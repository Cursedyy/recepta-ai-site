import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../_lib/supabase-server.js";
import { autenticarClinica } from "../_lib/auth-clinica.js";
import { rateLimit } from "../_lib/rate-limit.js";

const MIN_MINUTOS = 1;
const MAX_MINUTOS = 120;
const STRIPE_RETURN_URL = "https://www.receptaai.com.br/clinica/painel";

// Mutacoes do painel: 60 por minuto por usuario. Uso normal fica muito
// abaixo disso; o limite existe para conter loop no client ou conta
// comprometida cancelando a agenda inteira. Chave por usuario, nao por IP:
// aqui ja passamos da autenticacao e clinicas compartilham IP de consultorio.
const MAX_MUTACOES = 60;
const JANELA_MUTACOES_MS = 60 * 1000;

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

async function resolverNomeClinica(admin, perfil) {
  const { data } = await admin
    .from("clinicas")
    .select("clinica")
    .eq("id", perfil.clinica_id)
    .maybeSingle();
  return data?.clinica || null;
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

  const { error } = await admin.from("conversas_pausadas").upsert(
    {
      telefone,
      clinica: nomeClinica,
      pausada: true,
      pausada_em: new Date().toISOString(),
    },
    { onConflict: "telefone,clinica" },
  );

  if (error) {
    console.error("pausar_conversa_erro", error.message);
    return {
      status: 500,
      corpo: {
        erro: "falha_pausar",
        detalhe:
          "Tabela conversas_pausadas não existe. Execute o SQL de migração.",
      },
    };
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

  const { error } = await admin
    .from("conversas_pausadas")
    .delete()
    .eq("telefone", telefone)
    .eq("clinica", nomeClinica);

  if (error) {
    console.error("retomar_conversa_erro", error.message);
    return {
      status: 500,
      corpo: {
        erro: "falha_retomar",
        detalhe:
          "Tabela conversas_pausadas não existe. Execute o SQL de migração.",
      },
    };
  }

  return { status: 200, corpo: { ok: true, pausada: false } };
}

// Normaliza para E.164 sem "+", o formato que a tabela conversas ja usa
// ("5553991635302"). O telefone importa: o cron de lembretes manda WhatsApp
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
      data_hora: data.toISOString(),
      status: "agendado",
    })
    .select("id,paciente_telefone,data_hora,status,cancelado_em")
    .maybeSingle();

  if (error) {
    console.error("criar_agendamento_erro", error.message);
    return { status: 500, corpo: { erro: "falha_criar" } };
  }

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

  // Atualizar data/hora
  const { error: erroUpdate } = await admin
    .from("agendamentos")
    .update({ data_hora: novaData.toISOString() })
    .eq("id", agendamentoId);

  if (erroUpdate) {
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
    .select("id,telefone,clinica,role,mensagem,criado_em")
    .eq("clinica", nomeClinica)
    .order("criado_em", { ascending: false })
    .limit(CONVERSAS_LIMITE);

  if (error) return { status: 500, corpo: { erro: "falha_buscar" } };
  return { status: 200, corpo: { ok: true, conversas: data || [] } };
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
    if (acao === "metricas") {
      const resultado = await acaoMetricas(admin, perfil);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (acao === "exportar") {
      const resultado = await acaoExportar(admin, perfil, req.query);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (acao === "conversas") {
      const resultado = await acaoConversas(admin, perfil);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (acao === "feriados") {
      const resultado = await acaoListarFeriados(admin, perfil);
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

    if (body?.acao === "tempo_pausa") {
      const resultado = await acaoTempoPausa(admin, perfil, body);
      return res.status(resultado.status).json(resultado.corpo);
    }
    if (body?.acao === "portal_sessao") {
      const resultado = await acaoPortalSessao(admin, perfil);
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
    return res.status(400).json({ erro: "acao_invalida" });
  }

  return res.status(405).json({ erro: "metodo" });
}
