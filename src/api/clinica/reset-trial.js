import { createClient } from "@supabase/supabase-js";
import { rateLimit } from "../_lib/rate-limit.js";

/**
 * POST /api/clinica/reset-trial
 *
 * Deleta uma clínica (e seus perfis) que não conseguiu conectar a instância
 * UazAPI, permitindo que o n8n recrie o fluxo de onboarding do zero.
 *
 * Body: { clinica_id: "uuid" }
 * Header: X-Api-Key: <RESET_TRIAL_KEY>
 *
 * PERIGO: esta rota APAGA dados e é alcançável a partir de `/api/submit`, que
 * é público e sem autenticação. O caminho é: briefing público -> n8n casa a
 * clínica PELO NOME -> `Já Existe?` -> esta rota. Como o nome de uma clínica é
 * informação pública, todo guard abaixo existe para garantir que só uma
 * clínica que NUNCA virou cliente possa ser removida. Na dúvida, recusa:
 * recriar um onboarding é barato, restaurar uma clínica apagada não é.
 */

// Tetos de destruição. O chamador legítimo é o n8n, que precisa de UMA chamada
// por briefing reenviado; qualquer volume acima disso é abuso ou loop.
// Por clínica: mata a estratégia de repetir até a instância piscar offline.
const MAX_POR_CLINICA = 3;
// Global: limita o estrago caso a RESET_TRIAL_KEY vaze.
const MAX_GLOBAL = 10;
const JANELA_MS = 60 * 60 * 1000;

/**
 * Guards que não dependem da rede. Devolve o corpo do 409, ou null se a
 * clínica pode ser resetada no que diz respeito ao cadastro.
 *
 * Quem chegou no checkout tem `stripe_customer_id`, e quem está `ativo` foi
 * liberado pelo workflow de cobrança do n8n (`cf1An4BYT9A0LuHi`, vocabulário
 * `ativo`/`expirado` — ver docs/runbook-producao.md). Nenhum dos dois é um
 * trial que falhou, então nenhum dos dois pode ser apagado por esta rota.
 * Estes guards não olham o estado momentâneo da UazAPI, que é justamente o
 * sinal frágil: o WhatsApp de um cliente pagante pode estar offline agora.
 */
export function bloqueioCadastral(clinica) {
  if (clinica?.stripe_customer_id || clinica?.stripe_subscription_id) {
    return {
      erro: "clinica_e_cliente",
      mensagem: "Clínica já passou pelo checkout. Não pode ser resetada.",
    };
  }
  if (clinica?.status === "ativo") {
    return {
      erro: "clinica_ativa",
      mensagem: "Clínica ativa. Não pode ser resetada.",
    };
  }
  return null;
}

/**
 * Guard sobre o estado da instância. `conectado` é true, false, ou null quando
 * não deu para saber.
 *
 * FAIL-CLOSED em null. A versão anterior deletava quando a UazAPI não
 * respondia, tratando "não sei" como "não conectou": uma queda da UazAPI
 * virava autorização para apagar a clínica. O n8n pode tentar de novo; a linha
 * do banco não volta.
 */
export function bloqueioDeInstancia(conectado) {
  if (conectado === true) {
    return {
      erro: "instancia_conectada",
      mensagem: "A instância já está conectada. O trial já foi usado.",
    };
  }
  if (conectado === null) {
    return {
      erro: "status_indisponivel",
      mensagem:
        "Não foi possível confirmar o estado da instância. Tente de novo.",
    };
  }
  return null;
}

/**
 * true / false / null (não deu para saber). Sem instância provisionada devolve
 * false: nada foi criado, então o trial não foi usado.
 */
async function instanciaConectada(clinica) {
  if (!clinica.uazapi_token || !clinica.uazapi_server) return false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(clinica.uazapi_server + "/instance/status", {
      headers: { token: clinica.uazapi_token },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    const dados = await r.json();
    const inst = dados?.instance || {};
    const conexao = dados?.status || {};
    return (
      inst.status === "connected" ||
      Boolean(conexao.connected && conexao.loggedIn)
    );
  } catch {
    return null;
  }
}

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

  // ── Rate limit ────────────────────────────────────────────────────────
  const rlClinica = await rateLimit(
    "reset-trial:" + clinicaId,
    MAX_POR_CLINICA,
    JANELA_MS,
  );
  if (rlClinica.blocked) {
    return res.status(429).json({ erro: "muitas_tentativas" });
  }
  const rlGlobal = await rateLimit("reset-trial:global", MAX_GLOBAL, JANELA_MS);
  if (rlGlobal.blocked) {
    return res.status(429).json({ erro: "muitas_tentativas_global" });
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
    .select(
      "id, clinica, uazapi_token, uazapi_server, status, stripe_customer_id",
    )
    .eq("id", clinicaId)
    .maybeSingle();

  if (erroBusca) {
    return res.status(500).json({ erro: "falha_buscar_clinica" });
  }
  if (!clinica) {
    return res.status(404).json({ erro: "clinica_nao_encontrada" });
  }

  // ── Guards ────────────────────────────────────────────────────────────
  // Cadastro primeiro: é barato e não gasta uma chamada na UazAPI para uma
  // clínica que já é cliente.
  const cadastral = bloqueioCadastral(clinica);
  if (cadastral) return res.status(409).json(cadastral);

  const instancia = bloqueioDeInstancia(await instanciaConectada(clinica));
  if (instancia) return res.status(409).json(instancia);

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
