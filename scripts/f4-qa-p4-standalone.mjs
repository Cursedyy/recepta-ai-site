#!/usr/bin/env node
// f4-qa-p4-standalone.mjs — prova P4 isolada: Supabase inacessível → fail-closed.
// Cria cópia QA com supabase_url apontando p/ host inválido, espera a ativação
// real (poll no GET), POSTa o evento, mostra status/duração, lê a execução
// (trace) e SÓ ENTÃO apaga a cópia.

const N8N_KEY = process.env.N8N_API_KEY;
const N8N_URL = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
const QA_WF_ID = process.argv[2];
if (!QA_WF_ID || !N8N_KEY) { console.error("Uso: f4-qa-p4-standalone.mjs <workflowIdQA>"); process.exit(1); }

const headers = { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" };
async function api(method, path, body) {
  const res = await fetch(`${N8N_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

const info = await api("GET", `/api/v1/workflows/${QA_WF_ID}`);
const wf = JSON.parse(info.text);
wf.name = `zz-f4-qa-p4-${Date.now().toString(36)}`;
const cfg = wf.nodes.find((n) => n.name === "Config Stripe Webhook");
for (const a of cfg.parameters.assignments.assignments) {
  if (a.name === "supabase_url") a.value = "https://supabase-f4-indisponivel.invalid";
}
const p4Path = `recepta/qa-f4-p4-${Date.now().toString(36)}`;
const wh = wf.nodes.find((n) => n.type === "n8n-nodes-base.webhook");
wh.parameters.path = p4Path; wh.webhookId = p4Path;

const criou = await api("POST", "/api/v1/workflows", { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings });
if (!criou.ok) { console.error("criação falhou:", criou.status, criou.text.slice(0, 300)); process.exit(1); }
const p4Id = JSON.parse(criou.text).id;
const act = await api("POST", `/api/v1/workflows/${p4Id}/activate`);
console.log(`cópia P4: ${p4Id} | activate: ${act.status}`);

// espera ATIVAÇÃO REAL (active=true na leitura)
let ativo = false;
for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const g = await api("GET", `/api/v1/workflows/${p4Id}`);
  if (g.ok && JSON.parse(g.text).active) { ativo = true; break; }
}
console.log(`ativação real: ${ativo ? "ok" : "NÃO confirmada"}`);
await new Promise((r) => setTimeout(r, 1500));

const t0 = Date.now();
const r = await fetch(`${N8N_URL}/webhook/${p4Path}`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id: `evt_qa_f4_p4_${Date.now()}`, type: "invoice.paid", data: { object: {} } }),
});
const corpo = await r.text();
console.log(`P4 POST → HTTP ${r.status} em ${((Date.now() - t0) / 1000).toFixed(1)}s | body: ${corpo.slice(0, 120) || "(vazio)"}`);

// trace da execução ANTES de apagar a cópia
const ex = await api("GET", `/api/v1/executions?workflowId=${p4Id}&limit=2&includeData=true`);
if (ex.ok) {
  const j = JSON.parse(ex.text);
  for (const e of (j.data || []).slice(0, 1)) {
    console.log(`exec ${e.id} | status: ${e.status}`);
    const rd = e.data?.resultData;
    if (rd?.error) console.log("  WF ERROR:", JSON.stringify(rd.error).slice(0, 200));
    for (const [nome, runs] of Object.entries(rd?.runData || {})) {
      for (const run of runs) {
        const err = run.error ? JSON.stringify(run.error).slice(0, 150) : "";
        const items = (run.data?.main || []).map((b) => (b ? b.length : 0)).join("/");
        console.log("   ", nome, "| out:", items, err ? "| ERR:" + err : "");
      }
    }
  }
} else console.log("(sem execução recuperável)", ex.status);

console.log(`cópia P4 mantida para inspeção/teardown autorizado: ${p4Id}`);
process.exit(r.status >= 500 ? 0 : 1);
