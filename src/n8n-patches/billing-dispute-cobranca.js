const event = $('Assinatura Válida?').first().json.event;
const charge = $json;
const id = x => typeof x === 'string' ? x : x?.id;
if (charge.id !== id(event.data.object.charge) || charge.object !== 'charge' || charge.livemode !== true || charge.currency !== 'brl') throw new Error('Disputa: cobrança inválida');
const customer_id = id(charge.customer), invoice_id = id(charge.invoice) || null, payment_intent_id = id(charge.payment_intent) || null;
if (!/^cus_[a-zA-Z0-9_]+$/.test(customer_id || '') || (!invoice_id && !/^pi_[a-zA-Z0-9_]+$/.test(payment_intent_id || ''))) throw new Error('Disputa: vínculo de fatura inválido');
return [{ json: { charge_id: charge.id, customer_id, invoice_id, payment_intent_id, data: new Date(event.created * 1000).toISOString(), disputa_id: event.data.object.id, motivo: 'charge.dispute.created' } }];
