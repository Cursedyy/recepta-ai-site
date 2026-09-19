import assert from "node:assert/strict";

process.env.STRIPE_SECRET_KEY = "sk_test_nao_real";
process.env.STRIPE_PRICE_ESSENCIAL_MENSAL = "price_ess_m";
process.env.STRIPE_PRICE_ESSENCIAL_ANUAL = "price_ess_a";
process.env.STRIPE_PRICE_COMPLETO_MENSAL = "price_comp_m";
process.env.STRIPE_PRICE_COMPLETO_ANUAL = "price_comp_a";

const { criarCheckout } = await import("../src/api/checkout.js");
const requests = [];
let inserts = [];
let updates = [];
let seq = 0;
let stripeMode = "ok";

global.fetch = async (url, options = {}) => {
  requests.push({ url: String(url), options });
  if (String(url).includes("/v1/prices/")) {
    const anual = String(url).endsWith("_a");
    const completo = String(url).includes("comp_");
    return new Response(JSON.stringify({
      active: true,
      livemode: true,
      currency: "brl",
      unit_amount: completo ? (anual ? 836400 : 99700) : (anual ? 416400 : 49700),
      recurring: { interval: anual ? "year" : "month" },
    }), { status: 200 });
  }
  if (String(url).includes("/expire"))
    return new Response(JSON.stringify({ status: "expired" }), { status: 200 });
  if (stripeMode === "reject")
    return new Response(JSON.stringify({ error: { message: "recusado" } }), { status: 500 });
  if (stripeMode === "timeout") throw new Error("timeout simulado");
  if (stripeMode === "sem_id") return new Response("{}", { status: 200 });
  if (stripeMode === "sem_url") return new Response(JSON.stringify({ id: `cs_${seq}` }), { status: 200 });
  return new Response(JSON.stringify({ id: `cs_${seq}`, url: `https://checkout.stripe.com/c/pay/cs_${seq}` }), { status: 200 });
};

function adminFake({ persistFail = false } = {}) {
  return {
    from(tabela) {
      assert.equal(tabela, "pedidos");
      return {
        insert(payload) {
          inserts.push(payload);
          const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
          return { select() { return { async single() { return { data: { id }, error: null }; } }; } };
        },
        update(payload) {
          updates.push(payload);
          const builder = {
            eq() { return this; },
            select() { return this; },
            async single() {
              return persistFail && payload.stripe_session_id
                ? { data: null, error: { message: "falha simulada" } }
                : { data: { id: "persistido" }, error: null };
            },
            then(resolve) { return Promise.resolve({ error: null }).then(resolve); },
          };
          return builder;
        },
      };
    },
  };
}

for (const tier of ["essencial", "completo"]) {
  for (const ciclo of ["mensal", "anual"]) {
    const resultado = await criarCheckout({
      admin: adminFake(), tier, ciclo, ip: "203.0.113.7", userAgent: "teste",
    });
    assert.equal(resultado.status, 200);
    assert.match(resultado.corpo.url, /^https:\/\/checkout\.stripe\.com\//);
    const pedido = inserts.at(-1);
    assert.equal(pedido.status, "aberto");
    assert.equal(pedido.origem, "landing");
    assert.equal("termos_aceito_em" in pedido, false);
    assert.equal("termos_versao" in pedido, false);
    const chamada = requests.at(-1);
    const params = new URLSearchParams(chamada.options.body);
    assert.equal(params.get("client_reference_id"), resultado.corpo.pedido_id);
    assert.equal(params.get("metadata[pedido_id]"), resultado.corpo.pedido_id);
    assert.equal(params.get("subscription_data[metadata][pedido_id]"), resultado.corpo.pedido_id);
    assert.equal(chamada.options.headers["Idempotency-Key"], resultado.corpo.pedido_id);
    assert.equal(params.get("mode"), "subscription");
    assert.equal(updates.at(-1).stripe_session_id.startsWith("cs_"), true);
  }
}

const antes = inserts.length;
const invalido = await criarCheckout({ admin: adminFake(), tier: "premium", ciclo: "semanal" });
assert.equal(invalido.status, 400);
assert.equal(inserts.length, antes);

const reativacao = await criarCheckout({
  admin: adminFake(),
  tier: "completo",
  ciclo: "anual",
  origem: "painel_reativacao",
  clinicaId: "11111111-1111-4111-8111-111111111111",
  successUrl: "https://www.receptaai.com.br/clinica/painel?checkout=sucesso",
  cancelUrl: "https://www.receptaai.com.br/clinica/painel?checkout=cancelado",
});
assert.equal(reativacao.status, 200);
assert.equal(inserts.at(-1).origem, "painel_reativacao");
assert.equal(inserts.at(-1).clinica_id, "11111111-1111-4111-8111-111111111111");

for (const modo of ["reject", "timeout"]) {
  stripeMode = modo;
  const resultado = await criarCheckout({
    admin: adminFake(), tier: "essencial", ciclo: "mensal",
  });
  assert.equal(resultado.status, 502);
  assert.equal(updates.at(-1).status, "cancelado");
  assert.match(updates.at(-1).motivo_encerramento, /stripe|rede/);
}

stripeMode = "sem_id";
const semId = await criarCheckout({ admin: adminFake(), tier: "essencial", ciclo: "mensal" });
assert.equal(semId.status, 502);
assert.equal(updates.at(-1).motivo_encerramento, "stripe_resposta_sem_session_id");

stripeMode = "sem_url";
const semUrl = await criarCheckout({ admin: adminFake(), tier: "essencial", ciclo: "anual" });
assert.equal(semUrl.status, 502);
assert.ok(requests.at(-1).url.includes("/expire"));
assert.equal(updates.at(-1).motivo_encerramento, "session_sem_url_expirada");

stripeMode = "ok";
const persistencia = await criarCheckout({
  admin: adminFake({ persistFail: true }), tier: "completo", ciclo: "mensal",
});
assert.equal(persistencia.status, 503);
assert.ok(requests.some((r) => r.url.includes("/expire")));
assert.equal(updates.at(-1).status, "cancelado");
assert.equal(updates.at(-1).motivo_encerramento, "session_expirada_apos_falha_persistencia");

console.log("OK: 4 combinações, contrato, consentimento, reativação e compensações.");
