import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

/**
 * Suspende clinicas cujo trial venceu e que NUNCA chegaram ao Stripe.
 *
 * Quem tem subscription no Stripe nao passa por aqui: o proprio Stripe emite
 * `customer.subscription.updated` no fim do trial e `/api/stripe/webhook`
 * atualiza o status. Este cron existe para o outro caminho, que e o comum
 * hoje: o Onboarding do n8n cria a clinica com um trial dado pela casa, sem
 * customer nenhum. Sem este cron esse trial nunca acaba.
 *
 * Roda 1x por dia (ver `crons` em vercel.json). Idempotente: so toca em quem
 * ainda esta com status 'trial'.
 */

function autorizado(req) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  const header = req.headers?.authorization || "";
  const esperado = "Bearer " + segredo;
  const a = Buffer.from(header);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  // A Vercel manda o header Authorization: Bearer $CRON_SECRET nos crons.
  if (!autorizado(req)) return res.status(401).json({ erro: "nao_autorizado" });

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return res.status(500).json({ erro: "supabase_nao_configurado" });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const agora = new Date().toISOString();

  const { data, error } = await admin
    .from("clinicas")
    .update({ status: "suspensa" })
    .eq("status", "trial")
    .is("stripe_subscription_id", null)
    .lt("trial_fim", agora)
    .select("id,clinica");

  if (error) {
    console.error("cron_expirar_trials_erro", error.message);
    return res.status(500).json({ erro: "falha_atualizar" });
  }

  const suspensas = data || [];
  if (suspensas.length) {
    // Log e o unico alerta que existe hoje. Quando houver canal de alerta,
    // e daqui que ele sai.
    console.log(
      "cron_expirar_trials",
      suspensas.length,
      JSON.stringify(suspensas.map((c) => c.clinica)),
    );
  }

  return res.status(200).json({ ok: true, suspensas: suspensas.length });
}
