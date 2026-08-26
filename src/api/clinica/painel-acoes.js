import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../_lib/supabase-server.js";

const MIN_MINUTOS = 1;
const MAX_MINUTOS = 120;
const STRIPE_RETURN_URL = "https://www.receptaai.com.br/clinica/painel";

async function autenticar(req, res) {
  const supabase = createSupabaseServerClient(req, res);
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user)
    return { erro: { status: 401, corpo: { erro: "nao_autenticado" } } };

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return {
      erro: { status: 500, corpo: { erro: "supabase_nao_configurado" } },
    };
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: perfil } = await admin
    .from("perfis")
    .select("papel,clinica_id,ativo")
    .eq("id", user.id)
    .maybeSingle();

  if (
    !perfil ||
    perfil.papel !== "clinica" ||
    !perfil.ativo ||
    !perfil.clinica_id
  ) {
    return { erro: { status: 403, corpo: { erro: "sem_permissao" } } };
  }

  return { admin, perfil };
}

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
      corpo: { erro: "falha_stripe", detalhe: "Erro ao comunicar com o Stripe. Tente novamente." },
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
    { telefone, clinica: nomeClinica, pausada: true, pausada_em: new Date().toISOString() },
    { onConflict: "telefone,clinica" }
  );

  if (error) {
    console.error("pausar_conversa_erro", error.message);
    return { status: 500, corpo: { erro: "falha_pausar", detalhe: "Tabela conversas_pausadas não existe. Execute o SQL de migração." } };
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
    return { status: 500, corpo: { erro: "falha_retomar", detalhe: "Tabela conversas_pausadas não existe. Execute o SQL de migração." } };
  }

  return { status: 200, corpo: { ok: true, pausada: false } };
}

async function acaoCancelarAgendamento(admin, perfil, body) {
  const agendamentoId = body?.agendamento_id;
  if (!agendamentoId)
    return { status: 400, corpo: { erro: "parametros_invalidos" } };

  // Verificar se a clínica existe
  const { data: clinicaRow } = await admin
    .from("clinicas")
    .select("clinica")
    .eq("id", perfil.clinica_id)
    .maybeSingle();

  if (!clinicaRow)
    return { status: 404, corpo: { erro: "clinica_nao_encontrada" } };

  // Buscar o agendamento e verificar pertence à clínica
  const { data: agendamento, error: erroBusca } = await admin
    .from("agendamentos")
    .select("id,status")
    .eq("id", agendamentoId)
    .maybeSingle();

  if (erroBusca || !agendamento)
    return { status: 404, corpo: { erro: "agendamento_nao_encontrado" } };

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

  if (erroConversas || erroEscalonamentos) {
    return { status: 500, corpo: { erro: "falha_buscar" } };
  }

  return {
    status: 200,
    corpo: {
      ok: true,
      total_conversas: totalConversas || 0,
      total_escalonamentos: totalEscalonamentos || 0,
    },
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");

  let auth;
  try {
    auth = await autenticar(req, res);
  } catch {
    return res.status(500).json({ erro: "supabase_nao_configurado" });
  }
  if (auth.erro) return res.status(auth.erro.status).json(auth.erro.corpo);
  const { admin, perfil } = auth;

  if (req.method === "GET") {
    const acao = req.query?.acao;
    if (acao === "metricas") {
      const resultado = await acaoMetricas(admin, perfil);
      return res.status(resultado.status).json(resultado.corpo);
    }
    return res.status(400).json({ erro: "acao_invalida" });
  }

  if (req.method === "POST") {
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
    if (body?.acao === "cancelar_agendamento") {
      const resultado = await acaoCancelarAgendamento(admin, perfil, body);
      return res.status(resultado.status).json(resultado.corpo);
    }
    return res.status(400).json({ erro: "acao_invalida" });
  }

  return res.status(405).json({ erro: "metodo" });
}
