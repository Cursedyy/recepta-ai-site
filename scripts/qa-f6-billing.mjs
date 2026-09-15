#!/usr/bin/env node
const base = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
const headers = { "X-N8N-API-KEY": process.env.N8N_API_KEY, "Content-Type": "application/json" };
if (!process.env.N8N_API_KEY) throw new Error("Falta N8N_API_KEY");
const prod = await (await fetch(`${base}/api/v1/workflows/cf1An4BYT9A0LuHi`, { headers })).json();
const stamp = Date.now().toString(36);
const path = `qa-f6-billing-${stamp}`;
const webhook = prod.nodes.find((n) => n.name === "Webhook Stripe Pagamento");
webhook.parameters.path = path;
webhook.parameters.responseMode = "onReceived";
webhook.webhookId = crypto.randomUUID();
prod.nodes.push({
  parameters: { jsCode: 'const b = $("Webhook Stripe Pagamento").first().json.body || {}; return [{ json: { event: { type: "checkout.session.completed", data: { object: { id: b.session_id, client_reference_id: b.pedido_id, customer: "cus_qa", subscription: "sub_qa" } } } } }];' },
  id: `qa-event-${stamp}`, name: "QA Evento Checkout", type: "n8n-nodes-base.code", typeVersion: 2, position: [-500, -500],
});
prod.connections["Webhook Stripe Pagamento"] = { main: [[{ node: "QA Evento Checkout", type: "main", index: 0 }]] };
prod.connections["QA Evento Checkout"] = { main: [[{ node: "Extrair Evento Checkout", type: "main", index: 0 }]] };
const lineItems = prod.nodes.find((n) => n.name === "Buscar Line Items Checkout Session");
lineItems.type = "n8n-nodes-base.code";
lineItems.typeVersion = 2;
lineItems.parameters = { jsCode: 'return [{ json: { data: [{ price: { id: $("Config Stripe Webhook").first().json.STRIPE_PRICE_ESSENCIAL_ANUAL } }] } }];' };
delete lineItems.credentials;
delete lineItems.onError;
const settings = { executionOrder: prod.settings?.executionOrder || "v1" };
const response = await fetch(`${base}/api/v1/workflows`, {
  method: "POST", headers,
  body: JSON.stringify({ name: `ZZ QA F6 billing ${stamp}`, nodes: prod.nodes, connections: prod.connections, settings }),
});
const text = await response.text();
if (!response.ok) throw new Error(`${response.status}: ${text}`);
const qa = JSON.parse(text);
console.log(JSON.stringify({ id: qa.id, path }));
