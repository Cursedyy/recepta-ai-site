#!/usr/bin/env node
// patch-billing-cron-f0b.mjs
// F0b: conserta o defeito topológico do cron de cobrança (cf1An4BYT9A0LuHi).
//
// 1. Reparenta "Expirar Clínicas" do output compartilhado de "Config Fixa"
//    para uma SAÍDA NOVA dedicada — os dois ramos deixam de abortar juntos.
// 2. retryOnFail (3 tentativas, 5s) em todos os nodes HTTP do RAMO DO CRON
//    (Schedule → Config Fixa → avisos + expiração). Não toca no ramo do
//    webhook Stripe: retries lá só entram DEPOIS da idempotência (F4).
//
// Segue o padrão de segurança do deploy-node-code.mjs: backup, PUT, publish,
// e prova (versionId == activeVersionId + diff do que mudou).

const N8N_KEY = process.env.N8N_API_KEY;
const N8N_URL = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
const WF_ID = "cf1An4BYT9A0LuHi";

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

const r0 = await api("GET", `/api/v1/workflows/${WF_ID}`);
if (!r0.ok) {
  console.error(`GET falhou (${r0.status}): ${r0.texto.slice(0, 300)}`);
  process.exit(1);
}
const wf = JSON.parse(r0.texto);
console.log(`Workflow: ${wf.name}  active=${wf.active} versionId=${wf.versionId}`);

// ── backup ────────────────────────────────────────────────────────────────
const { writeFileSync, mkdirSync } = await import("fs");
mkdirSync("tmp-backup-workflows-deletados", { recursive: true });
const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `tmp-backup-workflows-deletados/${WF_ID}-pre-f0b-${carimbo}.json`;
writeFileSync(backupPath, JSON.stringify(wf, null, 2));
console.log(`backup: ${backupPath}`);

// ── 1. isolar o ramo de expiração: saída dedicada no Config Fixa ──────────
// addOutput em Set não é suportado de forma estável via API; em vez disso,
// apontamos "Expirar Clínicas" para o node "Schedule - Diário 9h"? Não —
// schedule não repassa $json do Config. Solução robusta: novo node Set
// "Config Expiração" com as mesmas 3 variáveis, alimentado pelo Schedule
// junto com o Config Fixa (fan-out do START é permitido e os dois Sets são
// independentes), e o ramo de expiração lê dele.
const schedule = wf.nodes.find((n) => n.name === "Schedule - Diário 9h");
if (!schedule) {
  console.error("Node Schedule - Diário 9h não encontrado.");
  process.exit(1);
}
if (wf.nodes.some((n) => n.name === "Config Expiração")) {
  console.error("Patch já aplicado (Config Expiração existe). Nada a fazer.");
  process.exit(0);
}

// fan-out do Schedule: dois outputs
wf.connections["Schedule - Diário 9h"] = {
  main: [
    [
      { node: "Config Fixa", type: "main", index: 0 },
      { node: "Config Expiração", type: "main", index: 0 },
    ],
  ],
};

// novo node Set espelhando Config Fixa
const cfgFixa = wf.nodes.find((n) => n.name === "Config Fixa");
const maxPos = Math.max(...wf.nodes.map((n) => n.position?.[0] ?? 0));
wf.nodes.push({
  parameters: JSON.parse(JSON.stringify(cfgFixa.parameters)),
  id: `cfg-exp-${Date.now().toString(36)}`,
  name: "Config Expiração",
  type: "n8n-nodes-base.set",
  typeVersion: cfgFixa.typeVersion,
  position: [maxPos + 220, cfgFixa.position[1] + 220],
});

// Expirar Clínicas passa a ler do Config Expiração
wf.connections["Config Expiração"] = {
  main: [[{ node: "Expirar Clínicas", type: "main", index: 0 }]],
};
const antiga = wf.connections["Config Fixa"].main[0];
wf.connections["Config Fixa"].main[0] = antiga.filter(
  (c) => c.node !== "Expirar Clínicas",
);

// ── 2. retry no ramo do cron (nunca no webhook) ───────────────────────────
const cronChain = [
  "Buscar Avisos Pendentes",
  "Filtrar Aviso Último Dia",
  "Enviar Aviso Trial",
  "Marcar Aviso Enviado",
  "Expirar Clínicas",
  "Config Fixa",
  "Config Expiração",
];
const alterados = [];
for (const nome of cronChain) {
  const n = wf.nodes.find((x) => x.name === nome);
  if (!n) {
    console.error(`Node ${nome} sumiu do workflow? Abortando.`);
    process.exit(1);
  }
  if (!n.retryOnFail) {
    n.retryOnFail = true;
    n.maxTries = 3;
    n.waitBetweenTries = 5000;
    alterados.push(nome);
  }
}
console.log(`retryOnFail ligado em: ${alterados.join(", ")}`);

// ── PUT + publish + prova ────────────────────────────────────────────────
async function put(settings) {
  return api("PUT", `/api/v1/workflows/${WF_ID}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings,
  });
}
let r = await put(wf.settings || {});
if (!r.ok) {
  console.warn(`PUT settings completas recusado (${r.status}), tentando mínimas.`);
  const minimas = { executionOrder: wf.settings?.executionOrder || "v1" };
  if (wf.settings?.errorWorkflow) minimas.errorWorkflow = wf.settings.errorWorkflow;
  r = await put(minimas);
  if (!r.ok) {
    console.error(`PUT falhou (${r.status}): ${r.texto.slice(0, 400)}`);
    process.exit(1);
  }
}
if (wf.active) {
  const act = await api("POST", `/api/v1/workflows/${WF_ID}/activate`);
  if (!act.ok) {
    console.error(`Publish falhou (${act.status}): ${act.texto.slice(0, 400)}`);
    process.exit(1);
  }
}

const depois = JSON.parse((await api("GET", `/api/v1/workflows/${WF_ID}`)).texto);
let falhou = false;
if (depois.versionId !== depois.activeVersionId) {
  console.error("ERRO: versionId != activeVersionId.");
  falhou = true;
}
const connFixa = JSON.stringify(depois.connections["Config Fixa"]);
if (connFixa.includes("Expirar Clínicas")) {
  console.error("ERRO: Config Fixa ainda alimenta Expirar Clínicas.");
  falhou = true;
}
const cfgExp = depois.nodes.find((n) => n.name === "Config Expiração");
if (!cfgExp) {
  console.error("ERRO: Config Expiração não está no ar.");
  falhou = true;
}
const expira = depois.nodes.find((n) => n.name === "Expirar Clínicas");
if (!expira?.retryOnFail) {
  console.error("ERRO: Expirar Clínicas sem retryOnFail no ar.");
  falhou = true;
}
console.log("");
console.log(`Publicado. versionId=${depois.versionId} activeVersionId=${depois.activeVersionId}`);
console.log(falhou ? "FALHOU na prova." : "PROVA OK: ramos isolados + retry no ar.");
process.exit(falhou ? 1 : 0);
