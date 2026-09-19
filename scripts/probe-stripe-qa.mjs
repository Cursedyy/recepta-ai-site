#!/usr/bin/env node
// probe-stripe-qa.mjs
// Sonda descartável: cria um workflow QA no n8n com webhook próprio que usa a
// credencial Stripe já existente para consultar /v1/prices e /v1/payment_links,
// devolve o JSON via resposta do webhook, e APAGA o workflow no fim.
// Não toca em nenhum workflow de produção.

const N8N_KEY = process.env.N8N_API_KEY;
const N8N_URL = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
const STRIPE_CRED_ID = process.argv[2] || "ZYM7MJM0SkrpqFWc";

if (!N8N_KEY) {
  console.error("Falta N8N_API_KEY.");
  process.exit(1);
}

const headers = { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" };

async function api(method, path, body) {
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${N8N_URL}${path}`, opts);
  const texto = await res.text();
  return { ok: res.ok, status: res.status, texto };
}

const path = `zz-probe-stripe-${Date.now().toString(36)}`;
const wf = {
  name: `zz-qa-probe-stripe-${new Date().toISOString().slice(0, 16)}`,
  settings: { executionOrder: "v1" },
  nodes: [
    {
      parameters: { httpMethod: "GET", path, responseMode: "responseNode", options: {} },
      id: "wh-probe",
      name: "Webhook Probe",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [0, 0],
      webhookId: path,
    },
    {
      parameters: {
        method: "GET",
        url: "={{ 'https://api.stripe.com/v1/prices?active=true&limit=100&expand[]=data.product' }}",
        authentication: "predefinedCredentialType",
        nodeCredentialType: "stripeApi",
        options: {},
      },
      id: "http-prices",
      name: "Stripe Prices",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [220, 0],
      credentials: { stripeApi: { id: STRIPE_CRED_ID, name: "Stripe API - Recepta" } },
    },
    {
      parameters: { respondWith: "json", responseBody: "={{ JSON.stringify($json) }}", options: {} },
      id: "respond-probe",
      name: "Respond",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.1,
      position: [440, 0],
    },
  ],
  connections: {
    "Webhook Probe": { main: [[{ node: "Stripe Prices", type: "main", index: 0 }]] },
    "Stripe Prices": { main: [[{ node: "Respond", type: "main", index: 0 }]] },
  },
};

const criado = await api("POST", "/api/v1/workflows", wf);
if (!criado.ok) {
  console.error(`Falhou criar workflow QA (${criado.status}): ${criado.texto.slice(0, 400)}`);
  process.exit(1);
}
const { id: wfId } = JSON.parse(criado.texto);
console.log(`QA workflow criado: ${wfId}`);

const act = await api("POST", `/api/v1/workflows/${wfId}/activate`);
if (!act.ok) {
  console.error(`Falhou ativar (${act.status}): ${act.texto.slice(0, 300)}`);
  await api("DELETE", `/api/v1/workflows/${wfId}`);
  process.exit(1);
}

// aguarda webhook de produção subir
await new Promise((r) => setTimeout(r, 3000));

let saida = null;
for (let i = 0; i < 3; i++) {
  const res = await fetch(`${N8N_URL}/webhook/${path}`);
  if (res.ok) {
    saida = await res.text();
    break;
  }
  await new Promise((r) => setTimeout(r, 2000));
}

const del = await api("DELETE", `/api/v1/workflows/${wfId}`);
console.log(`QA workflow apagado: ${del.ok ? "ok" : `falhou (${del.status})`}`);

if (!saida) {
  console.error("Sonda não respondeu a tempo.");
  process.exit(1);
}
const j = JSON.parse(saida);
if (j.error || !j.data) {
  console.error("Resposta inesperada do Stripe:", saida.slice(0, 600));
  process.exit(1);
}
for (const p of j.data) {
  const prod = typeof p.product === "object" ? p.product : {};
  console.log(
    [
      p.id,
      `livemode=${p.livemode}`,
      `unit_amount=${p.unit_amount}`,
      p.recurring ? `${p.recurring.interval}` : "one_time",
      `produto=${prod.name || "(sem nome)"}`,
      `metadata=${JSON.stringify(p.metadata || {})}`,
    ].join(" | "),
  );
}
