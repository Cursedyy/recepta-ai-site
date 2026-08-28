import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { patchDaSubscription } from "../_lib/assinatura.js";

/**
 * Webhook do Stripe -> espelha o estado da assinatura em `clinicas`.
 *
 * POR QUE ESTA ROTA NAO VERIFICA A ASSINATURA `Stripe-Signature`:
 * verificar exige o corpo CRU, e o runtime da Vercel entrega o body ja
 * parseado. Em vez de brigar com isso, a rota trata o evento como um mero
 * "algo mudou neste customer" e vai LER O ESTADO REAL NA API DO STRIPE antes
 * de escrever qualquer coisa. Nenhum dado do corpo vira valor no banco.
 *
 * Consequencia de seguranca: quem descobrir a URL e o token so consegue
 * disparar uma releitura do Stripe, nunca escrever um estado escolhido por
 * ele. E mais forte que confiar no payload assinado, nao mais fraco.
 *
 * Amarracao clinica <-> customer, em ordem:
 *   1. `clinicas.stripe_customer_id` (clinica que ja comprou alguma vez)
 *   2. `metadata.clinica_id` ou `client_reference_id` do checkout
 * Sem nenhum dos dois o evento e ignorado com 200 (nao adianta o Stripe
 * reenviar: o dado que falta nao vai aparecer sozinho).
 */

function tokenConfere(recebido) {
  const esperado = process.env.STRIPE_WEBHOOK_TOKEN;
  if (!esperado || typeof recebido !== "string") return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  // timingSafeEqual estoura se os tamanhos diferem: comparar antes.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function lerCorpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let cru = "";
  for await (const chunk of req) cru += chunk;
  try {
    return JSON.parse(cru || "{}");
  } catch {
    return {};
  }
}

function extrairReferencias(evento) {
  const obj = evento?.data?.object || {};
  const customerId =
    typeof obj.customer === "string"
      ? obj.customer
      : obj.object === "customer" && typeof obj.id === "string"
        ? obj.id
        : null;
  const clinicaId = obj.metadata?.clinica_id || obj.client_reference_id || null;
  return { customerId, clinicaId };
}

async function buscarSubscription(stripeKey, customerId) {
  const params = new URLSearchParams();
  params.set("customer", customerId);
  params.set("status", "all");
  params.set("limit", "1");

  const resposta = await fetch(
    "https://api.stripe.com/v1/subscriptions?" + params.toString(),
    { headers: { Authorization: "Bearer " + stripeKey } },
  );
  const dados = await resposta.json();
  if (!resposta.ok) {
    console.error("stripe_webhook_busca_erro", JSON.stringify(dados?.error));
    return null;
  }
  return dados?.data?.[0] || null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "metodo" });

  if (!tokenConfere(req.query?.token)) {
    return res.status(401).json({ erro: "nao_autorizado" });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!stripeKey || !url || !serviceKey) {
    console.error("stripe_webhook_sem_config");
    return res.status(500).json({ erro: "nao_configurado" });
  }

  const evento = await lerCorpo(req);
  const { customerId, clinicaId } = extrairReferencias(evento);
  if (!customerId) {
    console.warn("stripe_webhook_sem_customer", evento?.type || "?");
    return res.status(200).json({ ok: true, ignorado: "sem_customer" });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  // Quem e a clinica deste customer?
  let alvo = null;
  const { data: porCustomer } = await admin
    .from("clinicas")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (porCustomer) alvo = porCustomer.id;

  if (!alvo && clinicaId) {
    const { data: porId } = await admin
      .from("clinicas")
      .select("id")
      .eq("id", clinicaId)
      .maybeSingle();
    if (porId) alvo = porId.id;
  }

  if (!alvo) {
    // Cliente pagou e nao conseguimos casar com uma clinica: e dinheiro
    // entrando sem acesso saindo. Grita no log, responde 200 para o Stripe
    // parar de reenviar um evento que reenvio nenhum resolve.
    console.error("stripe_webhook_clinica_nao_encontrada", customerId);
    return res.status(200).json({ ok: true, ignorado: "clinica_desconhecida" });
  }

  const subscription = await buscarSubscription(stripeKey, customerId);
  const patch = patchDaSubscription(subscription);
  if (!patch) {
    return res.status(200).json({ ok: true, ignorado: "sem_mudanca" });
  }

  patch.stripe_customer_id = customerId;

  const { error } = await admin.from("clinicas").update(patch).eq("id", alvo);
  if (error) {
    // 500 de proposito: aqui o Stripe REENVIAR resolve (falha transitoria do
    // banco), ao contrario dos ignorados acima.
    console.error("stripe_webhook_update_erro", error.message);
    return res.status(500).json({ erro: "falha_gravar" });
  }

  console.log("stripe_webhook_ok", evento?.type || "?", alvo, patch.status);
  return res.status(200).json({ ok: true, status: patch.status });
}
