#!/usr/bin/env node
// deploy-node-code.mjs
// Substitui o jsCode de um ou mais Code nodes de um workflow n8n pelo conteudo
// de arquivos deste diretorio, publica e PROVA que a versao ativa mudou.
//
// Uso:
//   node src/n8n-patches/deploy-node-code.mjs <workflowId> "<Nome do Node>" <arquivo> [...]
//
// Por que existe: colar codigo de node a mao ja corrompeu producao duas vezes
// (ver CLAUDE.md). O arquivo e a fonte da verdade; o deploy e verbatim.
//
// Cuidados embutidos:
// - backup do JSON original em tmp-backup-workflows-deletados/ antes do PUT
// - `settings` e reenviado inteiro; se o schema da API recusar alguma chave
//   (binaryMode, availableInMCP), tenta de novo so com o que ela aceita, mas
//   AVISA em alto e bom som para a chave perdida ser reposta na UI
// - confere no GET seguinte que activeVersionId === versionId e que o codigo
//   no ar e byte a byte igual ao arquivo

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(__dirname, "..", "..");

const N8N_KEY = process.env.N8N_API_KEY;
const N8N_URL = (
  process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br"
).replace(/\/$/, "");

if (!N8N_KEY) {
  console.error("Falta N8N_API_KEY no ambiente.");
  process.exit(1);
}

const [workflowId, ...resto] = process.argv.slice(2);
if (!workflowId || resto.length === 0 || resto.length % 2 !== 0) {
  console.error(
    'Uso: deploy-node-code.mjs <workflowId> "<Node>" <arquivo> [...]',
  );
  process.exit(1);
}

const pares = [];
for (let i = 0; i < resto.length; i += 2) {
  pares.push({ node: resto[i], arquivo: resto[i + 1] });
}

const headers = {
  "X-N8N-API-KEY": N8N_KEY,
  "Content-Type": "application/json",
};

async function api(method, path, body) {
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${N8N_URL}${path}`, opts);
  const texto = await res.text();
  return { ok: res.ok, status: res.status, texto };
}

async function getWorkflow() {
  const r = await api("GET", `/api/v1/workflows/${workflowId}`);
  if (!r.ok) {
    console.error(`GET falhou (${r.status}): ${r.texto.slice(0, 400)}`);
    process.exit(1);
  }
  return JSON.parse(r.texto);
}

const wf = await getWorkflow();
console.log(`Workflow: ${wf.name}`);
console.log(`  active=${wf.active} versionId=${wf.versionId}`);

// backup antes de qualquer escrita
const dirBackup = join(RAIZ, "tmp-backup-workflows-deletados");
mkdirSync(dirBackup, { recursive: true });
const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
const caminhoBackup = join(
  dirBackup,
  `${workflowId}-pre-patch-${carimbo}.json`,
);
writeFileSync(caminhoBackup, JSON.stringify(wf, null, 2));
console.log(`  backup: ${caminhoBackup}`);

const esperado = new Map();
for (const { node, arquivo } of pares) {
  const alvo = wf.nodes.find((n) => n.name === node);
  if (!alvo) {
    console.error(
      `Node "${node}" nao existe. Nodes: ${wf.nodes.map((n) => n.name).join(" | ")}`,
    );
    process.exit(1);
  }
  if (typeof alvo.parameters?.jsCode !== "string") {
    console.error(`Node "${node}" nao e Code node (sem jsCode).`);
    process.exit(1);
  }
  const codigo = readFileSync(resolve(RAIZ, arquivo), "utf8");
  try {
    new Function(codigo);
  } catch (e) {
    console.error(`Sintaxe invalida em ${arquivo}: ${e.message}`);
    process.exit(1);
  }
  alvo.parameters.jsCode = codigo;
  esperado.set(node, codigo);
  console.log(`  patch: ${node} <- ${arquivo} (${codigo.length} bytes)`);
}

async function publicar(settings) {
  return api("PUT", `/api/v1/workflows/${workflowId}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings,
  });
}

let r = await publicar(wf.settings || {});
let settingsReduzidas = false;
if (!r.ok) {
  console.warn(
    `PUT com settings completas recusado (${r.status}): ${r.texto.slice(0, 200)}`,
  );
  const minimas = { executionOrder: wf.settings?.executionOrder || "v1" };
  if (wf.settings?.errorWorkflow)
    minimas.errorWorkflow = wf.settings.errorWorkflow;
  r = await publicar(minimas);
  settingsReduzidas = true;
  if (!r.ok) {
    console.error(`PUT falhou (${r.status}): ${r.texto.slice(0, 400)}`);
    console.error(`Nada foi publicado. Backup intacto em ${caminhoBackup}`);
    process.exit(1);
  }
}

// O PUT grava uma nova versao como draft. Em workflows ativos, publicar
// explicitamente evita que a execucao continue usando a versao anterior.
if (wf.active) {
  const ativacao = await api(
    "POST",
    `/api/v1/workflows/${workflowId}/activate`,
  );
  if (!ativacao.ok) {
    console.error(
      `Publish falhou (${ativacao.status}): ${ativacao.texto.slice(0, 400)}`,
    );
    console.error(
      `O draft foi salvo, mas nao publicado. Backup em ${caminhoBackup}`,
    );
    process.exit(1);
  }
}

const depois = await getWorkflow();
console.log("");
console.log(
  `Publicado. versionId=${depois.versionId} activeVersionId=${depois.activeVersionId}`,
);

let falhou = false;
if (depois.versionId !== depois.activeVersionId) {
  console.error("ERRO: versionId != activeVersionId — ficou como rascunho.");
  falhou = true;
}
if (depois.active !== wf.active) {
  console.error(`ERRO: active mudou de ${wf.active} para ${depois.active}.`);
  falhou = true;
}
for (const [node, codigo] of esperado) {
  const noAr = depois.nodes.find((n) => n.name === node)?.parameters?.jsCode;
  if (noAr !== codigo) {
    console.error(`ERRO: o codigo de "${node}" no ar nao bate com o arquivo.`);
    falhou = true;
  } else {
    console.log(`  ok: "${node}" no ar identico ao arquivo`);
  }
}

const antes = JSON.stringify(wf.settings || {});
const agora = JSON.stringify(depois.settings || {});
if (antes !== agora) {
  console.warn("");
  console.warn("ATENCAO: settings do workflow mudaram no PUT.");
  console.warn(`  antes: ${antes}`);
  console.warn(`  agora: ${agora}`);
  if (settingsReduzidas) {
    console.warn(
      "  A API recusou o objeto completo. Reponha as chaves perdidas pela UI do n8n.",
    );
  }
}

process.exit(falhou ? 1 : 0);
