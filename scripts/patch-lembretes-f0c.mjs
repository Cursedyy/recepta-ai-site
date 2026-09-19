#!/usr/bin/env node
// patch-lembretes-f0c.mjs
// F0c: lembretes somente para clínica ativa. O !inner é obrigatório para o
// filtro da tabela relacionada eliminar o agendamento da resposta.

const N8N_KEY = process.env.N8N_API_KEY;
const N8N_URL = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
const WF_ID = "sJzrlremPGkjZDxO";

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

const { writeFileSync, mkdirSync } = await import("fs");
mkdirSync("tmp-backup-workflows-deletados", { recursive: true });
const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(
  `tmp-backup-workflows-deletados/${WF_ID}-pre-f0c-${carimbo}.json`,
  JSON.stringify(wf, null, 2),
);
console.log("backup salvo.");

const alvoBuscas = {
  "Buscar Lembretes 24h": "lembrete_24h_em",
  "Buscar Lembretes 3h": "lembrete_3h_em",
};

let mudou = false;
for (const [nome, colunaMarcacao] of Object.entries(alvoBuscas)) {
  const n = wf.nodes.find((x) => x.name === nome);
  if (!n) {
    console.error(`Node ${nome} não encontrado.`);
    process.exit(1);
  }
  const horas = nome.includes("24h") ? 24 : 3;
  const urlEsperada = `={{ $json.supabase_url + '/rest/v1/agendamentos?select=id,paciente_telefone,data_hora,clinicas!inner(uazapi_token,uazapi_server,status)&status=eq.agendado&${colunaMarcacao}=is.null&data_hora=gte.' + encodeURIComponent(new Date().toISOString()) + '&data_hora=lte.' + encodeURIComponent(new Date(Date.now() + ${horas}*60*60*1000).toISOString()) + '&clinicas.status=eq.ativo' }}`;
  if (n.parameters.url !== urlEsperada) {
    n.parameters.url = urlEsperada;
    mudou = true;
    console.log(`${nome}: embed inner e filtro ativo aplicados.`);
  } else {
    console.log(`${nome}: URL canônica já presente.`);
  }
}

for (const nome of ["Montar Mensagem 24h", "Montar Mensagem 3h"]) {
  const codigo = wf.nodes.find((x) => x.name === nome)?.parameters?.jsCode || "";
  if (!/a\.clinicas\s*\|\|/.test(codigo)) {
    console.error(`Contrato inesperado em ${nome}: alias clinicas não é consumido.`);
    process.exit(1);
  }
}

if (!mudou) {
  console.log("Nada a mudar — patch já aplicado.");
  process.exit(0);
}

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
let falhou = depois.versionId !== depois.activeVersionId;
if (falhou) console.error("ERRO: versionId != activeVersionId.");
for (const nome of Object.keys(alvoBuscas)) {
  const noAr = depois.nodes.find((x) => x.name === nome)?.parameters.url || "";
  if (!noAr.includes("clinicas!inner(uazapi_token,uazapi_server,status)") ||
      !noAr.includes("'&clinicas.status=eq.ativo' }}")) {
    console.error(`ERRO: ${nome} no ar sem embed inner/filtro dentro da expressão.`);
    falhou = true;
  } else {
    console.log(`ok: ${nome} com embed inner e filtro ativo no ar.`);
  }
}
const enviar = ["Enviar Lembrete 24h", "Enviar Lembrete 3h"];
for (const nome of enviar) {
  const n = depois.nodes.find((x) => x.name === nome);
  if (n?.retryOnFail) {
    console.error(`ERRO: ${nome} ganhou retry indevidamente.`);
    falhou = true;
  }
}
console.log(`Publicado. versionId=${depois.versionId} activeVersionId=${depois.activeVersionId}`);
console.log(falhou ? "FALHOU na prova." : "PROVA OK.");
process.exit(falhou ? 1 : 0);
