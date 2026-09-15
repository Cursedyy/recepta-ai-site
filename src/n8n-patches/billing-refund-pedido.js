const subscription = $("Validar Assinatura Reembolso").first().json;
const rows = $input.all().map(item => item.json).filter(row => row.id);
if (rows.length !== 1) throw new Error("Reembolso: exige exatamente um pedido");
const pedido = rows[0];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!uuid.test(pedido.id) || pedido.stripe_subscription_id !== subscription.subscription_id || pedido.stripe_customer_id !== subscription.customer_id || !["pago", "provisionando", "provisionado", "reembolsado"].includes(pedido.status)) {
  throw new Error("Reembolso: pedido não confirma compra paga");
}
if (subscription.pedido_metadata && subscription.pedido_metadata !== pedido.id) throw new Error("Reembolso: metadata da assinatura diverge do pedido");
if (pedido.clinica_id && !uuid.test(pedido.clinica_id)) throw new Error("Reembolso: clínica inválida");
return [{ json: { ...subscription, pedido_id: pedido.id, clinica_id: pedido.clinica_id || null,
  pedido_status: pedido.status, encerrado_em: pedido.encerrado_em || subscription.data,
  motivo_encerramento: pedido.status === "reembolsado" ? pedido.motivo_encerramento : `charge.refunded:${subscription.charge_id}`,
} }];
