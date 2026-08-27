import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { nanoid } from "nanoid";
import { rateLimit, getClientIp } from "../_lib/rate-limit.js";

const VALIDADE_HORAS = 2;

// Máximo 3 pedidos de reset por IP a cada 15 minutos
const MAX_PEDIDOS = 3;
const JANELA_MS = 15 * 60 * 1000;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  if (req.method !== "POST") return res.status(405).json({ erro: "metodo" });

  // Rate limiting por IP
  const ip = getClientIp(req);
  const rl = await rateLimit("esqueci-senha:" + ip, MAX_PEDIDOS, JANELA_MS);
  if (rl.blocked) {
    const minutosReset = Math.ceil(rl.resetMs / 60000);
    return res.status(429).json({
      erro: "muitas_tentativas",
      mensagem: "Muitos pedidos. Tente novamente em " + minutosReset + " minuto" + (minutosReset > 1 ? "s" : "") + ".",
      restantes: 0,
    });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ erro: "payload_invalido" });
  }

  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return res.status(400).json({ erro: "email_obrigatorio" });

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!url || !serviceKey || !resendKey)
    return res.status(500).json({ erro: "servico_nao_configurado" });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  // resposta sempre generica: nao revela se o email tem conta ou nao
  const respostaGenerica = () =>
    res.status(200).json({
      ok: true,
      mensagem:
        "Se esse email tiver uma conta, enviamos um link de redefinicao.",
    });

  // Busca o usuario diretamente pelo REST API do Supabase Auth, filtrando
  // por email. Mais eficiente que listUsers (que escaneia tudo).
  const urlAuth = url + "/auth/v1/admin/users?email=" + encodeURIComponent(email);
  const authRes = await fetch(urlAuth, {
    headers: {
      Authorization: "Bearer " + serviceKey,
      apikey: serviceKey,
    },
  });
  if (!authRes.ok) return res.status(500).json({ erro: "falha_buscar_usuario" });
  const authData = await authRes.json();
  const usuarios = authData?.users || [];
  const usuario = usuarios.find(
    (u) => (u.email || "").toLowerCase() === email,
  );
  if (!usuario) return respostaGenerica();

  const { data: perfil } = await admin
    .from("perfis")
    .select("clinica_id")
    .eq("id", usuario.id)
    .eq("papel", "clinica")
    .maybeSingle();
  if (!perfil) return respostaGenerica();

  const token = nanoid(24);
  const expiraEm = new Date(
    Date.now() + VALIDADE_HORAS * 60 * 60 * 1000,
  ).toISOString();

  const { error: erroInsert } = await admin.from("convites_clinica").insert({
    clinica_id: perfil.clinica_id,
    token,
    expira_em: expiraEm,
    tipo: "reset",
  });
  if (erroInsert) return res.status(500).json({ erro: "falha_criar_convite" });

  const base = process.env.SITE_URL || "https://www.receptaai.com.br";
  const linkReset = base + "/clinica/definir-senha/" + token;

  const resend = new Resend(resendKey);
  const { error: erroEmail } = await resend.emails.send({
    from: process.env.RESEND_FROM || "Recepta AI <no-reply@receptaai.com.br>",
    to: email,
    subject: "Redefinir senha - Recepta AI",
    html:
      "<p>Recebemos um pedido para redefinir a senha do painel da sua clinica.</p>" +
      '<p><a href="' +
      escapeHtml(linkReset) +
      '">Clique aqui para criar uma nova senha</a></p>' +
      "<p>Este link expira em " +
      escapeHtml(String(VALIDADE_HORAS)) +
      " horas. Se voce nao pediu isso, ignore este email.</p>",
  });
  if (erroEmail) {
    console.error("resend_erro", JSON.stringify(erroEmail));
    return res.status(500).json({ erro: "falha_enviar_email" });
  }

  return respostaGenerica();
}
