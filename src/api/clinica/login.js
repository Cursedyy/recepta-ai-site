import { createSupabaseServerClient } from "../_lib/supabase-server.js";
import { rateLimit, getClientIp } from "../_lib/rate-limit.js";

// 5 tentativas por IP a cada 5 minutos
const MAX_TENTATIVAS = 5;
const JANELA_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  if (req.method !== "POST") return res.status(405).json({ erro: "metodo" });

  // Rate limiting por IP para prevenir brute force
  const ip = getClientIp(req);
  const rl = await rateLimit("login:" + ip, MAX_TENTATIVAS, JANELA_MS);
  if (rl.blocked) {
    const minutosReset = Math.ceil(rl.resetMs / 60000);
    return res.status(429).json({
      erro: "muitas_tentativas",
      mensagem: "Muitas tentativas. Tente novamente em " + minutosReset + " minuto" + (minutosReset > 1 ? "s" : "") + ".",
      restantes: 0,
    });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ erro: "payload_invalido" });
  }

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const senha = typeof body?.senha === "string" ? body.senha : "";
  if (!email || !senha)
    return res.status(400).json({ erro: "campos_obrigatorios" });

  let supabase;
  try {
    supabase = createSupabaseServerClient(req, res);
  } catch {
    return res.status(500).json({ erro: "supabase_nao_configurado" });
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (error) {
    return res.status(401).json({
      erro: "credenciais_invalidas",
      restantes: rl.restantes,
    });
  }

  return res.status(200).json({ ok: true });
}
