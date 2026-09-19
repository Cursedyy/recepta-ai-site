import { autenticarClinica } from "../_lib/auth-clinica.js";
import { validarConfigEditavel } from "../_lib/config-editavel.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  if (req.method !== "POST") return res.status(405).json({ erro: "metodo" });

  const auth = await autenticarClinica(req, res);
  if (auth.erro) return res.status(auth.erro.status).json(auth.erro.corpo);
  const { admin, perfil } = auth;

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ erro: "payload_invalido" });
  }

  // Gate de assinatura: com a clinica "expirado" o painel inteiro esta
  // bloqueado (overlay server-rendered em painel-view). Aqui e a camada
  // servidor do mesmo gate — a validacao em si so acontece se a clinica
  // pode de fato salvar.
  const { data: clinicaStatus } = await admin
    .from("clinicas")
    .select("status")
    .eq("id", perfil.clinica_id)
    .maybeSingle();
  if (clinicaStatus?.status === "expirado") {
    return res.status(402).json({ erro: "assinatura_expirada" });
  }

  const validado = validarConfigEditavel(body);
  if (!validado.ok) return res.status(400).json({ erro: validado.erro });

  const { error: erroUpdate } = await admin
    .from("clinicas")
    .update({ config_editavel: validado.limpo })
    .eq("id", perfil.clinica_id);

  if (erroUpdate) return res.status(500).json({ erro: "falha_salvar" });

  return res.status(200).json({ ok: true, config: validado.limpo });
}
