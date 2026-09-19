#!/usr/bin/env node

const n8nUrl = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
const n8nKey = process.env.N8N_API_KEY;
if (!n8nKey) throw new Error("N8N_API_KEY ausente");

const headers = { "X-N8N-API-KEY": n8nKey, "Content-Type": "application/json" };
async function api(method, path, body) {
  const response = await fetch(`${n8nUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

const production = await api("GET", "/api/v1/workflows/cf1An4BYT9A0LuHi");
const stripeNode = production.nodes.find((node) => node.credentials?.stripeApi);
if (!stripeNode) throw new Error("Credencial Stripe não encontrada no workflow de billing");

const suffix = Date.now().toString(36);
const webhookPath = `recepta/qa-f1-stripe-audit-${suffix}`;
const webhook = {
  id: `webhook-${suffix}`,
  name: "Webhook QA F1 Stripe",
  type: "n8n-nodes-base.webhook",
  typeVersion: 2,
  position: [0, 0],
  webhookId: crypto.randomUUID(),
  parameters: { httpMethod: "POST", path: webhookPath, options: {} },
};

function request(name, url, y) {
  return {
    id: crypto.randomUUID(),
    name,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [320, y],
    credentials: stripeNode.credentials,
    parameters: {
      url,
      authentication: "predefinedCredentialType",
      nodeCredentialType: "stripeApi",
      options: {},
    },
  };
}

const nodes = [
  webhook,
  request("Stripe Listar Prices", "https://api.stripe.com/v1/prices?active=true&limit=100&expand[]=data.product", -200),
  request("Stripe Listar Payment Links", "https://api.stripe.com/v1/payment_links?active=true&limit=100&expand[]=data.line_items", 0),
  request("Stripe Listar Portal", "https://api.stripe.com/v1/billing_portal/configurations?active=true&limit=100", 200),
];
const connections = {
  [webhook.name]: {
    main: [[
      { node: "Stripe Listar Prices", type: "main", index: 0 },
      { node: "Stripe Listar Payment Links", type: "main", index: 0 },
      { node: "Stripe Listar Portal", type: "main", index: 0 },
    ]],
  },
};

const created = await api("POST", "/api/v1/workflows", {
  name: `QA F1 - Auditoria Stripe ${suffix}`,
  nodes,
  connections,
  settings: { executionOrder: "v1" },
});
await api("POST", `/api/v1/workflows/${created.id}/activate`);
const active = await api("GET", `/api/v1/workflows/${created.id}`);
if (active.versionId !== active.activeVersionId) throw new Error("QA versionId != activeVersionId");

const trigger = await fetch(`${n8nUrl}/webhook/${webhookPath}`, { method: "POST" });
if (!trigger.ok) throw new Error(`Webhook QA: HTTP ${trigger.status} ${(await trigger.text()).slice(0, 300)}`);

await new Promise((resolve) => setTimeout(resolve, 1200));
const executions = await api("GET", `/api/v1/executions?workflowId=${created.id}&limit=1`);
const executionId = executions.data?.[0]?.id;
if (!executionId) throw new Error("Execução QA não encontrada");
const execution = await api("GET", `/api/v1/executions/${executionId}?includeData=true`);
const runData = execution.data?.resultData?.runData || {};

function output(name) {
  const run = runData[name]?.[0];
  if (run?.error) throw new Error(`${name}: ${run.error.message}`);
  return run?.data?.main?.[0]?.[0]?.json;
}

const prices = output("Stripe Listar Prices")?.data || [];
const links = output("Stripe Listar Payment Links")?.data || [];
const portal = output("Stripe Listar Portal")?.data || [];
const pinnedIds = new Set([
  "price_1U35F9HkvKNdqMufd58XEIq2",
  "price_1U35FAHkvKNdqMuf7dtT8vrs",
  "price_1UEIx6HkvKNdqMufqV6xA1s7",
  "price_1UEIx8HkvKNdqMufg0iqXerD",
]);

console.log(JSON.stringify({
  qa_workflow_id: created.id,
  qa_version_id: active.versionId,
  qa_execution_id: executionId,
  qa_webhook_path: webhookPath,
  prices: prices.filter((price) => pinnedIds.has(price.id)).map((price) => ({
    id: price.id,
    active: price.active,
    livemode: price.livemode,
    currency: price.currency,
    unit_amount: price.unit_amount,
    recurring: price.recurring,
    product: { id: price.product?.id, name: price.product?.name, active: price.product?.active, livemode: price.product?.livemode },
  })),
  payment_links: links.map((link) => ({
    id: link.id,
    active: link.active,
    livemode: link.livemode,
    url: link.url,
    price_ids: (link.line_items?.data || []).map((item) => item.price?.id).filter(Boolean),
  })),
  portal_configurations: portal.map((config) => ({
    id: config.id,
    active: config.active,
    livemode: config.livemode,
    is_default: config.is_default,
    features: Object.fromEntries(Object.entries(config.features || {}).map(([key, value]) => [key, Boolean(value?.enabled)])),
  })),
}, null, 2));
