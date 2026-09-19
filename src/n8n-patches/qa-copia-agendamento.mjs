// Cria/atualiza a COPIA QA do subworkflow "Criar Agendamento"
// (DxCGAEmTMS6sU1qK) e aponta a copia QA do Atendimento para ela.
//
// Por que: o "Criar Agendamento" produtivo termina chamando o workflow
// "Sheets Pos-Commit", que NAO e gated por spreadsheet_id -- ele monta a URL do
// Google Sheets com o id da clinica seja ele qual for e dispara a requisicao.
// Com a clinica sintetica (spreadsheet_id null) isso seria uma chamada real ao
// sheets.googleapis.com com "null" no caminho. Nao e destrutivo, mas quebra a
// regra de isolamento desta bateria, entao a copia QA corta esse ramo.
//
// Uso: node src/n8n-patches/qa-copia-agendamento.mjs
// Env: N8N_BASE_URL, N8N_API_KEY

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PROD_AGENDA = "DxCGAEmTMS6sU1qK";
const QA_ATENDIMENTO_NOME =
  "[QA] Atendimento - Fila E2E (nao usar em producao)";
const QA_NAME = "[QA] Criar Agendamento - Fila E2E (nao usar em producao)";

const base = (
  process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br"
).replace(/\/$/, "");
const key = process.env.N8N_API_KEY;
if (!key) throw new Error("N8N_API_KEY ausente");
const H = { "X-N8N-API-KEY": key, "Content-Type": "application/json" };

async function api(method, path, body) {
  const r = await fetch(base + path, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok)
    throw new Error(`${method} ${path} -> ${r.status} ${t.slice(0, 500)}`);
  return t ? JSON.parse(t) : {};
}

const prod = await api("GET", `/api/v1/workflows/${PROD_AGENDA}`);
const dir = resolve("tmp-backup-workflows-deletados");
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = join(dir, `${PROD_AGENDA}-fonte-copia-qa-${stamp}.json`);
writeFileSync(backup, JSON.stringify(prod, null, 2));

const wf = JSON.parse(JSON.stringify(prod));

// Corta o unico ramo que sairia para o Google. Vira Code no-op para manter a
// ligacao "Inserir Agendamento -> ... -> Sucesso" intacta.
const sync = wf.nodes.find((n) => /Sincronizar Sheets/i.test(n.name));
if (!sync) throw new Error("node de sincronizacao com Sheets nao encontrado");
sync.type = "n8n-nodes-base.code";
sync.typeVersion = 2;
sync.parameters = {
  jsCode: `
// Copia QA: sincronizacao com Google Sheets desativada de proposito.
return [{ json: { ...$json, qa_sheets_sync: 'ignorado-na-copia-qa' } }];`,
};
delete sync.credentials;

// O ramo "Buscar Clinica -> Preparar Planilha -> ... -> Adicionar Linha na
// Planilha" ja esta orfao no produtivo (nada o alimenta), mas nodes orfaos com
// URL do Google continuam sendo uma arma carregada numa copia de teste.
const orfaos = [
  "Buscar Clínica",
  "Preparar Planilha",
  "Tem Planilha?",
  "Contar Linhas Existentes",
  "Montar Linha",
  "Adicionar Linha na Planilha",
  "Marcar sheet_row",
];
wf.nodes = wf.nodes.filter((n) => !orfaos.includes(n.name));
for (const nome of orfaos) delete wf.connections[nome];

for (const n of wf.nodes) {
  const alvo = JSON.stringify(n.parameters || {});
  if (/googleapis|sheets\.google/i.test(alvo)) {
    throw new Error(
      `node "${n.name}" ainda fala com o Google -- isolamento quebrado`,
    );
  }
}

const lista = await api("GET", "/api/v1/workflows?limit=250");
const existente = (lista.data || []).find((w) => w.name === QA_NAME);
const payload = {
  name: QA_NAME,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: { executionOrder: wf.settings?.executionOrder || "v1" },
};

let qaAgendaId;
if (existente) {
  qaAgendaId = existente.id;
  await api("PUT", `/api/v1/workflows/${qaAgendaId}`, payload);
} else {
  qaAgendaId = (await api("POST", "/api/v1/workflows", payload)).id;
}
// Sem isto o PUT no Atendimento QA e recusado: "references workflow ... which
// is not published". No n8n, publicar um subworkflow passa pelo activate.
await api("POST", `/api/v1/workflows/${qaAgendaId}/activate`);

// Aponta o "Executar Agendamento" da copia QA do Atendimento para esta copia.
// Resolvido por NOME: recriar a copia gera id novo, e id hardcoded vira 404.
const atendMeta = (lista.data || []).find((w) => w.name === QA_ATENDIMENTO_NOME);
if (!atendMeta) throw new Error(`copia QA do Atendimento nao encontrada: ${QA_ATENDIMENTO_NOME}`);
const QA_ATENDIMENTO = atendMeta.id;
const atend = await api("GET", `/api/v1/workflows/${QA_ATENDIMENTO}`);
const exec = atend.nodes.find((n) => n.name === "Executar Agendamento");
if (!exec) throw new Error('node "Executar Agendamento" ausente na copia QA');
// executeWorkflow typeVersion 1 guarda workflowId como STRING pura. Passar um
// resource locator ({__rl, value, mode}) faz o node responder "Workflow does
// not exist." mesmo com o subworkflow existindo, ativo e publicado.
if (exec.typeVersion !== 1) {
  throw new Error(
    `Executar Agendamento agora e typeVersion ${exec.typeVersion}: revisar o formato de workflowId antes de prosseguir`,
  );
}
exec.parameters = { ...exec.parameters, workflowId: qaAgendaId };
await api("PUT", `/api/v1/workflows/${QA_ATENDIMENTO}`, {
  name: atend.name,
  nodes: atend.nodes,
  connections: atend.connections,
  settings: { executionOrder: atend.settings?.executionOrder || "v1" },
});
await api("POST", `/api/v1/workflows/${QA_ATENDIMENTO}/activate`);

const prodDepois = await api("GET", `/api/v1/workflows/${PROD_AGENDA}`);
if (prodDepois.versionId !== prod.versionId) {
  throw new Error("PRODUCAO FOI ALTERADA -- investigar imediatamente");
}

const atendDepois = await api("GET", `/api/v1/workflows/${QA_ATENDIMENTO}`);
const alvoFinal = atendDepois.nodes.find(
  (n) => n.name === "Executar Agendamento",
)?.parameters?.workflowId;

console.log(
  JSON.stringify(
    {
      backup_fonte: backup,
      qa_agendamento_id: qaAgendaId,
      qa_atendimento_aponta_para: alvoFinal,
      ligacao_ok: alvoFinal === qaAgendaId,
      qa_atendimento_ativo: atendDepois.active,
      prod_agendamento_versionId_inalterado: prodDepois.versionId,
    },
    null,
    2,
  ),
);
