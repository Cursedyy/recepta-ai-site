// F0/F6 — Extrair Fim de Pagamento (billing) — remove `past_due` da lista que
// EXPIRA a clínica (decisão registrada em billing + garantia-politica).
//
// ANTES: unpaid | past_due | canceled expiravam — a primeira recusa de cartão
// cortava o atendimento de uma clínica pagante.
// AGORA: past_due NÃO expira. O registro em clinicas.pagamento_pendente_em e o
// alerta entram no patch do F7 (precisam da coluna da migration 021); aqui vai
// só a correção de comportamento, que não depende de migration.
//
// deleted (qualquer status) OU updated caindo em unpaid/canceled continuam
// expirando, como sempre.
const event = $json.event;
if (!event) return [];
const obj = (event.data && event.data.object) || {};

const fimDefinitivo =
  event.type === "customer.subscription.deleted" ||
  (event.type === "customer.subscription.updated" &&
    ["unpaid", "canceled"].includes(obj.status));

if (!fimDefinitivo) return [];

const customer_id = typeof obj.customer === "string" ? obj.customer : null;
if (!customer_id) return [];

return [{ json: { customer_id, motivo: event.type + ":" + (obj.status || "") } }];
