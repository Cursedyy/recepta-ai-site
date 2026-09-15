import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// Test the route boundary without Redis, external webhooks or database writes.
const source = fs.readFileSync(new URL("../src/api/submit.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "")
  .replace("export default async function handler", "async function handler");
const sent = [];
const context = vm.createContext({
  process: { env: { N8N_BRIEFING_WEBHOOK: "https://webhook.invalid", N8N_ONBOARDING_WEBHOOK_SECRET: "fixture" } },
  console, Date, nanoid: () => "fixture-token",
  getClientIp: () => "fixture", rateLimit: async () => ({ blocked: false }),
  fetch: async (_, options) => { sent.push(JSON.parse(options.body)); return { ok: true }; },
});
vm.runInContext(source + "\nthis.handler = handler;", context);
async function submit(body) {
  const result = {};
  const res = { setHeader() {}, status(code) { result.status = code; return this; }, json(value) { result.body = value; return this; } };
  await context.handler({ method: "POST", headers: {}, body }, res);
  return result;
}
for (const pedido of [undefined, null, "", "lixo", 123, {}, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa"]) {
  const response = await submit({ pedido });
  assert.equal(response.status, 400);
  assert.equal(response.body.erro, "pedido_invalido");
}
assert.equal((await submit("{")).body.erro, "payload_invalido");
assert.equal(sent.length, 0, "invalid requests must not reach the webhook");
const pedido = "12345678-abcd-4321-9876-123456789abc";
// Exercise the real frontend payload against the real route validation.
const html = fs.readFileSync('src/briefing/index.html', 'utf8');
const payloadCode = html.slice(html.indexOf('const payload = {'), html.indexOf('\n        try {', html.indexOf('const payload = {')));
const frontend = vm.createContext({ Date, S: [], data: () => ({clinica:'Fixture',cnpj:'12.345.678/0001-90'}), val:()=>'', Object, URLSearchParams, window:{location:{search:'?pedido='+pedido}} });
const pedidoFunction = html.slice(html.indexOf('function pedidoDaUrl()'), html.indexOf('\n      F.addEventListener',html.indexOf('function pedidoDaUrl()')));
vm.runInContext(pedidoFunction+'\n'+payloadCode+'\nthis.payload=payload;', frontend);
assert.equal(frontend.payload.pedido,pedido);
assert.equal(frontend.payload.bruto.pedido,pedido);
const fromForm = await submit(frontend.payload);
assert.equal(fromForm.status,200,'actual frontend payload must pass the API boundary');
sent.length=0;
const good = await submit({ pedido, bruto: { pedido: "untrusted", clinica: "Fixture", cnpj: "12.345.678/0001-90" } });
assert.equal(good.status, 200);
assert.equal(sent.length, 1);
assert.equal(sent[0].pedido, pedido, "validated top-level pedido must win over bruto");
assert.equal(sent[0].cnpj, "12345678000190");
console.log("PASS: invalid pedido blocks webhook; valid pedido reaches it unchanged.");
