#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
const id = process.env.F6_WORKFLOW_ID || "voEwbw5fzNnn6bQq";
const base = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
const headers = { "X-N8N-API-KEY": process.env.N8N_API_KEY, "Content-Type": "application/json" };
if (!process.env.N8N_API_KEY) throw new Error("Falta N8N_API_KEY");
const api = async (method, path, body) => {
  const response = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
};
const wf = await api("GET", `/api/v1/workflows/${id}`);
for (const required of ["Preparar Claim", "Liberar Pedido para Retry", "Deletar Instância Órfã UazAPI", "Finalizar Pedido Provisionado"]) {
  if (!wf.nodes.some((n) => n.name === required)) throw new Error(`F6 incompleto: ${required} ausente`);
}
mkdirSync("tmp-backup-workflows-deletados", { recursive: true });
writeFileSync(`tmp-backup-workflows-deletados/${id}-pre-f6-robustez-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, JSON.stringify(wf, null, 2));
const connectError = (name, target) => {
  const node = wf.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`Node ausente: ${name}`);
  node.onError = "continueErrorOutput";
  wf.connections[name] ||= { main: [[]] };
  wf.connections[name].main[1] = [{ node: target, type: "main", index: 0 }];
};
for (const name of ["Gerar ia_config", "Extrair ia_config", "UazAPI Criar Instância"])
  connectError(name, "Liberar Pedido para Retry");
for (const name of ["UazAPI Configurar Webhook IN", "UazAPI Configurar Webhook OUT", "Limitar Resposta Webhook OUT", "Montar JSON Body", "Supabase Inserir Clínica", "UazAPI Gerar Código Pareamento", "Enviar Código Pareamento"])
  connectError(name, "Deletar Instância Órfã UazAPI");
const finalizar = wf.nodes.find((n) => n.name === "Finalizar Pedido Provisionado");
finalizar.retryOnFail = true;
finalizar.maxTries = 3;
finalizar.waitBetweenTries = 2000;
const settings = { executionOrder: wf.settings?.executionOrder || "v1" };
if (wf.settings?.errorWorkflow) settings.errorWorkflow = wf.settings.errorWorkflow;
await api("PUT", `/api/v1/workflows/${id}`, { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings });
if (wf.active) await api("POST", `/api/v1/workflows/${id}/activate`);
const after = await api("GET", `/api/v1/workflows/${id}`);
if (after.versionId !== after.activeVersionId) throw new Error("versionId != activeVersionId");
console.log(JSON.stringify({ id, versionId: after.versionId, activeVersionId: after.activeVersionId }));
