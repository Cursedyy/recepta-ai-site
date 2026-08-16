import { createClient } from "@supabase/supabase-js";
import { nanoid } from "nanoid";

const VALIDADE_HORAS = 48;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  if (req.method !== "POST") return res.status(405).json({ erro: "metodo" });

  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== process.env.CLINICA_CONVITE_API_KEY) {
    return res.status(401).json({ erro: "nao_autorizado" });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ erro: "payload_invalido" });
  }

  const clinicaId =
    typeof body?.clinica_id === "string" ? body.clinica_id.trim() : "";
  if (!clinicaId)
    return res.status(400).json({ erro: "clinica_id_obrigatorio" });

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey)
    return res.status(500).json({ erro: "supabase_nao_configurado" });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: clinicaRow, error: erroClinica } = await admin
    .from("clinicas")
    .select("id")
    .eq("id", clinicaId)
    .maybeSingle();

  if (erroClinica || !clinicaRow)
    return res.status(404).json({ erro: "clinica_nao_encontrada" });

  const token = nanoid(24);
  const expiraEm = new Date(
    Date.now() + VALIDADE_HORAS * 60 * 60 * 1000,
  ).toISOString();

  const { error: erroInsert } = await admin.from("convites_clinica").insert({
    clinica_id: clinicaId,
    token,
    expira_em: expiraEm,
  });

  if (erroInsert) return res.status(500).json({ erro: "falha_criar_convite" });

  const base = process.env.SITE_URL || "https://www.receptaai.com.br";
  return res.status(200).json({
    ok: true,
    token,
    expira_em: expiraEm,
    url: base + "/clinica/definir-senha/" + token,
  });
}
