#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const raiz = resolve(import.meta.dirname, "../..");
const base = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
const key = process.env.N8N_API_KEY;
if (!key) throw new Error("N8N_API_KEY ausente");
async function api(method, path, body) {
  const r = await fetch(base + path, { method, headers: { "X-N8N-API-KEY": key, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${t.slice(0, 500)}`);
  return t ? JSON.parse(t) : {};
}
const id = "cxn5FxUNMJmlJ1WJ";
const wf = await api("GET", `/api/v1/workflows/${id}`);
const dir = join(raiz, "tmp-backup-workflows-deletados");
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = join(dir, `${id}-pre-image-vision-${stamp}.json`);
writeFileSync(backup, JSON.stringify(wf, null, 2));
console.log(`backup: ${backup}`);
const node = (name) => wf.nodes.find((n) => n.name === name) || (() => { throw new Error(`node ausente: ${name}`); })();
const entradaMidia = node("IF - Entrada é Mídia?");
entradaMidia.parameters.conditions = {
  options: { caseSensitive: false, typeValidation: "loose", version: 2 },
  conditions: [
    { id: "entrada-audio", leftValue: "={{ String($json.body?.message?.mimetype || $json.body?.mimetype || '').toLowerCase() }}", rightValue: "audio", operator: { type: "string", operation: "contains" } },
    { id: "entrada-imagem", leftValue: "={{ String($json.body?.message?.mimetype || $json.body?.mimetype || '').toLowerCase() }}", rightValue: "image", operator: { type: "string", operation: "contains" } },
  ],
  combinator: "or",
};
const add = (name, type, typeVersion, position, parameters, extra = {}) => {
  const existing = wf.nodes.find((n) => n.name === name);
  const n = { id: existing?.id || randomUUID(), name, type, typeVersion, position, parameters, ...extra };
  if (existing) Object.assign(existing, n); else wf.nodes.push(n);
};
const openAi = { openAiApi: { id: "diCuDBCdTkK5zE1p", name: "OpenAI account" } };
add("IF - É Imagem?", "n8n-nodes-base.if", 2.2, [-40, 1180], {
  conditions: { options: { caseSensitive: true, typeValidation: "loose", version: 2 }, conditions: [{ id: "imagem", leftValue: "={{ $('Parser da Mensagem').first().json.midia_tipo }}", rightValue: "imagem", operator: { type: "string", operation: "equals" } }], combinator: "and" }, options: {},
});
add("IF - Imagem Completo?", "n8n-nodes-base.if", 2.2, [180, 1180], {
  conditions: { options: { caseSensitive: true, typeValidation: "loose", version: 2 }, conditions: [{ id: "tier-completo-imagem", leftValue: "={{ $('Buscar Clínica').first().json.tier || 'essencial' }}", rightValue: "completo", operator: { type: "string", operation: "equals" } }], combinator: "and" }, options: {},
});
add("Ler Imagem com Visão", "n8n-nodes-base.httpRequest", 4.2, [440, 1100], {
  method: "POST", url: "https://api.openai.com/v1/responses", authentication: "predefinedCredentialType", nodeCredentialType: "openAiApi", sendBody: true, specifyBody: "json", jsonBody: "={{ JSON.stringify({ model: 'gpt-4o-mini', input: [{ role: 'user', content: [{ type: 'input_text', text: 'Você é um extrator documental. Identifique se a foto é pedido médico, receita ou carteirinha. Extraia SOMENTE texto e campos claramente visíveis. Não invente, não complete lacunas, não faça diagnóstico, não interprete exames e não recomende tratamento. Se estiver ilegível, cortada, escura ou houver dúvida relevante, responda exatamente: FOTO_ILEGIVEL_NOVA_FOTO. Responda em português, de forma curta.' }, { type: 'input_image', image_url: $('Parser da Mensagem').first().json.mensagem_media.URL, detail: 'high' }] }] }) }}", options: {},
  }, { credentials: openAi, onError: "continueRegularOutput" });
add("Aplicar Resultado da Imagem", "n8n-nodes-base.code", 2, [700, 1100], { jsCode: readFileSync(join(raiz, "src/n8n-patches/imagem-aplicar-resultado.js"), "utf8") });
add("Aplicar Limitação de Imagem", "n8n-nodes-base.code", 2, [440, 1300], { jsCode: readFileSync(join(raiz, "src/n8n-patches/imagem-limitacao-essencial.js"), "utf8") });
wf.connections["IF - É Áudio?"].main[1] = [{ node: "IF - É Imagem?", type: "main", index: 0 }];
wf.connections["IF - É Imagem?"] = { main: [[{ node: "IF - Imagem Completo?", type: "main", index: 0 }], [{ node: "Montar Prompt", type: "main", index: 0 }]] };
wf.connections["IF - Imagem Completo?"] = { main: [[{ node: "Ler Imagem com Visão", type: "main", index: 0 }], [{ node: "Aplicar Limitação de Imagem", type: "main", index: 0 }]] };
wf.connections["Ler Imagem com Visão"] = { main: [[{ node: "Aplicar Resultado da Imagem", type: "main", index: 0 }]] };
wf.connections["Aplicar Resultado da Imagem"] = { main: [[{ node: "Montar Prompt", type: "main", index: 0 }]] };
wf.connections["Aplicar Limitação de Imagem"] = { main: [[{ node: "Montar Prompt", type: "main", index: 0 }]] };
const settings = { executionOrder: wf.settings?.executionOrder || "v1" };
if (wf.settings?.errorWorkflow) settings.errorWorkflow = wf.settings.errorWorkflow;
await api("PUT", `/api/v1/workflows/${id}`, { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings });
if (wf.active) await api("POST", `/api/v1/workflows/${id}/activate`);
const after = await api("GET", `/api/v1/workflows/${id}`);
if (after.versionId !== after.activeVersionId) throw new Error("versionId != activeVersionId");
console.log(`versionId=${after.versionId} activeVersionId=${after.activeVersionId}`);
