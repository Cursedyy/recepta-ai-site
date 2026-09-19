import { createClient } from "@supabase/supabase-js";
import { rateLimit, getClientIp } from "./_lib/rate-limit.js";

const PRECOS = {
  essencial: {
    mensal: { env: "STRIPE_PRICE_ESSENCIAL_MENSAL", centavos: 49700, intervalo: "month" },
    anual: { env: "STRIPE_PRICE_ESSENCIAL_ANUAL", centavos: 416400, intervalo: "year" },
  },
  completo: {
    mensal: { env: "STRIPE_PRICE_COMPLETO_MENSAL", centavos: 99700, intervalo: "month" },
    anual: { env: "STRIPE_PRICE_COMPLETO_ANUAL", centavos: 836400, intervalo: "year" },
  },
};

const SITE_BASE = "https://www.receptaai.com.br";
const MAX_BYTES = 4 * 1024;
const JANELA_MS = 10 * 60 * 1000;

function falha(status, erro) {
  return { status, corpo: { erro } };
}

async function encerrarPedido(admin, pedidoId, motivo) {
  const { error } = await admin
    .from("pedidos")
    .update({
      status: "cancelado",
      encerrado_em: new Date().toISOString(),
      motivo_encerramento: motivo,
    })
    .eq("id", pedidoId)
    .eq("status", "aberto");
  if (error) console.error("checkout_compensacao_pedido_erro", pedidoId, motivo, error.message);
  return !error;
}

async function expirarSessaoStripe(sessionId) {
  try {
    const resposta = await stripeRequest(
      `/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      },
    );
    return resposta.ok;
  } catch (erro) {
    console.error("checkout_compensacao_stripe_erro", sessionId, erro.message);
    return false;
  }
}

async function stripeRequest(path, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`https://api.stripe.com${path}`, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function conferirPrecoStripe(priceId, esperado) {
  try {
    const resposta = await stripeRequest(
      `/v1/prices/${encodeURIComponent(priceId)}`,
      { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } },
      10000,
    );
    if (!resposta.ok) return { ok: false, detalhe: `HTTP ${resposta.status}` };
    const price = await resposta.json();
    if (price.active !== true) return { ok: false, detalhe: "price inativo" };
    if (price.livemode !== true) return { ok: false, detalhe: "price fora do modo live" };
    if (price.currency !== "brl") return { ok: false, detalhe: `moeda=${price.currency}` };
    if (price.unit_amount !== esperado.centavos)
      return { ok: false, detalhe: `unit_amount=${price.unit_amount}` };
    if (price.recurring?.interval !== esperado.intervalo)
      return { ok: false, detalhe: `interval=${price.recurring?.interval}` };
    return { ok: true };
  } catch (erro) {
    return { ok: false, detalhe: `rede: ${erro.message}` };
  }
}

/**
 * Núcleo compartilhado pela landing e pela reativação autenticada do painel.
 * Só cria o pedido aberto, a Checkout Session e persiste stripe_session_id.
 * O estado de cobrança continua pertencendo exclusivamente ao n8n.
 */
export async function criarCheckout({
  admin,
  tier,
  ciclo,
  ip,
  userAgent,
  origem = "landing",
  clinicaId = null,
  successUrl = `${SITE_BASE}/briefing`,
  cancelUrl = `${SITE_BASE}/?c=abandonado#planos`,
}) {
  const config = PRECOS[tier]?.[ciclo];
  if (!config) return falha(400, "tier_ou_ciclo_invalido");

  const priceId = process.env[config.env];
  if (!priceId) return falha(500, "price_nao_configurado");

  const pin = await conferirPrecoStripe(priceId, config);
  if (!pin.ok) {
    console.error("checkout_price_pin_falhou", config.env, pin.detalhe);
    return falha(500, "configuracao_preco_invalida");
  }

  const { data: pedido, error: erroPedido } = await admin
    .from("pedidos")
    .insert({
      status: "aberto",
      tier,
      ciclo,
      plano: ciclo,
      price_id: priceId,
      origem,
      clinica_id: clinicaId,
    })
    .select("id")
    .single();

  if (erroPedido || !pedido?.id) {
    console.error("checkout_pedido_erro", erroPedido?.message);
    return falha(500, "falha_criar_pedido");
  }

  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("success_url", `${successUrl}${successUrl.includes("?") ? "&" : "?"}pedido=${pedido.id}`);
  params.set("cancel_url", cancelUrl);
  params.set("client_reference_id", pedido.id);
  params.set("line_items[0][price]", priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("metadata[pedido_id]", pedido.id);
  params.set("subscription_data[metadata][pedido_id]", pedido.id);
  params.set("allow_promotion_codes", "false");

  let session;
  try {
    const resposta = await stripeRequest("/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": pedido.id,
      },
      body: params.toString(),
    });
    const texto = await resposta.text();
    if (!resposta.ok) {
      console.error("checkout_stripe_erro", resposta.status, texto.slice(0, 400));
      await encerrarPedido(admin, pedido.id, "stripe_recusou_session");
      return falha(502, "falha_criar_checkout");
    }
    session = JSON.parse(texto);
  } catch (erro) {
    console.error("checkout_stripe_rede", erro.message);
    await encerrarPedido(admin, pedido.id, "erro_rede_stripe");
    return falha(502, "falha_criar_checkout");
  }

  if (!session?.id || !session?.url) {
    const tinhaId = typeof session?.id === "string" && session.id.length > 0;
    const expirada = tinhaId ? await expirarSessaoStripe(session.id) : false;
    const motivo = tinhaId
      ? expirada
        ? "session_sem_url_expirada"
        : "session_sem_url_nao_expirada"
      : "stripe_resposta_sem_session_id";
    await encerrarPedido(admin, pedido.id, motivo);
    return falha(502, "resposta_checkout_invalida");
  }
  const { data: pedidoAtualizado, error: erroSessao } = await admin
    .from("pedidos")
    .update({ stripe_session_id: session.id })
    .eq("id", pedido.id)
    .eq("status", "aberto")
    .select("id")
    .single();
  if (erroSessao || !pedidoAtualizado?.id) {
    console.error("checkout_session_persistencia_erro", erroSessao?.message || "linha não retornada");
    const expirada = await expirarSessaoStripe(session.id);
    const encerrado = await encerrarPedido(
      admin,
      pedido.id,
      expirada ? "session_expirada_apos_falha_persistencia" : "falha_persistencia_session_nao_expirada",
    );
    console.error("checkout_session_compensada", {
      pedido_id: pedido.id,
      stripe_session_id: session.id,
      session_expirada: expirada,
      pedido_encerrado: encerrado,
    });
    return falha(503, "falha_salvar_pedido");
  }

  return { status: 200, corpo: { url: session.url, pedido_id: pedido.id } };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  if (req.method !== "POST") return res.status(405).json({ erro: "metodo" });

  const ip = getClientIp(req);
  const limite = await rateLimit(`checkout:${ip}`, 10, JANELA_MS);
  if (limite.blocked)
    return res.status(429).json({ erro: "muitas_tentativas", reset_ms: limite.resetMs });

  if (Number(req.headers["content-length"] || 0) > MAX_BYTES)
    return res.status(413).json({ erro: "payload_muito_grande" });

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.STRIPE_SECRET_KEY)
    return res.status(500).json({ erro: "servidor_nao_configurado" });

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ erro: "payload_invalido" });
  }

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const resultado = await criarCheckout({
    admin,
    tier: body?.tier,
    ciclo: body?.ciclo,
    ip,
    userAgent: req.headers["user-agent"],
  });
  return res.status(resultado.status).json(resultado.corpo);
}
