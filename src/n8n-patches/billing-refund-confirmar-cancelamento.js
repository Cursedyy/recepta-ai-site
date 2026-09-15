const target = $("Preparar Destino Reembolso").first().json;
const subscription = $json;
const customer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
if (subscription.id !== target.subscription_id || subscription.status !== "canceled" || customer !== target.customer_id || subscription.livemode !== true) {
  throw new Error("Reembolso: cancelamento da assinatura não confirmado");
}
return [{ json: target }];
