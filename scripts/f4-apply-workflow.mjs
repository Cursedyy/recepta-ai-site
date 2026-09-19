#!/usr/bin/env node
// f4-apply-workflow.mjs — F4: gate de idempotência + respostas terminais + retries
// no ramo webhook do workflow "Verificação de Trial" (cf1An4BYT9A0LuHi).
//
// Uso:
//   node scripts/f4-apply-workflow.mjs --mode qa    → cria cópia descartável zz-f4-qa-*
//   node scripts/f4-apply-workflow.mjs --mode prod  → transforma o workflow de produção
//
// Contratos medidos (não supostos):
//   POST /rest/v1/stripe_eventos com Prefer: return=representation,resolution=ignore-duplicates
//     1ª entrega → 201 + [{row}]; duplicado → 201 + [] (verificado no Supabase, não 409).
//   => Registrar Evento usa alwaysOutputData: duplicado vira 1 item vazio,
//      roteado pelo IF "Novo Evento?" para o branch de duplicado.
//
// DUPLICADO NÃO É SEMPRE "IGNORAR": se a 1ª entrega falhou no meio do ramo,
// a linha fica com processado_em null — o reenvio do Stripe PRECISA
// reprocessar (senão o evento se perde para sempre com um 200). O ramo de
// duplicado consulta a linha (GET) e só responde 200/duplicate quando
// processado_em está preenchido; linha aberta volta para o Classificar.
//   lastNode com terminais de zero itens → HTTP 500 (probe-n8n-runtime) —
//   por isso TODO ramo termina em respondToWebhook explícito.
//
// Fechamento de auditoria: cada ramo terminal faz PATCH condicional
// (?event_id=eq.X&processado_em=is.null) em stripe_eventos antes de responder.
//
// Modo QA: remove o ramo cron (Schedule/avisos/expiração — nunca pode disparar),
// substitui "Comparar Assinatura" por versão controlada por header x-qa-invalid
// (não precisamos do segredo HMAC; o código PÓS-gate é idêntico ao de produção).
// Erros jogados NÃO são fail-closed nesta instância (200 vazio medido) — o
// fail-closed real vem do onError=continueErrorOutput → Respond 500 explícito.

import { writeFileSync, mkdirSync } from "fs";
import { randomBytes } from "crypto";

const N8N_KEY = process.env.N8N_API_KEY;
const N8N_URL = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
const SB_URL = process.env.SUPABASE_URL || "https://vfyubktlmqytkcewicse.supabase.co";

if (!N8N_KEY) {
  console.error("Falta N8N_API_KEY.");
  process.exit(1);
}

const args = process.argv.slice(2);
const mode = args.includes("--mode") ? args[args.indexOf("--mode") + 1] : null;
if (!mode || !["qa", "prod"].includes(mode)) {
  console.error("Uso: f4-apply-workflow.mjs --mode qa|prod");
  process.exit(1);
}
const SOURCE_ID = "cf1An4BYT9A0LuHi";

const headers = { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" };
async function api(method, path, body) {
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${N8N_URL}${path}`, opts);
  return { ok: res.ok, status: res.status, text: await res.text() };
}

const src = await api("GET", `/api/v1/workflows/${SOURCE_ID}`);
if (!src.ok) {
  console.error(`GET falhou (${src.status}).`);
  process.exit(1);
}
const wf = JSON.parse(src.text);
console.log(`Origem: ${wf.name} | active=${wf.active} versionId=${wf.versionId}`);

// backup completo antes de qualquer coisa
mkdirSync("tmp-backup-workflows-deletados", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `tmp-backup-workflows-deletados/${SOURCE_ID}-f4-${mode}-${stamp}.json`;
writeFileSync(backupPath, JSON.stringify(wf, null, 2));
console.log(`backup: ${backupPath}`);

const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
const OBRIGATORIOS = [
  "Webhook Stripe Pagamento", "Config Stripe Webhook", "Montar Payload Assinado",
  "Calcular HMAC Stripe", "Comparar Assinatura", "Assinatura Válida?",
  "Extrair Evento Checkout", "Supabase Confirmar Pagamento",
  "Extrair Fim de Pagamento", "Supabase Expirar Por Pagamento",
  "Extrair Reativar", "Supabase Reativar Clínica",
];
for (const nome of OBRIGATORIOS) {
  if (!byName[nome]) { console.error(`Node obrigatório ausente: "${nome}". Abortando.`); process.exit(1); }
}
if (byName["Registrar Evento"]) {
  console.error('Node "Registrar Evento" já existe — F4 aparentemente já aplicado. Abortando.');
  process.exit(1);
}

// credencial supabaseApi copiada de um node que já funciona (padrão 4 chaves)
const credSupabase = byName["Supabase Confirmar Pagamento"].credentials?.supabaseApi;
if (!credSupabase) { console.error("Supabase Confirmar Pagamento sem credencial supabaseApi."); process.exit(1); }

const RETRY = { retryOnFail: true, maxTries: 3, waitBetweenTries: 2000 };
let x = 1240;
const pos = (dy = 0) => [x, 540 + dy]; x += 200;

const novo = [];
const addNode = (node) => { novo.push(node); return node.name; };

// ── 1. Gate: Registrar Evento (POST stripe_eventos, fail-closed em erro) ──
addNode({
  id: "f4-registrar-evento",
  name: "Registrar Evento",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: pos(0),
  alwaysOutputData: true,
  ...RETRY,
  credentials: { supabaseApi: credSupabase },
  parameters: {
    method: "POST",
    url: `={{ $('Config Stripe Webhook').item.json.supabase_url + '/rest/v1/stripe_eventos' }}`,
    authentication: "predefinedCredentialType",
    nodeCredentialType: "supabaseApi",
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: "Prefer", value: "return=representation,resolution=ignore-duplicates" },
    ] },
    sendBody: true,
    specifyBody: "json",
    jsonBody: "={{ JSON.stringify({ event_id: $json.event.id, tipo: $json.event.type }) }}",
    options: {},
  },
});

// ── 2. IF Novo Evento? (item vazio = duplicado) ──
addNode({
  id: "f4-novo-evento",
  name: "Novo Evento?",
  type: "n8n-nodes-base.if",
  typeVersion: 2,
  position: pos(-120),
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
      conditions: [{ id: "f4g1", leftValue: "={{ $json.event_id !== undefined }}", rightValue: 0,
        operator: { type: "boolean", operation: "true", singleValue: true } }],
      combinator: "and",
    },
    options: {},
  },
});

// ── 3. Classificar Evento — espelha EXATAMENTE os filtros dos extractors ──
addNode({
  id: "f4-classificar",
  name: "Classificar Evento",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: pos(-240),
  parameters: { jsCode: `// O item que chega aqui é a resposta HTTP do Registrar Evento (a linha) —
// sem o event. O evento vem do node pinado 'Assinatura Válida?'.
// Saída reanexa o event p/ os extractors, que leem $json.event.
let event;
try { event = $('Assinatura Válida?').first().json.event; } catch (e) { event = null; }
if (!event) return [{ json: { rota: 'ignorado', motivo: 'sem event' } }];
const obj = (event.data && event.data.object) || {};
const customerOk = typeof obj.customer === 'string';

if (event.type === 'checkout.session.completed') return [{ json: { event, rota: 'checkout' } }];

if (event.type === 'customer.subscription.deleted' && customerOk) {
  return [{ json: { event, rota: 'fim' } }];
}

if (event.type === 'customer.subscription.updated' && customerOk) {
  if (['unpaid', 'past_due', 'canceled'].includes(obj.status)) return [{ json: { event, rota: 'fim' } }];
  if (obj.status === 'active') return [{ json: { event, rota: 'reativar' } }];
}

return [{ json: { rota: 'ignorado', tipo: event.type } }];
` },
});

// ── 4. Switch de rota com fallback explícito ──
addNode({
  id: "f4-switch-rota",
  name: "Rotear Evento",
  type: "n8n-nodes-base.switch",
  typeVersion: 3.2,
  position: pos(-360),
  parameters: {
    rules: { values: ["checkout", "fim", "reativar"].map((rota, i) => ({
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [{ id: `f4r${i}`, leftValue: "={{ $json.rota }}", rightValue: rota,
          operator: { type: "string", operation: "equals" } }],
        combinator: "and",
      },
      renameOutput: true,
      outputKey: rota,
    })) },
    options: { fallbackOutput: "extra", renameFallbackOutput: "ignorado" },
  },
});

// ── 5. Responds terminais + fechamento de auditoria por ramo ──
const fechar = (nome, resultado, dy) => addNode({
  id: `f4-fechar-${resultado || "duplicado"}`,
  name: nome,
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: pos(dy),
  ...RETRY,
  credentials: { supabaseApi: credSupabase },
  parameters: {
    method: "PATCH",
    url: `={{ $('Config Stripe Webhook').item.json.supabase_url + '/rest/v1/stripe_eventos?event_id=eq.' + encodeURIComponent($('Assinatura Válida?').first().json.event.id) + '&processado_em=is.null' }}`,
    authentication: "predefinedCredentialType",
    nodeCredentialType: "supabaseApi",
    sendHeaders: true,
    headerParameters: { parameters: [{ name: "Prefer", value: "return=minimal" }] },
    sendBody: true,
    specifyBody: "json",
    jsonBody: `={{ JSON.stringify({ processado_em: new Date().toISOString(), resultado: '${resultado}' }) }}`,
    options: {},
  },
});
const respond = (nome, corpo, dy, code) => addNode({
  id: `f4-respond-${nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  name: nome,
  type: "n8n-nodes-base.respondToWebhook",
  typeVersion: 1.1,
  position: pos(dy),
  parameters: {
    respondWith: "json",
    responseBody: `={{ JSON.stringify(${corpo}) }}`,
    options: code ? { responseCode: code } : {},
  },
});

// Ramo duplicado: consultar estado da linha e decidir reprocessar.
addNode({
  id: "f4-consultar-registro",
  name: "Consultar Registro",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: pos(240),
  ...RETRY,
  credentials: { supabaseApi: credSupabase },
  parameters: {
    method: "GET",
    url: `={{ $('Config Stripe Webhook').item.json.supabase_url + '/rest/v1/stripe_eventos?event_id=eq.' + encodeURIComponent($('Assinatura Válida?').first().json.event.id) + '&select=event_id,processado_em' }}`,
    authentication: "predefinedCredentialType",
    nodeCredentialType: "supabaseApi",
    options: {},
  },
  alwaysOutputData: true,
});
addNode({
  id: "f4-registro-aberto",
  name: "Registro Aberto?",
  type: "n8n-nodes-base.if",
  typeVersion: 2,
  position: pos(360),
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
      conditions: [{ id: "f4g2",
        leftValue: "={{ $json.processado_em === null && $json.event_id !== undefined }}",
        rightValue: 0, operator: { type: "boolean", operation: "true", singleValue: true } }],
      combinator: "and",
    },
    options: {},
  },
});
addNode({
  id: "f4-recompor-evento",
  name: "Recompor Evento",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: pos(480),
  parameters: { jsCode: `// Reenvio de uma entrega que falhou no meio: a linha existe e está aberta.
// Recompõe o item com o event do node pinado.
return [{ json: { event: $('Assinatura Válida?').first().json.event } }];
` },
});
// Responder "duplicado" só com evidência POSITIVA: linha consultada e fechada.
// O item {} de fallback (alwaysOutputData em erro do Consultar Registro ou do
// próprio Registrar Evento) não tem event_id/processado_em — sai SEM itens, e
// quem responde é o Respond 500 do ramo de erro (medido: 200 vazio mata o
// reenvio do Stripe; exec 101762 respondeu 200 duplicado com Supabase morto).
addNode({
  id: "f4-decidir-duplicado",
  name: "Decidir Duplicado",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: pos(600),
  parameters: { jsCode: `const row = $('Consultar Registro').first().json;
if (row && row.event_id !== undefined && row.processado_em !== null) {
  return [{ json: { duplicado: true } }];
}
// sem evidência positiva de já-processado → NÃO é duplicado confirmado;
// cai no IF que responde 500 (Stripe reenvia; linha aberta garante reprocesso).
return [{ json: { duplicado: false } }];
` },
});
addNode({
  id: "f4-duplicado-confirmado",
  name: "Duplicado Confirmado?",
  type: "n8n-nodes-base.if",
  typeVersion: 2,
  position: pos(720),
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
      conditions: [{ id: "f4g3", leftValue: "={{ $json.duplicado }}", rightValue: 0,
        operator: { type: "boolean", operation: "true", singleValue: true } }],
      combinator: "and",
    },
    options: {},
  },
});
respond("Respond 200 Duplicado", "{ received: true, duplicate: true }", 240);
fechar("Fechar Evento Ignorado", "ignorado", 360);
respond("Respond 200 Ignorado", "{ received: true, ignored: true }", 360);
fechar("Fechar Evento Checkout", "checkout", -480);
respond("Respond 200 Checkout", "{ received: true, processed: 'checkout' }", -480);
fechar("Fechar Evento Fim", "fim", -600);
respond("Respond 200 Fim", "{ received: true, processed: 'fim' }", -600);
fechar("Fechar Evento Reativar", "reativar", -720);
respond("Respond 200 Reativar", "{ received: true, processed: 'reativar' }", -720);
respond("Respond 400 Assinatura Inválida", '{ received: false, error: "invalid signature" }', 480, 400);
// Fail-closed real: erro jogado no meio do ramo responde 200 VAZIO nesta instância
// (medido, exec 101741) — o Stripe nunca reenviaria. Então cada node que pode
// falhar usa onError=continueErrorOutput e o output de ERRO vai para um Respond
// 500 explícito → Stripe recebe 500 e reenvia; a linha aberta garante reprocesso.
respond("Respond 500 Falha", '{ received: false, error: "processing failed" }', 600, 500);

// ── Remodelagem ──
const wfNew = JSON.parse(JSON.stringify(wf));
wfNew.nodes = wfNew.nodes.filter((n) => n.name !== "Registrar Evento");

if (mode === "qa") {
  // nunca pode disparar o ramo cron nem depender do segredo HMAC na cópia
  const remover = [
    "Schedule - Diário 9h", "Config Fixa", "Buscar Avisos Pendentes", "Filtrar Aviso Último Dia",
    "Enviar Aviso Trial", "Marcar Aviso Enviado", "Expirar Clínicas", "Config Expiração",
    "Calcular HMAC Stripe",
  ];
  wfNew.nodes = wfNew.nodes.filter((n) => !remover.includes(n.name));
  const nomes = new Set(wfNew.nodes.map((n) => n.name));
  for (const k of Object.keys(wfNew.connections)) {
    if (!nomes.has(k)) delete wfNew.connections[k];
  }
  for (const k of Object.keys(wfNew.connections)) {
    wfNew.connections[k].main = (wfNew.connections[k].main || []).map((arr) =>
      (arr || []).filter((c) => nomes.has(c.node)));
  }
}

// webhook: resposta passa a vir dos Responds (fail-closed: erro no meio → 500 → Stripe reenvia)
const wh = wfNew.nodes.find((n) => n.name === "Webhook Stripe Pagamento");
wh.parameters.responseMode = "responseNode";

if (mode === "qa") {
  const rnd = randomBytes(4).toString("hex");
  wh.parameters.path = `recepta/qa-f4-${rnd}`;
  wh.webhookId = `recepta/qa-f4-${rnd}`;
  // Comparar Assinatura (QA): controlado por header; valid:false também exercita o branch 400
  const cmp = wfNew.nodes.find((n) => n.name === "Comparar Assinatura");
  cmp.parameters.jsCode = `const headers = $('Webhook Stripe Pagamento').first().json.headers || {};
if (headers['x-qa-invalid']) return [{ json: { valid: false } }];
const event = JSON.parse($json.raw_body);
return [{ json: { valid: true, event } }];
`;
  const rndNome = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  wfNew.name = `zz-f4-qa-${rndNome}`;
  wfNew.settings = { executionOrder: "v1" };
} else {
  wfNew.settings = { executionOrder: wf.settings?.executionOrder || "v1" };
  if (wf.settings?.errorWorkflow) wfNew.settings.errorWorkflow = wf.settings.errorWorkflow;
}

// conexões: só o subgrafo webhook muda; cron permanece intacto em prod
const C = wfNew.connections;
const alvo = (node) => [{ node, type: "main", index: 0 }];
C["Assinatura Válida?"] = { main: [alvo("Registrar Evento"), alvo("Respond 400 Assinatura Inválida")] };
C["Registrar Evento"] = { main: [alvo("Novo Evento?")] };
C["Novo Evento?"] = { main: [alvo("Classificar Evento"), alvo("Consultar Registro")] };
C["Consultar Registro"] = { main: [alvo("Registro Aberto?")] };
C["Registro Aberto?"] = { main: [alvo("Recompor Evento"), alvo("Decidir Duplicado")] };
C["Decidir Duplicado"] = { main: [alvo("Duplicado Confirmado?")] };
C["Duplicado Confirmado?"] = { main: [alvo("Respond 200 Duplicado"), alvo("Respond 500 Falha")] };
C["Recompor Evento"] = { main: [alvo("Classificar Evento")] };
C["Classificar Evento"] = { main: [alvo("Rotear Evento")] };
C["Rotear Evento"] = { main: [
  alvo("Extrair Evento Checkout"),
  alvo("Extrair Fim de Pagamento"),
  alvo("Extrair Reativar"),
  alvo("Fechar Evento Ignorado"),
] };
C["Fechar Evento Ignorado"] = { main: [alvo("Respond 200 Ignorado")] };
C["Fechar Evento Checkout"] = { main: [alvo("Respond 200 Checkout")] };
C["Fechar Evento Fim"] = { main: [alvo("Respond 200 Fim")] };
C["Fechar Evento Reativar"] = { main: [alvo("Respond 200 Reativar")] };

if (mode === "qa") {
  // Montar Payload Assinado alimenta Comparar Assinatura direto (sem HMAC na cópia)
  C["Montar Payload Assinado"] = { main: [alvo("Comparar Assinatura")] };
} else {
  C["Calcular HMAC Stripe"] = { main: [alvo("Comparar Assinatura")] };
}
// saídas dos nodes Supabase antes mortas agora fecham auditoria + respondem
const uuidCode = (origem) => `const rows = $input.all().map(i => i.json).filter(r => r && r.id);
if (rows.length !== 1) throw new Error('${origem}: esperado exatamente 1 clínica; recebido ' + rows.length);
const id = String(rows[0].id || '');
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('${origem}: clinica.id não é UUID válido');
return [{ json: { ...rows[0], clinica_id: id } }];`;
const assertPatchCode = (origem) => `const rows = $input.all().map(i => i.json).filter(r => r && r.id);
if (rows.length !== 1) throw new Error('${origem}: PATCH deveria alterar exatamente 1 clínica; alterou ' + rows.length);
return $input.all();`;

const buscarClinica = (name, dy) => ({
  id: `f4-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  name, type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: pos(dy),
  ...RETRY, alwaysOutputData: true, credentials: { supabaseApi: credSupabase },
  parameters: {
    method: "GET",
    url: `={{ $('Config Stripe Webhook').item.json.supabase_url + '/rest/v1/clinicas?stripe_subscription_id=eq.' + encodeURIComponent(String($('Assinatura Válida?').first().json.event.data.object.id || '')) + '&select=id&limit=2' }}`,
    authentication: "predefinedCredentialType", nodeCredentialType: "supabaseApi", options: {},
  },
});
novo.push(buscarClinica("Buscar Clínica Fim", -610), buscarClinica("Buscar Clínica Reativar", -730));
novo.push({ id:"f4-validar-clinica-fim", name:"Validar Clínica Fim", type:"n8n-nodes-base.code", typeVersion:2, position:pos(-610), parameters:{jsCode:uuidCode("fim")} });
novo.push({ id:"f4-validar-clinica-reativar", name:"Validar Clínica Reativar", type:"n8n-nodes-base.code", typeVersion:2, position:pos(-730), parameters:{jsCode:uuidCode("reativar")} });
novo.push({ id:"f4-assert-patch-checkout", name:"Assert 1 Clínica Checkout", type:"n8n-nodes-base.code", typeVersion:2, position:pos(-480), parameters:{jsCode:assertPatchCode("checkout")} });
novo.push({ id:"f4-assert-patch-fim", name:"Assert 1 Clínica Fim", type:"n8n-nodes-base.code", typeVersion:2, position:pos(-610), parameters:{jsCode:assertPatchCode("fim")} });
novo.push({ id:"f4-assert-patch-reativar", name:"Assert 1 Clínica Reativar", type:"n8n-nodes-base.code", typeVersion:2, position:pos(-730), parameters:{jsCode:assertPatchCode("reativar")} });

const fimPatch = wfNew.nodes.find(n => n.name === "Supabase Expirar Por Pagamento");
fimPatch.parameters.url = `={{ $('Config Stripe Webhook').item.json.supabase_url + '/rest/v1/clinicas?id=eq.' + encodeURIComponent($json.clinica_id) + '&or=(assinatura_evento_em.is.null,assinatura_evento_em.lt.' + encodeURIComponent(new Date($('Assinatura Válida?').first().json.event.created * 1000).toISOString()) + ')&select=id' }}`;
fimPatch.parameters.jsonBody = `={{ JSON.stringify({ status: 'expirado', assinatura_evento_em: new Date($('Assinatura Válida?').first().json.event.created * 1000).toISOString() }) }}`;
fimPatch.parameters.headerParameters.parameters = [{ name:"Prefer", value:"return=representation" }];
const reativarPatch = wfNew.nodes.find(n => n.name === "Supabase Reativar Clínica");
reativarPatch.parameters.url = `={{ $('Config Stripe Webhook').item.json.supabase_url + '/rest/v1/clinicas?id=eq.' + encodeURIComponent($json.clinica_id) + '&reembolsado_em=is.null&disputa_em=is.null&or=(assinatura_evento_em.is.null,assinatura_evento_em.lt.' + encodeURIComponent(new Date($('Assinatura Válida?').first().json.event.created * 1000).toISOString()) + ')&select=id' }}`;
reativarPatch.parameters.jsonBody = `={{ JSON.stringify({ status: 'ativo', assinatura_evento_em: new Date($('Assinatura Válida?').first().json.event.created * 1000).toISOString() }) }}`;
reativarPatch.parameters.headerParameters.parameters = [{ name:"Prefer", value:"return=representation" }];
const checkoutPatch = wfNew.nodes.find(n => n.name === "Supabase Confirmar Pagamento");
checkoutPatch.parameters.url = `={{ $('Config Stripe Webhook').item.json.supabase_url + '/rest/v1/clinicas?id=eq.' + encodeURIComponent($json.clinica_id) + '&select=id' }}`;
checkoutPatch.parameters.headerParameters.parameters = [{ name:"Prefer", value:"return=representation" }];

C["Extrair Fim de Pagamento"] = { main: [alvo("Buscar Clínica Fim")] };
C["Buscar Clínica Fim"] = { main: [alvo("Validar Clínica Fim")] };
C["Validar Clínica Fim"] = { main: [alvo("Supabase Expirar Por Pagamento")] };
C["Extrair Reativar"] = { main: [alvo("Buscar Clínica Reativar")] };
C["Buscar Clínica Reativar"] = { main: [alvo("Validar Clínica Reativar")] };
C["Validar Clínica Reativar"] = { main: [alvo("Supabase Reativar Clínica")] };
C["Supabase Confirmar Pagamento"] = { main: [alvo("Assert 1 Clínica Checkout")] };
C["Assert 1 Clínica Checkout"] = { main: [alvo("Fechar Evento Checkout")] };
C["Supabase Expirar Por Pagamento"] = { main: [alvo("Assert 1 Clínica Fim")] };
C["Assert 1 Clínica Fim"] = { main: [alvo("Fechar Evento Fim")] };
C["Supabase Reativar Clínica"] = { main: [alvo("Assert 1 Clínica Reativar")] };
C["Assert 1 Clínica Reativar"] = { main: [alvo("Fechar Evento Reativar")] };

// retries só em nodes HTTP do ramo webhook — SEMPRE depois do gate (idempotência first)
// alwaysOutputData nos Supabase de branch: PATCH que casa 0 linhas responde 200 + []
// e o node sai com ZERO itens — sem isso os nodes seguintes (Fechar/Respond)
// nunca rodam e o webhook responde 200 vazio (bug achado na prova P1).
for (const nome of ["Buscar Line Items Checkout Session", "Supabase Confirmar Pagamento",
  "Supabase Expirar Por Pagamento", "Supabase Reativar Clínica"]) {
  const n = wfNew.nodes.find((nn) => nn.name === nome);
  Object.assign(n, RETRY, { alwaysOutputData: true });
}

wfNew.nodes.push(...novo);

// Fail-closed: erro em qualquer node do caminho → output de erro → Respond 500
// (o retries acontecem ANTES do output de erro; aqui só capturamos o esgotado).
const COM_ERRO_PARA_500 = [
  "Registrar Evento", "Consultar Registro",
  "Buscar Clínica Fim", "Validar Clínica Fim", "Buscar Clínica Reativar", "Validar Clínica Reativar",
  "Buscar Line Items Checkout Session", "Supabase Confirmar Pagamento",
  "Supabase Expirar Por Pagamento", "Supabase Reativar Clínica",
  "Assert 1 Clínica Checkout", "Assert 1 Clínica Fim", "Assert 1 Clínica Reativar",
  "Fechar Evento Checkout", "Fechar Evento Fim", "Fechar Evento Reativar", "Fechar Evento Ignorado",
];
for (const nome of COM_ERRO_PARA_500) {
  const n = wfNew.nodes.find((nn) => nn.name === nome);
  n.onError = "continueErrorOutput";
  const c = C[nome];
  if (!c) { console.error(`Node "${nome}" sem conexão para casar erro.`); process.exit(1); }
  while (c.main.length < 2) c.main.push([]);
  c.main[1] = alvo("Respond 500 Falha");
}

// ── Publicar ──
const payload = {
  name: wfNew.name,
  nodes: wfNew.nodes,
  connections: wfNew.connections,
  settings: wfNew.settings,
};

let resp;
if (mode === "qa") {
  resp = await api("POST", "/api/v1/workflows", payload);
} else {
  resp = await api("PUT", `/api/v1/workflows/${SOURCE_ID}`, payload);
}
if (!resp.ok) {
  console.error(`PUT/POST falhou (${resp.status}): ${resp.text.slice(0, 600)}`);
  console.error(`Nada publicado. Backup: ${backupPath}`);
  process.exit(1);
}
const salvo = JSON.parse(resp.text);
const id = salvo.id || SOURCE_ID;
console.log(`Workflow ${mode === "qa" ? "criado" : "atualizado"}: ${id}`);

const act = await api("POST", `/api/v1/workflows/${id}/activate`);
if (!act.ok) {
  console.error(`Activate falhou (${act.status}): ${act.text.slice(0, 300)}`);
  process.exit(1);
}

// ── Verificação: draft vs ativo, settings preservadas, código no ar ──
const depois = JSON.parse((await api("GET", `/api/v1/workflows/${id}`)).text);
let falhou = false;
if (depois.versionId !== depois.activeVersionId) {
  console.error("ERRO: versionId != activeVersionId — ficou draft."); falhou = true;
}
if (mode === "prod" && wf.settings?.binaryMode && depois.settings?.binaryMode !== wf.settings.binaryMode) {
  console.error(`ERRO: settings.binaryMode se perdeu (${wf.settings.binaryMode} → ${depois.settings?.binaryMode}).`);
  console.error("O rawBody do HMAC depende disso. Restaurar do backup imediatamente."); falhou = true;
}
if (mode === "prod" && !wfNew.nodes.every((n) => depois.nodes.some((d) => d.name === n.name && JSON.stringify(d.parameters) === JSON.stringify(n.parameters)))) {
  console.error("ERRO: algum node no ar difere do transformado."); falhou = true;
}
for (const nome of ["Registrar Evento", "Novo Evento?", "Rotear Evento", "Registro Aberto?", "Recompor Evento", "Respond 500 Falha"]) {
  if (!depois.nodes.some((n) => n.name === nome)) { console.error(`ERRO: "${nome}" ausente no ar.`); falhou = true; }
}
const cronIntacto = mode !== "qa" && ["Schedule - Diário 9h", "Config Fixa", "Expirar Clínicas"]
  .every((nome) => depois.nodes.some((n) => n.name === nome));
if (mode === "prod" && !cronIntacto) { console.error("ERRO: ramo cron sumiu no prod."); falhou = true; }

console.log("");
console.log(`Publicado: versionId=${depois.versionId} activeVersionId=${depois.activeVersionId} active=${depois.active}`);
if (mode === "qa") console.log(`Webhook QA: ${N8N_URL}/webhook/${wh.parameters.path}`);
console.log(falhou ? "VERIFICAÇÃO FALHOU — ver acima." : "Verificação OK.");
process.exit(falhou ? 1 : 0);

process.exit(falhou ? 1 : 0);
