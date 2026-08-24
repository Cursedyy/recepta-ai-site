import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  if (req.method !== "POST") return res.status(405).json({ erro: "metodo" });

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ erro: "payload_invalido" });
  }

  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const senha = typeof body?.senha === "string" ? body.senha : "";

  if (!token || !email || !senha)
    return res.status(400).json({ erro: "campos_obrigatorios" });
  if (senha.length < 8) return res.status(400).json({ erro: "senha_curta" });

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey)
    return res.status(500).json({ erro: "supabase_nao_configurado" });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: convite, error: erroConvite } = await admin
    .from("convites_clinica")
    .select("id,clinica_id,tipo,expira_em,usado_em")
    .eq("token", token)
    .maybeSingle();

  if (erroConvite || !convite)
    return res.status(404).json({ erro: "convite_invalido" });
  if (convite.usado_em) return res.status(410).json({ erro: "convite_usado" });
  if (new Date(convite.expira_em) < new Date())
    return res.status(410).json({ erro: "convite_expirado" });

  if (convite.tipo === "reset") {
    const { data: perfilExistente } = await admin
      .from("perfis")
      .select("id")
      .eq("clinica_id", convite.clinica_id)
      .eq("papel", "clinica")
      .maybeSingle();

    if (!perfilExistente)
      return res.status(404).json({ erro: "usuario_nao_encontrado" });

    const { error: erroUpdate } = await admin.auth.admin.updateUserById(
      perfilExistente.id,
      { password: senha },
    );
    if (erroUpdate)
      return res.status(500).json({ erro: "falha_redefinir_senha" });

    await admin
      .from("convites_clinica")
      .update({ usado_em: new Date().toISOString() })
      .eq("id", convite.id);

    return res.status(200).json({ ok: true });
  }

  const { data: clinicaRow } = await admin
    .from("clinicas")
    .select("clinica")
    .eq("id", convite.clinica_id)
    .maybeSingle();

  const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });

  if (erroCriar || !criado?.user) {
    const duplicado = /already.*registered|already exists/i.test(
      erroCriar?.message || "",
    );
    return res.status(duplicado ? 409 : 400).json({
      erro: duplicado ? "email_ja_cadastrado" : "nao_foi_possivel_criar_conta",
    });
  }

  const { error: erroPerfil } = await admin.from("perfis").insert({
    id: criado.user.id,
    clinica_id: convite.clinica_id,
    nome: clinicaRow?.clinica || null,
    papel: "clinica",
  });

  if (erroPerfil) {
    // reverte o usuario recem-criado pra nao deixar auth.users orfao sem perfil
    await admin.auth.admin.deleteUser(criado.user.id);
    return res.status(500).json({ erro: "falha_criar_perfil" });
  }

  await admin
    .from("convites_clinica")
    .update({ usado_em: new Date().toISOString() })
    .eq("id", convite.id);

  return res.status(200).json({ ok: true });
}
