#!/usr/bin/env node
// f4-zz-settings-probe.mjs — decide a semântica de settings no PUT da API do n8n
// nesta instância, com workflows descartáveis zz-* (criados e apagados aqui).
//
// Perguntas que definem se o PUT em produção é seguro:
//   Q1. POST aceita settings.binaryMode? (AGENTS.md diz que o schema rejeita)
//   Q2. PUT com settings parciais FAZ MERGE (preserva chaves existentes)
//       ou SUBSTITUI (apaga o que não foi mandado)?
//   Q3. PUT aceita settings.binaryMode direto?
//
// Resultado decide como o patch do F4 envia settings no PUT. Nada toca produção.

const N8N_KEY = process.env.N8N_API_KEY;
const N8N_URL = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
if (!N8N_KEY) {
  console.error("Falta N8N_API_KEY.");
  process.exit(1);
}
const H = { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" };

async function api(method, path, body) {
  const res = await fetch(`${N8N_URL}${path}`, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await res.text();
  let json = null;
  try { json = JSON.parse(texto); } catch {}
  return { status: res.status, ok: res.ok, json, texto };
}

const tag = Date.now().toString(36);
let id = null;

try {
  // ── cria workflow com settings cheios (inclusive binaryMode via POST?) ──
  const wf = {
    name: `zz-f4-settings-probe-${tag} (apagar)`,
    settings: { executionOrder: "v1", binaryMode: "separate" },
    nodes: [
      {
        name: "Manual",
        type: "n8n-nodes-base.manualTrigger",
        typeVersion: 1,
        position: [0, 0],
        parameters: {},
      },
      {
        name: "Noop",
        type: "n8n-nodes-base.noOp",
        typeVersion: 1,
        position: [200, 0],
        parameters: {},
      },
    ],
    connections: { Manual: { main: [[{ node: "Noop", type: "main", index: 0 }]] } },
  };
  const criado = await api("POST", "/api/v1/workflows", wf);
  console.log(`Q1 POST com binaryMode -> HTTP ${criado.status}`);
  if (!criado.ok) {
    console.log(`   erro: ${criado.texto.slice(0, 300)}`);
    // cria sem binaryMode para continuar
    wf.settings = { executionOrder: "v1" };
    const c2 = await api("POST", "/api/v1/workflows", wf);
    if (!c2.ok) throw new Error("nem sem binaryMode criou");
    console.log("   (criado sem binaryMode para prosseguir)");
    id = c2.json.id;
  } else {
    id = criado.json.id;
    console.log(`   binaryMode salvo? ${JSON.stringify(criado.json.settings)}`);
  }

  // ── base: coloca uma chave extra via PUT completo (para ter o que perder) ──
  const g1 = await api("GET", `/api/v1/workflows/${id}`);
  const baseSettings = g1.json.settings;
  console.log(`settings iniciais: ${JSON.stringify(baseSettings)}`);

  const put1 = await api("PUT", `/api/v1/workflows/${id}`, {
    name: wf.name,
    nodes: g1.json.nodes,
    connections: g1.json.connections,
    settings: { ...baseSettings, timezone: "America/Sao_Paulo" },
  });
  console.log(`PUT adicionando timezone -> HTTP ${put1.status}`);
  if (!put1.ok) console.log(`   erro: ${put1.texto.slice(0, 300)}`);
  else console.log(`   depois: ${JSON.stringify(put1.json.settings)}`);

  // ── Q2: PUT com settings PARCIAIS (só executionOrder) — perde timezone? ──
  const g2 = await api("GET", `/api/v1/workflows/${id}`);
  const put2 = await api("PUT", `/api/v1/workflows/${id}`, {
    name: wf.name,
    nodes: g2.json.nodes,
    connections: g2.json.connections,
    settings: { executionOrder: "v1" },
  });
  console.log(`Q2 PUT com settings parciais (só executionOrder) -> HTTP ${put2.status}`);
  if (!put2.ok) console.log(`   erro: ${put2.texto.slice(0, 300)}`);
  else {
    const depois = put2.json.settings || {};
    console.log(`   settings depois: ${JSON.stringify(depois)}`);
    console.log(
      depois.timezone === "America/Sao_Paulo"
        ? "   VEREDITO Q2: MERGE (timezone sobreviveu)"
        : "   VEREDITO Q2: SUBSTITUI (timezone sumiu) — produção DEVE mandar settings completas",
    );
  }

  // ── Q3: PUT aceita binaryMode direto? ──
  const g3 = await api("GET", `/api/v1/workflows/${id}`);
  const put3 = await api("PUT", `/api/v1/workflows/${id}`, {
    name: wf.name,
    nodes: g3.json.nodes,
    connections: g3.json.connections,
    settings: { ...g3.json.settings, binaryMode: "separate" },
  });
  console.log(`Q3 PUT com binaryMode -> HTTP ${put3.status}`);
  if (!put3.ok) console.log(`   erro: ${put3.texto.slice(0, 300)}`);
  else console.log(`   settings depois: ${JSON.stringify(put3.json.settings)}`);
} finally {
  if (id) {
    const del = await api("DELETE", `/api/v1/workflows/${id}`);
    console.log(`cleanup zz-probe ${id}: HTTP ${del.status}`);
  }
}
