const event = $("Assinatura Válida?").first().json.event;
const charge = event?.data?.object;
if (event?.type !== "charge.refunded" || !/^ch_[a-zA-Z0-9_]+$/.test(charge?.id || "")) {
  throw new Error("Reembolso: evento ou cobrança inválida");
}
if (!Number.isInteger(event.created) || event.created <= 0) throw new Error("Reembolso: data inválida");
return [{ json: { charge_id: charge.id } }];
