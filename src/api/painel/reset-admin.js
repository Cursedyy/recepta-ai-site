import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { rateLimit, getClientIp } from "../_lib/rate-limit.js";

const MAX_PEDIDOS = 3;
const JANELA_MS = 15 * 60 * 1000;
const REDIRECT_PATH = "/painel?recovery=1";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  if (req.method !== "POST") return res.status(405).json({ erro: "metodo" });

  const rl = await rateLimit(
    "reset-admin:" + getClientIp(req),
    MAX_PEDIDOS,
    JANELA_MS,
  );
  if (rl.blocked)
    return res.status(429).json({
      erro: "muitas_tentativas",
      mensagem: "Muitos pedidos. Tente novamente mais tarde.",
    });

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ erro: "payload_invalido" });
  }

  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const resposta = () =>
    res.status(200).json({
      ok: true,
      mensagem: "Se esse email for de uma conta admin, enviaremos um link.",
    });
  if (!email) return res.status(400).json({ erro: "email_obrigatorio" });

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!url || !serviceKey || !resendKey)
    return res.status(500).json({ erro: "servico_nao_configurado" });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  const authRes = await fetch(
    url + "/auth/v1/admin/users?email=" + encodeURIComponent(email),
    { headers: { Authorization: "Bearer " + serviceKey, apikey: serviceKey } },
  );
  if (!authRes.ok) return res.status(500).json({ erro: "falha_buscar_usuario" });
  const authData = await authRes.json();
  const usuario = (authData?.users || []).find(
    (u) => (u.email || "").toLowerCase() === email,
  );
  if (!usuario) return resposta();

  const { data: perfil } = await admin
    .from("perfis")
    .select("id")
    .eq("id", usuario.id)
    .eq("papel", "admin")
    .maybeSingle();
  if (!perfil) return resposta();

  const base = process.env.SITE_URL || "https://www.receptaai.com.br";
  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: base + REDIRECT_PATH },
    });
  if (linkError || !linkData?.properties?.action_link)
    return res.status(500).json({ erro: "falha_gerar_link" });

  const resend = new Resend(resendKey);
  const { error: emailError } = await resend.emails.send({
    from: process.env.RESEND_FROM || "Recepta AI <no-reply@receptaai.com.br>",
    to: email,
    subject: "Redefinir senha do painel Recepta AI",
    html:
      "<p>Recebemos um pedido para redefinir sua senha administrativa.</p>" +
      '<p><a href="' + escapeHtml(linkData.properties.action_link) + '">Redefinir minha senha</a></p>' +
      "<p>Se você não fez este pedido, ignore este email.</p>",
  });
  if (emailError) return res.status(500).json({ erro: "falha_enviar_email" });
  return resposta();
}
