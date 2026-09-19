#!/usr/bin/env node
/**
 * Publica src/n8n-patches/processar-resposta-ia.js no node "Processar Resposta
 * IA" do Atendimento.
 *
 * Motivo: `mensagemPaciente` vinha de $('Parser da Mensagem'), entao o que ia
 * para conversas.mensagem era o rotulo cru ("[imagem]", "[audio]"), nunca a
 * extracao da visao, a transcricao ou o texto de limitacao de tier. O painel
 * mostrava o chip de midia sem o conteudo. Passa a ler a ultima mensagem que
 * Montar Prompt enviou a IA, que e exatamente o que o sistema entendeu.
 *
 *   N8N_API_KEY=... node src/n8n-patches/deploy-processar-resposta-ia.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "../..");
const base = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
const key = process.env.N8N_API_KEY;
if (!key) throw new Error("N8N_API_KEY ausente");

async function api(method, path, body) {
  const r = await fetch(base + path, {
    method,
    headers: { "X-N8N-API-KEY": key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${t.slice(0, 400)}`);
  return t ? JSON.parse(t) : {};
}

const lista = await api("GET", "/api/v1/workflows?limit=250");
if (!(lista.data || []).length) throw new Error("token suspeito: 0 workflows");

const id = "cxn5FxUNMJmlJ1WJ";
const wf = await api("GET", `/api/v1/workflows/${id}`);
const nodesAntes = wf.nodes.length;

const dir = join(raiz, "tmp-backup-workflows-deletados");
mkdirSync(dir, { recursive: true });
const backup = join(dir, `${id}-pre-processar-resposta-ia-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(backup, JSON.stringify(wf, null, 2));
console.log(`backup: ${backup}`);

const alvo = wf.nodes.find((n) => n.name === "Processar Resposta IA");
if (!alvo) throw new Error("node ausente: Processar Resposta IA");

// Entrada unica garante que $('Montar Prompt') sempre executou antes daqui.
const entradas = Object.entries(wf.connections)
  .filter(([, v]) => (v.main || []).some((br) => br.some((x) => x.node === "Processar Resposta IA")))
  .map(([k]) => k);
if (entradas.length !== 1 || entradas[0] !== "Chamar Claude") {
  throw new Error(`entradas inesperadas em Processar Resposta IA: ${JSON.stringify(entradas)}`);
}
const mpSaida = (wf.connections["Montar Prompt"]?.main || []).flat().map((x) => x.node);
if (!mpSaida.includes("Chamar Claude")) throw new Error("Montar Prompt nao alimenta Chamar Claude");

const novo = readFileSync(join(raiz, "src/n8n-patches/processar-resposta-ia.js"), "utf8");
for (const c of ["partes", "precisa_escalar", "agendamento", "is_agendamento", "supabase_insert", "mensagem_media"]) {
  if (!novo.includes(c)) throw new Error(`contrato quebrado: ${c}`);
}
if (novo.includes("const mensagemPaciente = $('Parser da Mensagem')")) {
  throw new Error("arquivo do repo ainda tem a linha antiga");
}
alvo.parameters.jsCode = novo;

const settings = { executionOrder: wf.settings?.executionOrder || "v1" };
if (wf.settings?.errorWorkflow) settings.errorWorkflow = wf.settings.errorWorkflow;
await api("PUT", `/api/v1/workflows/${id}`, { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings });
if (wf.active) await api("POST", `/api/v1/workflows/${id}/activate`);

const depois = await api("GET", `/api/v1/workflows/${id}`);
const vivo = depois.nodes.find((n) => n.name === "Processar Resposta IA").parameters.jsCode;
if (vivo !== novo) throw new Error("codigo no ar difere do repo");
if (depois.nodes.length !== nodesAntes) throw new Error("contagem de nodes mudou");
if (depois.versionId !== depois.activeVersionId) throw new Error("versionId != activeVersionId");

console.log(`nodes: ${depois.nodes.length} (antes ${nodesAntes}) | active: ${depois.active}`);
console.log(`versionId=${depois.versionId}`);
console.log(`activeVersionId=${depois.activeVersionId}`);
console.log("OK");
