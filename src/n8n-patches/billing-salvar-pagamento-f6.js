// F6 — Interpretar o resultado do PATCH condicional em pedidos.
//
// O node "Supabase Confirmar Pagamento" (PATCH com Prefer:
// return=representation) devolve:
//   - []  → nenhuma linha casou (id=pedido_id AND status=aberto falhou):
//           pedido já processado ou inexistente → DUPLICADO, encerra o ramo.
//   - [row] → claim vencido; o pedido agora é 'pago' e ninguém mais o
//           reprocessa.
// Com Accept: vnd.pgrst.object+json e um POSTGREST_ERROR, o node falha e o
// Error Workflow alerta — nunca seguimos com estado desconhecido.
const rows = $input.all().map((i) => i.json).filter((r) => r && r.id);
if (rows.length === 0) {
  // Duplicado ou pedido desconhecido: não provisiona, mas fecha o evento
  // Stripe para o webhook nunca ficar sem resposta/processado_em.
  const tentativa = $("Determinar Plano").first().json;
  return [{ json: { pedido_id: tentativa.pedido_id || null, duplicado: true } }];
}

const p = rows[0];
return [
  {
    json: {
      pedido_id: p.id,
      session_id: p.stripe_session_id,
      subscription_id: p.stripe_subscription_id,
      customer_id: p.stripe_customer_id,
      plano: p.plano,
      tier: p.tier,
      pago_em: p.pago_em,
      garantia_teto: p.garantia_teto_em,
      salvou: true,
    },
  },
];
