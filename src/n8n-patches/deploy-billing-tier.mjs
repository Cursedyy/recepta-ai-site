#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "../..");
const base = (
  process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br"
).replace(/\/$/, "");
const key = process.env.N8N_API_KEY;
if (!key) throw new Error("N8N_API_KEY ausente");

const ids = {
  STRIPE_PRICE_ESSENCIAL_MENSAL: "price_1U35F9HkvKNdqMufd58XEIq2",
  STRIPE_PRICE_ESSENCIAL_ANUAL: "price_1U35FAHkvKNdqMuf7dtT8vrs",
  STRIPE_PRICE_COMPLETO_MENSAL: "price_1UEIx6HkvKNdqMufqV6xA1s7",
  STRIPE_PRICE_COMPLETO_ANUAL: "price_1UEIx8HkvKNdqMufg0iqXerD",
};

async function api(method, path, body) {
  const response = await fetch(base + path, {
    method,
    headers: { "X-N8N-API-KEY": key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok)
    throw new Error(
      `${method} ${path}: ${response.status} ${text.slice(0, 400)}`,
    );
  return text ? JSON.parse(text) : {};
}

const workflow = await api("GET", "/api/v1/workflows/cf1An4BYT9A0LuHi");
const dir = join(raiz, "tmp-backup-workflows-deletados");
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = join(dir, `${workflow.id}-pre-billing-tier-${stamp}.json`);
writeFileSync(backup, JSON.stringify(workflow, null, 2));
console.log(`backup: ${backup}`);

const node = (name) => {
  const found = workflow.nodes.find((item) => item.name === name);
  if (!found) throw new Error(`Node ausente: ${name}`);
  return found;
};
const config = node("Config Stripe Webhook");
const atuais = config.parameters.assignments.assignments.filter(
  (item) => !(item.name in ids),
);
config.parameters.assignments.assignments = atuais.concat(
  Object.entries(ids).map(([name, value]) => ({
    id: name.toLowerCase(),
    name,
    type: "string",
    value,
  })),
);
node("Determinar Plano").parameters.jsCode = readFileSync(
  join(raiz, "src/n8n-patches/billing-determinar-plano.js"),
  "utf8",
);
node("Supabase Confirmar Pagamento").parameters.jsonBody =
  "={{ JSON.stringify({ status: 'ativo', trial_fim: null, plano_pago_em: new Date().toISOString(), stripe_subscription_id: $json.subscription_id, stripe_customer_id: $json.customer_id, plano: $json.plano, tier: $json.tier }) }}";

const settings = { executionOrder: workflow.settings?.executionOrder || "v1" };
if (workflow.settings?.errorWorkflow)
  settings.errorWorkflow = workflow.settings.errorWorkflow;
await api("PUT", `/api/v1/workflows/${workflow.id}`, {
  name: workflow.name,
  nodes: workflow.nodes,
  connections: workflow.connections,
  settings,
});
if (workflow.active)
  await api("POST", `/api/v1/workflows/${workflow.id}/activate`);

const after = await api("GET", `/api/v1/workflows/${workflow.id}`);
if (after.versionId !== after.activeVersionId)
  throw new Error("versionId != activeVersionId");
const afterConfig = after.nodes.find(
  (item) => item.name === "Config Stripe Webhook",
);
const assignments = Object.fromEntries(
  afterConfig.parameters.assignments.assignments.map((item) => [
    item.name,
    item.value,
  ]),
);
for (const [name, value] of Object.entries(ids)) {
  if (assignments[name] !== value) throw new Error(`${name} nao publicado`);
}
console.log(
  `versionId=${after.versionId} activeVersionId=${after.activeVersionId}`,
);
console.log("quatro Price IDs confirmados na versao ativa");
