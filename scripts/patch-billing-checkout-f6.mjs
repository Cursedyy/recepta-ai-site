#!/usr/bin/env node
// patch-billing-checkout-f6.mjs
// F6: ramo checkout.session.completed passa a operar sobre PEDIDOS (o cliente
// ainda não é uma clínica no momento do pagamento).
//
// ANTES: Extrair Evento Checkout → Buscar Line Items → Determinar Plano →
//        Supabase Confirmar Pagamento (PATCH clinicas?id=client_reference_id,
//        com client_reference_id = clinica_id do trial — morto na prática).
//
// DEPOIS: Extrair Evento Checkout (emite pedido_id) → Buscar Line Items →
//         Determinar Plano (inalterado; spread carrega pedido_id) →
//         Confirmar Pagamento (PATCH CONDICIONAL em pedidos — claim atômico) →
//         Salvar Pagamento (interpreta o resultado).
//
// O extrator F6 (src/n8n-patches/billing-extrair-evento-checkout-f6.js) e os
// nodes de PATCH/interpretação são deployados verbatim dos arquivos, no padrão
// do deploy-node-code.mjs. Pré-condição: migration 021 (tabela pedidos).
// ADDITIVE: nada a jusante muda; extrator sem match segue terminando em [].

const N8N_KEY = process.env.N8N_API_KEY;
const N8N_URL = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
const WF_ID = process.env.F6_WORKFLOW_ID || "cf1An4BYT9A0LuHi";

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

if (wf.nodes.some((n) => n.name === "Salvar Pagamento")) {
  console.log("Patch já aplicado (Salvar Pagamento existe). Nada a fazer.");
  process.exit(0);
}

// ── pré-condição: migration 021 (tabela pedidos) ─────────────────────────
const sbUrl = process.env.SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!sbUrl || !sbKey) {
  console.error("Falta SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const chk = await fetch(`${sbUrl}/rest/v1/pedidos?select=id&limit=1`, {
  headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
});
if (chk.status === 404) {
  console.error("PRÉ-CONDIÇÃO FALTANDO: tabela pedidos não existe (404).");
  console.error("Aplique a migration 021 primeiro. Nada foi alterado.");
  process.exit(1);
}
if (!chk.ok) {
  console.error(`Não consegui verificar pedidos (HTTP ${chk.status}). Abortando por segurança.`);
  process.exit(1);
}
console.log("Pré-condição OK: pedidos existe.");

// ── backup ────────────────────────────────────────────────────────────────
const { writeFileSync, mkdirSync, readFileSync } = await import("fs");
mkdirSync("tmp-backup-workflows-deletados", { recursive: true });
const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `tmp-backup-workflows-deletados/${WF_ID}-pre-f6-${carimbo}.json`;
writeFileSync(backupPath, JSON.stringify(wf, null, 2));
console.log(`backup: ${backupPath}`);

const lerNode = (arquivo) => {
  const codigo = readFileSync(arquivo, "utf8");
  new Function(codigo); // valida antes de deployar (padrão da casa)
  return codigo;
};

// ── 1. Extrair Evento Checkout ← arquivo F6 (emite pedido_id, fail-closed) ─
const extrair = wf.nodes.find((n) => n.name === "Extrair Evento Checkout");
if (!extrair) {
  console.error("Node Extrair Evento Checkout não encontrado.");
  process.exit(1);
}
extrair.parameters.jsCode = lerNode("src/n8n-patches/billing-extrair-evento-checkout-f6.js");

// ── 2. Confirmar Pagamento: PATCH condicional em pedidos (claim atômico) ──
const confirmar = wf.nodes.find((n) => n.name === "Supabase Confirmar Pagamento");
if (!confirmar) {
  console.error("Node Supabase Confirmar Pagamento não encontrado.");
  process.exit(1);
}
confirmar.parameters = {
  method: "PATCH",
  url: "={{ $('Config Stripe Webhook').item.json.supabase_url }}/rest/v1/pedidos?id=eq.{{ $json.pedido_id }}&status=eq.aberto",
  authentication: "predefinedCredentialType",
  nodeCredentialType: "supabaseApi",
  sendHeaders: true,
  headerParameters: {
    parameters: [{ name: "Prefer", value: "return=representation" }],
  },
  sendBody: true,
  specifyBody: "json",
  jsonBody:
    "={{ (function(){ const pago = new Date(); return JSON.stringify({ status: 'pago', pago_em: pago.toISOString(), garantia_teto_em: new Date(pago.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(), stripe_session_id: $json.session_id, stripe_customer_id: $json.customer_id, stripe_subscription_id: $json.subscription_id, price_id: $json.price_id_encontrado, tier: $json.tier, ciclo: $json.plano, plano: $json.plano }); })() }}",
  options: {},
};
// alwaysOutputData: o [] de duplicado precisa chegar ao node seguinte para
// encerrar o ramo SEM falhar (idempotência de 2º nível).
confirmar.alwaysOutputData = true;

// ── 3. Salvar Pagamento (novo node interpretador) ─────────────────────────
const det = wf.nodes.find((n) => n.name === "Determinar Plano");
if (!det) {
  console.error("Node Determinar Plano não encontrado.");
  process.exit(1);
}
wf.nodes.push({
  parameters: { jsCode: lerNode("src/n8n-patches/billing-salvar-pagamento-f6.js") },
  id: `salvar-pg-${Date.now().toString(36)}`,
  name: "Salvar Pagamento",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [confirmar.position[0] + 224, confirmar.position[1]],
  alwaysOutputData: true,
});

// ── 4. rewire: Determinar Plano → Confirmar → Salvar ─────────────────────
const conn = wf.connections;
conn["Determinar Plano"] = {
  main: [[{ node: "Supabase Confirmar Pagamento", type: "main", index: 0 }]],
};
conn["Supabase Confirmar Pagamento"] = {
  main: [[{ node: "Salvar Pagamento", type: "main", index: 0 }]],
};
conn["Salvar Pagamento"] = {
  main: [[{ node: "Fechar Evento Checkout", type: "main", index: 0 }]],
};

if (process.env.F6_INCLUDE_LATER_SCOPE === "1") {
// ── 5. Mudanças de escopo posterior; desligadas no F6 por padrão.
// ── Extrair Fim de Pagamento ← arquivo F6 (remove past_due da lista que
//    EXPIRA — decisão registrada: a primeira recusa de cartão não corta o
//    atendimento de clínica pagante; unpaid/canceled/deleted continuam) ──
const extrairFim = wf.nodes.find((n) => n.name === "Extrair Fim de Pagamento");
if (!extrairFim) {
  console.error("Node Extrair Fim de Pagamento não encontrado.");
  process.exit(1);
}
extrairFim.parameters.jsCode = lerNode("src/n8n-patches/billing-extrair-fim-f6.js");

// ── 6. C6 (R3): reativação não pode ressuscitar clínica reembolsada ──────
// O guard vai NO FILTRO (o banco decide): &reembolsado_em=is.null. Um evento
// atrasado de subscription.updated:active sobre um customer reembolsado
// deixa de casar linha em vez de reativar de graça.
const reativar = wf.nodes.find((n) => n.name === "Supabase Reativar Clínica");
if (!reativar) {
  console.error("Node Supabase Reativar Clínica não encontrado.");
  process.exit(1);
}
const urlReativar = String(reativar.parameters?.url || "");
if (!urlReativar.includes("reembolsado_em=is.null")) {
  reativar.parameters.url = urlReativar + "&reembolsado_em=is.null";
}

// ── 7. C9: charge.dispute.created congela acesso na hora (G10) ────────────
// Extrair Disputa (gate por tipo) → Congelar Por Disputa (PATCH por
// stripe_customer_id com status='expirado' + disputa_em). Congelar por
// customer é deliberado (fail-closed): disputa é rara e derrubar TODAS as
// clínicas do customer é o lado seguro do R4. O estorno em si continua
// manual (runbook G5) — disputa dentro da janela de garantia nem se
// contesta, estorna-se.
const assinaturaValida = wf.nodes.find((n) => n.name === "Assinatura Válida?");
const disputaY = extrairFim.position[1] + 148;
wf.nodes.push({
  parameters: {
    jsCode: [
      "// F6/C9 — charge.dispute.created: congela a clínica (via customer) e",
      "// deixa o pacote de evidência para o operador (runbook G10). Outros",
      "// tipos de evento: dead-end silencioso, como os demais extratores.",
      "const event = $json.event;",
      'if (!event || event.type !== "charge.dispute.created") return [];',
      "const obj = (event.data && event.data.object) || {};",
      'const chargeId = typeof obj.charge === "string" ? obj.charge : null;',
      "if (!chargeId) return [];",
      "return [{ json: { charge_id: chargeId, dispute_id: obj.id || null, motivo: event.type } }];",
    ].join("\n"),
  },
  id: `extr-disputa-${Date.now().toString(36)}`,
  name: "Extrair Disputa",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [extrairFim.position[0], disputaY],
});

// A disputa precisa do customer: o objeto dispute só traz charge_id, então
// buscamos a cobrança no Stripe (credencial stripeApi, mesmo padrão do node
// de Line Items) e lemos .customer do corpo.
wf.nodes.push({
  parameters: {
    url: "={{ 'https://api.stripe.com/v1/charges/' + $json.charge_id }}",
    authentication: "predefinedCredentialType",
    nodeCredentialType: "stripeApi",
    options: {},
  },
  id: `cob-disputa-${Date.now().toString(36)}`,
  name: "Buscar Cobrança Disputa",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [extrairFim.position[0] + 224, disputaY],
});

wf.nodes.push({
  parameters: {
    method: "PATCH",
    url: "={{ $('Config Stripe Webhook').item.json.supabase_url + '/rest/v1/clinicas?stripe_customer_id=eq.' + $json.customer }}",
    authentication: "predefinedCredentialType",
    nodeCredentialType: "supabaseApi",
    sendHeaders: true,
    headerParameters: {
      parameters: [{ name: "Prefer", value: "return=representation" }],
    },
    sendBody: true,
    specifyBody: "json",
    jsonBody:
      "={{ JSON.stringify({ status: 'expirado', disputa_em: new Date().toISOString() }) }}",
    options: {},
  },
  id: `cong-disputa-${Date.now().toString(36)}`,
  name: "Supabase Congelar Por Disputa",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [extrairFim.position[0] + 448, disputaY],
  alwaysOutputData: true,
});

conn["Extrair Disputa"] = {
  main: [[{ node: "Buscar Cobrança Disputa", type: "main", index: 0 }]],
};
conn["Buscar Cobrança Disputa"] = {
  main: [[{ node: "Supabase Congelar Por Disputa", type: "main", index: 0 }]],
};
// fan-out do Assinatura Válida? para o ramo novo (mantém os 3 existentes)
const saidasAssin = conn["Assinatura Válida?"].main[0].slice();
saidasAssin.push({ node: "Extrair Disputa", type: "main", index: 0 });
conn["Assinatura Válida?"].main[0] = saidasAssin;
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
if (wf.active && depois.versionId !== depois.activeVersionId) {
  console.error("ERRO: versionId != activeVersionId.");
  falhou = true;
}
const salvar = depois.nodes.find((n) => n.name === "Salvar Pagamento");
const confirmarDepois = depois.nodes.find((n) => n.name === "Supabase Confirmar Pagamento");
if (!salvar) {
  console.error("ERRO: Salvar Pagamento não está no ar.");
  falhou = true;
}
if (!confirmarDepois?.alwaysOutputData) {
  console.error("ERRO: Confirmar Pagamento sem alwaysOutputData.");
  falhou = true;
}
if (!String(confirmarDepois?.parameters?.url || "").includes("/rest/v1/pedidos")) {
  console.error("ERRO: Confirmar Pagamento não aponta para pedidos.");
  falhou = true;
}
if (!String(confirmarDepois?.parameters?.url || "").includes("status=eq.aberto")) {
  console.error("ERRO: PATCH sem status=eq.aberto (claim não é atômico).");
  falhou = true;
}
if (
  depois.connections["Supabase Confirmar Pagamento"]?.main?.[0]?.[0]?.node !== "Salvar Pagamento"
) {
  console.error("ERRO: Confirmar Pagamento não alimenta Salvar Pagamento.");
  falhou = true;
}
if (depois.connections["Salvar Pagamento"]?.main?.[0]?.[0]?.node !== "Fechar Evento Checkout") {
  console.error("ERRO: Salvar Pagamento não fecha o evento checkout.");
  falhou = true;
}
if (process.env.F6_INCLUDE_LATER_SCOPE === "1") {
const urlReat = String(
  depois.nodes.find((n) => n.name === "Supabase Reativar Clínica")?.parameters?.url || "",
);
if (!urlReat.includes("reembolsado_em=is.null")) {
  console.error("ERRO: Reativar Clínica sem guarda reembolsado_em (C6).");
  falhou = true;
}
const fimDepois = depois.nodes.find((n) => n.name === "Extrair Fim de Pagamento");
if (String(fimDepois?.parameters?.jsCode || "").includes("past_due")) {
  console.error("ERRO: Extrair Fim ainda expira em past_due.");
  falhou = true;
}
for (const nm of ["Extrair Disputa", "Buscar Cobrança Disputa", "Supabase Congelar Por Disputa"]) {
  if (!depois.nodes.some((n) => n.name === nm)) {
    console.error(`ERRO: node ${nm} não está no ar.`);
    falhou = true;
  }
}
if (!depois.connections["Assinatura Válida?"]?.main?.[0]?.some((c) => c.node === "Extrair Disputa")) {
  console.error("ERRO: Extrair Disputa não recebe de Assinatura Válida?.");
  falhou = true;
}
}
console.log("");
console.log(`Publicado. versionId=${depois.versionId} activeVersionId=${depois.activeVersionId}`);
console.log(falhou ? "FALHOU na prova." : "PROVA OK: claim atômico em pedidos no ar.");
process.exit(falhou ? 1 : 0);
