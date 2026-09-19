#!/usr/bin/env node
// n8n-remover-nodes.mjs — remove nodes de um workflow pelo nome, com os
// guardrails do repo (backup, PUT, publish, prova).
//
//   node scripts/n8n-remover-nodes.mjs <workflowId> "Nome do Node" ["Outro"]
//
// Recusa remover node ALCANÇÁVEL a partir de um trigger: só sai do ar o que
// já está órfão. Limpa também as conexões que apontavam para ele.

import { mkdirSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const N8N_URL = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
const N8N_KEY = process.env.N8N_API_KEY;
const [wfId, ...alvos] = process.argv.slice(2);

if (!N8N_KEY || !wfId || alvos.length === 0) {
  console.error('Uso: node scripts/n8n-remover-nodes.mjs <workflowId> "Nome do Node" [...]');
  process.exit(1);
}

const headers = { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" };
async function api(method, path, body) {
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${N8N_URL}${path}`, opts);
  return { ok: res.ok, status: res.status, texto: await res.text() };
}

const r0 = await api("GET", `/api/v1/workflows/${wfId}`);
if (!r0.ok) {
  console.error(`GET falhou (${r0.status}): ${r0.texto.slice(0, 300)}`);
  process.exit(1);
}
const wf = JSON.parse(r0.texto);
console.log(`Workflow: ${wf.name}  active=${wf.active}  versionId=${wf.versionId}`);

const dirBackup = resolve(RAIZ, "tmp-backup-workflows-deletados");
mkdirSync(dirBackup, { recursive: true });
const caminhoBackup = resolve(
  dirBackup,
  `${wfId}-antes-remover-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
);
writeFileSync(caminhoBackup, r0.texto);
console.log(`Backup: ${caminhoBackup}`);

// alcançáveis a partir de qualquer trigger
const TRIGGER = /trigger|webhook/i;
const vivos = new Set();
const pilha = wf.nodes.filter((n) => TRIGGER.test(n.type)).map((n) => n.name);
pilha.forEach((n) => vivos.add(n));
while (pilha.length) {
  const atual = pilha.pop();
  for (const ramo of wf.connections[atual]?.main ?? [])
    for (const c of ramo ?? [])
      if (!vivos.has(c.node)) { vivos.add(c.node); pilha.push(c.node); }
}

for (const alvo of alvos) {
  if (!wf.nodes.some((n) => n.name === alvo)) {
    console.error(`Node "${alvo}" não existe. Nada foi alterado.`);
    process.exit(1);
  }
  if (vivos.has(alvo)) {
    console.error(`RECUSADO: "${alvo}" é alcançável a partir de um trigger.`);
    console.error("Remover node vivo é mudança de fluxo, não limpeza. Nada foi alterado.");
    process.exit(1);
  }
}

wf.nodes = wf.nodes.filter((n) => !alvos.includes(n.name));
for (const alvo of alvos) delete wf.connections[alvo];
for (const origem of Object.keys(wf.connections)) {
  const main = wf.connections[origem]?.main;
  if (!main) continue;
  wf.connections[origem].main = main.map((ramo) =>
    (ramo ?? []).filter((c) => !alvos.includes(c.node)),
  );
}

const settings = { executionOrder: wf.settings?.executionOrder || "v1" };
if (wf.settings?.errorWorkflow) settings.errorWorkflow = wf.settings.errorWorkflow;

const put = await api("PUT", `/api/v1/workflows/${wfId}`, {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings,
});
if (!put.ok) {
  console.error(`PUT falhou (${put.status}): ${put.texto.slice(0, 400)}`);
  console.error(`Nada publicado. Backup intacto em ${caminhoBackup}`);
  process.exit(1);
}
if (wf.active) {
  const act = await api("POST", `/api/v1/workflows/${wfId}/activate`);
  if (!act.ok) {
    console.error(`Publish falhou (${act.status}): ${act.texto.slice(0, 400)}`);
    process.exit(1);
  }
}

const dep = JSON.parse((await api("GET", `/api/v1/workflows/${wfId}`)).texto);
const restantes = alvos.filter((a) => dep.nodes.some((n) => n.name === a));
const publicado = dep.versionId === dep.activeVersionId;
const orfaosRef = Object.entries(dep.connections).filter(([, v]) =>
  (v.main || []).some((b) => (b || []).some((c) => alvos.includes(c.node))),
);
console.log(`\nremovidos: ${alvos.filter((a) => !restantes.includes(a)).join(", ") || "(nenhum)"}`);
console.log(`ainda presentes: ${restantes.join(", ") || "(nenhum)"}`);
console.log(`conexões pendentes para os removidos: ${orfaosRef.length}`);
console.log(`versionId=${dep.versionId}`);
console.log(`activeVersionId=${dep.activeVersionId}  publicado=${publicado}`);
process.exit(publicado && restantes.length === 0 && orfaosRef.length === 0 ? 0 : 1);
