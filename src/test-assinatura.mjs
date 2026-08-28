import assert from "node:assert/strict";
import {
  estadoDaSubscription,
  planoDoIntervalo,
  patchDaSubscription,
} from "./api/_lib/assinatura.js";

// --- traducao de status -----------------------------------------------------
const casos = [
  ["trialing", "trial"],
  ["active", "ativo"],
  ["past_due", "ativo"], // Stripe ainda esta tentando cobrar: nao corta
  ["unpaid", "suspensa"], // Stripe desistiu: corta
  ["incomplete_expired", "suspensa"],
  ["paused", "suspensa"],
  ["canceled", "cancelada"],
  ["incomplete", null], // 3DS pendente: nao mexe
  ["coisa_nova_do_stripe", null], // status desconhecido nunca corta acesso
];

for (const [entrada, esperado] of casos) {
  const obtido = estadoDaSubscription(entrada);
  assert.equal(
    obtido,
    esperado,
    `estadoDaSubscription(${entrada}) = ${obtido}, esperado ${esperado}`,
  );
  console.log(`  ok    ${entrada} -> ${esperado}`);
}

// --- plano ------------------------------------------------------------------
assert.equal(planoDoIntervalo("month"), "mensal");
assert.equal(planoDoIntervalo("year"), "anual");
assert.equal(planoDoIntervalo("week"), null);

// --- patch ------------------------------------------------------------------
assert.equal(patchDaSubscription(null), null, "sem subscription, sem patch");
assert.equal(
  patchDaSubscription({ status: "incomplete" }),
  null,
  "status que nao manda mudar nada devolve null",
);

const trial = patchDaSubscription({
  id: "sub_1",
  status: "trialing",
  trial_end: 1790000000,
  items: { data: [{ price: { recurring: { interval: "month" } } }] },
});
assert.equal(trial.status, "trial");
assert.equal(trial.plano, "mensal");
assert.equal(trial.stripe_subscription_id, "sub_1");
assert.equal(trial.trial_fim, new Date(1790000000 * 1000).toISOString());

const pagante = patchDaSubscription({
  id: "sub_2",
  status: "active",
  trial_end: null,
  items: { data: [{ price: { recurring: { interval: "year" } } }] },
});
assert.equal(pagante.status, "ativo");
assert.equal(pagante.plano, "anual");
// Zerar trial_fim ao virar pagante e o que impede o cron de suspender cliente
// que ja paga por causa de uma data velha.
assert.equal(pagante.trial_fim, null, "trial_fim zera quando o trial acaba");

const semPreco = patchDaSubscription({ id: "sub_3", status: "active" });
assert.equal(semPreco.status, "ativo");
assert.equal("plano" in semPreco, false, "sem preco, nao inventa plano");

console.log("\nassinatura: " + (casos.length + 9) + " casos ok.");
