import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../_lib/supabase-server.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  if (req.method !== "GET") return res.status(405).json({ erro: "metodo" });

  let supabase;
  try {
    supabase = createSupabaseServerClient(req, res);
  } catch {
    return res.status(500).json({ erro: "supabase_nao_configurado" });
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return res.status(401).json({ erro: "nao_autenticado" });

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey)
    return res.status(500).json({ erro: "supabase_nao_configurado" });

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
    return res.status(403).json({ erro: "sem_permissao" });
  }

  const { data: agendamentos, error: erroBusca } = await admin
    .from("agendamentos")
    .select("id,paciente_telefone,data_hora,status,cancelado_em")
    .eq("clinica_id", perfil.clinica_id)
    .order("data_hora", { ascending: true });

  if (erroBusca) return res.status(500).json({ erro: "falha_buscar" });

  return res.status(200).json({ ok: true, agendamentos: agendamentos || [] });
}
