#!/usr/bin/env node
/**
 * Conserta o elo que descartava o resultado de midia no Atendimento.
 *
 * "Montar Prompt" lia a mensagem sempre de $('Parser da Mensagem'), ignorando o
 * item que chegava. Como os tres nodes de midia (transcricao de audio, leitura
 * de imagem e limitacao de tier) reescrevem `mensagem` na propria saida, nada
 * disso chegava na IA: audio virava "[audio]" e imagem virava "[imagem]".
 * Provado nas execucoes 95395 (audio), 95415 (imagem) e 95418 (tier).
 *
 * Faz DUAS alteracoes cirurgicas, nunca substituicao de node inteiro:
 *  1. uma linha em "Montar Prompt";
 *  2. o jsCode de "Aplicar Resultado da Imagem", vindo do arquivo do repo
 *     (trata o sentinela FOTO_ILEGIVEL_NOVA_FOTO, visto na execucao 95413).
 *
 *   N8N_API_KEY=... node src/n8n-patches/deploy-fix-mensagem-atual.mjs
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

// Armadilha 2 do AGENTS.md: token invalido pode devolver 200 com data vazio.
const lista = await api("GET", "/api/v1/workflows?limit=250");
if (!(lista.data || []).length) throw new Error("token suspeito: 0 workflows retornados");

const id = "cxn5FxUNMJmlJ1WJ";
const wf = await api("GET", `/api/v1/workflows/${id}`);
const nodesAntes = wf.nodes.length;

const dir = join(raiz, "tmp-backup-workflows-deletados");
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = join(dir, `${id}-pre-fix-mensagem-atual-${stamp}.json`);
writeFileSync(backup, JSON.stringify(wf, null, 2));
console.log(`backup: ${backup}`);

const node = (nome) => {
  const n = wf.nodes.find((x) => x.name === nome);
  if (!n) throw new Error(`node ausente: ${nome}`);
  return n;
};

// ── 1. Montar Prompt: ja corrigido por outra mao em 2026-09-11 ─────────────
// Outro agente aplicou a mesma correcao com redacao diferente enquanto este
// script era escrito. Nao sobrescrever: so conferir que o conserto esta la.
const mp = node("Montar Prompt");
const jaCorrigido =
  /[$]json\s*[?]?[.]\s*mensagem/.test(mp.parameters.jsCode) &&
  mp.parameters.jsCode.includes("$('Parser da Mensagem')");
if (!jaCorrigido) {
  throw new Error(
    "Montar Prompt nao le $json.mensagem: o elo que descarta midia voltou. " +
      "Rever antes de seguir.",
  );
}
console.log("Montar Prompt: correcao de terceiro presente, preservada");

// ── 2. Aplicar Resultado da Imagem ──────────────────────────────────────────
const ari = node("Aplicar Resultado da Imagem");
const novoCodigo = readFileSync(join(raiz, "src/n8n-patches/imagem-aplicar-resultado.js"), "utf8");
for (const campo of ["mensagem", "visao_imagem_ok", "imagem_fallback"]) {
  if (!novoCodigo.includes(campo)) throw new Error(`contrato quebrado: ${campo} sumiu`);
}
ari.parameters.jsCode = novoCodigo;

// ── Escrita ─────────────────────────────────────────────────────────────────
if (wf.nodes.length !== nodesAntes) throw new Error("contagem de nodes mudou");
// Armadilha 6 do AGENTS.md: PUT rejeita chaves de settings fora do schema.
const settings = { executionOrder: wf.settings?.executionOrder || "v1" };
if (wf.settings?.errorWorkflow) settings.errorWorkflow = wf.settings.errorWorkflow;

await api("PUT", `/api/v1/workflows/${id}`, {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings,
});
// Armadilha 1: sem publicar, o teste roda a versao antiga em silencio.
if (wf.active) await api("POST", `/api/v1/workflows/${id}/activate`);

const depois = await api("GET", `/api/v1/workflows/${id}`);
const mpDepois = depois.nodes.find((n) => n.name === "Montar Prompt").parameters.jsCode;
const ariDepois = depois.nodes.find((n) => n.name === "Aplicar Resultado da Imagem").parameters.jsCode;
if (!/[$]json\s*[?]?[.]\s*mensagem/.test(mpDepois)) throw new Error("Montar Prompt: correcao sumiu na escrita");
if (ariDepois !== novoCodigo) throw new Error("Aplicar Resultado da Imagem: codigo no ar difere do repo");
if (depois.versionId !== depois.activeVersionId) throw new Error("versionId != activeVersionId");
if (depois.nodes.length !== nodesAntes) throw new Error("contagem de nodes mudou apos escrita");

console.log(`nodes: ${depois.nodes.length} (antes ${nodesAntes}) | active: ${depois.active}`);
console.log(`versionId=${depois.versionId}`);
console.log(`activeVersionId=${depois.activeVersionId}`);
console.log("OK");
