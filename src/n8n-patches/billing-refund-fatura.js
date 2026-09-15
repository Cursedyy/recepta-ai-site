const charge = $("Validar Cobrança Reembolso").first().json;
const invoice = $json;
const id = value => typeof value === "string" ? value : value?.id;
const subscription_id = id(invoice.parent?.subscription_details?.subscription) || id(invoice.subscription);
let invoiceId = charge.invoice_id;
if (!invoiceId) invoiceId = $("Resolver Fatura Reembolso").first().json.invoice_id;
if (invoice.object !== "invoice" || invoice.id !== invoiceId || invoice.livemode !== true || id(invoice.customer) !== charge.customer_id || !/^sub_[a-zA-Z0-9_]+$/.test(subscription_id || "")) {
  throw new Error("Reembolso: fatura não confirma cliente/assinatura");
}
return [{ json: { ...charge, invoice_id: invoice.id, subscription_id } }];
