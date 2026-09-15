// Cria/atualiza a COPIA QA do workflow Atendimento (cxn5FxUNMJmlJ1WJ).
//
// Por que existe: a API publica do n8n nao expoe execucao manual. Para rodar os
// cenarios da fila ponta a ponta sem tocar em producao, a copia recebe um
// Webhook proprio (path unico) e fica ativa sozinha. Producao NUNCA e escrita
// aqui: o GET do workflow produtivo e somente leitura, e o script aborta se o
// versionId dele mudar durante a operacao.
//
// Isolamento (invariantes verificadas antes de publicar):
//   - paths de webhook diferentes dos de producao, senao o n8n rouba a rota;
//   - ZERO node que fale com UazAPI, Anthropic ou OpenAI: todos viram Code mock
//     que devolve o mesmo contrato que o node real devolvia;
//   - Supabase continua REAL (e o que estamos testando), isolado por clinica
//     sintetica + telefone sintetico.
//
// Uso: node src/n8n-patches/qa-copia-atendimento-fila.mjs
// Env: N8N_BASE_URL, N8N_API_KEY

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { aplicarIntegracaoFila } from "./fila-integracao.mjs";

const PROD_ID = "cxn5FxUNMJmlJ1WJ";
const QA_NAME = "[QA] Atendimento - Fila E2E (nao usar em producao)";
const QA_SUFFIX = "qafila7f3c";
const PATH_IN = `qa/${QA_SUFFIX}/in`;
const PATH_OUT = `qa/${QA_SUFFIX}/out`;
const SUPABASE_URL = "https://vfyubktlmqytkcewicse.supabase.co";

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

// ---- 1. Ler producao (SOMENTE LEITURA) e guardar o snapshot ----------------
const prod = await api("GET", `/api/v1/workflows/${PROD_ID}`);
const dir = resolve("tmp-backup-workflows-deletados");
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = join(dir, `${PROD_ID}-fonte-copia-qa-${stamp}.json`);
writeFileSync(backup, JSON.stringify(prod, null, 2));

const wf = JSON.parse(JSON.stringify(prod));
const nodeByName = (name) => {
  const n = wf.nodes.find((x) => x.name === name);
  if (!n) throw new Error(`node ausente na copia: ${name}`);
  return n;
};
const credSupabase = nodeByName("Buscar Clínica").credentials || {};

// ---- 2. Trigger proprio ---------------------------------------------------
// Path novo + webhookId novo. Sem isso a copia ativa disputaria a rota de
// producao e sequestraria o WhatsApp real.
const wIn = nodeByName("Webhook - Mensagem Recebida");
wIn.parameters = { ...wIn.parameters, path: PATH_IN };
wIn.webhookId = randomUUID();
const wOut = nodeByName("Webhook - Mensagem Enviada (Operador)");
wOut.parameters = { ...wOut.parameters, path: PATH_OUT };
wOut.webhookId = randomUUID();

// ---- 3. Mocks: nenhuma chamada externa sai da copia ------------------------
// Cada mock devolve exatamente o shape que o node real devolvia, para que os
// Code nodes a jusante rodem o codigo de producao sem adaptacao.
const mock = (name, jsCode) => {
  const n = nodeByName(name);
  n.type = "n8n-nodes-base.code";
  n.typeVersion = 2;
  n.parameters = { jsCode };
  delete n.credentials;
  delete n.continueOnFail;
  delete n.onError;
};

// Le o roteiro do cenario direto do payload do webhook.
const QA = `const _qa = (() => { try { const b = $('Webhook - Mensagem Recebida').first().json; return (b.body || b).qa || {}; } catch (e) { return {}; } })();`;

// Claude: contrato {content:[{text}]} lido por "Processar Resposta IA".
mock(
  "Chamar Claude",
  `${QA}
const texto = _qa.claude || 'Ola! Como posso ajudar?';
return [{ json: { content: [{ type: 'text', text: texto }] } }];`,
);

mock(
  "Chamar Claude - Resposta",
  `${QA}
const texto = _qa.claude_resposta || _qa.claude || 'Pronto, confirmado.';
return [{ json: { content: [{ type: 'text', text: texto }] } }];`,
);

// Visao: contrato do /v1/responses lido por "Aplicar Resultado da Imagem".
mock(
  "Ler Imagem com Visão",
  `${QA}
return [{ json: { output_text: _qa.visao || 'Receita: Amoxicilina 500mg, 8/8h por 7 dias.' } }];`,
);

// Download do audio: so precisa nao estourar; o STT tambem e mock.
mock(
  "Baixar Áudio para STT",
  `
return [{ json: { qa_mock: 'download-audio-noop' } }];`,
);

// STT: contrato {text} lido por "Aplicar Transcrição".
mock(
  "Transcrever Áudio",
  `${QA}
return [{ json: { text: _qa.transcricao ?? 'Quero entrar na fila de espera para limpeza.' } }];`,
);

// TTS: "Preparar Envio TTS" chama getBinaryDataBuffer(0,'data'); precisa de
// binario de verdade, senao o proprio no de producao quebra por motivo errado.
mock(
  "Gerar Áudio TTS",
  `${QA}
return (async () => {
  if (_qa.tts_falha) return [{ json: { qa_mock: 'tts-vazio' } }];
  const buf = Buffer.from('QA-FAKE-MP3-' + Date.now());
  const bin = await this.helpers.prepareBinaryData(buf, 'qa-tts.mp3', 'audio/mpeg');
  return [{ json: { qa_mock: 'tts' }, binary: { data: bin } }];
})();`,
);

// UazAPI: coletores. Nada sai da maquina; a evidencia fica no runData.
const coletor = (nome, campos) => `
const _p = (() => { try { return ${campos}; } catch (e) { return {}; } })();
return [{ json: { qa_envio: { node: ${JSON.stringify(nome)}, ..._p }, qa_enviado_em: new Date().toISOString() } }];`;

mock(
  "Enviar Parte",
  coletor(
    "Enviar Parte",
    "({ texto: $json.text ?? $json.texto ?? $json, item: $runIndex })",
  ),
);
mock("Enviar Alerta", coletor("Enviar Alerta", "({ alerta: $json })"));
mock(
  "Enviar Resposta Áudio",
  coletor("Enviar Resposta Audio", "({ payload: $json })"),
);
mock(
  "Enviar Mensagem Final Expirado",
  coletor("Enviar Mensagem Final Expirado", "({ payload: $json })"),
);
mock("Marcar Digitando", coletor("Marcar Digitando", "({})"));
mock(
  "Enviar Áudio TTS",
  coletor(
    "Enviar Audio TTS",
    "({ tts_ok: $json.tts_ok, bytes: (($json.audio_base64 || '').length) })",
  ),
);

// ---- 4+5+6. Integracao da fila -----------------------------------------
// Mesmo modulo que o aplicador de producao usa. A copia QA existe para provar
// ESTE codigo; se o construtor tivesse a sua propria copia, a bateria pararia
// de falar sobre o que realmente vai ao ar.
aplicarIntegracaoFila(wf, { credSupabase, supabaseUrl: SUPABASE_URL });

// A copia QA nao envia oferta por WhatsApp em nenhuma hipotese.
const cfgQa = wf.nodes.find((n) => n.name === "Configuração da Clínica");
if (!cfgQa.parameters.jsCode.includes("fila_whatsapp_enabled")) {
  cfgQa.parameters.jsCode = cfgQa.parameters.jsCode.replace(
    "    clinica_id: c.id,\n",
    "    clinica_id: c.id,\n    fila_whatsapp_enabled: false,\n",
  );
}

// ---- 7. Guarda de isolamento: falha antes de publicar, nao depois ---------
// So nodes que ABREM CONEXAO contam. Um Code node que menciona "uazapi_server"
// apenas copia o campo da linha da clinica adiante; nao fala com ninguem.
const FALA_REDE = (t) =>
  t === "n8n-nodes-base.httpRequest" ||
  t === "n8n-nodes-base.webhook" ||
  t.includes("langchain");
for (const n of wf.nodes) {
  if (!FALA_REDE(n.type)) continue;
  const alvo = JSON.stringify(n.parameters || {});
  // Hosts, nao substrings: "uazapi_token" / "uazapi_server" sao COLUNAS do
  // Supabase que nodes legitimos filtram e selecionam. Quem realmente sairia da
  // rede e pego pela regra seguinte (todo httpRequest precisa ser Supabase).
  for (const proibido of [
    "uazapi.com",
    "api.anthropic.com",
    "api.openai.com",
    "sitemagic",
  ]) {
    if (alvo.includes(proibido)) {
      throw new Error(
        `node de rede "${n.name}" ainda aponta para "${proibido}" -- isolamento quebrado`,
      );
    }
  }
  // Aceita a URL literal ou a expressao que a le do config -- onde
  // supabase_url e um literal que este mesmo script injeta acima.
  const paraSupabase =
    alvo.includes(SUPABASE_URL) || alvo.includes(".supabase_url");
  if (n.type === "n8n-nodes-base.httpRequest" && !paraSupabase) {
    throw new Error(
      `node httpRequest "${n.name}" nao aponta para o Supabase -- destino inesperado`,
    );
  }
}
for (const n of wf.nodes) {
  if (
    n.type === "n8n-nodes-base.webhook" &&
    !String(n.parameters.path).startsWith("qa/")
  ) {
    throw new Error(
      `webhook ${n.name} com path de producao: ${n.parameters.path}`,
    );
  }
  if (n.type.includes("langchain"))
    throw new Error(`node langchain remanescente: ${n.name}`);
}

// ---- 8. Criar ou atualizar a copia ---------------------------------------
const lista = await api("GET", "/api/v1/workflows?limit=250");
const existente = (lista.data || []).find((w) => w.name === QA_NAME);
const payload = {
  name: QA_NAME,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: { executionOrder: wf.settings?.executionOrder || "v1" },
};

let qaId;
if (existente) {
  qaId = existente.id;
  await api("PUT", `/api/v1/workflows/${qaId}`, payload);
} else {
  const criado = await api("POST", "/api/v1/workflows", payload);
  qaId = criado.id;
}
await api("POST", `/api/v1/workflows/${qaId}/activate`);

const final = await api("GET", `/api/v1/workflows/${qaId}`);
if (final.versionId !== final.activeVersionId)
  throw new Error("draft: versionId != activeVersionId");

// Producao intacta?
const prodDepois = await api("GET", `/api/v1/workflows/${PROD_ID}`);
if (
  prodDepois.versionId !== prod.versionId ||
  prodDepois.active !== prod.active
) {
  throw new Error("PRODUCAO FOI ALTERADA -- investigar imediatamente");
}

console.log(
  JSON.stringify(
    {
      backup_fonte: backup,
      qa_workflow_id: qaId,
      qa_nome: QA_NAME,
      qa_ativo: final.active,
      qa_versionId: final.versionId,
      qa_nodes: final.nodes.length,
      webhook_in: `${base}/webhook/${PATH_IN}`,
      prod_id: PROD_ID,
      prod_versionId_inalterado: prodDepois.versionId,
      prod_active: prodDepois.active,
    },
    null,
    2,
  ),
);
