import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../src/package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const base = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
const headers = { "X-N8N-API-KEY": process.env.N8N_API_KEY, "Content-Type": "application/json" };
const stamp = Date.now().toString(36);
const output = `tmp-qa-reembolso/implementacao-${stamp}`;
fs.mkdirSync(output, { recursive: true });
const fixtures = [], events = [], proofs = [];
let qaId;
function checked(r) { if (r.error) throw new Error(r.error.message); return r.data; }
async function api(method, path, body) {
  const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${method} n8n HTTP ${r.status}`);
  return r.json();
}
async function fixture(label, customer) {
  const f = { name: `ZZ QA Refund ${stamp} ${label}`, customer: customer || `cus_qa_${stamp}_${label}`, subscription: `sub_qa_${stamp}_${label}`, invoice: `in_qa_${stamp}_${label}`, charge: `ch_qa_${stamp}_${label}`, pi: `pi_qa_${stamp}_${label}` };
  fixtures.push(f);
  const c = checked(await db.from("clinicas").insert({ clinica: f.name, uazapi_token: `qa_sem_instancia_${stamp}_${label}`, uazapi_server: "https://sitemagic1.uazapi.com", status: "ativo", tier: "essencial", plano: "mensal", stripe_customer_id: f.customer, stripe_subscription_id: f.subscription, garantia_fim: new Date(Date.now() + 7 * 86400000).toISOString(), reembolso_motivo: "Solicitado pelo painel QA" }).select("id").single());
  f.clinica = c.id;
  const p = checked(await db.from("pedidos").insert({ status: "provisionado", tier: "essencial", ciclo: "mensal", plano: "mensal", origem: "landing", clinica_id: c.id, stripe_customer_id: f.customer, stripe_subscription_id: f.subscription, pago_em: new Date().toISOString(), provisionado_em: new Date().toISOString() }).select("id").single());
  f.pedido = p.id;
  checked(await db.from("clinicas").update({ pedido_id: p.id }).eq("id", c.id));
  return f;
}
async function state(f) {
  return {
    clinica: checked(await db.from("clinicas").select("id,status,reembolsado_em,reembolso_valor,reembolso_motivo").eq("id", f.clinica).single()),
    pedido: checked(await db.from("pedidos").select("id,status,encerrado_em,motivo_encerramento").eq("id", f.pedido).single()),
  };
}
function event(f, suffix, amount = 49700, extra = {}) {
  const id = `evt_qa_refund_impl_${stamp}_${suffix}`; events.push(id);
  return { id, type: "charge.refunded", created: Math.floor(Date.now() / 1000), ...extra, data: { object: {
    id: f.charge, object: "charge", livemode: true, currency: "brl", customer: f.customer,
    amount: 49700, amount_refunded: amount, payment_intent: f.pi,
    refunds: { data: [{ reason: "requested_by_customer" }] },
  } } };
}
async function run(label, body) {
  const r = await fetch(`${base}/webhook/qa-refund-impl-${stamp}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  const response = await r.json(); let execution;
  for (let i = 0; i < 20; i++) {
    const rows = await api("GET", `/api/v1/executions?workflowId=${qaId}&limit=5`);
    for (const row of rows.data || []) {
      const item = await api("GET", `/api/v1/executions/${row.id}?includeData=true`);
      const actual = item.data?.resultData?.runData?.["Webhook Stripe Pagamento"]?.[0]?.data?.main?.[0]?.[0]?.json?.body?.id;
      if (actual === body.id && !proofs.some(p => p.executionId === item.id)) { execution = item; break; }
    }
    if (execution?.finished) break;
    await new Promise(r => setTimeout(r, 500));
  }
  assert.ok(execution, `${label}: execution missing`);
  const runs = execution.data?.resultData?.runData || {};
  const proof = { label, http: r.status, response, executionId: execution.id, executedNodes: Object.keys(runs),
    cancellationRequests: (runs["Cancelar Assinatura Reembolso"] || []).map(x => x.data?.main?.[0]?.[0]?.json?.qa_request),
    errors: Object.values(runs).flat().filter(x => x.error).map(x => x.error.message),
  };
  proofs.push(proof); fs.writeFileSync(`${output}/${label}.json`, JSON.stringify(execution));
  console.log(JSON.stringify(proof)); return proof;
}

try {
  const a = await fixture("A");
  const control = await fixture("control", a.customer);
  const b = await fixture("B");
  const c = await fixture("C");
  const wf = JSON.parse(fs.readFileSync("tmp-qa-reembolso/candidate.json", "utf8"));
  const sourceVersion = wf.versionId;
  const webhook = wf.nodes.find(n => n.name === "Webhook Stripe Pagamento");
  webhook.parameters = { httpMethod: "POST", path: `qa-refund-impl-${stamp}`, responseMode: "responseNode", options: {} };
  webhook.webhookId = crypto.randomUUID();
  const signature = wf.nodes.find(n => n.name === "Assinatura Válida?");
  signature.type = "n8n-nodes-base.code"; signature.typeVersion = 2;
  signature.parameters = { jsCode: 'const event = $("Webhook Stripe Pagamento").first().json.body; if (!String(event.id).startsWith("evt_qa_refund_impl_")) throw new Error("QA only"); return [{json:{valid:true,event}}];' };
  wf.connections["Config Stripe Webhook"] = { main: [[{ node: signature.name, type: "main", index: 0 }]] };
  wf.connections[signature.name] = { main: [[{ node: "Registrar Evento", type: "main", index: 0 }]] };
  // Every Stripe credential is removed and every Stripe HTTP request replaced
  // by a local simulation. The simulation records the candidate's exact method
  // and evaluated URL, including the real cancellation parameters.
  for (const node of wf.nodes.filter(n => n.credentials?.stripeApi || n.parameters?.nodeCredentialType === "stripeApi")) {
    const original = node.parameters;
    const expression = original.url?.match(/^={{\s*([\s\S]*?)\s*}}$/)?.[1];
    if (!expression) throw new Error(`Cannot simulate URL: ${node.name}`);
    const mock = `
const event = $("Assinatura Válida?").first().json.event;
const fixtures = ${JSON.stringify(fixtures)};
const url = (${expression});
const request = {method:${JSON.stringify(original.method || "GET")},url};
const stored = $getWorkflowStaticData('global'); stored.cancelled ||= {};
const f = fixtures.find(x => url.includes(x.charge) || url.includes(x.pi) || url.includes(x.invoice) || url.includes(x.subscription));
if (!f) throw new Error('QA refuses any non-fixture Stripe operation');
let response;
if (url.includes('/charges/')) response = {...event.data.object, invoice:event.qa_legacy ? f.invoice : undefined};
else if (url.includes('/invoice_payments')) response = {has_more:false,data:[{status:'paid',invoice:f.invoice,payment:{type:'payment_intent',payment_intent:f.pi}}]};
else if (url.includes('/invoices/')) response = {id:f.invoice,object:'invoice',livemode:true,customer:event.qa_mismatch ? fixtures[2].customer : f.customer,parent:event.qa_legacy ? undefined : {subscription_details:{subscription:f.subscription}},subscription:event.qa_legacy ? f.subscription : undefined};
else if (request.method === 'DELETE') {
 if (!event.qa_fail_cancel) stored.cancelled[f.subscription] = true;
 response = {statusCode:event.qa_fail_cancel ? 500 : event.qa_uncertain ? 404 : 200,body:{id:f.subscription,status:event.qa_fail_cancel ? 'active':'canceled'}};
} else if (url.includes('/subscriptions/')) response = {id:f.subscription,object:'subscription',livemode:true,customer:f.customer,metadata:{pedido_id:f.pedido},status:stored.cancelled[f.subscription] ? 'canceled':'active'};
else throw new Error('QA refuses unimplemented Stripe operation');
return [{json:{...response,qa_request:request}}];`;
    node.type = "n8n-nodes-base.code"; node.typeVersion = 2; node.parameters = { jsCode: mock };
    delete node.credentials; node.retryOnFail = false;
  }
  const reachable = new Set(), queue = [webhook.name];
  while (queue.length) { const name = queue.shift(); if (reachable.has(name)) continue; reachable.add(name); for (const output of wf.connections[name]?.main || []) for (const link of output) queue.push(link.node); }
  const nodes = wf.nodes.filter(n => reachable.has(n.name));
  assert.ok(nodes.every(n => !n.credentials?.stripeApi));
  const connections = Object.fromEntries(Object.entries(wf.connections).filter(([name]) => reachable.has(name)));
  const qa = await api("POST", "/api/v1/workflows", { name: `ZZ QA Refund Impl ${stamp}`, nodes, connections, settings: { executionOrder: "v1" } });
  qaId = qa.id; fs.writeFileSync(`${output}/before-activation.json`, JSON.stringify(qa));
  await api("POST", `/api/v1/workflows/${qaId}/activate`);

  let p = await run("partial", event(a, "partial", 10000));
  assert.equal(p.http, 200); assert.equal(p.response.integral, false); assert.equal(p.cancellationRequests.length, 0);
  const partial = await state(a); assert.equal(partial.clinica.status, "ativo"); assert.equal(partial.clinica.reembolsado_em, null); assert.equal(Number(partial.clinica.reembolso_valor), 100); assert.equal(partial.pedido.status, "provisionado");
  const fullEvent = event(a, "full");
  p = await run("full", fullEvent); assert.equal(p.http, 200); assert.equal(p.cancellationRequests.length, 1);
  assert.equal(p.cancellationRequests[0].method, "DELETE"); assert.ok(p.cancellationRequests[0].url.endsWith("?invoice_now=false&prorate=false"));
  const full = await state(a); assert.equal(full.clinica.status, "expirado"); assert.ok(full.clinica.reembolsado_em); assert.equal(Number(full.clinica.reembolso_valor), 497); assert.equal(full.clinica.reembolso_motivo, "Solicitado pelo painel QA"); assert.equal(full.pedido.status, "reembolsado");
  p = await run("duplicate", fullEvent); assert.equal(p.http, 200); assert.equal(p.cancellationRequests.length, 0); assert.deepEqual(await state(a), full);
  p = await run("new_event_same_charge", event(a, "second")); assert.equal(p.http, 200); assert.equal(p.cancellationRequests.length, 0); assert.deepEqual(await state(a), full);
  assert.equal((await state(control)).clinica.status, "ativo"); assert.equal((await state(control)).pedido.status, "provisionado");

  const failedEvent = event(b, "retry", 49700, { qa_fail_cancel: true, qa_legacy: true });
  p = await run("cancel_failure", failedEvent); assert.equal(p.http, 500);
  const failed = await state(b); assert.equal(failed.clinica.status, "ativo"); assert.equal(failed.clinica.reembolsado_em, null); assert.equal(failed.pedido.status, "provisionado");
  const open = checked(await db.from("stripe_eventos").select("processado_em").eq("event_id", failedEvent.id).single()); assert.equal(open.processado_em, null);
  p = await run("retry_after_failure", { ...failedEvent, qa_fail_cancel: false }); assert.equal(p.http, 200); assert.equal((await state(b)).pedido.status, "reembolsado");

  p = await run("uncertain_cancel_confirmed", event(c, "uncertain", 49700, { qa_uncertain: true })); assert.equal(p.http, 200); assert.equal((await state(c)).pedido.status, "reembolsado");
  const wrong = event(control, "wrong_customer", 49700, { qa_mismatch: true });
  p = await run("wrong_customer", wrong); assert.equal(p.http, 500); assert.equal(p.cancellationRequests.length, 0); assert.equal((await state(control)).clinica.status, "ativo");
  checked(await db.from("stripe_eventos").update({ processado_em: new Date().toISOString(), resultado: "qa_vinculo_invalido_esperado" }).eq("event_id", wrong.id).is("processado_em", null));

  const reactivation = { id: `evt_qa_refund_impl_${stamp}_active`, type: "customer.subscription.updated", created: Math.floor(Date.now()/1000) + 10, data: { object: { id: a.subscription, customer: a.customer, status: "active" } } }; events.push(reactivation.id);
  p = await run("active_after_refund", reactivation);
  assert.equal((await state(a)).clinica.status, "expirado");
  const current = await api("GET", "/api/v1/workflows/cf1An4BYT9A0LuHi");
  assert.equal(current.versionId, sourceVersion); assert.equal(current.activeVersionId, sourceVersion);
  fs.writeFileSync(`${output}/result.json`, JSON.stringify({ qaId, fixtures, proofs, partial, full, productionUnchanged: true, stripeSimulated: true }, null, 2));
  console.log(JSON.stringify({ result: "PASS", qaId, scenarios: proofs.length, productionUnchanged: true, stripeRequestsReal: 0, output }));
} finally {
  if (qaId) { await api("POST", `/api/v1/workflows/${qaId}/deactivate`); const qa = await api("GET", `/api/v1/workflows/${qaId}`); assert.equal(qa.active, false); }
  for (const f of fixtures) {
    if (f.pedido) checked(await db.from("pedidos").update({ status: "cancelado", motivo_encerramento: "qa_refund_impl", encerrado_em: new Date().toISOString() }).eq("id", f.pedido));
    if (f.clinica) checked(await db.from("clinicas").update({ status: "expirado" }).eq("id", f.clinica));
  }
  for (const id of new Set(events)) checked(await db.from("stripe_eventos").update({ processado_em: new Date().toISOString(), resultado: "qa_refund_impl_encerrado" }).eq("event_id", id).is("processado_em", null));
  const final = [];
  for (const f of fixtures) if (f.pedido && f.clinica) { const row = await state(f); assert.equal(row.clinica.status, "expirado"); assert.equal(row.pedido.status, "cancelado"); final.push(row); }
  fs.writeFileSync(`${output}/teardown.json`, JSON.stringify({ qaId, qaInactive: true, final }, null, 2));
  console.log(JSON.stringify({ teardown: "fixtures encerradas e copia inativa", qaId, fixtures: final.length }));
}
