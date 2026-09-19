const charge = $("Validar Cobrança Reembolso").first().json;
const list = $json;
if (list.has_more || !Array.isArray(list.data) || list.data.length !== 1) throw new Error("Reembolso: fatura ausente ou ambígua");
const payment = list.data[0];
const pi = typeof payment.payment?.payment_intent === "string" ? payment.payment.payment_intent : payment.payment?.payment_intent?.id;
const invoice_id = typeof payment.invoice === "string" ? payment.invoice : payment.invoice?.id;
if (payment.status !== "paid" || pi !== charge.payment_intent_id || !/^in_[a-zA-Z0-9_]+$/.test(invoice_id || "")) throw new Error("Reembolso: vínculo de pagamento inválido");
return [{ json: { invoice_id } }];
