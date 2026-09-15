import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../_lib/supabase-server.js";
import { autenticarClinica } from "../_lib/auth-clinica.js";
import { configEditavelPadrao } from "../_lib/config-editavel.js";
import { rateLimit, getClientIp } from "../_lib/rate-limit.js";
import { criarCheckout } from "../checkout.js";
import { sincronizarAgendamentoSheets } from "../_lib/sheets-sync.js";
import { ofertaTemJanelaValida } from "../_lib/fila-janela.js";

const MIN_MINUTOS = 1;
const MAX_MINUTOS = 120;
const STRIPE_RETURN_URL = "https://www.receptaai.com.br/clinica/painel";

// Mutacoes do painel: 60 por minuto por usuario. Uso normal fica muito
// abaixo disso; o limite existe para conter loop no client ou conta
// comprometida cancelando a agenda inteira. Chave por usuario, nao por IP:
// aqui ja passamos da autenticacao e clinicas compartilham IP de consultorio.
const MAX_MUTACOES = 60;

// Nome e observacao do agendamento manual. Limites gemeos do maxlength dos
// inputs: o cliente impede na digitacao, o servidor recusa no request forjado.
const MAX_NOME = 120;
const MAX_OBSERVACAO = 500;
const JANELA_MUTACOES_MS = 60 * 1000;

// Pausa por conversa: painel e n8n usam a MESMA tabela, `pausas_ia`.
// O workflow de Atendimento ("Checar Pausa Ativa") so pergunta
// `pausado_ate > now()`, entao a pausa manual do painel e' simplesmente uma
// data absurdamente no futuro. Retomar apaga a linha.
// A pausa automatica (operador respondeu no WhatsApp -> now + N minutos)
// escreve na mesma linha; o trigger `pausas_ia_nunca_encurta` (migration 014)
// impede que ela rebaixe uma pausa manual para 10 minutos.
const PAUSA_MANUAL_ATE = "2999-12-31T00:00:00.000Z";
const PAUSA_MANUAL_LIMIAR = "2900-01-01T00:00:00.000Z";

async function acaoTempoPausa(admin, perfil, body) {
  const valor = Number(body?.tempo_pausa_minutos);
  if (!Number.isInteger(valor) || valor < MIN_MINUTOS || valor > MAX_MINUTOS) {
    return { status: 400, corpo: { erro: "valor_invalido" } };
  }

  const { error: erroUpdate } = await admin
    .from("clinicas")
    .update({ tempo_pausa_minutos: valor })
    .eq("id", perfil.clinica_id);

  if (erroUpdate) return { status: 500, corpo: { erro: "falha_salvar" } };

  return { status: 200, corpo: { ok: true, tempo_pausa_minutos: valor } };
}

// O alerta de escalonamento sai da instancia UazAPI da clinica para este
// numero. Ate 2026-09-09 ele nascia hardcoded no node "Config Fixa" do
// Onboarding com o celular pessoal do dono do produto, para toda clinica nova.
async function acaoTelefoneAlerta(admin, perfil, body) {
  const numero = normalizarTelefone(body?.telefone_alerta);
  if (!numero) return { status: 400, corpo: { erro: "telefone_invalido" } };

  const { error: erroUpdate } = await admin
    .from("clinicas")
    .update({ telefone_alerta: numero })
    .eq("id", perfil.clinica_id);

  if (erroUpdate) return { status: 500, corpo: { erro: "falha_salvar" } };

  return { status: 200, corpo: { ok: true, telefone_alerta: numero } };
}

async function acaoPortalSessao(admin, perfil) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey)
    return { status: 500, corpo: { erro: "stripe_nao_configurado" } };

  const { data: clinicaRow } = await admin
    .from("clinicas")
    .select("stripe_customer_id")
    .eq("id", perfil.clinica_id)
    .maybeSingle();

  if (!clinicaRow?.stripe_customer_id) {
    return { status: 400, corpo: { erro: "sem_assinatura" } };
  }

  const params = new URLSearchParams();
  params.set("customer", clinicaRow.stripe_customer_id);
  params.set("return_url", STRIPE_RETURN_URL);

  const stripeRes = await fetch(
    "https://api.stripe.com/v1/billing_portal/sessions",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + stripeKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );

  const dados = await stripeRes.json();
  if (!stripeRes.ok) {
    // Logar o erro interno mas NAO expor ao cliente (pode conter
    // informacoes sensiveis do Stripe, como IDs internos ou razoes).
    console.error("stripe_portal_erro", JSON.stringify(dados?.error));
    return {
      status: 502,
      corpo: {
        erro: "falha_stripe",
        detalhe: "Erro ao comunicar com o Stripe. Tente novamente.",
      },
    };
  }

  return { status: 200, corpo: { ok: true, url: dados.url } };
}

async function acaoCheckoutReativacao(admin, perfil, body, req) {
  const ciclo = body?.ciclo;
  if (ciclo !== "mensal" && ciclo !== "anual")
    return { status: 400, corpo: { erro: "ciclo_invalido" } };

  const ip = getClientIp(req);
  const limite = await rateLimit(`checkout:${ip}`, 10, 10 * 60 * 1000);
  if (limite.blocked)
    return { status: 429, corpo: { erro: "muitas_tentativas", reset_ms: limite.resetMs } };

  const { data: clinica, error } = await admin
    .from("clinicas")
    .select("tier,status")
    .eq("id", perfil.clinica_id)
    .maybeSingle();
  if (error || !clinica) return { status: 404, corpo: { erro: "clinica_nao_encontrada" } };
  if (clinica.status !== "expirado")
    return { status: 409, corpo: { erro: "assinatura_nao_expirada" } };

  const tier = clinica.tier === "completo" ? "completo" : "essencial";
  return criarCheckout({
    admin,
    tier,
    ciclo,
    ip,
    userAgent: req.headers["user-agent"],
    origem: "painel_reativacao",
    clinicaId: perfil.clinica_id,
    successUrl: "https://www.receptaai.com.br/clinica/painel?checkout=sucesso",
    cancelUrl: "https://www.receptaai.com.br/clinica/painel?checkout=cancelado",
  });
}

// Detalhes que so o Stripe tem: valor cobrado, proxima fatura, cartao, se a
// assinatura ja esta marcada para cancelar no fim do periodo. O banco guarda
// apenas status/plano/trial_fim, entao a aba Status mostrava um resumo sem
// nenhuma informacao de cobranca.
//
// Degrada em silencio: sem chave, sem customer ou com o Stripe fora do ar a
// resposta volta { ok: true, assinatura: null } e o painel cai no que ja tem
// no window.__PAINEL__. Detalhe de cobranca nao vale derrubar a aba inteira.
async function acaoAssinaturaDetalhes(admin, perfil) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return { status: 200, corpo: { ok: true, assinatura: null } };

  const { data: clinicaRow } = await admin
    .from("clinicas")
    .select("stripe_customer_id")
    .eq("id", perfil.clinica_id)
    .maybeSingle();

  if (!clinicaRow?.stripe_customer_id)
    return { status: 200, corpo: { ok: true, assinatura: null } };

  const params = new URLSearchParams();
  params.set("customer", clinicaRow.stripe_customer_id);
  params.set("status", "all");
  params.set("limit", "1");
  params.append("expand[]", "data.default_payment_method");

  let dados;
  try {
    const resposta = await fetch(
      "https://api.stripe.com/v1/subscriptions?" + params.toString(),
      { headers: { Authorization: "Bearer " + stripeKey } },
    );
    dados = await resposta.json();
    if (!resposta.ok) {
      // Mesmo tratamento do portal: logar o erro do Stripe, nunca devolver ao
      // cliente (pode carregar id interno ou motivo sensivel).
      console.error("stripe_assinatura_erro", JSON.stringify(dados?.error));
      return { status: 200, corpo: { ok: true, assinatura: null } };
    }
  } catch (e) {
    console.error("stripe_assinatura_falha", e.message);
    return { status: 200, corpo: { ok: true, assinatura: null } };
  }

  const assinatura = dados?.data?.[0];
  if (!assinatura)
    return { status: 200, corpo: { ok: true, assinatura: null } };

  const preco = assinatura.items?.data?.[0]?.price || null;
  const cartao = assinatura.default_payment_method?.card || null;

  // Lista fechada de campos: devolver o objeto do Stripe inteiro jogaria ids
  // internos e metadata dentro do HTML do painel.
  return {
    status: 200,
    corpo: {
      ok: true,
      assinatura: {
        status: assinatura.status || null,
        cancela_no_fim: !!assinatura.cancel_at_period_end,
        periodo_fim: assinatura.current_period_end
          ? new Date(assinatura.current_period_end * 1000).toISOString()
          : null,
        valor_centavos:
          typeof preco?.unit_amount === "number" ? preco.unit_amount : null,
        moeda: preco?.currency || null,
        intervalo: preco?.recurring?.interval || null,
        cartao_bandeira: cartao?.brand || null,
        cartao_final: cartao?.last4 || null,
      },
    },
  };
}

async function resolverNomeClinica(admin, perfil) {
  const { data } = await admin
    .from("clinicas")
    .select("clinica")
    .eq("id", perfil.clinica_id)
    .maybeSingle();
  return data?.clinica || null;
}

// Status de vida da clinica ('ativo' | 'expirado' — vocabulario do n8n, que
// e quem grava o campo). O vocabulario vive no n8n: NAO introduzir novos
// valores aqui.
async function statusClinica(admin, perfil) {
  const { data } = await admin
    .from("clinicas")
    .select("status")
    .eq("id", perfil.clinica_id)
    .maybeSingle();
  return data?.status || null;
}

// ── Fila de espera (tier Completo) ─────────────────────────────────────
// Vivia em api/clinica/fila.js e foi fundida aqui porque a Vercel Hobby
// limita cada deployment a 12 Serverless Functions (verificado 2026-09-11:
// com a fila eram 13 => "No more than 12 Serverless Functions"). Mesma
// superficie: GET ?acao=fila e POST {acao: cancelar|aceitar|recusar}.
// O arquivo original segue em archive/api-clinica-fila.js.
const FILA_JANELA_INVALIDA = {
  ok: false,
  erro: "janela_invalida",
  mensagem:
    "Informe início e fim válidos para a preferência e para o horário oferecido.",
};

// aceitar/recusar/cancelar continuam abertas com a assinatura expirada:
// o endpoint autonomo anterior nao checava status da clinica (apenas tier),
// e recusar uma oferta nao pode depender de pagamento.
const FILA_ACOES = ["cancelar", "aceitar", "recusar"];

const FILA_ID_RE = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function filaCsrfOk(req) {
  const origin = req.headers?.origin || req.headers?.referer || "";
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname;
    return (
      host === "receptaai.com.br" ||
      host === "www.receptaai.com.br" ||
      host === "localhost"
    );
  } catch {
    return false;
  }
}

async function filaTierCompleto(admin, clinicaId) {
  const { data } = await admin
    .from("clinicas")
    .select("tier")
    .eq("id", clinicaId)
    .maybeSingle();
  return data?.tier === "completo";
}

async function acaoListarFila(admin, perfil) {
  const { data, error } = await admin
    .from("fila_espera")
    .select(
      "id,paciente_telefone,paciente_nome,servico,servico_normalizado,janela_inicio,janela_fim,oferta_inicio,oferta_fim,status,entrou_em,ofertado_em,oferta_expira_em,respondido_em,agendamento_id",
    )
    .eq("clinica_id", perfil.clinica_id)
    .order("entrou_em", { ascending: true });
  if (error)
    return { status: 500, corpo: { ok: false, erro: "falha_buscar_fila" } };
  return { status: 200, corpo: { ok: true, entradas: data || [] } };
}

async function acaoResponderFila(admin, perfil, req, body) {
  if (!filaCsrfOk(req))
    return {
      status: 403,
      corpo: { ok: false, erro: "csrf_invalido", codigo: "CSRF_INVALIDO" },
    };
  const id = String(body?.id || "");
  const acao = body?.acao;
  if (
    !FILA_ACOES.includes(acao) ||
    !FILA_ID_RE.test(id)
  )
    return { status: 400, corpo: { ok: false, erro: "acao_invalida" } };
  // Body/query não são uma fonte de identidade. Clínica vem apenas da sessão.
  const { data: owned, error: erroBusca } = await admin
    .from("fila_espera")
    .select("id,janela_inicio,janela_fim,oferta_inicio,oferta_fim")
    .eq("id", id)
    .eq("clinica_id", perfil.clinica_id)
    .maybeSingle();
  if (erroBusca)
    return { status: 500, corpo: { ok: false, erro: "falha_buscar_fila" } };
  if (!owned)
    return { status: 404, corpo: { ok: false, erro: "entrada_nao_encontrada" } };
  if (acao === "cancelar") {
    const { data, error } = await admin
      .from("fila_espera")
      .update({ status: "cancelado", respondido_em: new Date().toISOString() })
      .eq("id", id)
      .eq("clinica_id", perfil.clinica_id)
      .in("status", ["aguardando", "ofertado"])
      .select("id,status")
      .maybeSingle();
    if (error)
      return { status: 409, corpo: { ok: false, erro: "nao_pode_cancelar" } };
    return { status: 200, corpo: { ok: true, entrada: data } };
  }
  // Rejeitar ofertas legadas/incompletas antes de executar a RPC de aceite.
  if (acao === "aceitar" && !ofertaTemJanelaValida(owned))
    return { status: 400, corpo: FILA_JANELA_INVALIDA };
  const fn =
    acao === "aceitar" ? "fila_aceitar_oferta" : "fila_recusar_oferta";
  const { data, error } = await admin.rpc(fn, {
    p_id: id,
    p_clinica: perfil.clinica_id,
  });
  if (error) {
    if (error.code === "22023")
      return { status: 400, corpo: FILA_JANELA_INVALIDA };
    if (error.code === "23505")
      return { status: 409, corpo: { ok: false, erro: "horario_ocupado" } };
    if (error.code === "P0002")
      return {
        status: 404,
        corpo: { ok: false, erro: "entrada_nao_encontrada" },
      };
    return {
      status: 409,
      corpo: {
        ok: false,
        erro: String(error.message).includes("expirada")
          ? "oferta_expirada"
          : "oferta_invalida",
      },
    };
  }
  if (acao === "aceitar" && data?.id) {
    const { data: agendamento } = await admin
      .from("agendamentos")
      .select("id,clinica_id,paciente_telefone,data_hora,sheet_row")
      .eq("id", data.id)
      .eq("clinica_id", perfil.clinica_id)
      .maybeSingle();
    if (agendamento)
      await sincronizarAgendamentoSheets({ admin, agendamento });
  }
  return { status: 200, corpo: { ok: true, resultado: data } };
}

// Acoes que continuam abertas com a assinatura expirada:
// - checkout_reativacao: cria um pedido autenticado para regularizar a cobrança;
// - portal_sessao: gerencia assinatura existente (não é fluxo de reativação);
// - atualizar_perfil: trocar senha nunca pode depender de pagamento;
// - cancelar/aceitar/recusar: acoes da fila (ver FILA_ACOES acima).
// As leituras (GET) tambem ficam abertas de proposito: ler configuracao nao
// gera custo, e manter a aba Status acessivel ajuda o cliente a entender o
// que fazer. O bloqueio de escrita e o overlay sao camadas independentes:
// o overlay e a interface do gate, o 402 e o gate em si.
// ── Reembolso (F7/G4) ─────────────────────────────────────────────────────
// Canal primário do pedido de reembolso: botão "Pedir reembolso" no painel.
// O carimbo oficial é o timestamp do SERVIDOR, não do navegador.
//
// Esta ação só REGISTRA a intenção (`reembolso_pedido_em`, motivo) — escrita
// condicional `.is("reembolso_pedido_em", null)`, idempotente: o cliente pode
// clicar quantas vezes quiser que a data não muda.
//
// NÃO estorna, NÃO cancela, NÃO muda `status`: o estorno é humano (runbook do
// operador — política G4/G5), no Stripe, depois de conferir identidade e
// janela. v1 é manual por decisão registrada (garantia-politica-operacional).
//
// Motivo é opcional e livre (máx 500 chars) — a promessa pública é "sem
// perguntas"; pedir razão obrigatória contradiria a copy.
const MAX_MOTIVO_REEMBOLSO = 500;

async function carregarGarantia(admin, clinicaId) {
  const { data, error } = await admin
    .from("clinicas")
    .select(
      "garantia_inicio,garantia_fim,garantia_teto,reembolso_pedido_em,reembolsado_em,stripe_customer_id",
    )
    .eq("id", clinicaId)
    .maybeSingle();

  if (error) return { erro: { status: 500, corpo: { erro: "falha_buscar" } } };
  return { garantia: data || {} };
}

function janelaGarantiaResumo(g) {
  // G3 — regimes disjuntos: ativou → vale garantia_fim; nunca ativou → teto.
  const fim = g.garantia_fim || g.garantia_teto || null;
  return {
    dentro_da_janela: fim ? new Date(fim).getTime() > Date.now() : false,
    fim,
    origem: g.garantia_fim ? "ativacao" : g.garantia_teto ? "teto" : null,
  };
}

async function acaoReembolso(admin, perfil, body) {
  // Limite próprio: 5 por hora. O teto global de mutações do painel (60/min)
  // é frouxo demais para uma ação que vira ticket humano.
  const rl = await rateLimit("reembolso-post:" + perfil.id, 5, 60 * 60 * 1000);
  if (rl.blocked) {
    return {
      status: 429,
      corpo: { erro: "muitas_requisicoes", mensagem: "Aguarde alguns minutos." },
    };
  }

  const motivo = String(body?.motivo || "").slice(0, MAX_MOTIVO_REEMBOLSO);

  const r = await carregarGarantia(admin, perfil.clinica_id);
  if (r.erro) return { status: r.erro.status, corpo: r.erro.corpo };
  const g = r.garantia;

  // Reembolsado: o pedido vira informativo; nada novo a registrar.
  if (g.reembolsado_em) {
    return {
      status: 409,
      corpo: {
        erro: "ja_reembolsado",
        mensagem:
          "Este contrato já foi reembolsado. Se precisar de algo, fale com o suporte.",
      },
    };
  }

  const j = janelaGarantiaResumo(g);
  const agora = new Date().toISOString();

  // Idempotente por construção: só grava se não há pedido anterior.
  const { error } = await admin
    .from("clinicas")
    .update({
      reembolso_pedido_em: agora,
      reembolso_motivo: motivo || null,
    })
    .eq("id", perfil.clinica_id)
    .is("reembolso_pedido_em", null);

  if (error) {
    console.error("reembolso_pedido_falhou", perfil.clinica_id, error.message);
    return { status: 500, corpo: { erro: "falha_registrar" } };
  }

  return {
    status: 200,
    corpo: {
      ok: true,
      // Registro com data nova = este request venceu a corrida; com null =
      // já havia pedido (resposta honesta: a data oficial é a primeira).
      registrado_em: g.reembolso_pedido_em ? null : agora,
      pedido_em: g.reembolso_pedido_em || agora,
      ...j,
      mensagem:
        "Recebemos seu pedido. Respondemos em até 2 dias úteis e lançamos o estorno em até 5 dias úteis após a resposta. O crédito no cartão depende do prazo do seu banco.",
    },
  };
}

function acaoBloqueadaExpirado(acao) {
  return (
    acao !== "portal_sessao" &&
    acao !== "checkout_reativacao" &&
    acao !== "atualizar_perfil" &&
    acao !== "reembolso" &&
    !FILA_ACOES.includes(acao)
  );
}

async function acaoPausarConversa(admin, perfil, body) {
  const telefone = body?.telefone;
  const clinicaBody = body?.clinica;
  if (!telefone || !clinicaBody)
    return { status: 400, corpo: { erro: "parametros_invalidos" } };

  // Verificar ownership: o nome da clínica no body deve bater com a do perfil
  const nomeClinica = await resolverNomeClinica(admin, perfil);
  if (!nomeClinica || nomeClinica !== clinicaBody)
    return { status: 403, corpo: { erro: "sem_permissao" } };

  const { data: conversa } = await admin
    .from("conversas")
    .select("id")
    .eq("telefone", telefone)
    .eq("clinica", nomeClinica)
    .limit(1)
    .maybeSingle();

  if (!conversa)
    return { status: 404, corpo: { erro: "conversa_nao_encontrada" } };

  const { error } = await admin.from("pausas_ia").upsert(
    {
      telefone,
      clinica: nomeClinica,
      pausado_ate: PAUSA_MANUAL_ATE,
    },
    { onConflict: "telefone,clinica" },
  );

  if (error) {
    console.error("pausar_conversa_erro", error.message);
    return { status: 500, corpo: { erro: "falha_pausar" } };
  }

  return { status: 200, corpo: { ok: true, pausada: true } };
}

async function acaoRetomarConversa(admin, perfil, body) {
  const telefone = body?.telefone;
  const clinicaBody = body?.clinica;
  if (!telefone || !clinicaBody)
    return { status: 400, corpo: { erro: "parametros_invalidos" } };

  const nomeClinica = await resolverNomeClinica(admin, perfil);
  if (!nomeClinica || nomeClinica !== clinicaBody)
    return { status: 403, corpo: { erro: "sem_permissao" } };

  // Apaga a linha inteira: retomar tambem cancela uma pausa automatica em
  // curso, que e' o que a clinica espera ao clicar em "Retomar".
  const { error } = await admin
    .from("pausas_ia")
    .delete()
    .eq("telefone", telefone)
    .eq("clinica", nomeClinica);

  if (error) {
    console.error("retomar_conversa_erro", error.message);
    return { status: 500, corpo: { erro: "falha_retomar" } };
  }

  return { status: 200, corpo: { ok: true, pausada: false } };
}

// Normaliza para E.164 sem "+", o formato que a tabela conversas ja usa
// ("5511999999999"). O telefone importa: o cron de lembretes manda WhatsApp
// para paciente_telefone, entao um numero digitado errado vira mensagem para
// um estranho. Retorna null quando nao da para confiar no que foi digitado.
export function normalizarTelefone(bruto) {
  let d = String(bruto || "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (d.length !== 12 && d.length !== 13) return null;
  if (!d.startsWith("55")) return null;
  const ddd = Number(d.slice(2, 4));
  if (!(ddd >= 11 && ddd <= 99)) return null;
  return d;
}

// Campo de texto opcional: espaco em branco vira null, para o painel nao ter
// que distinguir "" de ausente na hora de decidir o que exibir.
function textoOpcional(bruto, limite) {
  const texto = String(bruto == null ? "" : bruto).trim();
  if (!texto) return { valor: null };
  if (texto.length > limite) return { excedeu: true };
  return { valor: texto };
}

// Agendamento criado a mao pela clinica (paciente que ligou, balcao, encaixe).
// Entra na MESMA tabela dos agendamentos da Recepta de proposito: os lembretes
// automaticos de 24h e 3h saem de um cron sobre `agendamentos`, entao o manual
// ja nasce com lembrete, sem workflow novo.
async function acaoCriarAgendamento(admin, perfil, body) {
  const telefone = normalizarTelefone(body?.paciente_telefone);
  if (!telefone) return { status: 400, corpo: { erro: "telefone_invalido" } };

  const data = new Date(body?.data_hora);
  if (isNaN(data.getTime()) || data <= new Date())
    return { status: 400, corpo: { erro: "data_invalida" } };

  const nome = textoOpcional(body?.paciente_nome, MAX_NOME);
  if (nome.excedeu) return { status: 400, corpo: { erro: "nome_muito_longo" } };

  const observacao = textoOpcional(body?.observacao, MAX_OBSERVACAO);
  if (observacao.excedeu)
    return { status: 400, corpo: { erro: "observacao_muito_longa" } };

  // Encaixe duplicado no mesmo horario quase sempre e' erro de digitacao, e
  // dois lembretes sairiam para o mesmo slot. Bloqueia so o choque exato:
  // sobreposicao por duracao depende de config_agenda, que ainda nao existe
  // nesta tela.
  const { data: choque } = await admin
    .from("agendamentos")
    .select("id")
    .eq("clinica_id", perfil.clinica_id)
    .eq("data_hora", data.toISOString())
    .neq("status", "cancelado")
    .limit(1)
    .maybeSingle();

  if (choque) return { status: 409, corpo: { erro: "horario_ocupado" } };

  // clinica_id vem SEMPRE do perfil autenticado, nunca do body: aceitar do
  // cliente deixaria qualquer clinica logada escrever na agenda de outra.
  const { data: criado, error } = await admin
    .from("agendamentos")
    .insert({
      clinica_id: perfil.clinica_id,
      paciente_telefone: telefone,
      paciente_nome: nome.valor,
      observacao: observacao.valor,
      data_hora: data.toISOString(),
      status: "agendado",
    })
    .select(
      "id,clinica_id,paciente_telefone,paciente_nome,observacao,data_hora,status,cancelado_em,sheet_row",
    )
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { status: 409, corpo: { erro: "horario_ocupado" } };
    console.error("criar_agendamento_erro", error.message);
    return { status: 500, corpo: { erro: "falha_criar" } };
  }

  if (criado) await sincronizarAgendamentoSheets({ admin, agendamento: criado });

  return { status: 200, corpo: { ok: true, agendamento: criado } };
}

async function acaoRemarcarAgendamento(admin, perfil, body) {
  const agendamentoId = body?.agendamento_id;
  const novaDataHora = body?.nova_data_hora;
  if (!agendamentoId || !novaDataHora)
    return { status: 400, corpo: { erro: "parametros_invalidos" } };

  // Validar data
  const novaData = new Date(novaDataHora);
  if (isNaN(novaData.getTime()) || novaData <= new Date())
    return { status: 400, corpo: { erro: "data_invalida" } };

  // Buscar o agendamento e verificar ownership
  const { data: agendamento, error: erroBusca } = await admin
    .from("agendamentos")
    .select("id,status,clinica_id")
    .eq("id", agendamentoId)
    .maybeSingle();

  if (erroBusca || !agendamento)
    return { status: 404, corpo: { erro: "agendamento_nao_encontrado" } };

  if (agendamento.clinica_id !== perfil.clinica_id)
    return { status: 403, corpo: { erro: "sem_permissao" } };

  if (agendamento.status === "cancelado")
    return { status: 400, corpo: { erro: "agendamento_cancelado" } };

  // A pré-checagem dá uma resposta legível; a unique constraint continua sendo
  // a proteção contra duas remarcações/criações simultâneas.
  const { data: choque, error: erroConflito } = await admin
    .from("agendamentos")
    .select("id")
    .eq("clinica_id", perfil.clinica_id)
    .eq("data_hora", novaData.toISOString())
    .neq("status", "cancelado")
    .neq("id", agendamentoId)
    .limit(1)
    .maybeSingle();
  if (erroConflito) return { status: 500, corpo: { erro: "falha_remarcar" } };
  if (choque) return { status: 409, corpo: { erro: "horario_ocupado" } };

  // Só alterar o registro da sessão; falha de constraint mantém o original.
  const { error: erroUpdate } = await admin
    .from("agendamentos")
    .update({ data_hora: novaData.toISOString() })
    .eq("id", agendamentoId)
    .eq("clinica_id", perfil.clinica_id);

  if (erroUpdate) {
    if (erroUpdate.code === "23505") return { status: 409, corpo: { erro: "horario_ocupado" } };
    console.error("remarcar_agendamento_erro", erroUpdate.message);
    return { status: 500, corpo: { erro: "falha_remarcar" } };
  }

  return { status: 200, corpo: { ok: true } };
}

async function acaoCancelarAgendamento(admin, perfil, body) {
  const agendamentoId = body?.agendamento_id;
  if (!agendamentoId)
    return { status: 400, corpo: { erro: "parametros_invalidos" } };

  // Buscar o agendamento e verificar pertence à clínica do usuário
  const { data: agendamento, error: erroBusca } = await admin
    .from("agendamentos")
    .select("id,status,clinica_id")
    .eq("id", agendamentoId)
    .maybeSingle();

  if (erroBusca || !agendamento)
    return { status: 404, corpo: { erro: "agendamento_nao_encontrado" } };

  // Ownership: verificar se o agendamento pertence à clínica do usuário
  if (agendamento.clinica_id !== perfil.clinica_id)
    return { status: 403, corpo: { erro: "sem_permissao" } };

  if (agendamento.status === "cancelado")
    return { status: 200, corpo: { ok: true, mensagem: "ja_cancelado" } };

  // Cancelar
  const { error: erroUpdate } = await admin
    .from("agendamentos")
    .update({ status: "cancelado", cancelado_em: new Date().toISOString() })
    .eq("id", agendamentoId);

  if (erroUpdate) {
    console.error("cancelar_agendamento_erro", erroUpdate.message);
    return { status: 500, corpo: { erro: "falha_cancelar" } };
  }

  return { status: 200, corpo: { ok: true } };
}

// Prefixa apostrofo em valores que o Excel/Sheets interpretaria como formula.
// Sem isso, uma mensagem de paciente como =HYPERLINK(...) executa ao abrir o CSV.
function escapeCsv(valor) {
  let str = String(valor || "");
  if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

async function acaoExportar(admin, perfil, query) {
  const dataInicio = query?.inicio || null;
  const dataFim = query?.fim || null;

  // FAIL CLOSED: se o nome da clinica nao resolver, NAO exportamos nada.
  // Antes o filtro simplesmente nao era aplicado e o CSV saia com as conversas
  // de TODAS as clinicas (vazamento entre tenants de dados de pacientes).
  // O parametro ?clinica= tambem foi removido: `autenticar` ja garante
  // papel === "clinica", entao o unico escopo legitimo e' o do proprio perfil.
  const nomeClinica = await resolverNomeClinica(admin, perfil);
  if (!nomeClinica) return { status: 403, corpo: { erro: "sem_permissao" } };

  let q = admin
    .from("conversas")
    .select("telefone,clinica,role,mensagem,criado_em")
    .eq("clinica", nomeClinica)
    .order("criado_em", { ascending: true });

  if (dataInicio) q = q.gte("criado_em", dataInicio);
  if (dataFim) q = q.lte("criado_em", dataFim);

  const { data: conversas, error } = await q.limit(10000);
  if (error) return { status: 500, corpo: { erro: "falha_exportar" } };
  if (!conversas || !conversas.length)
    return { status: 200, corpo: { ok: true, csv: "", total: 0 } };

  const header = "Data,Hora,Telefone,Clínica,Papel,Mensagem";
  const linhas = conversas.map((c) => {
    const dt = new Date(c.criado_em);
    const data = dt.toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });
    const hora = dt.toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    });
    return [
      escapeCsv(data),
      escapeCsv(hora),
      escapeCsv(c.telefone),
      escapeCsv(c.clinica),
      escapeCsv(c.role === "ia" ? "Recepta" : "Paciente"),
      escapeCsv(c.mensagem),
    ].join(",");
  });

  return {
    status: 200,
    corpo: {
      ok: true,
      csv: header + "\n" + linhas.join("\n"),
      total: conversas.length,
    },
  };
}

const CONVERSAS_LIMITE = 500;

// Lista as conversas da clinica do usuario. Existe porque o painel antes lia a
// tabela `conversas` DIRETO do navegador com a anon key e SEM filtro de
// clinica: qualquer clinica logada (ou anonimo, se a RLS estivesse permissiva)
// recebia telefone e mensagens de pacientes de todas as outras clinicas.
// O filtro por tenant tem que acontecer no servidor, com a service role.
async function acaoConversas(admin, perfil) {
  const nomeClinica = await resolverNomeClinica(admin, perfil);
  if (!nomeClinica) return { status: 403, corpo: { erro: "sem_permissao" } };

  const { data, error } = await admin
    .from("conversas")
    .select(
      "id,telefone,clinica,role,mensagem,mensagem_media,criado_em,nome_cliente",
    )
    .eq("clinica", nomeClinica)
    .order("criado_em", { ascending: false })
    .limit(CONVERSAS_LIMITE);

  if (error) return { status: 500, corpo: { erro: "falha_buscar" } };

  // Telefones com pausa MANUAL, para o badge da UI. A pausa automatica de
  // N minutos tambem mora em `pausas_ia`, mas e' transitoria e nao vira badge:
  // o limiar de data separa as duas.
  const { data: pausadas } = await admin
    .from("pausas_ia")
    .select("telefone")
    .eq("clinica", nomeClinica)
    .gte("pausado_ate", PAUSA_MANUAL_LIMIAR);

  const pausadasSet = new Set((pausadas || []).map((p) => p.telefone));

  return {
    status: 200,
    corpo: {
      ok: true,
      conversas: data || [],
      pausadas: Array.from(pausadasSet),
    },
  };
}

async function acaoListarFeriados(admin, perfil) {
  const { data, error } = await admin
    .from("feriados")
    .select("id,data,nome")
    .eq("clinica_id", perfil.clinica_id)
    .order("data", { ascending: true });
  if (error) return { status: 500, corpo: { erro: "falha_buscar" } };
  return { status: 200, corpo: { ok: true, feriados: data || [] } };
}

async function acaoAdicionarFeriado(admin, perfil, body) {
  const data = body?.data;
  const nome = typeof body?.nome === "string" ? body.nome.trim() : null;
  if (!data) return { status: 400, corpo: { erro: "data_obrigatoria" } };
  const { error } = await admin
    .from("feriados")
    .insert({ clinica_id: perfil.clinica_id, data, nome });
  if (error) {
    if (error.code === "23505")
      return { status: 409, corpo: { erro: "data_ja_cadastrada" } };
    return { status: 500, corpo: { erro: "falha_salvar" } };
  }
  return { status: 200, corpo: { ok: true } };
}

async function acaoRemoverFeriado(admin, perfil, body) {
  const id = body?.id;
  if (!id) return { status: 400, corpo: { erro: "id_obrigatorio" } };
  const { error } = await admin
    .from("feriados")
    .delete()
    .eq("id", id)
    .eq("clinica_id", perfil.clinica_id);
  if (error) return { status: 500, corpo: { erro: "falha_remover" } };
  return { status: 200, corpo: { ok: true } };
}

async function acaoAtualizarPerfil(admin, user, body) {
  const erros = [];
  if (typeof body?.nome === "string" && body.nome.trim()) {
    const nome = body.nome.trim();
    if (nome.length > 100) {
      erros.push("Nome muito longo (máx 100 caracteres).");
    } else {
      const { error } = await admin
        .from("perfis")
        .update({ nome })
        .eq("id", user.id);
      if (error) erros.push("Falha ao salvar nome.");
    }
  }
  if (
    typeof body?.senha_atual === "string" &&
    typeof body?.nova_senha === "string"
  ) {
    if (body.nova_senha.length < 8) {
      erros.push("A nova senha precisa ter pelo menos 8 caracteres.");
    } else {
      const url = process.env.SUPABASE_URL;
      const tempClient = createClient(url, process.env.SUPABASE_ANON_KEY);
      const { data: emailUser } = await admin.auth.admin.getUserById(user.id);
      const email = emailUser?.user?.email;
      if (!email) {
        erros.push("Não foi possível verificar a senha atual.");
      } else {
        const { error: loginError } = await tempClient.auth.signInWithPassword({
          email,
          password: body.senha_atual,
        });
        if (loginError) {
          erros.push("A senha atual está incorreta.");
        } else {
          const { error: updateError } = await admin.auth.admin.updateUserById(
            user.id,
            { password: body.nova_senha },
          );
          if (updateError) erros.push("Falha ao atualizar senha.");
        }
      }
    }
  }
  if (erros.length)
    return { status: 400, corpo: { erro: "erros", detalhes: erros } };
  return { status: 200, corpo: { ok: true } };
}

const MAX_NOME_CLIENTE = 120;

async function acaoSalvarNomeCliente(admin, perfil, body) {
  const telefone = body?.telefone;
  const nome = body?.nome;
  if (!telefone)
    return { status: 400, corpo: { erro: "telefone_obrigatorio" } };

  const nomeTrim = typeof nome === "string" ? nome.trim() : "";
  if (nomeTrim.length > MAX_NOME_CLIENTE)
    return { status: 400, corpo: { erro: "nome_muito_longo" } };

  const nomeClinica = await resolverNomeClinica(admin, perfil);
  if (!nomeClinica) return { status: 403, corpo: { erro: "sem_permissao" } };

  const valorNome = nomeTrim || null;

  // Atualizar todas as mensagens dessa conversa com o nome do paciente
  const { error } = await admin
    .from("conversas")
    .update({ nome_cliente: valorNome })
    .eq("telefone", telefone)
    .eq("clinica", nomeClinica);

  if (error) {
    console.error("salvar_nome_cliente_erro", error.message);
    return { status: 500, corpo: { erro: "falha_salvar" } };
  }

  return { status: 200, corpo: { ok: true, nome: valorNome } };
}

async function acaoBuscarSugestaoNome(admin, perfil, query) {
  const telefone = query?.telefone;
  if (!telefone)
    return { status: 400, corpo: { erro: "telefone_obrigatorio" } };

  // Buscar nome mais recente na tabela agendamentos
  const { data, error } = await admin
    .from("agendamentos")
    .select("paciente_nome")
    .eq("clinica_id", perfil.clinica_id)
    .eq("paciente_telefone", telefone)
    .not("paciente_nome", "is", null)
    .neq("paciente_nome", "")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("buscar_sugestao_nome_erro", error.message);
    return { status: 500, corpo: { erro: "falha_buscar" } };
  }

  return {
    status: 200,
    corpo: { ok: true, nome: data?.paciente_nome || null },
  };
}

async function acaoConfig(admin, perfil) {
  const { data: clinicaRow } = await admin
    .from("clinicas")
    .select(
      "clinica,config_editavel,tempo_pausa_minutos,status,trial_fim,plano,tier,criado_em",
    )
    .eq("id", perfil.clinica_id)
    .maybeSingle();

  if (!clinicaRow) {
    return { status: 404, corpo: { erro: "clinica_nao_encontrada" } };
  }

  const padrao = configEditavelPadrao();
  const configSalvo = clinicaRow.config_editavel || {};

  const config = {
    precos: Array.isArray(configSalvo.precos)
      ? configSalvo.precos
      : padrao.precos,
    horarios: { ...padrao.horarios, ...(configSalvo.horarios || {}) },
    convenios: Array.isArray(configSalvo.convenios)
      ? configSalvo.convenios
      : padrao.convenios,
    mensagem_identidade:
      typeof configSalvo.mensagem_identidade === "string"
        ? configSalvo.mensagem_identidade
        : padrao.mensagem_identidade,
    regras_ia:
      typeof configSalvo.regras_ia === "string"
        ? configSalvo.regras_ia
        : padrao.regras_ia,
    faq: Array.isArray(configSalvo.faq) ? configSalvo.faq : padrao.faq,
    campos_extras:
      configSalvo.campos_extras && typeof configSalvo.campos_extras === "object"
        ? configSalvo.campos_extras
        : {},
  };

  return {
    status: 200,
    corpo: {
      ok: true,
      nome: clinicaRow.clinica || perfil.nome || "sua clínica",
      config,
      tempo_pausa_minutos: clinicaRow.tempo_pausa_minutos || 10,
      status: clinicaRow.status || null,
      trial_fim: clinicaRow.trial_fim || null,
      plano: clinicaRow.plano || null,
      tier: clinicaRow.tier || "essencial",
      criado_em: clinicaRow.criado_em || null,
    },
  };
}

async function acaoMetricas(admin, perfil) {
  const { data: clinicaRow } = await admin
    .from("clinicas")
    .select("clinica")
    .eq("id", perfil.clinica_id)
    .maybeSingle();

  if (!clinicaRow)
    return { status: 404, corpo: { erro: "clinica_nao_encontrada" } };

  const { count: totalConversas, error: erroConversas } = await admin
    .from("conversas")
    .select("id", { count: "exact", head: true })
    .eq("clinica", clinicaRow.clinica);

  const { count: totalEscalonamentos, error: erroEscalonamentos } = await admin
    .from("conversas")
    .select("id", { count: "exact", head: true })
    .eq("clinica", clinicaRow.clinica)
    .eq("escalado", true);

  const { count: agendamentosAtivos, error: erroAgendAtivos } = await admin
    .from("agendamentos")
    .select("id", { count: "exact", head: true })
    .eq("clinica_id", perfil.clinica_id)
    .eq("status", "agendado")
    .gte("data_hora", new Date().toISOString());

  if (erroConversas || erroEscalonamentos || erroAgendAtivos) {
    return { status: 500, corpo: { erro: "falha_buscar" } };
  }

  return {
    status: 200,
    corpo: {
      ok: true,
      nome: perfil.nome || null,
      total_conversas: totalConversas || 0,
      total_escalonamentos: totalEscalonamentos || 0,
      agendamentos_ativos: agendamentosAtivos || 0,
    },
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");

  const auth = await autenticarClinica(req, res);
  if (auth.erro) return res.status(auth.erro.status).json(auth.erro.corpo);
  const { admin, perfil } = auth;

  if (req.method === "GET") {
    const acao = req.query?.acao;
    if (acao === "config") {
      const resultado = await acaoConfig(admin, perfil);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (acao === "metricas") {
      const resultado = await acaoMetricas(admin, perfil);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (acao === "exportar") {
      const resultado = await acaoExportar(admin, perfil, req.query);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (acao === "assinatura") {
      const resultado = await acaoAssinaturaDetalhes(admin, perfil);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (acao === "conversas") {
      const resultado = await acaoConversas(admin, perfil);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (acao === "sugestao_nome") {
      const resultado = await acaoBuscarSugestaoNome(admin, perfil, req.query);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (acao === "feriados") {
      const resultado = await acaoListarFeriados(admin, perfil);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (acao === "fila") {
      if (!(await filaTierCompleto(admin, perfil.clinica_id)))
        return res.status(403).json({
          ok: false,
          erro: "fila_disponivel_apenas_no_completo",
          codigo: "TIER_COMPLETO_OBRIGATORIO",
        });
      const resultado = await acaoListarFila(admin, perfil);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (acao === "logout") {
      const supabase = createSupabaseServerClient(req, res);
      await supabase.auth.signOut();
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ erro: "acao_invalida" });
  }

  if (req.method === "POST") {
    const rl = await rateLimit(
      "painel:" + perfil.id,
      MAX_MUTACOES,
      JANELA_MUTACOES_MS,
    );
    if (rl.blocked) {
      return res.status(429).json({
        erro: "muitas_requisicoes",
        mensagem: "Muitas acoes seguidas. Aguarde um momento e tente de novo.",
      });
    }

    let body;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ erro: "payload_invalido" });
    }

    // Gate de assinatura: com a clinica "expirado" nenhuma mutacao passa,
    // mesmo que o cliente contorne o overlay do painel chamando a API direto.
    if (acaoBloqueadaExpirado(body?.acao)) {
      const status = await statusClinica(admin, perfil);
      if (status === "expirado") {
        return res
          .status(402)
          .json({ erro: "assinatura_expirada", acao: body?.acao || null });
      }
    }

    if (body?.acao === "tempo_pausa") {
      const resultado = await acaoTempoPausa(admin, perfil, body);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (body?.acao === "telefone_alerta") {
      const resultado = await acaoTelefoneAlerta(admin, perfil, body);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (body?.acao === "portal_sessao") {
      const resultado = await acaoPortalSessao(admin, perfil);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (body?.acao === "checkout_reativacao") {
      const resultado = await acaoCheckoutReativacao(admin, perfil, body, req);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (body?.acao === "pausar_conversa") {
      const resultado = await acaoPausarConversa(admin, perfil, body);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (body?.acao === "retomar_conversa") {
      const resultado = await acaoRetomarConversa(admin, perfil, body);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (body?.acao === "criar_agendamento") {
      const resultado = await acaoCriarAgendamento(admin, perfil, body);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (body?.acao === "remarcar_agendamento") {
      const resultado = await acaoRemarcarAgendamento(admin, perfil, body);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (body?.acao === "cancelar_agendamento") {
      const resultado = await acaoCancelarAgendamento(admin, perfil, body);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (body?.acao === "adicionar_feriado") {
      const resultado = await acaoAdicionarFeriado(admin, perfil, body);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (body?.acao === "remover_feriado") {
      const resultado = await acaoRemoverFeriado(admin, perfil, body);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (body?.acao === "atualizar_perfil") {
      const resultado = await acaoAtualizarPerfil(admin, perfil, body);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (body?.acao === "reembolso") {
      const resultado = await acaoReembolso(admin, perfil, body);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (body?.acao === "salvar_nome_cliente") {
      const resultado = await acaoSalvarNomeCliente(admin, perfil, body);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (FILA_ACOES.includes(body?.acao)) {
      if (!(await filaTierCompleto(admin, perfil.clinica_id)))
        return res.status(403).json({
          ok: false,
          erro: "fila_disponivel_apenas_no_completo",
          codigo: "TIER_COMPLETO_OBRIGATORIO",
        });
      const resultado = await acaoResponderFila(admin, perfil, req, body);
      return res.status(resultado.status).json(resultado.corpo);
    }
    return res.status(400).json({ erro: "acao_invalida" });
  }

  return res.status(405).json({ erro: "metodo" });
}
