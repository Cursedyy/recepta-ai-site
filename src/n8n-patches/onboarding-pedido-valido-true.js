// F6 — Ramo true de "Pedido Válido?" (claim vencido no Onboarding).
//
// Entrada: resposta do PATCH condicional em pedidos (array PostgREST com
// return=representation; sempre executa — alwaysOutputData no HTTP). O gate
// "Pedido Válido?" só chega aqui quando $json.id existe.
//
// Reconstrói o contexto do briefing (o PATCH substituiu o item) a partir de
// "Preparar Claim" e anexa o pedido confirmado em $json.pedido. Campos que o
// fluxo passa a consumir (Montar JSON Body):
//   - pedido.id / tier / plano → clinicas.pedido_id / tier / plano
//   - garantia_teto_em → teto da garantia (o início/fim ficam para o F7,
//     materializados quando o WhatsApp conecta — início do serviço).
const row = $json || {};
if (!row.id) {
  throw new Error(
    "F6: Pedido Válido? true sem linha do pedido — estado desconhecido, abortando.",
  );
}
const claim = $("Preparar Claim").first().json;

return [
  {
    json: {
      ...claim,
      pedido: {
        id: row.id,
        status: row.status,
        tier: row.tier,
        plano: row.plano,
        garantia_teto_em: row.garantia_teto_em,
        stripe_subscription_id: row.stripe_subscription_id,
      },
    },
  },
];
