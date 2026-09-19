#!/usr/bin/env node
// f6-claim-modo.mjs — alterna o Onboarding (voEwbw5fzNnn6bQq) entre os dois
// modos do claim F6, com os guardrails do repo (backup, PUT, publish, prova).
//
//   node scripts/f6-claim-modo.mjs --soft   (default)
//   node scripts/f6-claim-modo.mjs --hard
//
// SOFT: briefing sem ?pedido= UUID segue como trial — "É Pedido Pago?" (false)
//       cai direto em "Gerar ia_config". É o modo seguro enquanto a landing
//       ainda tem CTA para /briefing sem pedido (F8 não subiu).
// HARD: briefing sem pedido morre em "Preparar Claim" (throw → Alerta de
//       Falha). Só na janela do F8, minutos antes da troca de copy.
//
// Em ambos, o caminho PAGO é idêntico: PATCH condicional
// pedidos SET status='provisionando' WHERE id=<pedido> AND status='pago'.
//
// Os PATCHes de encerramento/compensação usam UUID_NULO como filtro quando não
// há pedido (modo trial): um uuid válido que não casa nenhuma linha, para o
// PostgREST devolver [] em vez de 400 "invalid input syntax for type uuid".

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WF_ID = process.env.F6_WORKFLOW_ID || "voEwbw5fzNnn6bQq";
const N8N_URL = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
const N8N_KEY = process.env.N8N_API_KEY;
const UUID_NULO = "00000000-0000-0000-0000-000000000000";

const modo = process.argv.includes("--hard") ? "hard" : "soft";
const ARQUIVO = modo === "hard"
  ? "src/n8n-patches/onboarding-claim-pedido-hard.js"
  : "src/n8n-patches/onboarding-claim-pedido.js";

if (!N8N_KEY) {
  console.error("Falta N8N_API_KEY.");
  process.exit(1);
}

const headers = { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" };
async function api(method, path, body) {
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${N8N_URL}${path}`, opts);
  return { ok: res.ok, status: res.status, texto: await res.text() };
}

const r0 = await api("GET", `/api/v1/workflows/${WF_ID}`);
if (!r0.ok) {
  console.error(`GET falhou (${r0.status}): ${r0.texto.slice(0, 300)}`);
  process.exit(1);
}
const wf = JSON.parse(r0.texto);
console.log(`Workflow: ${wf.name}  active=${wf.active}  versionId=${wf.versionId}`);

// ── backup obrigatório antes de qualquer PUT ─────────────────────────────
const dirBackup = resolve(RAIZ, "tmp-backup-workflows-deletados");
mkdirSync(dirBackup, { recursive: true });
const caminhoBackup = resolve(
  dirBackup,
  `${WF_ID}-antes-claim-${modo}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
);
writeFileSync(caminhoBackup, r0.texto);
console.log(`Backup: ${caminhoBackup}`);

// ── 1. jsCode do Preparar Claim, verbatim do arquivo ─────────────────────
const codigo = readFileSync(resolve(RAIZ, ARQUIVO), "utf8");
const preparar = wf.nodes.find((n) => n.name === "Preparar Claim");
if (!preparar) {
  console.error('Node "Preparar Claim" não existe. Rode o patch F6 primeiro.');
  process.exit(1);
}
preparar.parameters = { ...preparar.parameters, jsCode: codigo };

// ── 2. destino do ramo false de "É Pedido Pago?" ─────────────────────────
// soft: trial segue o fluxo (Gerar ia_config). hard: nunca chega aqui, mas
// mantemos o fail-loud ligado por segurança.
const destinoFalse = modo === "soft" ? "Gerar ia_config" : "Falha Claim Pedido";
const conexoes = wf.connections["É Pedido Pago?"];
if (!conexoes?.main?.[1]) {
  console.error('"É Pedido Pago?" sem ramo false. Topologia inesperada, abortando.');
  process.exit(1);
}
conexoes.main[1] = [{ node: destinoFalse, type: "main", index: 0 }];

// ── 3. PATCHes de pedido toleram ausência de pedido_id ───────────────────
const FALLBACK = `($('Preparar Claim').first().json.pedido_id || '${UUID_NULO}')`;
let urlsCorrigidas = 0;
for (const nome of ["Finalizar Pedido Provisionado", "Liberar Pedido para Retry"]) {
  const node = wf.nodes.find((n) => n.name === nome);
  if (!node) continue;
  const antes = node.parameters.url;
  const depois = antes.replace(
    /\$\('Preparar Claim'\)\.first\(\)\.json\.pedido_id/g,
    FALLBACK,
  );
  if (depois !== antes) {
    node.parameters = { ...node.parameters, url: depois };
    urlsCorrigidas++;
  }
}
console.log(`Modo: ${modo} | ramo false → ${destinoFalse} | URLs com fallback: ${urlsCorrigidas}`);

// ── PUT + publish ────────────────────────────────────────────────────────
const settings = { executionOrder: wf.settings?.executionOrder || "v1" };
if (wf.settings?.errorWorkflow) settings.errorWorkflow = wf.settings.errorWorkflow;

const put = await api("PUT", `/api/v1/workflows/${WF_ID}`, {
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
  const act = await api("POST", `/api/v1/workflows/${WF_ID}/activate`);
  if (!act.ok) {
    console.error(`Publish falhou (${act.status}): ${act.texto.slice(0, 400)}`);
    console.error(`Draft salvo, NÃO publicado. Backup em ${caminhoBackup}`);
    process.exit(1);
  }
}

// ── prova ────────────────────────────────────────────────────────────────
const dep = JSON.parse((await api("GET", `/api/v1/workflows/${WF_ID}`)).texto);
const noAr = dep.nodes.find((n) => n.name === "Preparar Claim").parameters.jsCode;
const ramo = dep.connections["É Pedido Pago?"].main[1].map((c) => c.node).join(", ");
const publicado = dep.versionId === dep.activeVersionId;
const igual = noAr === codigo;
console.log(`\nversionId=${dep.versionId}`);
console.log(`activeVersionId=${dep.activeVersionId}  publicado=${publicado}`);
console.log(`código byte a byte igual ao arquivo: ${igual}`);
console.log(`É Pedido Pago? (false) → ${ramo}`);
process.exit(publicado && igual && ramo === destinoFalse ? 0 : 1);
