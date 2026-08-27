import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../_lib/supabase-server.js";

async function autenticar(req, res) {
  const supabase = createSupabaseServerClient(req, res);
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return { erro: { status: 401, corpo: { erro: "nao_autenticado" } } };

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { erro: { status: 500, corpo: { erro: "supabase_nao_configurado" } } };

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: perfil } = await admin.from("perfis").select("papel,clinica_id,ativo").eq("id", user.id).maybeSingle();

  if (!perfil || perfil.papel !== "clinica" || !perfil.ativo || !perfil.clinica_id) {
    return { erro: { status: 403, corpo: { erro: "sem_permissao" } } };
  }
  return { admin, perfil };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");

  let auth;
  try { auth = await autenticar(req, res); } catch { return res.status(500).json({ erro: "supabase_nao_configurado" }); }
  if (auth.erro) return res.status(auth.erro.status).json(auth.erro.corpo);
  const { admin, perfil } = auth;

  // GET: listar feriados
  if (req.method === "GET") {
    const { data, error } = await admin.from("feriados").select("id,data,nome").eq("clinica_id", perfil.clinica_id).order("data", { ascending: true });
    if (error) return res.status(500).json({ erro: "falha_buscar" });
    return res.status(200).json({ ok: true, feriados: data || [] });
  }

  // POST: adicionar/remover feriado
  if (req.method === "POST") {
    let body;
    try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; } catch { return res.status(400).json({ erro: "payload_invalido" }); }

    if (body?.acao === "adicionar") {
      const data = body?.data;
      const nome = typeof body?.nome === "string" ? body.nome.trim() : null;
      if (!data) return res.status(400).json({ erro: "data_obrigatoria" });
      const { error } = await admin.from("feriados").insert({ clinica_id: perfil.clinica_id, data, nome });
      if (error) {
        if (error.code === "23505") return res.status(409).json({ erro: "data_ja_cadastrada" });
        return res.status(500).json({ erro: "falha_salvar" });
      }
      return res.status(200).json({ ok: true });
    }

    if (body?.acao === "remover") {
      const id = body?.id;
      if (!id) return res.status(400).json({ erro: "id_obrigatorio" });
      const { error } = await admin.from("feriados").delete().eq("id", id).eq("clinica_id", perfil.clinica_id);
      if (error) return res.status(500).json({ erro: "falha_remover" });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ erro: "acao_invalida" });
  }

  return res.status(405).json({ erro: "metodo" });
}
