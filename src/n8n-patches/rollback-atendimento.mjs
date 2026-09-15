#!/usr/bin/env node
/**
 * Rollback do Atendimento para um backup conhecido.
 *
 *   N8N_API_KEY=... node src/n8n-patches/rollback-atendimento.mjs <arquivo-backup.json>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "../..");
const base = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
const key = process.env.N8N_API_KEY;
if (!key) throw new Error("N8N_API_KEY ausente");
const arquivo = process.argv[2];
if (!arquivo) throw new Error("uso: rollback-atendimento.mjs <arquivo-backup.json>");

async function api(method, path, body) {
  const r = await fetch(base + path, {
    method, headers: { "X-N8N-API-KEY": key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${t.slice(0, 400)}`);
  return t ? JSON.parse(t) : {};
}

const lista = await api("GET", "/api/v1/workflows?limit=250");
if (!(lista.data || []).length) throw new Error("token suspeito: 0 workflows");

const id = "cxn5FxUNMJmlJ1WJ";
const alvo = JSON.parse(readFileSync(resolve(raiz, arquivo), "utf8"));
if (!alvo.nodes?.length || !alvo.connections) throw new Error("backup invalido");

// Backup do estado ATUAL antes de sobrescrever: o rollback tambem e uma escrita.
const atual = await api("GET", `/api/v1/workflows/${id}`);
const dir = join(raiz, "tmp-backup-workflows-deletados");
mkdirSync(dir, { recursive: true });
const bk = join(dir, `${id}-pre-rollback-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(bk, JSON.stringify(atual, null, 2));
console.log(`estado atual salvo em: ${bk} (${atual.nodes.length} nodes)`);
console.log(`restaurando: ${arquivo} (${alvo.nodes.length} nodes)`);

const settings = { executionOrder: alvo.settings?.executionOrder || "v1" };
if (alvo.settings?.errorWorkflow) settings.errorWorkflow = alvo.settings.errorWorkflow;

await api("PUT", `/api/v1/workflows/${id}`, {
  name: alvo.name, nodes: alvo.nodes, connections: alvo.connections, settings,
});
await api("POST", `/api/v1/workflows/${id}/activate`);

const depois = await api("GET", `/api/v1/workflows/${id}`);
if (depois.nodes.length !== alvo.nodes.length) throw new Error(`nodes: esperava ${alvo.nodes.length}, tem ${depois.nodes.length}`);
if (depois.versionId !== depois.activeVersionId) throw new Error("versionId != activeVersionId");
if (!depois.active) throw new Error("workflow nao ficou ativo");

console.log(`nodes: ${depois.nodes.length} | active: ${depois.active}`);
console.log(`versionId=${depois.versionId}`);
console.log(`activeVersionId=${depois.activeVersionId}`);
console.log("ROLLBACK OK");
