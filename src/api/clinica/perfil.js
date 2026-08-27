import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../_lib/supabase-server.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  if (req.method !== "POST") return res.status(405).json({ erro: "metodo" });

  let supabase;
  try { supabase = createSupabaseServerClient(req, res); } catch { return res.status(500).json({ erro: "supabase_nao_configurado" }); }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return res.status(401).json({ erro: "nao_autenticado" });

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ erro: "supabase_nao_configurado" });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: perfil } = await admin.from("perfis").select("papel,clinica_id,ativo").eq("id", user.id).maybeSingle();
  if (!perfil || perfil.papel !== "clinica" || !perfil.ativo) {
    return res.status(403).json({ erro: "sem_permissao" });
  }

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; } catch { return res.status(400).json({ erro: "payload_invalido" }); }

  const erros = [];

  // Atualizar nome
  if (typeof body?.nome === "string" && body.nome.trim()) {
    const nome = body.nome.trim();
    if (nome.length > 100) { erros.push("Nome muito longo (máx 100 caracteres)."); }
    else {
      const { error } = await admin.from("perfis").update({ nome }).eq("id", user.id);
      if (error) erros.push("Falha ao salvar nome.");
    }
  }

  // Atualizar senha
  if (typeof body?.senha_atual === "string" && typeof body?.nova_senha === "string") {
    if (body.nova_senha.length < 8) {
      erros.push("A nova senha precisa ter pelo menos 8 caracteres.");
    } else {
      // Verificar senha atual via signIn
      const tempClient = createClient(url, process.env.SUPABASE_ANON_KEY);
      const { data: emailUser } = await admin.auth.admin.getUserById(user.id);
      const email = emailUser?.user?.email;
      if (!email) {
        erros.push("Não foi possível verificar a senha atual.");
      } else {
        const { error: loginError } = await tempClient.auth.signInWithPassword({ email, password: body.senha_atual });
        if (loginError) {
          erros.push("A senha atual está incorreta.");
        } else {
          const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { password: body.nova_senha });
          if (updateError) erros.push("Falha ao atualizar senha.");
        }
      }
    }
  }

  if (erros.length) return res.status(400).json({ erro: "erros", detalhes: erros });
  return res.status(200).json({ ok: true });
}
