import { autenticarClinica } from "../_lib/auth-clinica.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  if (req.method !== "GET") return res.status(405).json({ erro: "metodo" });

  const auth = await autenticarClinica(req, res);
  if (auth.erro) return res.status(auth.erro.status).json(auth.erro.corpo);
  const { admin, perfil } = auth;

  const { data: agendamentos, error: erroBusca } = await admin
    .from("agendamentos")
    .select("id,paciente_telefone,data_hora,status,cancelado_em")
    .eq("clinica_id", perfil.clinica_id)
    .order("data_hora", { ascending: true });

  if (erroBusca) return res.status(500).json({ erro: "falha_buscar" });

  return res.status(200).json({ ok: true, agendamentos: agendamentos || [] });
}
