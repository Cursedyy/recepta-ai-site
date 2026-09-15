#!/usr/bin/env node
/**
 * P0: restaura o Atendimento.
 *
 * Seis nodes da Fase 4 (fila/oferta) montam a URL a partir de
 * $('Configuração da Clínica').first().json.supabase_url, campo que nunca
 * existiu. Toda execucao morria em "Invalid URL: undefined/rest/v1/..." ANTES
 * de Chamar Claude e de Gravar Turno: mensagem de paciente sem resposta e sem
 * gravacao. Ultima execucao boa: 95442, 2026-09-11T02:15:17Z.
 *
 * Correcao CENTRAL: define o campo uma vez na saida de "Configuração da
 * Clínica". Os seis consumidores passam a funcionar sem serem tocados.
 *
 *   N8N_API_KEY=... node src/n8n-patches/deploy-p0-supabase-url.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "../..");
const base = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
const key = process.env.N8N_API_KEY;
if (!key) throw new Error("N8N_API_KEY ausente");
const SUPABASE_URL = "https://vfyubktlmqytkcewicse.supabase.co";

async function api(method, path, body) {
  const r = await fetch(base + path, {
    method,
    headers: { "X-N8N-API-KEY": key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${t.slice(0, 400)}`);
  return t ? JSON.parse(t) : {};
}

const lista = await api("GET", "/api/v1/workflows?limit=250");
if (!(lista.data || []).length) throw new Error("token suspeito: 0 workflows");

const id = "cxn5FxUNMJmlJ1WJ";
// Releitura imediatamente antes da escrita: outro agente trabalha neste mesmo
// workflow, entao a janela entre GET e PUT precisa ser a menor possivel.
const wf = await api("GET", `/api/v1/workflows/${id}`);
const nodesAntes = wf.nodes.length;

const dir = join(raiz, "tmp-backup-workflows-deletados");
mkdirSync(dir, { recursive: true });
const backup = join(dir, `${id}-P0-supabase-url-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(backup, JSON.stringify(wf, null, 2));
console.log(`backup: ${backup}`);

const cfg = wf.nodes.find((n) => n.name === "Configuração da Clínica");
if (!cfg) throw new Error("node ausente: Configuração da Clínica");

const CONSUMIDORES = ["Verificar Entrada Fila", "Entrar na Fila", "Buscar Oferta Ativa do Paciente",
                      "Aceitar Oferta", "Recusar Oferta", "Ofertar Próximo Após Recusa"];
const antesConsumidores = Object.fromEntries(
  CONSUMIDORES.map((n) => {
    const no = wf.nodes.find((x) => x.name === n);
    if (!no) throw new Error(`consumidor ausente: ${n}`);
    return [n, JSON.stringify(no.parameters)];
  }),
);

const antigo = cfg.parameters.jsCode;
if (antigo.includes("supabase_url")) {
  console.log("supabase_url ja existe no node; nada a fazer");
  process.exit(0);
}

const ANCORA = "    ia_config,\n    config_editavel,\n  },\n}];";
const ocorrencias = antigo.split(ANCORA).length - 1;
if (ocorrencias !== 1) throw new Error(`esperava 1 ancora, achei ${ocorrencias}`);

const NOVO = [
  "    ia_config,",
  "    config_editavel,",
  "    // Base publica do PostgREST. Os nodes de fila/oferta concatenam",
  "    // '/rest/v1/...' direto, entao vai SEM barra final. Nao e segredo: quem",
  "    // autentica continua sendo a credencial supabaseApi de cada node.",
  `    supabase_url: '${SUPABASE_URL}',`,
  "  },",
  "}];",
].join("\n");

cfg.parameters.jsCode = antigo.replace(ANCORA, NOVO);

// Preservacao: todo campo que saia antes tem de continuar saindo.
const CAMPOS = ["...ctx", "clinica:", "clinica_id:", "tier:", "status:", "uazapi_token:",
                "uazapi_server:", "telefone_alerta:", "telefone_operador:",
                "mensagem_audio_padrao:", "tempo_pausa_minutos:", "ia_config", "config_editavel"];
for (const c of CAMPOS) {
  if (!cfg.parameters.jsCode.includes(c)) throw new Error(`campo perdido: ${c}`);
}
// So a ancora pode ter mudado.
if (antigo.replace(ANCORA, "@@") !== cfg.parameters.jsCode.replace(NOVO, "@@")) {
  throw new Error("a edicao tocou mais do que o bloco alvo");
}
if (wf.nodes.length !== nodesAntes) throw new Error("contagem de nodes mudou");

const settings = { executionOrder: wf.settings?.executionOrder || "v1" };
if (wf.settings?.errorWorkflow) settings.errorWorkflow = wf.settings.errorWorkflow;
await api("PUT", `/api/v1/workflows/${id}`, { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings });
if (wf.active) await api("POST", `/api/v1/workflows/${id}/activate`);

const depois = await api("GET", `/api/v1/workflows/${id}`);
const vivo = depois.nodes.find((n) => n.name === "Configuração da Clínica").parameters.jsCode;
if (!vivo.includes(`supabase_url: '${SUPABASE_URL}'`)) throw new Error("supabase_url nao subiu");
for (const n of CONSUMIDORES) {
  const no = depois.nodes.find((x) => x.name === n);
  if (JSON.stringify(no.parameters) !== antesConsumidores[n]) throw new Error(`consumidor alterado: ${n}`);
}
if (depois.nodes.length !== nodesAntes) throw new Error("contagem de nodes mudou apos escrita");
if (depois.versionId !== depois.activeVersionId) throw new Error("versionId != activeVersionId");

console.log(`nodes: ${depois.nodes.length} (antes ${nodesAntes}) | active: ${depois.active}`);
console.log(`6 consumidores: intocados`);
console.log(`versionId=${depois.versionId}`);
console.log(`activeVersionId=${depois.activeVersionId}`);
console.log("OK");
