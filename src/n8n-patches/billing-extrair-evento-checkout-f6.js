// F6 — checkout.session.completed sob pagamento antecipado.
//
// ANTES: client_reference_id era o id da CLÍNICA (fluxo de trial, nunca
// disparado na prática). AGORA: /api/checkout cria o pedido e usa
// client_reference_id = pedidos.id. No momento deste evento a clínica ainda
// não existe — ela nasce no Onboarding, que faz o claim deste pedido.
//
// Emitir pedido_id (não mais clinica_id) para o node "Claim do Pedido Pago".
// Sem pedido vinculado = session criada fora do /api/checkout. Fail-closed:
// nada é marcado como pago sem um pedido rastreável.
const event = $json.event;
if (!event || event.type !== "checkout.session.completed") {
  return [];
}
const session = event.data.object;
const pedido_id = session.client_reference_id;
if (!pedido_id) return [];

return [
  {
    json: {
      pedido_id,
      session_id: session.id,
      customer_id: session.customer,
      subscription_id: session.subscription,
    },
  },
];
