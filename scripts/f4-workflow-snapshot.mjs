#!/usr/bin/env node
// f4-workflow-snapshot.mjs — READ-ONLY.
// 1. GET /workflows/cf1An4BYT9A0LuHi e grava backup completo (sem mutação).
// 2. Imprime resumo: nodes (name/type/typeVersion), settings, connections.
// Nenhum PUT, nenhum publish. Uso: node scripts/f4-workflow-snapshot.mjs [--print-connections]

const N8N_KEY = process.env.N8N_API_KEY;
const N8N_URL = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
const WF_ID = "cf1An4BYT9A0LuHi";
const PRINT_CONN = process.argv.includes("--print-connections");

if (!N8N_KEY) {
  console.error("Falta N8N_API_KEY.");
  process.exit(1);
}

const res = await fetch(`${N8N_URL}/api/v1/workflows/${WF_ID}`, {
  headers: { "X-N8N-API-KEY": N8N_KEY },
});
if (!res.ok) {
  console.error(`GET falhou (${res.status}).`);
  process.exit(1);
}
const texto = await res.text();
const wf = JSON.parse(texto);

const { writeFileSync, mkdirSync } = await import("fs");
mkdirSync("tmp-backup-workflows-deletados", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const path = `tmp-backup-workflows-deletados/${WF_ID}-snapshot-${stamp}.json`;
writeFileSync(path, texto);
console.log(`Workflow: ${wf.name}`);
console.log(`active=${wf.active} versionId=${wf.versionId} activeVersionId=${wf.activeVersionId ?? "(nao informado)"}`);
console.log(`backup completo: ${path} (${(texto.length / 1024).toFixed(0)} KB)`);
console.log(`settings: ${JSON.stringify(wf.settings)}`);
console.log(`\n== NODES (${wf.nodes.length}) ==`);
for (const n of wf.nodes) {
  console.log(`  [${n.type.split(".").pop()}] "${n.name}" tv=${n.typeVersion}${n.disabled ? " [DISABLED]" : ""}`);
}
console.log("\n== CONNECTIONS ==");
for (const [from, spec] of Object.entries(wf.connections)) {
  const outs = (spec.main || []).map((arr, i) => {
    const targets = (arr || []).map((c) => c.node).join(", ") || "(vazio)";
    return `    out${i}: ${targets}`;
  });
  console.log(`  "${from}":`);
  outs.forEach((l) => console.log(l));
}
if (!PRINT_CONN) {
  // resumos já impressos acima; nada extra
}
