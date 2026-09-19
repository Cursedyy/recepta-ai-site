const invoice = $("Validar Fatura Reembolso").first().json;
const subscription = $json;
const customer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
if (subscription.object !== "subscription" || subscription.id !== invoice.subscription_id || subscription.livemode !== true || customer !== invoice.customer_id) {
  throw new Error("Reembolso: assinatura não confirma cliente");
}
return [{ json: { ...invoice, subscription_status: subscription.status, pedido_metadata: subscription.metadata?.pedido_id || null } }];
