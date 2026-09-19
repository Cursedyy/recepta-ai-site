const event = $("Assinatura Válida?").first().json.event;
const charge = $json;
const id = value => typeof value === "string" ? value : value?.id;
if (charge.id !== event.data.object.id || charge.object !== "charge" || charge.livemode !== true || charge.currency !== "brl") {
  throw new Error("Reembolso: cobrança diverge do evento ou modo/moeda inválidos");
}
if (!Number.isInteger(charge.amount) || charge.amount <= 0 || !Number.isInteger(charge.amount_refunded) || charge.amount_refunded <= 0 || charge.amount_refunded > charge.amount) {
  throw new Error("Reembolso: valores inválidos");
}
const customer_id = id(charge.customer);
const invoice_id = id(charge.invoice) || null;
const payment_intent_id = id(charge.payment_intent) || null;
if (!/^cus_[a-zA-Z0-9_]+$/.test(customer_id || "")) throw new Error("Reembolso: cliente inválido");
if (!invoice_id && !/^pi_[a-zA-Z0-9_]+$/.test(payment_intent_id || "")) throw new Error("Reembolso: sem vínculo de fatura");
return [{ json: {
  charge_id: charge.id, customer_id, invoice_id, payment_intent_id,
  integral: charge.amount_refunded === charge.amount,
  valor: charge.amount_refunded / 100,
  data: new Date(event.created * 1000).toISOString(),
  motivo: event.data.object.refunds?.data?.slice(-1)?.[0]?.reason || "charge.refunded",
} }];
