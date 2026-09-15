#!/usr/bin/env node
// f4-inspect-nodes.mjs — lê o backup MAIS RECENTE de cf1An4BYT9A0LuHi e imprime
// os parameters completos dos nodes informados por nome. Somente leitura.
// Uso: node scripts/f4-inspect-nodes.mjs "Comparar Assinatura" "Extrair Evento Checkout" ...

import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const DIR = "tmp-backup-workflows-deletados";
const files = readdirSync(DIR)
  .filter((f) => f.startsWith("cf1An4BYT9A0LuHi-") && f.endsWith(".json"))
  .sort();
if (files.length === 0) {
  console.error("Nenhum backup encontrado em " + DIR);
  process.exit(1);
}
const latest = join(DIR, files[files.length - 1]);
const wf = JSON.parse(readFileSync(latest, "utf8"));
console.log(`lendo: ${latest} (nodes=${wf.nodes.length})\n`);

const wanted = process.argv.slice(2);
const nodes = wanted.length ? wanted : wf.nodes.map((n) => n.name);
for (const name of nodes) {
  const n = wf.nodes.find((x) => x.name === name);
  if (!n) {
    console.log(`=== "${name}": NAO ENCONTRADO\n`);
    continue;
  }
  console.log(`=== "${n.name}" (${n.type} tv=${n.typeVersion}) ===`);
  console.log(JSON.stringify(n.parameters, null, 2));
  console.log("");
}
