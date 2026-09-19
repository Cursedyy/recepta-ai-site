#!/usr/bin/env node
// patch-onboarding-claim-f6.mjs
// F6: claim atômico do pedido pago no Onboarding (voEwbw5fzNnn6bQq).
//
// ANTES: Campos Obrigatórios OK? → Buscar Clínica Existente → Normalizar →
//        Já Existe? → (true) Reset Trial [F0a: fail-loud neutralizado]
//                  → (false) Gerar ia_config → ...
//
// DEPOIS: Campos Obrigatórios OK? → Preparar Claim (novo; modo trial/pago) →
//         Supabase Claim Pedido (HTTP; só executa no modo pago; PATCH condicional
//         UPDATE pedidos SET status='provisionando' WHERE id=pedido AND
//         status='pago') → Pedido Válido? (IF) →
//           (true)  Ramo Pedido Pago (reconstrói contexto + anexa pedido) →
//                   Gerar ia_config
//           (false) [modo trial: continua o fluxo antigo]
//                   Supabase Buscar Clínica Existente → Normalizar →
//                   Já Existe? → (true) Reset Trial (fail-loud F0a)
//                              → (false) Gerar ia_config
//
// Soft-claim preservado: briefings de trial (sem ?pedido= UUID) percorrem o
// caminho antigo byte a byte. O claim só roda no modo pago, e só passa se o
// pedido estava em 'pago' — nunca provisiona de graça, nunca reprocessa.
//
// Pré-condição: migration 021 (tabela pedidos). Deploy verbatim dos arquivos
// em src/n8n-patches/ (padrão deploy-node-code.mjs).

const N8N_KEY = process.env.N8N_API_KEY;
const N8N_URL = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
const WF_ID = process.env.F6_WORKFLOW_ID || "voEwbw5fzNnn6bQq";

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

if (wf.nodes.some((n) => n.name === "Preparar Claim")) {
  console.log("Patch já aplicado (Preparar Claim existe). Nada a fazer.");
  process.exit(0);
}

// ── pré-condição: migration 021 ──────────────────────────────────────────
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

// F6 é fail-closed: não existe mais fallback de trial neste workflow.
const ARQUIVO_CLAIM = "src/n8n-patches/onboarding-claim-pedido-hard.js";
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
  new Function(codigo);
  return codigo;
};

// ── 1. Montar JSON Body ← arquivo F6 (propaga pedido no modo pago) ───────
const montar = wf.nodes.find((n) => n.name === "Montar JSON Body");
if (!montar) {
  console.error("Node Montar JSON Body não encontrado.");
  process.exit(1);
}
montar.parameters.jsCode = lerNode("src/n8n-patches/onboarding-montar-json-body.js");

// ── 2. novos nodes ────────────────────────────────────────────────────────
const campos = wf.nodes.find((n) => n.name === "Campos Obrigatórios OK?");
const buscar = wf.nodes.find((n) => n.name === "Supabase Buscar Clínica Existente");
const cfg = wf.nodes.find((n) => n.name === "Config Fixa");
const mapear = wf.nodes.find((n) => n.name === "Mapear Campos Briefing");
if (!campos || !buscar || !cfg || !mapear) {
  console.error("Nodes de ancoragem não encontrados (Campos Obrigatórios OK? / Buscar / Config Fixa).");
  process.exit(1);
}
const assignments = mapear.parameters?.assignments?.assignments;
if (!Array.isArray(assignments)) throw new Error("Mapear Campos Briefing sem assignments");
if (!assignments.some((a) => a.name === "pedido_id")) {
  assignments.push({ id: "f6-pedido-id", name: "pedido_id", type: "string", value: "={{ $json.body.pedido }}" });
}
const y = campos.position[1];

// Preparar Claim — decide modo trial/pago e monta o PATCH condicional.
// (modo pago só segue por Pedido Válido? true; o PATCH em si é o HTTP abaixo.)
wf.nodes.push({
  parameters: { jsCode: lerNode(ARQUIVO_CLAIM) },
  id: `prep-claim-${Date.now().toString(36)}`,
  name: "Preparar Claim",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [campos.position[0] + 224, y],
});

// Supabase Claim Pedido — PATCH condicional ATÔMICO em pedidos.
// só executa quando o item é do modo pago (o item trial é filtrado pelo IF
// "É Pedido Pago?"). alwaysOutputData + neverError: o [] do duplicado/não-pago
// chega ao IF "Pedido Válido?" como saída falsa SEM falhar o workflow.
wf.nodes.push({
  parameters: {
    method: "PATCH",
    url: "={{ $json.claim_url }}",
    authentication: "predefinedCredentialType",
    nodeCredentialType: "supabaseApi",
    sendHeaders: true,
    headerParameters: {
      parameters: [{ name: "Prefer", value: "return=representation" }],
    },
    sendBody: true,
    specifyBody: "json",
    jsonBody: "={{ JSON.stringify($json.patch_body) }}",
    options: { response: { response: { neverError: true } } },
  },
  id: `claim-pedido-${Date.now().toString(36)}`,
  name: "Supabase Claim Pedido",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [campos.position[0] + 448, y],
  alwaysOutputData: true,
  credentials: structuredClone(buscar.credentials || {}),
});

// É Pedido Pago? — defesa adicional; o preparador hard só emite modo pago.
wf.nodes.push({
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
      conditions: [
        {
          id: "f6p1",
          leftValue: "={{ $json.modo }}",
          rightValue: "pago",
          operator: { type: "string", operation: "equals" },
        },
      ],
      combinator: "and",
    },
    options: {},
  },
  id: `e-pago-${Date.now().toString(36)}`,
  name: "É Pedido Pago?",
  type: "n8n-nodes-base.if",
  typeVersion: 2.2,
  position: [campos.position[0] + 336, y],
});

// Pedido Válido? — gate: só segue com linha do pedido (claim venceu).
wf.nodes.push({
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
      conditions: [
        {
          id: "f6v1",
          leftValue: "={{ $json.id }}",
          rightValue: 0,
          operator: { type: "string", operation: "notEmpty", singleValue: true },
        },
      ],
      combinator: "and",
    },
    options: {},
  },
  id: `ped-ok-${Date.now().toString(36)}`,
  name: "Pedido Válido?",
  type: "n8n-nodes-base.if",
  typeVersion: 2.2,
  position: [campos.position[0] + 560, y],
});

// Ramo Pedido Pago — reconstrói o contexto do briefing e anexa o pedido.
wf.nodes.push({
  parameters: { jsCode: lerNode("src/n8n-patches/onboarding-pedido-valido-true.js") },
  id: `ramo-pago-${Date.now().toString(36)}`,
  name: "Ramo Pedido Pago",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [campos.position[0] + 784, y],
});

// ── 3. rewire ─────────────────────────────────────────────────────────────
const conn = wf.connections;

// Campos Obrigatórios OK? out0 → Preparar Claim (antes: Buscar Clínica)
conn["Campos Obrigatórios OK?"].main[0] = [
  { node: "Preparar Claim", type: "main", index: 0 },
];

// Preparar Claim → É Pedido Pago?
conn["Preparar Claim"] = {
  main: [[{ node: "É Pedido Pago?", type: "main", index: 0 }]],
};

// É Pedido Pago? out0 (pago) → Supabase Claim Pedido
//                    out1 → Falha Claim Pedido (fail-closed)
conn["É Pedido Pago?"] = {
  main: [
    [{ node: "Supabase Claim Pedido", type: "main", index: 0 }],
    [{ node: "Falha Claim Pedido", type: "main", index: 0 }],
  ],
};

// Claim Pedido → Pedido Válido?
conn["Supabase Claim Pedido"] = {
  main: [[{ node: "Pedido Válido?", type: "main", index: 0 }]],
};

// Pedido Válido? out0 (true) → Ramo Pedido Pago
//                 out1 (false) → Alerta: falha silenciosa? Não: fail-loud.
// Um pedido em 'pago' que não vence o claim = duplicado ou inconsistente.
// Conforme desenho: o operador precisa saber (Error Workflow), não é
// dead-end silencioso — mas também não pode derrubar o briefing de trial.
// Como este ramo SÓ existe no modo pago, lançar erro aqui é seguro.
conn["Pedido Válido?"] = {
  main: [
    [{ node: "Ramo Pedido Pago", type: "main", index: 0 }],
    [{ node: "Falha Claim Pedido", type: "main", index: 0 }],
  ],
};

// Ramo Pedido Pago → Gerar ia_config
conn["Ramo Pedido Pago"] = {
  main: [[{ node: "Gerar ia_config", type: "main", index: 0 }]],
};

// ── Falha Claim Pedido — alerta legível ao operador (padrão de alerta) ────
// Usa o mesmo formato dos alerts existentes (UazAPI) se possível; aqui
// simplificamos: HTTP GET num endpoint de alerta não existe — usamos o Code
// node que lança erro com mensagem clara (o Error Workflow alerta o dono).
wf.nodes.push({
  parameters: {
    jsCode: [
      "// F6 — claim venceu mas o PATCH não casou: pedido não estava 'pago'",
      "// (duplicado? expirado? inconsistência). Fail-loud: o Error Workflow",
      "// alerta o operador. Nada provisiona de graça.",
      'const anterior = $("Preparar Claim").first().json;',
      'throw new Error(',
      '  "F6_CLAIM_FALHOU: pedido " + (anterior.pedido_id || "?") +',
      '    " não confirmou claim (status != pago ou já provisionado). Investigar antes de reprocessar.",',
      ');',
    ].join("\n"),
  },
  id: `falha-claim-${Date.now().toString(36)}`,
  name: "Falha Claim Pedido",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [campos.position[0] + 784, y + 220],
});

// Compensação sem delete de banco: qualquer falha libera o claim para retry.
wf.nodes.push({
  parameters: {
    method: "PATCH",
    url: "={{ $('Config Fixa').item.json.supabase_url + '/rest/v1/pedidos?id=eq.' + $('Preparar Claim').first().json.pedido_id + '&status=eq.provisionando' }}",
    authentication: "predefinedCredentialType",
    nodeCredentialType: "supabaseApi",
    sendHeaders: true,
    headerParameters: { parameters: [{ name: "Prefer", value: "return=representation" }] },
    sendBody: true,
    specifyBody: "json",
    jsonBody: "={{ JSON.stringify({ status: 'pago', provisionando_em: null }) }}",
    options: {},
  },
  id: `liberar-pedido-${Date.now().toString(36)}`,
  name: "Liberar Pedido para Retry",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [campos.position[0] + 1920, y + 420],
  credentials: structuredClone(buscar.credentials || {}),
});
wf.nodes.push({
  parameters: { jsCode: 'throw new Error("F6_PROVISIONAMENTO_COMPENSADO: pedido devolvido a pago para retry")' },
  id: `falha-compensada-${Date.now().toString(36)}`,
  name: "Falha Provisionamento Compensada",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [campos.position[0] + 2144, y + 420],
});
wf.nodes.push({
  parameters: {
    method: "PATCH",
    url: "={{ $('Config Fixa').item.json.supabase_url + '/rest/v1/pedidos?id=eq.' + $('Preparar Claim').first().json.pedido_id + '&status=eq.provisionando' }}",
    authentication: "predefinedCredentialType",
    nodeCredentialType: "supabaseApi",
    sendHeaders: true,
    headerParameters: { parameters: [{ name: "Prefer", value: "return=representation" }] },
    sendBody: true,
    specifyBody: "json",
    jsonBody: "={{ JSON.stringify({ status: 'provisionado', provisionado_em: new Date().toISOString(), clinica_id: $('Supabase Inserir Clínica').first().json.id }) }}",
    options: {},
  },
  id: `finalizar-pedido-${Date.now().toString(36)}`,
  name: "Finalizar Pedido Provisionado",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [campos.position[0] + 2144, y],
  credentials: structuredClone(buscar.credentials || {}),
});

conn["Liberar Pedido para Retry"] = { main: [[{ node: "Falha Provisionamento Compensada", type: "main", index: 0 }]] };
conn["Deletar Instância Órfã UazAPI"] = {
  main: [
    [{ node: "Liberar Pedido para Retry", type: "main", index: 0 }],
    [{ node: "Liberar Pedido para Retry", type: "main", index: 0 }],
  ],
};
for (const nome of ["UazAPI Configurar Webhook IN", "UazAPI Configurar Webhook OUT", "Supabase Inserir Clínica", "UazAPI Gerar Código Pareamento", "Enviar Código Pareamento"]) {
  const node = wf.nodes.find((n) => n.name === nome);
  if (node) node.onError = "continueErrorOutput";
  if (conn[nome]?.main?.[1]) conn[nome].main[1] = [{ node: "Deletar Instância Órfã UazAPI", type: "main", index: 0 }];
}
const gerarIa = wf.nodes.find((n) => n.name === "Gerar ia_config");
gerarIa.onError = "continueErrorOutput";
conn["Gerar ia_config"].main[1] = [{ node: "Liberar Pedido para Retry", type: "main", index: 0 }];
for (const nome of ["Extrair ia_config", "UazAPI Criar Instância"]) {
  const node = wf.nodes.find((n) => n.name === nome);
  node.onError = "continueErrorOutput";
  conn[nome].main[1] = [{ node: "Liberar Pedido para Retry", type: "main", index: 0 }];
}
for (const nome of ["Limitar Resposta Webhook OUT", "Montar JSON Body"]) {
  const node = wf.nodes.find((n) => n.name === nome);
  node.onError = "continueErrorOutput";
  conn[nome].main[1] = [{ node: "Deletar Instância Órfã UazAPI", type: "main", index: 0 }];
}
conn["Instância Criada OK?"].main[1] = [{ node: "Liberar Pedido para Retry", type: "main", index: 0 }];
const alertaSucesso = wf.nodes.find((n) => n.name === "Alerta: Sucesso");
alertaSucesso.onError = "continueErrorOutput";
conn["Alerta: Sucesso"] = {
  main: [
    [{ node: "Finalizar Pedido Provisionado", type: "main", index: 0 }],
    [{ node: "Finalizar Pedido Provisionado", type: "main", index: 0 }],
  ],
};
const finalizarPedido = wf.nodes.find((n) => n.name === "Finalizar Pedido Provisionado");
finalizarPedido.retryOnFail = true;
finalizarPedido.maxTries = 3;
finalizarPedido.waitBetweenTries = 2000;

// ── 4. pedido_id propagando pelo briefing: submit.js já espalha o body ───
// (verificado: src/api/submit.js faz ...bruto no payload; nada a mudar aqui.)

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
const nomesNovos = ["Preparar Claim", "É Pedido Pago?", "Supabase Claim Pedido", "Pedido Válido?", "Ramo Pedido Pago", "Falha Claim Pedido"];
for (const nm of nomesNovos) {
  if (!depois.nodes.some((n) => n.name === nm)) {
    console.error(`ERRO: node ${nm} não está no ar.`);
    falhou = true;
  }
}
const c = depois.connections;
if (c["Campos Obrigatórios OK?"]?.main?.[0]?.[0]?.node !== "Preparar Claim") {
  console.error("ERRO: Campos Obrigatórios OK? não alimenta Preparar Claim.");
  falhou = true;
}
if (c["É Pedido Pago?"]?.main?.[1]?.[0]?.node !== "Falha Claim Pedido") {
  console.error("ERRO: ramo não pago não está fail-closed.");
  falhou = true;
}
const claimUrl = depois.nodes.find((n) => n.name === "Supabase Claim Pedido")?.parameters?.url || "";
const prepararCode = depois.nodes.find((n) => n.name === "Preparar Claim")?.parameters?.jsCode || "";
if (!claimUrl.includes("claim_url") || !prepararCode.includes("status=eq.pago")) {
  console.error("ERRO: claim sem status=eq.pago (não é atômico contra reprocesso).");
  falhou = true;
}
console.log("");
console.log(`Publicado. versionId=${depois.versionId} activeVersionId=${depois.activeVersionId}`);
console.log(falhou ? "FALHOU na prova." : "PROVA OK: claim atômico no Onboarding no ar.");
process.exit(falhou ? 1 : 0);
