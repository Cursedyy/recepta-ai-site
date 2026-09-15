// Aplica a integracao da fila no Atendimento de PRODUCAO (cxn5FxUNMJmlJ1WJ).
//
// Usa o MESMO modulo que constroi a copia QA (fila-integracao.mjs), para que o
// que a bateria validou e o que entra em producao sejam o mesmo codigo.
//
// Por padrao roda em DRY-RUN: mostra o diff de nodes e ligacoes e NAO escreve
// nada. Para aplicar de verdade:
//     node src/n8n-patches/aplicar-fila-producao.mjs --aplicar
//
// Guardrails honrados aqui:
//   - backup do JSON antes de qualquer PUT;
//   - update_workflow salva DRAFT: publica e confere versionId == activeVersionId;
//   - nao mexe em webhook, credencial, cron, Stripe, UazAPI nem em qualquer
//     outro workflow.
//
// Rollback: node src/n8n-patches/aplicar-fila-producao.mjs --rollback <arquivo-backup.json>
//
// Env: N8N_BASE_URL, N8N_API_KEY

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { aplicarIntegracaoFila } from "./fila-integracao.mjs";

const PROD_ID = "cxn5FxUNMJmlJ1WJ";
const SUPABASE_URL = "https://vfyubktlmqytkcewicse.supabase.co";
const PATHS_PRODUCAO = [
  "recepta/in/188316d5ae26373e3eb619086e10fcbcd38",
  "recepta/out",
];

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

const APLICAR = process.argv.includes("--aplicar");
const iRollback = process.argv.indexOf("--rollback");

const dir = resolve("tmp-backup-workflows-deletados");
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

// Publicar e provar que publicou. "update_workflow" sozinho deixa DRAFT: sem o
// activate o n8n continua rodando a versao anterior EM SILENCIO.
async function publicar(payload, rotulo) {
  await api("PUT", `/api/v1/workflows/${PROD_ID}`, payload);
  await api("POST", `/api/v1/workflows/${PROD_ID}/activate`);
  const depois = await api("GET", `/api/v1/workflows/${PROD_ID}`);
  if (depois.versionId !== depois.activeVersionId) {
    throw new Error(
      `${rotulo}: ficou em DRAFT (versionId ${depois.versionId} != activeVersionId ${depois.activeVersionId})`,
    );
  }
  if (!depois.active) throw new Error(`${rotulo}: workflow ficou inativo`);
  return depois;
}

// ---- Rollback -------------------------------------------------------------
if (iRollback !== -1) {
  const arquivo = process.argv[iRollback + 1];
  if (!arquivo) throw new Error("--rollback exige o caminho do backup");
  const bkp = JSON.parse(readFileSync(arquivo, "utf8"));
  if (bkp.id !== PROD_ID) {
    throw new Error(`backup e do workflow ${bkp.id}, nao de ${PROD_ID}`);
  }
  const depois = await publicar(
    {
      name: bkp.name,
      nodes: bkp.nodes,
      connections: bkp.connections,
      settings: {
        executionOrder: bkp.settings?.executionOrder || "v1",
        ...(bkp.settings?.errorWorkflow
          ? { errorWorkflow: bkp.settings.errorWorkflow }
          : {}),
      },
    },
    "rollback",
  );
  console.log(
    JSON.stringify(
      {
        acao: "rollback",
        de: arquivo,
        nodes: depois.nodes.length,
        versionId: depois.versionId,
        active: depois.active,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

// ---- Leitura e construcao -------------------------------------------------
const antes = await api("GET", `/api/v1/workflows/${PROD_ID}`);
const backup = join(dir, `${PROD_ID}-pre-fila-${stamp}.json`);
writeFileSync(backup, JSON.stringify(antes, null, 2));

const wf = JSON.parse(JSON.stringify(antes));
const credSupabase =
  wf.nodes.find((n) => n.name === "Buscar Clínica")?.credentials || {};
if (!Object.keys(credSupabase).length) {
  throw new Error("nao achei a credencial Supabase em 'Buscar Clínica'");
}

const nomesNovos = aplicarIntegracaoFila(wf, {
  credSupabase,
  supabaseUrl: SUPABASE_URL,
});

// ---- Invariantes: o que esta mudanca NAO pode fazer -----------------------
const nomesAntes = new Set(antes.nodes.map((n) => n.name));
const adicionados = wf.nodes
  .filter((n) => !nomesAntes.has(n.name))
  .map((n) => n.name);
const removidos = antes.nodes
  .filter((n) => !wf.nodes.some((x) => x.name === n.name))
  .map((n) => n.name);

if (removidos.length) {
  throw new Error(
    `a integracao removeu nodes de producao: ${removidos.join(", ")}`,
  );
}

// Nenhum node que ja existia pode ter trocado de tipo: isso seria mock vazando
// da copia QA para producao.
for (const n of antes.nodes) {
  const agora = wf.nodes.find((x) => x.name === n.name);
  if (agora && agora.type !== n.type) {
    throw new Error(
      `node "${n.name}" mudou de ${n.type} para ${agora.type} -- mock vazou para producao`,
    );
  }
}

// Webhooks tem de manter os paths reais, senao o WhatsApp para de chegar.
for (const n of wf.nodes.filter((x) => x.type === "n8n-nodes-base.webhook")) {
  if (!PATHS_PRODUCAO.includes(n.parameters.path)) {
    throw new Error(
      `webhook "${n.name}" com path inesperado: ${n.parameters.path}`,
    );
  }
}

// Os nodes que falam com terceiros continuam sendo eles mesmos.
for (const nome of ["Chamar Claude", "Enviar Parte", "Enviar Alerta"]) {
  const n = wf.nodes.find((x) => x.name === nome);
  if (!n || n.type !== "n8n-nodes-base.httpRequest") {
    throw new Error(`node "${nome}" nao e mais httpRequest -- mock vazou`);
  }
}

const resumo = {
  prod_id: PROD_ID,
  backup,
  nodes_antes: antes.nodes.length,
  nodes_depois: wf.nodes.length,
  nodes_adicionados: adicionados,
  nodes_removidos: removidos,
  entrada_do_ramo: wf.connections["Consolidar Histórico"].main[0].map(
    (x) => x.node,
  ),
  gate_saidas: wf.connections["Gate Fila Tier Completo"].main.map((b) =>
    b.map((x) => x.node),
  ),
  modo: APLICAR ? "APLICANDO" : "DRY-RUN (nada foi escrito)",
};

if (!APLICAR) {
  console.log(JSON.stringify(resumo, null, 2));
  console.log("\nPara aplicar de verdade: --aplicar");
  process.exit(0);
}

// ---- Aplicar --------------------------------------------------------------
const depois = await publicar(
  {
    name: antes.name,
    nodes: wf.nodes,
    connections: wf.connections,
    // So as chaves do schema: binaryMode/availableInMCP fazem o PUT falhar.
    settings: {
      executionOrder: antes.settings?.executionOrder || "v1",
      ...(antes.settings?.errorWorkflow
        ? { errorWorkflow: antes.settings.errorWorkflow }
        : {}),
    },
  },
  "aplicacao",
);

// Prova no objeto que voltou do servidor, nao no que mandamos.
const aplicados = nomesNovos.filter((nome) =>
  depois.nodes.some((n) => n.name === nome),
);
const entradaReal = depois.connections["Consolidar Histórico"].main[0].map(
  (x) => x.node,
);

console.log(
  JSON.stringify(
    {
      ...resumo,
      modo: "APLICADO",
      versionId: depois.versionId,
      activeVersionId: depois.activeVersionId,
      publicado: depois.versionId === depois.activeVersionId,
      active: depois.active,
      nodes_finais: depois.nodes.length,
      nodes_da_fila_presentes: `${aplicados.length}/${nomesNovos.length}`,
      entrada_do_ramo_no_servidor: entradaReal,
      rollback: `node src/n8n-patches/aplicar-fila-producao.mjs --rollback "${backup}"`,
    },
    null,
    2,
  ),
);
