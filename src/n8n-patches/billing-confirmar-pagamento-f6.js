// F6 — Confirmar Pagamento no pedido (não mais na clínica, que não existe ainda).
//
// PATCH CONDICIONAL = CLAIM ATÔMICO:
//   UPDATE pedidos SET status='pago'... WHERE id=pedido_id AND status='aberto'
//   - Se o pedido já tinha sido processado (status pago/provisionado/reembolsado),
//     o WHERE não casa com nenhuma linha → PostgREST devolve 200 com [] → o
//     próprio retorno vazio encerra este ramo sem reprocessar (idempotência
//     em segundo nível, além do gate stripe_eventos do F4).
//   - Se dois eventos chegam em paralelo, o Postgres serializa: só um PATCH
//     casa, o outro retorna vazio. Sem race.
//
// O teto da garantia é materializado aqui (30 dias a partir do pagamento),
// e a assinatura fica vinculada ao pedido — o Onboarding vai copiá-la para
// a clínica no claim, onde o índice único de clinicas.stripe_subscription_id
// protege contra duas clínicas com a mesma assinatura.
const pedidoId = $json.pedido_id;
if (!pedidoId) return [];

const agora = new Date();
const teto = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000);

return [
  {
    json: {
      pedido_id: pedidoId,
      session_id: $json.session_id,
      customer_id: $json.customer_id,
      subscription_id: $json.subscription_id,
      plano: $json.plano,
      tier: $json.tier,
      price_id: $json.price_id_encontrado || null,
      pago_em: agora.toISOString(),
      garantia_teto: teto.toISOString(),
      patch_url:
        ($json.supabase_url ||
          $('Config Stripe Webhook').item.json.supabase_url) +
          "/rest/v1/pedidos?id=eq." +
          pedidoId +
          "&status=eq.aberto",
    },
  },
];
