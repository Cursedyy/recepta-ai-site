#!/usr/bin/env node
// Probe — comportamentos do runtime n8n que decidem o desenho do F4/F6:
//   1. responseMode: lastNode com último node emitindo ZERO itens → 200 ou 500?
//   2. $('Node').isExecuted existe no Code node? (true/false/throw)
//
// Padrão casa de QA: workflow descartável zz-*, ativado, testado por curl,
// DESATIVADO e DELETADO no fim (deixo só o log). Nada toca produção.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const BASE = process.env.N8N_BASE_URL;
const KEY = process.env.N8N_API_KEY;
if (!BASE || !KEY) {
  console.error("N8N_BASE_URL / N8N_API_KEY ausentes");
  process.exit(1);
}
const H = { "X-N8N-API-KEY": KEY, "Content-Type": "application/json" };
const PATH_TESTE = "zz-f6probe-" + Date.now().toString(36);

const wf = {
  name: "zz-probe-runtime-f6 (apagar)",
  settings: { executionOrder: "v1" },
  nodes: [
    {
      name: "Webhook Teste",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [0, 0],
      webhookId: crypto.randomUUID(),
      parameters: {
        httpMethod: "GET",
        path: PATH_TESTE,
        responseMode: "lastNode",
        options: {},
      },
    },
    {
      name: "Emitir",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [220, 0],
      parameters: {
        jsCode: "return [{ json: { modo: $json.query.modo || 'trial' } }];",
      },
    },
    {
      name: "Vazio?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [440, 0],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
          conditions: [
            {
              id: "v1",
              leftValue: "={{ $json.modo }}",
              rightValue: "vazio",
              operator: { type: "string", operation: "equals" },
            },
          ],
          combinator: "and",
        },
        options: {},
      },
    },
    {
      name: "Emitir Vazio",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [660, -96],
      parameters: { jsCode: "return [];" },
    },
    {
      name: "Pago?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [660, 96],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
          conditions: [
            {
              id: "p1",
              leftValue: "={{ $json.modo }}",
              rightValue: "pago",
              operator: { type: "string", operation: "equals" },
            },
          ],
          combinator: "and",
        },
        options: {},
      },
    },
    {
      name: "Marcar Pago",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [880, 0],
      parameters: { jsCode: "return [{ json: { flag: true } }];" },
    },
    {
      name: "Repasar",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [880, 192],
      parameters: {
        jsCode: "return [{ json: { modo: $json.modo, flag: false } }];",
      },
    },
    {
      name: "Leitor",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1100, 96],
      parameters: {
        jsCode:
          "let flagExecutado = null, erro = null;\ntry { flagExecutado = $('Marcar Pago').isExecuted; } catch (e) { erro = String(e && e.message || e); }\nreturn [{ json: { flagExecutado, erro } }];",
      },
    },
  ],
  connections: {
    "Webhook Teste": { main: [[{ node: "Emitir", type: "main", index: 0 }]] },
    Emitir: { main: [[{ node: "Vazio?", type: "main", index: 0 }]] },
    "Vazio?": {
      main: [
        [{ node: "Emitir Vazio", type: "main", index: 0 }],
        [{ node: "Pago?", type: "main", index: 0 }],
      ],
    },
    "Pago?": {
      main: [
        [{ node: "Marcar Pago", type: "main", index: 0 }],
        [{ node: "Repasar", type: "main", index: 0 }],
      ],
    },
    "Marcar Pago": { main: [[{ node: "Leitor", type: "main", index: 0 }]] },
    Repasar: { main: [[{ node: "Leitor", type: "main", index: 0 }]] },
  },
};

async function api(method, url, body) {
  const r = await fetch(BASE + url, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let json = null;
  try { json = JSON.parse(txt); } catch {}
  return { status: r.status, json, txt };
}

// ── criar + ativar ────────────────────────────────────────────────────────
const criado = await api("POST", "/api/v1/workflows", wf);
if (criado.status >= 300) {
  console.error("Falha ao criar workflow:", criado.status, criado.txt.slice(0, 400));
  process.exit(1);
}
const id = criado.json.id;
console.log("workflow criado:", id, "| path:", PATH_TESTE);

const ativo = await api("POST", `/api/v1/workflows/${id}/activate`);
console.log("activate:", ativo.status);

// ── os três casos ─────────────────────────────────────────────────────────
for (const modo of ["pago", "trial", "vazio"]) {
  const r = await fetch(`${BASE}/webhook/${PATH_TESTE}?modo=${modo}`);
  const body = await r.text();
  console.log(`modo=${modo.padEnd(5)} → HTTP ${r.status} | body: ${body.slice(0, 200)}`);
}

// ── desativar + deletar (sempre) ──────────────────────────────────────────
const desativado = await api("POST", `/api/v1/workflows/${id}/deactivate`);
console.log("deactivate:", desativado.status);
const apagado = await api("DELETE", `/api/v1/workflows/${id}`);
console.log("delete:", apagado.status, apagado.status < 300 ? "OK — lixo zz-* removido" : "FALHOU — apagar manualmente");

// Log para auditoria
const logPath = "tmp-backup-workflows-deletados/probe-runtime-log.json";
const log = existsSync(logPath) ? JSON.parse(readFileSync(logPath, "utf8")) : [];
log.push({ ts: new Date().toISOString(), workflowId: id, path: PATH_TESTE });
writeFileSync(logPath, JSON.stringify(log, null, 2));
console.log("log:", logPath);
