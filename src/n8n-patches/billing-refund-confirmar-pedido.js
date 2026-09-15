const target = $("Preparar Destino Reembolso").first().json;
const rows = $input.all().map(item => item.json).filter(row => row.id);
if (rows.length !== 1 || rows[0].id !== target.pedido_id || rows[0].stripe_subscription_id !== target.subscription_id || rows[0].stripe_customer_id !== target.customer_id || rows[0].status !== "reembolsado") {
  throw new Error("Reembolso: pedido reembolsado não confirmado");
}
return [{ json: target }];
