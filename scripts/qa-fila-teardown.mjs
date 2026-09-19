// Teardown da bateria QA da fila. IRREVERSIVEL -- rodar so com autorizacao
// explicita do usuario (dada em 2026-09-11).
//
// Remove, nesta ordem:
//   1. workflow BSfSGponuUhJRJsH  ([QA] Atendimento - Fila E2E) + seu webhook
//   2. workflow dy0LStLE2xhTRt0S  ([QA] Criar Agendamento - Fila E2E)
//   3. clinica sintetica zz-qa-fila-7f3c e todo dado preso a ela
//
// O caller vai antes do subworkflow: apagar o subworkflow primeiro deixaria o
// Atendimento QA com referencia quebrada durante a janela entre os dois DELETEs.
//
// NAO toca em producao, cron, Stripe, aliases nem UazAPI. Faz backup dos dois
// workflows antes de apagar, porque depois do DELETE nao ha de onde recuperar.
//
// Uso: node scripts/qa-fila-teardown.mjs
// Env: N8N_BASE_URL, N8N_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Por NOME, nunca por id: recriar as copias gera ids novos, e id hardcoded aqui
// significaria "apagou" um workflow que ja nao existia enquanto o novo fica de
// pe -- o pior resultado possivel para um teardown.
const QA_ATENDIMENTO_NOME =
  "[QA] Atendimento - Fila E2E (nao usar em producao)";
const QA_AGENDAMENTO_NOME =
  "[QA] Criar Agendamento - Fila E2E (nao usar em producao)";
const CLINICA_NOME = "zz-qa-fila-7f3c";
const HOOK = "qa/qafila7f3c/in";

// Estado que producao tinha ANTES desta bateria. Se nao bater no fim, algo
// escapou do isolamento e o teardown tem de gritar.
const PROD_ESPERADO = {
  cxn5FxUNMJmlJ1WJ: "e628e2c4-9c77-4ee4-9206-fa55b65d4d74",
  DxCGAEmTMS6sU1qK: "d9dde35d-81d2-442e-b656-592467f67225",
};

const n8n = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(
  /\/$/,
  "",
);
const NH = {
  "X-N8N-API-KEY": process.env.N8N_API_KEY,
  "Content-Type": "application/json",
};
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SH = {
  apikey: SK,
  Authorization: `Bearer ${SK}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function api(method, path, { tolerar = [] } = {}) {
  const r = await fetch(n8n + path, { method, headers: NH });
  const t = await r.text();
  if (!r.ok && !tolerar.includes(r.status)) {
    throw new Error(`${method} ${path} -> ${r.status} ${t.slice(0, 300)}`);
  }
  return { status: r.status, body: t ? JSON.parse(t) : null };
}

async function sb(path, init = {}) {
  const r = await fetch(SB + "/rest/v1" + path, {
    ...init,
    headers: { ...SH, ...(init.headers || {}) },
  });
  const t = await r.text();
  let j = null;
  try {
    j = t ? JSON.parse(t) : null;
  } catch {
    j = t;
  }
  return { status: r.status, body: j };
}

const passos = [];
const registrar = (passo, ok, detalhe) => {
  passos.push({ passo, ok: Boolean(ok), detalhe });
  console.log(
    `${ok ? "OK   " : "FALHA"} | ${passo}${detalhe ? ` -- ${detalhe}` : ""}`,
  );
};

// ---- 1. Backup antes de qualquer DELETE ----------------------------------
const dir = resolve("tmp-backup-workflows-deletados");
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backups = [];
const { body: listaInicial } = await api("GET", "/api/v1/workflows?limit=250");
const acharId = (nome) =>
  (listaInicial.data || []).find((w) => w.name === nome)?.id || null;
const QA_ATENDIMENTO = acharId(QA_ATENDIMENTO_NOME);
const QA_AGENDAMENTO = acharId(QA_AGENDAMENTO_NOME);
// Nao e falha se ja estiverem ausentes: o teardown tem de ser idempotente.
registrar(
  "copias QA localizadas por nome",
  true,
  `atendimento=${QA_ATENDIMENTO || "ausente"} agendamento=${QA_AGENDAMENTO || "ausente"}`,
);

for (const [rotulo, id] of [
  ["Atendimento QA", QA_ATENDIMENTO],
  ["Criar Agendamento QA", QA_AGENDAMENTO],
]) {
  if (!id) {
    registrar(`backup de ${rotulo}`, true, "ja ausente, nada a salvar");
    continue;
  }
  const { body } = await api("GET", `/api/v1/workflows/${id}`);
  const arquivo = join(dir, `${id}-QA-DELETADO-${stamp}.json`);
  writeFileSync(arquivo, JSON.stringify(body, null, 2));
  backups.push(arquivo);
  registrar(`backup de ${rotulo} (${body.nodes.length} nodes)`, true, arquivo);
}

// ---- 2. Dados da clinica sintetica ---------------------------------------
const { body: clinicas } = await sb(
  `/clinicas?clinica=eq.${CLINICA_NOME}&select=id`,
);
const clinicaId = clinicas?.[0]?.id || null;
registrar(
  "clinica QA localizada",
  Boolean(clinicaId),
  clinicaId || "ja ausente",
);

if (clinicaId) {
  for (const [rotulo, path] of [
    ["agendamentos", `/agendamentos?clinica_id=eq.${clinicaId}`],
    ["fila_espera", `/fila_espera?clinica_id=eq.${clinicaId}`],
    ["conversas", `/conversas?clinica=eq.${CLINICA_NOME}`],
    ["mensagens_pendentes", `/mensagens_pendentes?clinica=eq.${CLINICA_NOME}`],
    ["pausas_ia", `/pausas_ia?clinica=eq.${CLINICA_NOME}`],
    ["convites_clinica", `/convites_clinica?clinica_id=eq.${clinicaId}`],
  ]) {
    const r = await sb(path, { method: "DELETE" });
    registrar(
      `dados QA removidos: ${rotulo}`,
      r.status < 300,
      `${r.status}, ${Array.isArray(r.body) ? r.body.length : 0} linha(s)`,
    );
  }
}

// ---- 3. Workflows QA: desativar, depois apagar ---------------------------
// Caller primeiro: nao deixar o Atendimento QA apontando para um subworkflow
// que ja nao existe, nem que seja por um instante.
for (const [rotulo, id] of [
  ["Atendimento QA", QA_ATENDIMENTO],
  ["Criar Agendamento QA", QA_AGENDAMENTO],
]) {
  if (!id) {
    registrar(`${rotulo} ja ausente`, true, "nada a apagar");
    continue;
  }
  const off = await api("POST", `/api/v1/workflows/${id}/deactivate`, {
    tolerar: [400, 404],
  });
  registrar(`${rotulo} desativado`, off.status < 500, `HTTP ${off.status}`);
  const del = await api("DELETE", `/api/v1/workflows/${id}`, {
    tolerar: [404],
  });
  registrar(
    `${rotulo} apagado (${id})`,
    del.status === 200,
    `HTTP ${del.status}`,
  );
  const conf = await api("GET", `/api/v1/workflows/${id}`, { tolerar: [404] });
  registrar(
    `${rotulo} confirmado ausente`,
    conf.status === 404,
    `HTTP ${conf.status}`,
  );
}

// ---- 4. Webhook QA tem de estar morto ------------------------------------
const hook = await fetch(`${n8n}/webhook/${HOOK}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ teardown: true }),
});
registrar(
  "webhook QA nao responde mais",
  hook.status === 404,
  `HTTP ${hook.status}`,
);

// ---- 5. Clinica sintetica ------------------------------------------------
if (clinicaId) {
  const del = await sb(`/clinicas?id=eq.${clinicaId}`, { method: "DELETE" });
  registrar(
    `clinica QA apagada (${clinicaId})`,
    del.status < 300,
    `HTTP ${del.status}`,
  );
  const conf = await sb(`/clinicas?clinica=eq.${CLINICA_NOME}&select=id`);
  registrar(
    "clinica QA confirmada ausente",
    Array.isArray(conf.body) && conf.body.length === 0,
    JSON.stringify(conf.body),
  );
}

// ---- 6. Producao intacta -------------------------------------------------
for (const [id, esperado] of Object.entries(PROD_ESPERADO)) {
  const { body } = await api("GET", `/api/v1/workflows/${id}`);
  registrar(
    `producao ${id} com versionId original`,
    body.versionId === esperado && body.active === true,
    `versionId ${body.versionId} | active ${body.active}`,
  );
}

// ---- 7. Nada com o prefixo desta bateria sobrou --------------------------
const { body: lista } = await api("GET", "/api/v1/workflows?limit=250");
const sobrou = (lista.data || []).filter((w) =>
  /^\[QA\] .*Fila E2E/.test(w.name),
);
registrar(
  "nenhum workflow desta bateria remanescente",
  sobrou.length === 0,
  sobrou.map((w) => w.id).join(", "),
);

const falhas = passos.filter((p) => !p.ok);
const arquivo = join(resolve("tmp-qa-fila-e2e"), `teardown-${stamp}.json`);
mkdirSync(resolve("tmp-qa-fila-e2e"), { recursive: true });
writeFileSync(arquivo, JSON.stringify({ backups, passos }, null, 2), "utf8");

console.log(
  `\n===== ${passos.length - falhas.length}/${passos.length} OK =====`,
);
console.log(`evidencia: ${arquivo}`);
process.exit(falhas.length ? 1 : 0);
