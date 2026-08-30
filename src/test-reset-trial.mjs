// Check: /api/clinica/reset-trial APAGA clinica, e e alcancavel a partir de
// /api/submit, que e publico e sem autenticacao (briefing -> n8n casa pelo
// NOME da clinica -> Reset Trial). Se estes guards afrouxarem, um nome de
// clinica publico vira deletar-conta-de-cliente.
import assert from "node:assert/strict";
import {
  bloqueioCadastral,
  bloqueioDeInstancia,
} from "./api/clinica/reset-trial.js";

// --- Cadastro: quem virou cliente nunca pode ser apagado ---

assert.equal(
  bloqueioCadastral({ status: "expirado" }),
  null,
  "trial que falhou e o caso legitimo: tem que passar",
);

assert.equal(
  bloqueioCadastral({ stripe_customer_id: "cus_123" })?.erro,
  "clinica_e_cliente",
  "quem chegou no checkout nao pode ser apagado",
);
assert.equal(
  bloqueioCadastral({ stripe_subscription_id: "sub_123" })?.erro,
  "clinica_e_cliente",
  "assinatura ativa nao pode ser apagada",
);
assert.equal(
  bloqueioCadastral({ status: "ativo" })?.erro,
  "clinica_ativa",
  "'ativo' e o vocabulario do n8n para clinica liberada",
);

// --- Instancia: null significa "nao sei", e "nao sei" nao autoriza deletar ---

assert.equal(
  bloqueioDeInstancia(false),
  null,
  "instancia nunca conectou: trial nao foi usado, pode resetar",
);
assert.equal(
  bloqueioDeInstancia(true)?.erro,
  "instancia_conectada",
  "instancia conectada significa trial usado",
);
assert.equal(
  bloqueioDeInstancia(null)?.erro,
  "status_indisponivel",
  "FAIL-CLOSED: UazAPI fora do ar nao pode virar permissao para apagar",
);

console.log("reset-trial guards: OK");
