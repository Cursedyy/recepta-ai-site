#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
const id = "Stg6aUfruEtDoOB4";
const base = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
const headers = { "X-N8N-API-KEY": process.env.N8N_API_KEY, "Content-Type": "application/json" };
const wf = await (await fetch(`${base}/api/v1/workflows/${id}`, { headers })).json();
mkdirSync("tmp-backup-workflows-deletados", { recursive: true });
writeFileSync(`tmp-backup-workflows-deletados/${id}-pre-qa-tier-${Date.now()}.json`, JSON.stringify(wf, null, 2));
wf.nodes.find((n) => n.name === "Supabase Confirmar Pagamento").parameters.jsonBody =
  "={{ (function(){ const pago = new Date(); return JSON.stringify({ status: 'pago', pago_em: pago.toISOString(), garantia_teto_em: new Date(pago.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(), stripe_session_id: $json.session_id, stripe_customer_id: $json.customer_id, stripe_subscription_id: $json.subscription_id, price_id: $json.price_id_encontrado, tier: $json.tier, ciclo: $json.plano, plano: $json.plano }); })() }}";
wf.nodes.find((n) => n.name === "Salvar Pagamento").parameters.jsCode = await (await import("node:fs/promises")).readFile("src/n8n-patches/billing-salvar-pagamento-f6.js", "utf8");
wf.nodes = wf.nodes.filter((n) => n.type !== "n8n-nodes-base.respondToWebhook");
for (const connection of Object.values(wf.connections)) {
  connection.main = (connection.main || []).map((output) => (output || []).filter((edge) => !edge.node.startsWith("Respond ")));
}
if (!wf.nodes.some((n) => n.name === "QA Fim Billing")) {
  wf.nodes.push({ parameters: { jsCode: "return $input.all()" }, id: `qa-fim-${Date.now()}`, name: "QA Fim Billing", type: "n8n-nodes-base.code", typeVersion: 2, position: [1600, -500] });
}
wf.connections["Salvar Pagamento"] = { main: [[{ node: "QA Fim Billing", type: "main", index: 0 }]] };
const settings = { executionOrder: wf.settings?.executionOrder || "v1" };
let response = await fetch(`${base}/api/v1/workflows/${id}`, { method: "PUT", headers, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings }) });
if (!response.ok) throw new Error(await response.text());
response = await fetch(`${base}/api/v1/workflows/${id}/activate`, { method: "POST", headers });
if (!response.ok) throw new Error(await response.text());
const sb = process.env.SUPABASE_URL.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbHeaders = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
const pedido = crypto.randomUUID();
response = await fetch(`${sb}/rest/v1/pedidos`, { method: "POST", headers: sbHeaders, body: JSON.stringify({ id: pedido, status: "aberto", tier: "completo", ciclo: "mensal", plano: "mensal", origem: "landing" }) });
if (!response.ok) throw new Error(await response.text());
const url = "https://n8n.zapscout.com.br/webhook/qa-f6-billing-mu1q92vv";
await Promise.all([0, 1].map(() => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pedido_id: pedido, session_id: `cs_qa_${pedido.slice(0, 8)}` }) })));
await new Promise((resolve) => setTimeout(resolve, 2500));
const row = await (await fetch(`${sb}/rest/v1/pedidos?id=eq.${pedido}&select=id,status,tier,ciclo,plano,price_id,stripe_session_id,pago_em,garantia_teto_em`, { headers: sbHeaders })).json();
const executions = await (await fetch(`${base}/api/v1/executions?workflowId=${id}&limit=3`, { headers })).json();
console.log(JSON.stringify({ pedido, row, executions: executions.data.map((x) => ({ id: x.id, status: x.status })) }, null, 2));
