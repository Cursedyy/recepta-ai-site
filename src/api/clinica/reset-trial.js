import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/clinica/reset-trial
 *
 * Deleta uma clínica (e seus perfis) que não conseguiu conectar a instância
 * UazAPI, permitindo que o n8n recrie o fluxo de onboarding do zero.
 *
 * Body: { clinica_id: "uuid" }
 * Header: X-Api-Key: <RESET_TRIAL_KEY>
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "metodo_invalido" });
  }

  // ── Autenticação por API key ──────────────────────────────────────────
  const apiKey = process.env.RESET_TRIAL_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ erro: "RESET_TRIAL_KEY nao configurado no servidor" });
  }
  const chave = req.headers["x-api-key"];
  if (!chave || chave !== apiKey) {
    return res.status(401).json({ erro: "chave_invalida" });
  }

  // ── Validar input ─────────────────────────────────────────────────────
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ erro: "payload_invalido" });
  }
  const clinicaId = body?.clinica_id;
  if (!clinicaId || typeof clinicaId !== "string") {
    return res.status(400).json({ erro: "clinica_id_obrigatorio" });
  }

  // ── Supabase admin ────────────────────────────────────────────────────
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return res.status(500).json({ erro: "supabase_nao_configurado" });
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });

  // ── Verificar se a clínica existe ─────────────────────────────────────
  const { data: clinica, error: erroBusca } = await admin
    .from("clinicas")
    .select("id, clinica")
    .eq("id", clinicaId)
    .maybeSingle();

  if (erroBusca) {
    return res.status(500).json({ erro: "falha_buscar_clinica" });
  }
  if (!clinica) {
    return res.status(404).json({ erro: "clinica_nao_encontrada" });
  }

  // ── Deletar perfis vinculados ─────────────────────────────────────────
  await admin.from("perfis").delete().eq("clinica_id", clinicaId);

  // ── Deletar convites vinculados ───────────────────────────────────────
  await admin.from("convites_clinica").delete().eq("clinica_id", clinicaId);

  // ── Deletar a clínica ─────────────────────────────────────────────────
  const { error: erroDelete } = await admin
    .from("clinicas")
    .delete()
    .eq("id", clinicaId);

  if (erroDelete) {
    return res.status(500).json({ erro: "falha_deletar_clinica" });
  }

  return res.status(200).json({
    ok: true,
    mensagem: "Clínica removida. Pode recriar o fluxo de onboarding.",
    clinica_id: clinicaId,
    clinica_nome: clinica.clinica,
  });
}
