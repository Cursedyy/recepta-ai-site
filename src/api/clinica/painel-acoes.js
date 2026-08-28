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

function escapeCsv(valor) {
  const str = String(valor || "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

async function acaoExportar(admin, perfil, query) {
  const clinicaFiltro = query?.clinica || null;
  const dataInicio = query?.inicio || null;
  const dataFim = query?.fim || null;

  let q = admin
    .from("conversas")
    .select("telefone,clinica,role,mensagem,criado_em")
    .order("criado_em", { ascending: true });

  if (perfil.papel === "clinica" && perfil.clinica_id) {
    const { data: clinicaRow } = await admin
      .from("clinicas")
      .select("clinica")
      .eq("id", perfil.clinica_id)
      .maybeSingle();
    if (clinicaRow?.clinica) q = q.eq("clinica", clinicaRow.clinica);
  } else if (clinicaFiltro) {
    q = q.eq("clinica", clinicaFiltro);
  }

  if (dataInicio) q = q.gte("criado_em", dataInicio);
  if (dataFim) q = q.lte("criado_em", dataFim);

  const { data: conversas, error } = await q.limit(10000);
  if (error) return { status: 500, corpo: { erro: "falha_exportar" } };
  if (!conversas || !conversas.length)
    return { status: 200, corpo: { ok: true, csv: "", total: 0 } };

  const header = "Data,Hora,Telefone,Clínica,Papel,Mensagem";
  const linhas = conversas.map((c) => {
    const dt = new Date(c.criado_em);
    const data = dt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const hora = dt.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
    return [
      escapeCsv(data), escapeCsv(hora), escapeCsv(c.telefone),
      escapeCsv(c.clinica), escapeCsv(c.role === "ia" ? "Recepta" : "Paciente"),
      escapeCsv(c.mensagem)
    ].join(",");
  });

  return { status: 200, corpo: { ok: true, csv: header + "\n" + linhas.join("\n"), total: conversas.length } };
}

async function acaoListarFeriados(admin, perfil) {
  const { data, error } = await admin.from("feriados").select("id,data,nome").eq("clinica_id", perfil.clinica_id).order("data", { ascending: true });
  if (error) return { status: 500, corpo: { erro: "falha_buscar" } };
  return { status: 200, corpo: { ok: true, feriados: data || [] } };
}

async function acaoAdicionarFeriado(admin, perfil, body) {
  const data = body?.data;
  const nome = typeof body?.nome === "string" ? body.nome.trim() : null;
  if (!data) return { status: 400, corpo: { erro: "data_obrigatoria" } };
  const { error } = await admin.from("feriados").insert({ clinica_id: perfil.clinica_id, data, nome });
  if (error) {
    if (error.code === "23505") return { status: 409, corpo: { erro: "data_ja_cadastrada" } };
    return { status: 500, corpo: { erro: "falha_salvar" } };
  }
  return { status: 200, corpo: { ok: true } };
}

async function acaoRemoverFeriado(admin, perfil, body) {
  const id = body?.id;
  if (!id) return { status: 400, corpo: { erro: "id_obrigatorio" } };
  const { error } = await admin.from("feriados").delete().eq("id", id).eq("clinica_id", perfil.clinica_id);
  if (error) return { status: 500, corpo: { erro: "falha_remover" } };
  return { status: 200, corpo: { ok: true } };
}

async function acaoAtualizarPerfil(admin, user, body) {
  const erros = [];
  if (typeof body?.nome === "string" && body.nome.trim()) {
    const nome = body.nome.trim();
    if (nome.length > 100) { erros.push("Nome muito longo (máx 100 caracteres)."); }
    else {
      const { error } = await admin.from("perfis").update({ nome }).eq("id", user.id);
      if (error) erros.push("Falha ao salvar nome.");
    }
  }
  if (typeof body?.senha_atual === "string" && typeof body?.nova_senha === "string") {
    if (body.nova_senha.length < 8) {
      erros.push("A nova senha precisa ter pelo menos 8 caracteres.");
    } else {
      const url = process.env.SUPABASE_URL;
      const tempClient = createClient(url, process.env.SUPABASE_ANON_KEY);
      const { data: emailUser } = await admin.auth.admin.getUserById(user.id);
      const email = emailUser?.user?.email;
      if (!email) { erros.push("Não foi possível verificar a senha atual."); }
      else {
        const { error: loginError } = await tempClient.auth.signInWithPassword({ email, password: body.senha_atual });
        if (loginError) { erros.push("A senha atual está incorreta."); }
        else {
          const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { password: body.nova_senha });
          if (updateError) erros.push("Falha ao atualizar senha.");
        }
      }
    }
  }
  if (erros.length) return { status: 400, corpo: { erro: "erros", detalhes: erros } };
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

  const { count: totalAgendamentos, error: erroAgendamentos } = await admin
    .from("agendamentos")
    .select("id", { count: "exact", head: true })
    .eq("clinica_id", perfil.clinica_id);

  const { count: agendamentosAtivos, error: erroAgendAtivos } = await admin
    .from("agendamentos")
    .select("id", { count: "exact", head: true })
    .eq("clinica_id", perfil.clinica_id)
    .eq("status", "agendado")
    .gte("data_hora", new Date().toISOString());

  if (erroConversas || erroEscalonamentos || erroAgendamentos || erroAgendAtivos) {
    return { status: 500, corpo: { erro: "falha_buscar" } };
  }

  return {
    status: 200,
    corpo: {
      ok: true,
      nome: perfil.nome || null,
      total_conversas: totalConversas || 0,
      total_escalonamentos: totalEscalonamentos || 0,
      total_agendamentos: totalAgendamentos || 0,
      agendamentos_ativos: agendamentosAtivos || 0,
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
    if (acao === "exportar") {
      const resultado = await acaoExportar(admin, perfil, req.query);
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
      const resultado = await acaoAtualizarPerfil(admin, { id: perfil.id || user.id }, body);
      return res.status(resultado.status).json(resultado.corpo);
    }
    return res.status(400).json({ erro: "acao_invalida" });
  }

  return res.status(405).json({ erro: "metodo" });
}
