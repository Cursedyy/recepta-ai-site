#!/usr/bin/env node
// patch-webhook-idempotencia-f4.mjs
// F4: idempotência + auditoria do webhook Stripe (cf1An4BYT9A0LuHi).
//
// ANTES: Webhook → Config → Montar → HMAC → Comparar → Assinatura Válida? →
//        3 extratores. Cada reenvio do Stripe reprocessa tudo; nenhum registro
//        de eventos processados; nenhum log de auditoria.
//
// DEPOIS: ... Assinatura Válida? (true) → REGISTRAR EVENTO (gate de idempotência
//         POST stripe_eventos com Prefer: resolution=ignore-duplicates) →
//         Extrair Evento (payload direto do evento) → 3 extratores (inalterados
//         a jusante). O POST ignora duplicados; nós detectamos duplicado lendo
//         postGetter para ver se a linha já existia (created=false → já vimos
//         este evento → dead-end SEM falhar).
//
// Design do gate (decidido após o probe de runtime):
//  - responseMode permanece "onReceived" (200 imediato). O probe provou que
//    responseMode:lastNode devolve 500 quando qualquer ramo termina em item
//    vazio — e este webhook tem 4 ramos silenciosos (assinatura inválida,
//    extrator sem match, price desconhecido, pedido sem client_reference_id).
//    Trocar agora transformaria TODO evento irrelevante do Stripe em 500 +
//    alerta do Error Workflow. A mudança de responseMode fica para o go-live
//    F8, quando checkout.session.completed de verdade existir e os dead-ends
//    forem redesenhados.
//  - idempotência 1º nível: POST resolution=ignore-duplicates (FK de event_id).
//    idempotência 2º nível: PATCH condicional em pedidos (F6) — status gate.
//  - Auditoria: a linha fica em stripe_eventos com resultado; consultável
//    para suporte.
//
// ADDITIVE: nenhum node existente é removido; assinatura, extração e os
// branches de expiração/reativação permanecem intactos.

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

if (wf.nodes.some((n) => n.name === "Registrar Evento")) {
  console.log("Patch já aplicado (Registrar Evento existe). Nada a fazer.");
  process.exit(0);
}

// ── PRÉ-CONDIÇÃO: migration 021 aplicada (stripe_eventos precisa existir) ──
const sbUrl = process.env.SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!sbUrl || !sbKey) {
  console.error("Falta SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY para checar a pré-condição.");
  process.exit(1);
}
const chk = await fetch(`${sbUrl}/rest/v1/stripe_eventos?select=event_id&limit=1`, {
  headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
});
if (chk.status === 404) {
  console.error("PRÉ-CONDIÇÃO FALTANDO: tabela stripe_eventos não existe (404).");
  console.error("Aplique a migration 021 primeiro (script gated). Nada foi alterado.");
  process.exit(1);
}
if (!chk.ok) {
  console.error(`Não consegui verificar stripe_eventos (HTTP ${chk.status}). Abortando por segurança.`);
  process.exit(1);
}
console.log("Pré-condição OK: stripe_eventos existe.");

// ── backup ────────────────────────────────────────────────────────────────
const { writeFileSync, mkdirSync } = await import("fs");
mkdirSync("tmp-backup-workflows-deletados", { recursive: true });
const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `tmp-backup-workflows-deletados/${WF_ID}-pre-f4-${carimbo}.json`;
writeFileSync(backupPath, JSON.stringify(wf, null, 2));
console.log(`backup: ${backupPath}`);

// ── 1. reescrever "Extrair Evento Checkout" (payload puro, nome preservado) ─
// O nome do node NÃO muda: os contratos downstream usam $('Extrair Evento
// Checkout') por nome (Determinar Plano chama $('Extrair Evento Checkout')) e
// renomear quebraria a resolução. Só o corpo muda.
const extrair = wf.nodes.find((n) => n.name === "Extrair Evento Checkout");
if (!extrair) {
  console.error("Node Extrair Evento Checkout não encontrado. Abortando.");
  process.exit(1);
}
extrair.parameters.jsCode = [
  '// F4 — payload puro do evento para os extratores a jusante (contratos preservados:',
  '// Extrair Fim de Pagamento e Extrair Reativar leem $json.event; a extração de',
  '// session migrou para o F6, que consome $json.event direto).',
  "const event = $json.event;",
  'if (!event) return [];',
  "return [{ json: { event } }];",
].join("\n");

// ── 2. criar o gate "Registrar Evento" ───────────────────────────────────
const cfgNode = wf.nodes.find((n) => n.name === "Config Stripe Webhook");
const assinNode = wf.nodes.find((n) => n.name === "Assinatura Válida?");
if (!cfgNode || !assinNode) {
  console.error("Nodes Config Stripe Webhook / Assinatura Válida? não encontrados.");
  process.exit(1);
}
const gateId = `gate-${Date.now().toString(36)}`;
wf.nodes.push({
  parameters: {
    method: "POST",
    url: "={{ $('Config Stripe Webhook').item.json.supabase_url }}/rest/v1/stripe_eventos",
    authentication: "predefinedCredentialType",
    nodeCredentialType: "supabaseApi",
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: "Prefer", value: "resolution=ignore-duplicates,return=representation" },
      ],
    },
    sendBody: true,
    specifyBody: "json",
    jsonBody:
      "={{ JSON.stringify({ event_id: $json.event.id, tipo: $json.event.type, resultado: 'recebido' }) }}",
    options: { response: { response: { neverError: true, fullResponse: true } } },
  },
  id: gateId,
  name: "Registrar Evento",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [assinNode.position[0] + 224, assinNode.position[1]],
});

// ── 3. rewire: Assinatura Válida? → Registrar Evento → Extrair Evento ────
const conn = wf.connections;
conn["Assinatura Válida?"] = {
  main: [[{ node: "Registrar Evento", type: "main", index: 0 }]],
};
conn["Registrar Evento"] = {
  main: [[{ node: "Evento Novo?", type: "main", index: 0 }]],
};
conn["Evento Novo?"] = {
  main: [
    [
      { node: "Extrair Evento Checkout", type: "main", index: 0 },
      { node: "Extrair Fim de Pagamento", type: "main", index: 0 },
      { node: "Extrair Reativar", type: "main", index: 0 },
    ],
  ],
};

// ── 4. detector de duplicado ──────────────────────────────────────────────
// Com fullResponse + neverError, o HTTP devolve { statusCode, body, headers }.
// Em duplicado o PostgREST devolve 409/200 sem a linha nova — usamos
// headers.location? Não existe em PATCH; em POST ignore-duplicates a resposta
// é 200 com body vazio ou a linha conflitante. Mais simples e à prova de
// versão do PostgREST: re-consultar por event_id é caro; em vez disso checamos
// se body veio vazio (criação de linha nova SEMPRE devolve a linha com
// return=representation). Sem linha = duplicado.
const dupCode = [
  "// F4 — gate de idempotência: linha nova = primeira vez; vazio = duplicado.",
  "// (POST com resolution=ignore-duplicates + return=representation devolve a",
  "//  linha somente na PRIMEIRA inserção; reenvio devolve 0 linhas.)",
  "const resp = $input.first().json;",
  "const linhas = Array.isArray(resp.body) ? resp.body : (resp.body ? [resp.body] : []);",
  "if (linhas.length === 0) {",
  "  // Reenvio do Stripe: já processamos este evento. Dead-end silencioso",
  "  // (sem alerta) — o Stripe considera o webhook entregue.",
  "  return [];",
  "}",
  "return [{ json: { evento_novo: true } }];",
].join("\n");
wf.nodes.push({
  parameters: { jsCode: dupCode },
  id: `dup-${Date.now().toString(36)}`,
  name: "Evento Novo?",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [gateNodePos(wf, gateId) + 224, assinNode.position[1]],
});

// o gate alimenta o detector; o detector alimenta os extratores
conn["Registrar Evento"] = {
  main: [[{ node: "Evento Novo?", type: "main", index: 0 }]],
};
conn["Evento Novo?"] = {
  main: [[{ node: "Extrair Evento", type: "main", index: 0 }]],
};

// ── helpers ───────────────────────────────────────────────────────────────
function gateNodePos(w, id) {
  const n = w.nodes.find((x) => x.id === id);
  return (n?.position?.[0]) ?? 900;
}

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
const gate = depois.nodes.find((n) => n.name === "Registrar Evento");
const det = depois.nodes.find((n) => n.name === "Evento Novo?");
if (!gate || !det) {
  console.error("ERRO: Registrar Evento / Evento Novo? não estão no ar.");
  falhou = true;
}
const connDepois = depois.connections;
if (!connDepois["Evento Novo?"]?.main?.[0]?.some((c) => c.node === "Extrair Evento Checkout")) {
  console.error("ERRO: Evento Novo? não alimenta Extrair Evento Checkout.");
  falhou = true;
}
if (connDepois["Assinatura Válida?"]?.main?.[0]?.[0]?.node !== "Registrar Evento") {
  console.error("ERRO: Assinatura Válida? não alimenta Registrar Evento.");
  falhou = true;
}
const tresExtratores =
  connDepois["Evento Novo?"]?.main?.[0]?.map((c) => c.node).sort().join(",") ===
  "Extrair Evento Checkout,Extrair Fim de Pagamento,Extrair Reativar";
if (!tresExtratores) {
  console.error("ERRO: os 3 extratores não recebem de Extrair Evento.");
  falhou = true;
}
console.log("");
console.log(`Publicado. versionId=${depois.versionId} activeVersionId=${depois.activeVersionId}`);
console.log(falhou ? "FALHOU na prova." : "PROVA OK: gate de idempotência no ar.");
process.exit(falhou ? 1 : 0);
