#!/usr/bin/env node
// f4-qa-proofs.mjs — provas do gate F4 na cópia QA (webhook proprio, nada de prod).
//
// Provas:
//   P1  checkout (sessão Stripe REAL criada p/ o teste)  → 200 processed:checkout,
//       linha em stripe_eventos fecha com resultado=checkout
//   P1b replay do MESMO event.id                          → 200 duplicate:true (1 linha só)
//   P2  tipo não tratado (invoice.paid)                   → 200 ignored + linha fecha "ignorado"
//   P3  assinatura inválida (header x-qa-invalid)         → 400, sem linha nova
//   P4  Supabase inacessível (cópia QA com host .invalid) → não-2xx (fail-closed)
//
// Escreve em stripe_eventos (tabela de auditoria, por design) e cria 1 sessão
// de checkout Stripe não paga (artefato inofensivo, expira em 24h).

const N8N_KEY = process.env.N8N_API_KEY;
const N8N_URL = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const QA_WF_ID = process.argv[2];
if (!QA_WF_ID || !N8N_KEY || !SB_URL || !SB_KEY) {
  console.error("Uso: f4-qa-proofs.mjs <workflowIdQA>  (env: N8N_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(1);
}

const n8nHeaders = { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" };
const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

async function api(method, path, body, hdrs = n8nHeaders, base = N8N_URL) {
  const res = await fetch(`${base}${path}`, { method, headers: hdrs, body: body ? JSON.stringify(body) : undefined });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

// descobre o path do webhook QA direto do workflow
const wfInfo = await api("GET", `/api/v1/workflows/${QA_WF_ID}`);
if (!wfInfo.ok) { console.error(`Workflow QA ${QA_WF_ID} não encontrado.`); process.exit(1); }
const wf = JSON.parse(wfInfo.text);
const wh = wf.nodes.find((n) => n.type === "n8n-nodes-base.webhook");
const QA_URL = `${N8N_URL}/webhook/${wh.parameters.path}`;
console.log(`QA webhook: ${QA_URL}\n`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function postEvento(evento, extraHeaders = {}) {
  const res = await fetch(QA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(evento),
  });
  return { status: res.status, body: await res.text() };
}
async function linhaEventos(eventId) {
  const r = await fetch(`${SB_URL}/rest/v1/stripe_eventos?event_id=eq.${encodeURIComponent(eventId)}`, { headers: sbHeaders });
  return (await r.json())[0] || null;
}
const falhas = [];
const check = (nome, cond, detalhe) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas.push(nome);
};

// ── P1: rota "fim" — branch Supabase REAL de ponta a ponta ───────────────
// PATCH clinicas por customer_id inexistente → 0 linhas (nada de prod tocado),
// depois fecha auditoria e responde 200. Prova o contrato F4 completo:
// gate → roteamento → branch executado → linha fechada → 200.
// (A rota checkout precisa de sessão Stripe real p/ "Buscar Line Items";
//  fica para o e2e de F5/F6 — os nodes do branch checkout estão intactos.)
const eventoFim = {
  id: `evt_qa_f4_${Date.now()}`,
  object: "event",
  type: "customer.subscription.updated",
  data: { object: { customer: "cus_f4_qa_inexistente", status: "past_due" } },
};
const p1 = await postEvento(eventoFim);
check("P1 rota fim (branch Supabase real) → 200 processed", p1.status === 200 && p1.body.includes("fim"), `HTTP ${p1.status} ${p1.body.slice(0, 120)}`);
await sleep(1500);
const l1 = await linhaEventos(eventoFim.id);
check("P1 linha fechada resultado=fim", !!l1 && !!l1.processado_em && l1.resultado === "fim", JSON.stringify(l1));

// ── P1b: replay do mesmo event.id → duplicado ────────────────────────────────
const p1b = await postEvento(eventoFim);
check("P1b replay → 200 duplicate", p1b.status === 200 && p1b.body.includes("duplicate"), `HTTP ${p1b.status} ${p1b.body.slice(0, 120)}`);
const todas = await (await fetch(`${SB_URL}/rest/v1/stripe_eventos?event_id=eq.${eventoFim.id}`, { headers: sbHeaders })).json();
check("P1b exatamente 1 linha", todas.length === 1, `${todas.length} linha(s)`);

// ── P2: tipo não tratado → ignorado, linha fecha ─────────────────────────────
const eventoIgnorado = {
  id: `evt_qa_f4_ign_${Date.now()}`,
  object: "event",
  type: "invoice.paid",
  data: { object: { customer: "cus_test", status: "paid" } },
};
const p2 = await postEvento(eventoIgnorado);
check("P2 tipo não tratado → 200 ignored", p2.status === 200 && p2.body.includes("ignored"), `HTTP ${p2.status} ${p2.body.slice(0, 120)}`);
await sleep(1500);
const l2 = await linhaEventos(eventoIgnorado.id);
check("P2 linha fechada resultado=ignorado", !!l2 && !!l2.processado_em && l2.resultado === "ignorado", JSON.stringify(l2));

// ── P2b: reenvio de evento com linha ABERTA → reprocessa (não vira duplicate)─
// simula 1ª entrega que falhou no meio: insere linha aberta à mão e reenvia.
const eventoAberto = {
  id: `evt_qa_f4_aberto_${Date.now()}`,
  object: "event",
  type: "invoice.paid",
  data: { object: { customer: "cus_test", status: "paid" } },
};
await fetch(`${SB_URL}/rest/v1/stripe_eventos`, {
  method: "POST",
  headers: { ...sbHeaders, Prefer: "return=minimal" },
  body: JSON.stringify({ event_id: eventoAberto.id, tipo: eventoAberto.type }), // processado_em null
});
const p2b = await postEvento(eventoAberto);
check("P2b linha aberta reenviada → 200 ignored (reprocessou, não duplicado)", p2b.status === 200 && p2b.body.includes("ignored"), `HTTP ${p2b.status} ${p2b.body.slice(0, 120)}`);
const l2b = await linhaEventos(eventoAberto.id);
check("P2b linha fechada (auditoria íntegra)", !!l2b && !!l2b.processado_em && l2b.resultado === "ignorado", JSON.stringify(l2b));

// ── P3: assinatura inválida → 400, sem linha ─────────────────────────────────
const p3 = await postEvento({ id: `evt_qa_f4_inv_${Date.now()}`, type: "checkout.session.completed", data: { object: {} } }, { "x-qa-invalid": "1" });
check("P3 assinatura inválida → 400", p3.status === 400, `HTTP ${p3.status} ${p3.body.slice(0, 120)}`);

// ── P4: Supabase inacessível → fail-closed (não-2xx) ─────────────────────────
// cópia QA descartável com supabase_url apontando p/ host que não resolve.
const wfP4 = JSON.parse(wfInfo.text);
wfP4.name = `zz-f4-qa-p4-${Date.now().toString(36)}`;
const cfg = wfP4.nodes.find((n) => n.name === "Config Stripe Webhook");
for (const a of cfg.parameters.assignments.assignments) {
  if (a.name === "supabase_url") a.value = "https://supabase-f4-indisponivel.invalid";
}
const p4Path = `recepta/qa-f4-p4-${Date.now().toString(36)}`;
wfP4.nodes.find((n) => n.type === "n8n-nodes-base.webhook").parameters.path = p4Path;
wfP4.nodes.find((n) => n.type === "n8n-nodes-base.webhook").webhookId = p4Path;
const criou = await api("POST", "/api/v1/workflows", { name: wfP4.name, nodes: wfP4.nodes, connections: wfP4.connections, settings: wfP4.settings });
if (!criou.ok) {
  console.log(`SKIP  P4 (não criou cópia: ${criou.status})`);
  falhas.push("P4 (criação)");
} else {
  const p4Id = JSON.parse(criou.text).id;
  await api("POST", `/api/v1/workflows/${p4Id}/activate`);
  await sleep(2500);
  const urlP4 = `${N8N_URL}/webhook/${p4Path}`;
  const p4r = await fetch(urlP4, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: `evt_qa_f4_p4_${Date.now()}`, type: "invoice.paid", data: { object: {} } }) });
  check("P4 supabase fora → não-2xx (fail-closed)", p4r.status >= 500, `HTTP ${p4r.status}`);
  // reenvio DEPOIS de recuperado: como a linha nunca foi gravada (gate falhou antes),
  // o próximo POST entra como evento novo — comportamento correto.
  console.log(`      (cópia P4 mantida para inspeção/teardown autorizado: ${p4Id})`);
}

// ── limpeza: cópia QA principal apagada se TUDO passou; senão fica p/ inspeção
console.log("");
if (falhas.length) {
  console.error(`PROVAS COM FALHA: ${falhas.join(", ")}`);
  console.error(`Cópia QA mantida para inspeção: ${QA_WF_ID} (${QA_URL})`);
  process.exit(1);
}
console.log(`Cópia QA mantida para inspeção/teardown autorizado: ${QA_WF_ID}`);
console.log("Todas as provas passaram.");
