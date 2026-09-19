import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { configEditavelPadrao, DIAS } from "../src/api/_lib/config-editavel.js";

// No real Stripe requests, purchases, UazAPI calls or DELETE operations.
// Writes are limited to named synthetic fixtures and their event audit.
const require = createRequire(new URL("../src/package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const base = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
const headers = { "X-N8N-API-KEY": process.env.N8N_API_KEY, "Content-Type": "application/json" };
const stamp = Date.now().toString(36);
const name = `ZZ QA Reembolso ${stamp}`;
const evidence = { fixture: name, limits: "Auth and webhook signature are injected; no real payment or external provisioning." };
let clinicaId, pedidoId, qaId, browser;
async function api(method, path, body) {
  const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`n8n ${method} HTTP ${r.status}`);
  return r.json();
}
function checked(result) { if (result.error) throw new Error(result.error.message); return result.data; }
fs.mkdirSync("tmp-qa-reembolso", { recursive: true });
try {
  const prod = await api("GET", "/api/v1/workflows/cf1An4BYT9A0LuHi");
  evidence.source = { id: prod.id, versionId: prod.versionId, activeVersionId: prod.activeVersionId };
  const clinica = checked(await admin.from("clinicas").insert({
    clinica: name, status: "ativo", tier: "essencial", plano: "mensal",
    uazapi_token: `qa-invalido-sem-instancia-${stamp}`, uazapi_server: "https://sitemagic1.uazapi.com",
    stripe_customer_id: `cus_qa_refund_${stamp}`, stripe_subscription_id: `sub_qa_refund_${stamp}`,
    garantia_inicio: new Date().toISOString(), garantia_fim: new Date(Date.now() + 7 * 86400000).toISOString(),
    ia_config: {},
  }).select("id").single());
  clinicaId = clinica.id;
  const pedido = checked(await admin.from("pedidos").insert({
    status: "provisionado", tier: "essencial", ciclo: "mensal", plano: "mensal", origem: "landing",
    clinica_id: clinicaId, stripe_customer_id: `cus_qa_refund_${stamp}`, stripe_subscription_id: `sub_qa_refund_${stamp}`,
    pago_em: new Date().toISOString(), provisionado_em: new Date().toISOString(),
  }).select("id").single());
  pedidoId = pedido.id;
  checked(await admin.from("clinicas").update({ pedido_id: pedidoId }).eq("id", clinicaId));
  evidence.clinicaId = clinicaId; evidence.pedidoId = pedidoId;

  // Exercise the actual renderer, browser button and route handler locally.
  // Authentication is injected for this fixture; no public diagnostic endpoint.
  const ctx = vm.createContext({
    console, Date, process, configEditavelPadrao, DIAS,
    autenticarClinica: async () => ({ admin, perfil: { id: clinicaId, clinica_id: clinicaId } }),
    rateLimit: async () => ({ blocked: false }), getClientIp: () => "qa-fixture",
  });
  const strip = (s) => s.replace(/^import .*;\r?\n/gm, "");
  const actions = strip(fs.readFileSync("src/api/clinica/painel-acoes.js", "utf8"))
    .replace("export default async function handler", "async function handler")
    .replace(/^export /gm, "");
  vm.runInContext(actions + "\nthis.handler = handler;", ctx);
  const renderer = strip(fs.readFileSync("src/api/clinica/painel-view.js", "utf8")).split("export default async function handler")[0];
  const renderCtx = vm.createContext({ DIAS });
  vm.runInContext(renderer + "\nthis.render = paginaPainel;", renderCtx);
  const html = renderCtx.render(name, configEditavelPadrao(), 10, {
    status: "ativo", tier: "essencial", plano: "mensal", tem_stripe: true,
    garantia_fim: new Date(Date.now() + 7 * 86400000).toISOString(), gate: { ativo: false },
  }, { categoria: "geral", categoriaMeta: {}, tabsVisiveis: ["status"], camposExtras: [], regrasCategoria: "", faqCategoria: [] });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  let refundCalls = 0;
  await page.route("**/*", async route => {
    const request = route.request(); const u = new URL(request.url());
    if (u.origin !== "https://qa-reembolso.invalid") return route.abort();
    if (u.pathname === "/clinica/painel") return route.fulfill({ contentType: "text/html", body: html });
    if (u.pathname === "/api/clinica/painel-acoes" && request.method() === "POST") {
      const body = request.postDataJSON(); assert.equal(body.acao, "reembolso"); refundCalls++;
      let status, result;
      await ctx.handler({ method: "POST", headers: {}, body }, { setHeader() {}, status(code) { status = code; return this; }, json(value) { result = value; } });
      evidence.buttonHttp = status;
      return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(result) });
    }
    if (u.pathname.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, assinatura: null, conversas: [], agendamentos: [], eventos: [] }) });
    const file = "src" + u.pathname;
    if (/\.(js|css)$/.test(u.pathname) && !u.pathname.includes("..") && fs.existsSync(file)) return route.fulfill({ contentType: u.pathname.endsWith(".js") ? "application/javascript" : "text/css", body: fs.readFileSync(file) });
    return route.fulfill({ status: 204 });
  });
  await page.goto("https://qa-reembolso.invalid/clinica/painel", { waitUntil: "domcontentloaded" });
  await page.locator('[data-tab="status"]').click();
  const responded = page.waitForResponse(r => r.url().includes("/api/clinica/painel-acoes") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Pedir reembolso (garantia de 7 dias)", exact: true }).click();
  await responded;
  assert.equal(refundCalls, 1); assert.equal(evidence.buttonHttp, 200);
  const requested = checked(await admin.from("clinicas").select("id,status,reembolso_pedido_em,reembolso_motivo,reembolsado_em").eq("id", clinicaId).single());
  assert.ok(requested.reembolso_pedido_em); assert.equal(requested.status, "ativo");
  evidence.requested = requested; evidence.browserErrors = errors;
  await page.screenshot({ path: "tmp-qa-reembolso/painel.png" });
  await browser.close(); browser = null;

  // Copy the published business workflow. Replace only signature verification
  // with a QA event injector, remove all cron roots and use a private QA path.
  const path = `qa-reembolso-${stamp}`;
  const webhook = prod.nodes.find(n => n.name === "Webhook Stripe Pagamento");
  webhook.parameters = { httpMethod: "POST", path, responseMode: "responseNode", options: {} };
  webhook.webhookId = crypto.randomUUID();
  const signature = prod.nodes.find(n => n.name === "Assinatura Válida?");
  signature.type = "n8n-nodes-base.code"; signature.typeVersion = 2;
  signature.parameters = { jsCode: 'const event = $("Webhook Stripe Pagamento").first().json.body; if (event.type !== "charge.refunded" || !String(event.id).startsWith("evt_qa_refund_")) throw new Error("QA fixture only"); return [{json:{valid:true,event}}];' };
  prod.connections["Config Stripe Webhook"] = { main: [[{ node: "Assinatura Válida?", type: "main", index: 0 }]] };
  prod.connections["Assinatura Válida?"] = { main: [[{ node: "Registrar Evento", type: "main", index: 0 }]] };
  const reachable = new Set(); const queue = [webhook.name];
  while (queue.length) { const n = queue.shift(); if (reachable.has(n)) continue; reachable.add(n); for (const links of prod.connections[n]?.main || []) for (const link of links) queue.push(link.node); }
  const nodes = prod.nodes.filter(n => reachable.has(n.name));
  const connections = Object.fromEntries(Object.entries(prod.connections).filter(([n]) => reachable.has(n)));
  const qa = await api("POST", "/api/v1/workflows", { name, nodes, connections, settings: { executionOrder: "v1" } });
  qaId = qa.id; evidence.qaWorkflowId = qaId;
  fs.writeFileSync(`tmp-qa-reembolso/${qaId}-draft.json`, JSON.stringify(qa));
  await api("POST", `/api/v1/workflows/${qaId}/activate`);
  const eventId = `evt_qa_refund_${stamp}`;
  const event = { id: eventId, type: "charge.refunded", created: Math.floor(Date.now() / 1000), data: { object: {
    id: `ch_qa_refund_${stamp}`, customer: `cus_qa_refund_${stamp}`, amount: 49700, amount_refunded: 49700,
    currency: "brl", refunded: true, metadata: { pedido_id: pedidoId }, refunds: { data: [{ id: `re_qa_${stamp}`, amount: 49700, reason: "requested_by_customer" }] },
  } } };
  const response = await fetch(`${base}/webhook/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event), signal: AbortSignal.timeout(30000) });
  evidence.webhookHttp = response.status; evidence.webhookBody = await response.json();
  let execution;
  for (let i = 0; i < 10; i++) {
    const list = await api("GET", `/api/v1/executions?workflowId=${qaId}&limit=5`);
    const row = list.data?.[0];
    if (row) { execution = await api("GET", `/api/v1/executions/${row.id}?includeData=true`); if (execution.finished || ["success", "error"].includes(execution.status)) break; }
    await new Promise(r => setTimeout(r, 1000));
  }
  assert.ok(execution); evidence.executionId = execution.id; evidence.executionStatus = execution.status;
  const runs = execution.data?.resultData?.runData || {};
  evidence.executedNodes = Object.keys(runs);
  evidence.classified = runs["Classificar Evento"]?.[0]?.data?.main?.[0]?.[0]?.json;
  const audit = checked(await admin.from("stripe_eventos").select("event_id,resultado,processado_em").eq("event_id", eventId).single());
  evidence.audit = audit;
  evidence.afterRefundEvent = checked(await admin.from("clinicas").select("id,status,reembolsado_em,reembolso_valor,reembolso_motivo").eq("id", clinicaId).single());
  evidence.pedidoAfterRefund = checked(await admin.from("pedidos").select("id,status").eq("id", pedidoId).single());
  evidence.refundSupported = audit.resultado !== "ignorado" && evidence.afterRefundEvent.reembolsado_em !== null;
  evidence.subscriptionCancellation = "não confirmei: no refund/cancellation branch exists; operator cancellation is manual";
  fs.writeFileSync("tmp-qa-reembolso/execution.json", JSON.stringify(execution));
} finally {
  if (browser) await browser.close();
  if (qaId) { await api("POST", `/api/v1/workflows/${qaId}/deactivate`); const wf = await api("GET", `/api/v1/workflows/${qaId}`); evidence.qaActiveAfter = wf.active; }
  if (pedidoId) { checked(await admin.from("pedidos").update({ status: "cancelado", motivo_encerramento: "qa_reembolso_sem_dinheiro", encerrado_em: new Date().toISOString() }).eq("id", pedidoId)); evidence.pedidoFinal = checked(await admin.from("pedidos").select("id,status,motivo_encerramento").eq("id", pedidoId).single()); }
  if (clinicaId) { checked(await admin.from("clinicas").update({ status: "expirado" }).eq("id", clinicaId)); evidence.clinicaFinal = checked(await admin.from("clinicas").select("id,status").eq("id", clinicaId).single()); }
  fs.writeFileSync("tmp-qa-reembolso/provas.json", JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
}
