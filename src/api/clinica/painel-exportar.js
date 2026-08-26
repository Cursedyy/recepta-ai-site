import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../_lib/supabase-server.js";

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

  if (!perfil || !perfil.ativo) {
    return { erro: { status: 403, corpo: { erro: "sem_permissao" } } };
  }

  return { admin, perfil };
}

function escapeCsv(valor) {
  const str = String(valor || "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");

  if (req.method !== "GET") {
    return res.status(405).json({ erro: "metodo" });
  }

  let auth;
  try {
    auth = await autenticar(req, res);
  } catch {
    return res.status(500).json({ erro: "supabase_nao_configurado" });
  }
  if (auth.erro) return res.status(auth.erro.status).json(auth.erro.corpo);
  const { admin, perfil } = auth;

  // Filtros opcionais
  const clinicaFiltro = req.query?.clinica || null;
  const dataInicio = req.query?.inicio || null;
  const dataFim = req.query?.fim || null;

  let query = admin
    .from("conversas")
    .select("telefone,clinica,role,mensagem,criado_em")
    .order("criado_em", { ascending: true });

  // Se for clínica, filtra pela própria
  if (perfil.papel === "clinica" && perfil.clinica_id) {
    const { data: clinicaRow } = await admin
      .from("clinicas")
      .select("clinica")
      .eq("id", perfil.clinica_id)
      .maybeSingle();
    if (clinicaRow?.clinica) {
      query = query.eq("clinica", clinicaRow.clinica);
    }
  } else if (clinicaFiltro) {
    query = query.eq("clinica", clinicaFiltro);
  }

  if (dataInicio) {
    query = query.gte("criado_em", dataInicio);
  }
  if (dataFim) {
    query = query.lte("criado_em", dataFim);
  }

  const { data: conversas, error } = await query.limit(10000);

  if (error) {
    console.error("exportar_erro", error.message);
    return res.status(500).json({ erro: "falha_exportar" });
  }

  if (!conversas || !conversas.length) {
    return res.status(200).json({ ok: true, csv: "", total: 0 });
  }

  // Montar CSV
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
      escapeCsv(c.role === "ia" ? "IA" : "Paciente"),
      escapeCsv(c.mensagem),
    ].join(",");
  });

  const csv = header + "\n" + linhas.join("\n");

  // Retornar como JSON com o CSV (facilita download no frontend)
  return res.status(200).json({ ok: true, csv, total: conversas.length });
}
