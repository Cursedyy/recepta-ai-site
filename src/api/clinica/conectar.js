import { autenticarClinica } from "../_lib/auth-clinica.js";
import { rateLimit } from "../_lib/rate-limit.js";

/**
 * Conexao da instancia UazAPI da clinica ao WhatsApp, self-service.
 *
 * Por que existe: ate aqui o onboarding (n8n) gerava o codigo de pareamento e
 * mandava por WhatsApp no mesmo instante. O relogio de validade comecava
 * enquanto o cliente ainda estava lendo a mensagem e procurando a tela de
 * aparelhos conectados, entao o codigo expirava antes do uso.
 *
 * A validade NAO e configuravel. A doc do POST /instance/connect e explicita:
 * "Timeout de 2 minutos para QRCode seja atingido ou 5 minutos para o codigo
 * de pareamento". E limite do WhatsApp, nao da UazAPI, e o corpo do request so
 * aceita phone/browser/systemName/proxy_managed_*. A unica correcao possivel e
 * de fluxo: gerar o codigo quando o cliente ja esta pronto, e deixar ele mesmo
 * regenerar.
 *
 * QR e codigo sao EXCLUSIVOS na mesma chamada: com `phone` a UazAPI gera
 * codigo de pareamento, sem `phone` gera QR code. Por isso a pagina oferece os
 * dois como caminhos separados, cada um com sua propria chamada.
 */

// Validade fixa imposta pelo WhatsApp (doc /instance/connect). Usada so para
// mostrar contagem regressiva: quem expira de fato e o servidor.
const VALIDADE_QR_S = 120;
const VALIDADE_CODIGO_S = 300;

// Cada geracao queima o QR/codigo anterior. 10 por 5 minutos cobre o cliente
// que erra a digitacao algumas vezes e ainda trava um loop no front.
const MAX_CONEXOES = 10;
const JANELA_CONEXOES_MS = 5 * 60 * 1000;

// Status e chamado em polling pela pagina (a cada 3s). O teto existe so para
// conter aba esquecida aberta; uso normal fica bem abaixo.
const MAX_STATUS = 200;
const JANELA_STATUS_MS = 5 * 60 * 1000;

const TIMEOUT_UAZAPI_MS = 15000;

// Duracao do trial. 7 dias e o que toda a copy publica promete: index.html,
// /termos, blog e as paginas de nicho. Mudar aqui sem mudar a copy quebra o
// contrato com o cliente. (painel/admin.js usa 14 dias, mas aquele e o caminho
// de criacao manual pelo admin, contexto diferente.)
const TRIAL_DIAS = 7;

/**
 * `uazapi_server` vem do banco, e o banco e escrito pelo n8n. Sem validacao,
 * um valor apontando para rede interna transformaria esta rota autenticada num
 * proxy SSRF. Exigimos https e recusamos IP literal e loopback: todo servidor
 * UazAPI real e um hostname publico, entao nada legitimo e bloqueado aqui.
 */
function origemUazapi(raw) {
  if (!raw || typeof raw !== "string") return null;
  let u;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return null;
  if (host.startsWith("[")) return null; // IPv6 literal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null; // IPv4 literal
  if (!host.includes(".")) return null; // hostname interno sem dominio
  return u.origin;
}

async function carregarClinica(admin, perfil) {
  const { data, error } = await admin
    .from("clinicas")
    .select(
      "uazapi_token,uazapi_server,telefone_operador,trial_inicio,stripe_customer_id",
    )
    .eq("id", perfil.clinica_id)
    .maybeSingle();

  if (error) return { erro: { status: 500, corpo: { erro: "falha_buscar" } } };
  if (!data?.uazapi_token) {
    return {
      erro: { status: 409, corpo: { erro: "instancia_nao_provisionada" } },
    };
  }

  const origem = origemUazapi(data.uazapi_server);
  if (!origem) {
    return { erro: { status: 409, corpo: { erro: "servidor_invalido" } } };
  }

  // `telefone_operador` e o numero do dono que opera o WhatsApp — o candidato
  // certo para o pareamento. Nao confundir com `telefone_alerta`, que e so o
  // destino dos alertas e pode ser outro aparelho. Vai como sugestao editavel:
  // a clinica pode querer conectar um numero diferente do cadastrado.
  const telefoneSugerido = String(data.telefone_operador || "").replace(
    /\D/g,
    "",
  );

  return {
    origem,
    token: data.uazapi_token,
    telefoneSugerido: /^\d{10,15}$/.test(telefoneSugerido)
      ? telefoneSugerido
      : null,
    trial_inicio: data.trial_inicio ?? null,
    stripe_customer_id: data.stripe_customer_id ?? null,
  };
}

/**
 * O relogio do trial comeca quando o WhatsApp conecta, nao quando o briefing e
 * enviado. Motivo: o onboarding pode falhar em provisionar a instancia, e nesse
 * caso o cliente nunca usou nada — cobrar dele os 7 dias seria cobrar por um
 * produto que nao subiu. Por isso o n8n insere trial_inicio/trial_fim nulos e
 * quem os preenche e este endpoint, no primeiro polling que ve a instancia
 * conectada.
 *
 * Duas condicoes, ambas necessarias:
 * - trial_inicio nulo: o trial so comeca UMA vez. Reconectar o WhatsApp no
 *   quinto dia nao pode devolver sete dias novos.
 * - sem stripe_customer_id: quem passou pelo checkout nao esta em trial. O n8n
 *   zera trial_fim ao confirmar pagamento (node "Supabase Confirmar
 *   Pagamento"), entao escrever aqui reabriria um trial para quem ja paga.
 *
 * Nao usamos plano_pago_em como guarda: nenhuma outra rota le essa coluna,
 * entao nao ha prova de que ela existe, e pedir coluna inexistente faz o
 * Supabase falhar a query inteira. stripe_customer_id cobre o caso.
 */
function deveIniciarTrial(clinica) {
  if (clinica.trial_inicio) return false;
  if (clinica.stripe_customer_id) return false;
  return true;
}

/**
 * Escrita condicional: o .is("trial_inicio", null) faz o banco decidir, nao
 * nos. O status e consultado em polling (3s na pagina de conexao, 15s no banner
 * do painel), entao duas chamadas podem ver a instancia conectar ao mesmo
 * tempo; sem a condicao, a segunda sobrescreveria a data da primeira.
 *
 * Falha aqui nao derruba a resposta de status: a pagina precisa saber que
 * conectou. E auto-curavel — trial_inicio continua nulo e o proximo polling
 * tenta de novo.
 */
async function iniciarTrial(admin, clinicaId) {
  const agora = new Date();
  const fim = new Date(agora.getTime() + TRIAL_DIAS * 86400000);
  const { error } = await admin
    .from("clinicas")
    .update({
      trial_inicio: agora.toISOString(),
      trial_fim: fim.toISOString(),
    })
    .eq("id", clinicaId)
    .is("trial_inicio", null);
  if (error) {
    console.error("trial_inicio_falhou", clinicaId, error.message);
  }
}

async function chamarUazapi(origem, caminho, token, metodo, corpo) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_UAZAPI_MS);
  try {
    const resposta = await fetch(origem + caminho, {
      method: metodo,
      headers: {
        token,
        ...(corpo ? { "Content-Type": "application/json" } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: ctrl.signal,
    });
    const texto = await resposta.text();
    let dados = null;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch {
      dados = null;
    }
    return { ok: resposta.ok, status: resposta.status, dados };
  } catch {
    return { ok: false, status: 0, dados: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A UazAPI expoe o progresso em dois lugares que nem sempre concordam:
 * `instance.status` (enum documentado) e `status.connected`/`loggedIn`.
 * Tratamos como conectado quando qualquer um dos dois afirma isso, senao a
 * pagina fica girando depois que o pareamento ja funcionou.
 */
function normalizarInstancia(dados) {
  const inst = dados?.instance || {};
  const conexao = dados?.status || {};
  const conectado =
    inst.status === "connected" ||
    Boolean(conexao.connected && conexao.loggedIn);

  // O numero conectado sai do `jid` do status, nao de `instance.owner`: o jid
  // e o que o WhatsApp devolveu na sessao ativa, enquanto `owner` no schema da
  // UazAPI aparece com exemplo de e-mail e nao e confiavel como telefone.
  // `owner` fica so de reserva para o caso do jid vir nulo.
  const jidUser = String(conexao.jid?.user || "").replace(/\D/g, "");
  const owner = String(inst.owner || "").replace(/\D/g, "");
  const numero = /^\d{10,15}$/.test(jidUser)
    ? jidUser
    : /^\d{10,15}$/.test(owner)
      ? owner
      : null;

  return {
    conectado,
    estado: inst.status || (conectado ? "connected" : "desconhecido"),
    paircode: inst.paircode || null,
    qrcode: inst.qrcode || null,
    numero,
    perfil_nome: inst.profileName || null,
    // Só https: a foto vai para um <img> e uma URL http quebraria no CSP.
    perfil_foto: /^https:\/\//.test(inst.profilePicUrl || "")
      ? inst.profilePicUrl
      : null,
    conta_business:
      typeof inst.isBusiness === "boolean" ? inst.isBusiness : null,
    plataforma: inst.plataform || null,
    desconectado_em: inst.lastDisconnect || null,
    desconectado_motivo: inst.lastDisconnectReason || null,
  };
}

async function acaoStatus(admin, perfil) {
  const clinica = await carregarClinica(admin, perfil);
  if (clinica.erro) return clinica.erro;

  const r = await chamarUazapi(
    clinica.origem,
    "/instance/status",
    clinica.token,
    "GET",
  );
  if (!r.ok) {
    return { status: 502, corpo: { erro: "uazapi_indisponivel" } };
  }

  const instancia = normalizarInstancia(r.dados);

  // Este polling e o unico ponto em que o backend enxerga a conexao: a UazAPI
  // nao manda webhook, e /instance/connect responde antes do pareamento
  // terminar.
  if (instancia.conectado && deveIniciarTrial(clinica)) {
    await iniciarTrial(admin, perfil.clinica_id);
  }

  return {
    status: 200,
    corpo: {
      ok: true,
      telefone_sugerido: clinica.telefoneSugerido,
      ...instancia,
    },
  };
}

async function acaoConectar(admin, perfil, body) {
  const metodo = body?.metodo;
  if (metodo !== "codigo" && metodo !== "qr") {
    return { status: 400, corpo: { erro: "metodo_invalido" } };
  }

  // Mesmo formato exigido pela UazAPI (pattern ^\d{10,15}$). Validar aqui evita
  // um round-trip e uma mensagem de erro em ingles chegando ao cliente.
  let telefone = null;
  if (metodo === "codigo") {
    telefone = String(body?.telefone || "").replace(/\D/g, "");
    if (!/^\d{10,15}$/.test(telefone)) {
      return { status: 400, corpo: { erro: "telefone_invalido" } };
    }
  }

  const clinica = await carregarClinica(admin, perfil);
  if (clinica.erro) return clinica.erro;

  const r = await chamarUazapi(
    clinica.origem,
    "/instance/connect",
    clinica.token,
    "POST",
    metodo === "codigo" ? { phone: telefone } : {},
  );

  if (r.status === 429 || r.status === 503) {
    return { status: 503, corpo: { erro: "uazapi_ocupada" } };
  }
  if (!r.ok) {
    return { status: 502, corpo: { erro: "uazapi_indisponivel" } };
  }

  const instancia = normalizarInstancia(r.dados);
  const validadeS = metodo === "codigo" ? VALIDADE_CODIGO_S : VALIDADE_QR_S;

  return {
    status: 200,
    corpo: {
      ok: true,
      metodo,
      validade_s: validadeS,
      expira_em: new Date(Date.now() + validadeS * 1000).toISOString(),
      ...instancia,
    },
  };
}

async function acaoDesconectar(admin, perfil) {
  const clinica = await carregarClinica(admin, perfil);
  if (clinica.erro) return clinica.erro;

  const r = await chamarUazapi(
    clinica.origem,
    "/instance/disconnect",
    clinica.token,
    "POST",
    {},
  );
  if (!r.ok) return { status: 502, corpo: { erro: "uazapi_indisponivel" } };
  return { status: 200, corpo: { ok: true } };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");

  const auth = await autenticarClinica(req, res);
  if (auth.erro) return res.status(auth.erro.status).json(auth.erro.corpo);
  const { admin, perfil } = auth;

  if (req.method === "GET") {
    if (req.query?.acao !== "status") {
      return res.status(400).json({ erro: "acao_invalida" });
    }
    const rl = await rateLimit(
      "conectar-status:" + perfil.id,
      MAX_STATUS,
      JANELA_STATUS_MS,
    );
    if (rl.blocked) return res.status(429).json({ erro: "muitas_requisicoes" });

    const resultado = await acaoStatus(admin, perfil);
    return res.status(resultado.status).json(resultado.corpo);
  }

  if (req.method === "POST") {
    const rl = await rateLimit(
      "conectar:" + perfil.id,
      MAX_CONEXOES,
      JANELA_CONEXOES_MS,
    );
    if (rl.blocked) {
      return res.status(429).json({
        erro: "muitas_requisicoes",
        mensagem:
          "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.",
      });
    }

    let body;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ erro: "payload_invalido" });
    }

    if (body?.acao === "conectar") {
      const resultado = await acaoConectar(admin, perfil, body);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (body?.acao === "desconectar") {
      const resultado = await acaoDesconectar(admin, perfil);
      return res.status(resultado.status).json(resultado.corpo);
    }
    return res.status(400).json({ erro: "acao_invalida" });
  }

  return res.status(405).json({ erro: "metodo" });
}
