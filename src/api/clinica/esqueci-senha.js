import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { nanoid } from "nanoid";

const VALIDADE_HORAS = 2;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  if (req.method !== "POST") return res.status(405).json({ erro: "metodo" });

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

  // ponytail: listUsers sem filtro de email nativo no supabase-js -- scan
  // simples de 1 pagina, ok pro volume atual de clinicas. Se crescer muito,
  // trocar por GET /auth/v1/admin/users?email= direto via REST.
  const { data: listaUsuarios, error: erroLista } =
    await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (erroLista) return res.status(500).json({ erro: "falha_buscar_usuario" });

  const usuario = listaUsuarios.users.find(
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
      linkReset +
      '">Clique aqui para criar uma nova senha</a></p>' +
      "<p>Este link expira em " +
      VALIDADE_HORAS +
      " horas. Se voce nao pediu isso, ignore este email.</p>",
  });
  if (erroEmail) {
    console.error("resend_erro", JSON.stringify(erroEmail));
    return res.status(500).json({ erro: "falha_enviar_email" });
  }

  return respostaGenerica();
}
