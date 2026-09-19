import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const raiz = resolve(import.meta.dirname, "../..");
const base = (
  process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br"
).replace(/\/$/, "");
const key = process.env.N8N_API_KEY;
if (!key) throw new Error("N8N_API_KEY ausente");

async function api(method, path, body) {
  const response = await fetch(base + path, {
    method,
    headers: { "X-N8N-API-KEY": key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok)
    throw new Error(
      `${method} ${path}: ${response.status} ${text.slice(0, 500)}`,
    );
  return text ? JSON.parse(text) : {};
}

function code(nome) {
  return readFileSync(join(raiz, "src/n8n-patches", nome), "utf8");
}

async function carregarComBackup(id) {
  const workflow = await api("GET", `/api/v1/workflows/${id}`);
  const dir = join(raiz, "tmp-backup-workflows-deletados");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(dir, `${id}-pre-billing-audio-${stamp}.json`);
  writeFileSync(path, JSON.stringify(workflow, null, 2));
  console.log(`backup ${id}: ${path}`);
  return workflow;
}

function payload(workflow) {
  const settings = {};
  if (workflow.settings?.executionOrder)
    settings.executionOrder = workflow.settings.executionOrder;
  if (workflow.settings?.errorWorkflow)
    settings.errorWorkflow = workflow.settings.errorWorkflow;
  return {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings,
  };
}

async function publicar(workflow) {
  await api("PUT", `/api/v1/workflows/${workflow.id}`, payload(workflow));
  if (workflow.active)
    await api("POST", `/api/v1/workflows/${workflow.id}/activate`);
  const after = await api("GET", `/api/v1/workflows/${workflow.id}`);
  if (after.versionId !== after.activeVersionId)
    throw new Error(`${workflow.id}: draft != active`);
  console.log(
    `${workflow.id}: versionId=${after.versionId} activeVersionId=${after.activeVersionId}`,
  );
  return after;
}

function node(workflow, name) {
  const found = workflow.nodes.find((item) => item.name === name);
  if (!found) throw new Error(`Node ausente: ${name}`);
  return found;
}

const billing = await carregarComBackup("cf1An4BYT9A0LuHi");
const config = node(billing, "Config Stripe Webhook");
const assignments = config.parameters.assignments.assignments;
const mensal = assignments.find((item) =>
  ["price_id_mensal", "STRIPE_PRICE_COMPLETO_MENSAL"].includes(item.name),
)?.value;
const anual = assignments.find((item) =>
  ["price_id_anual", "STRIPE_PRICE_COMPLETO_ANUAL"].includes(item.name),
)?.value;
if (!mensal || !anual) throw new Error("Price IDs atuais não encontrados");
config.parameters.assignments.assignments = assignments
  .filter(
    (item) =>
      ![
        "price_id_mensal",
        "price_id_anual",
        "STRIPE_PRICE_COMPLETO_MENSAL",
        "STRIPE_PRICE_COMPLETO_ANUAL",
      ].includes(item.name),
  )
  .concat([
    {
      id: "price-completo-mensal",
      name: "STRIPE_PRICE_COMPLETO_MENSAL",
      type: "string",
      value: mensal,
    },
    {
      id: "price-completo-anual",
      name: "STRIPE_PRICE_COMPLETO_ANUAL",
      type: "string",
      value: anual,
    },
  ]);
node(billing, "Determinar Plano").parameters.jsCode = code(
  "billing-determinar-plano.js",
);
const confirmar = node(billing, "Supabase Confirmar Pagamento");
confirmar.parameters.jsonBody =
  "={{ JSON.stringify({ status: 'ativo', trial_fim: null, plano_pago_em: new Date().toISOString(), stripe_subscription_id: $json.subscription_id, stripe_customer_id: $json.customer_id, plano: $json.plano, tier: $json.tier }) }}";
await publicar(billing);

const atendimento = await carregarComBackup("cxn5FxUNMJmlJ1WJ");
const openAiCredential = {
  openAiApi: { id: "diCuDBCdTkK5zE1p", name: "OpenAI account" },
};
const add = (name, type, typeVersion, position, parameters, extra = {}) => {
  const existing = atendimento.nodes.find((item) => item.name === name);
  const value = {
    id: existing?.id || randomUUID(),
    name,
    type,
    typeVersion,
    position,
    parameters,
    ...extra,
  };
  if (existing) Object.assign(existing, value);
  else atendimento.nodes.push(value);
};

add("IF - Entrada é Mídia?", "n8n-nodes-base.if", 2.2, [-1180, 760], {
  conditions: {
    options: { caseSensitive: false, typeValidation: "loose", version: 2 },
    conditions: [
      {
        id: "entrada-midia",
        leftValue:
          "={{ String($json.body?.message?.mimetype || $json.body?.mimetype || '').toLowerCase() }}",
        rightValue: "audio",
        operator: { type: "string", operation: "contains" },
      },
    ],
    combinator: "and",
  },
  options: {},
});

add(
  "Baixar Áudio para STT",
  "n8n-nodes-base.httpRequest",
  4.2,
  [-250, 980],
  {
    url: "={{ $('Parser da Mensagem').first().json.mensagem_media.URL }}",
    options: {
      response: {
        response: { responseFormat: "file", outputPropertyName: "data" },
      },
    },
  },
  { onError: "continueRegularOutput" },
);
add(
  "Transcrever Áudio",
  "@n8n/n8n-nodes-langchain.openAi",
  2,
  [-20, 980],
  {
    resource: "audio",
    operation: "transcribe",
    binaryPropertyName: "data",
    options: { language: "pt", temperature: 0 },
  },
  { credentials: openAiCredential, onError: "continueRegularOutput" },
);
add("Aplicar Transcrição", "n8n-nodes-base.code", 2, [210, 980], {
  jsCode: code("audio-aplicar-transcricao.js"),
});
add("IF - Responder com TTS?", "n8n-nodes-base.if", 2.2, [2580, 760], {
  conditions: {
    options: { caseSensitive: true, typeValidation: "loose", version: 2 },
    conditions: [
      {
        id: "tier-completo",
        leftValue:
          "={{ $('Buscar Clínica').first().json.tier || 'essencial' }}",
        rightValue: "completo",
        operator: { type: "string", operation: "equals" },
      },
      {
        id: "entrada-audio",
        leftValue: "={{ $('Parser da Mensagem').first().json.midia_tipo }}",
        rightValue: "audio",
        operator: { type: "string", operation: "equals" },
      },
    ],
    combinator: "and",
  },
  options: {},
});
add(
  "Gerar Áudio TTS",
  "@n8n/n8n-nodes-langchain.openAi",
  2,
  [2820, 660],
  {
    resource: "audio",
    operation: "generate",
    model: "gpt-4o-mini-tts",
    input: "={{ $('Processar Resposta IA').first().json.texto_final }}",
    voice: "alloy",
    binaryPropertyName: "data",
    options: {},
  },
  { credentials: openAiCredential, onError: "continueRegularOutput" },
);
add("Preparar Envio TTS", "n8n-nodes-base.code", 2, [3060, 660], {
  jsCode: code("audio-preparar-envio.js"),
});
add("IF - TTS Gerado?", "n8n-nodes-base.if", 2.2, [3300, 660], {
  conditions: {
    options: { caseSensitive: true, typeValidation: "loose", version: 2 },
    conditions: [
      {
        id: "tts-ok",
        leftValue: "={{ $json.tts_ok }}",
        rightValue: true,
        operator: { type: "boolean", operation: "true", singleValue: true },
      },
    ],
    combinator: "and",
  },
  options: {},
});
add(
  "Enviar Áudio TTS",
  "n8n-nodes-base.httpRequest",
  4.2,
  [3540, 600],
  {
    method: "POST",
    url: "={{ $('Configuração da Clínica').first().json.uazapi_server + '/send/media' }}",
    sendHeaders: true,
    headerParameters: {
      parameters: [
        {
          name: "token",
          value:
            "={{ $('Configuração da Clínica').first().json.uazapi_token }}",
        },
      ],
    },
    sendBody: true,
    specifyBody: "json",
    jsonBody:
      "={{ { number: $('Parser da Mensagem').first().json.telefone, type: 'ptt', file: $json.audio_base64 } }}",
    options: {},
  },
  { onError: "continueRegularOutput" },
);
add("Avaliar Envio TTS", "n8n-nodes-base.code", 2, [3780, 600], {
  jsCode: code("audio-avaliar-envio.js"),
});
add("IF - Áudio Enviado?", "n8n-nodes-base.if", 2.2, [4020, 600], {
  conditions: {
    options: { caseSensitive: true, typeValidation: "loose", version: 2 },
    conditions: [
      {
        id: "audio-ok",
        leftValue: "={{ $json.envio_audio_ok }}",
        rightValue: true,
        operator: { type: "boolean", operation: "true", singleValue: true },
      },
    ],
    combinator: "and",
  },
  options: {},
});
add("Fim - Áudio Enviado", "n8n-nodes-base.noOp", 1, [4260, 540], {});

atendimento.connections["IF - É Áudio?"] = {
  main: [
    [{ node: "Baixar Áudio para STT", type: "main", index: 0 }],
    [{ node: "Montar Prompt", type: "main", index: 0 }],
  ],
};
atendimento.connections["Webhook - Mensagem Recebida"] = {
  main: [[{ node: "IF - Entrada é Mídia?", type: "main", index: 0 }]],
};
atendimento.connections["IF - Entrada é Mídia?"] = {
  main: [
    [{ node: "Parser da Mensagem", type: "main", index: 0 }],
    [{ node: "Gravar Mensagem Pendente", type: "main", index: 0 }],
  ],
};
atendimento.connections["Baixar Áudio para STT"] = {
  main: [[{ node: "Transcrever Áudio", type: "main", index: 0 }]],
};
atendimento.connections["Transcrever Áudio"] = {
  main: [[{ node: "Aplicar Transcrição", type: "main", index: 0 }]],
};
atendimento.connections["Aplicar Transcrição"] = {
  main: [[{ node: "Montar Prompt", type: "main", index: 0 }]],
};
const escalar = atendimento.connections["IF - Precisa Escalar?"];
escalar.main[1] = [{ node: "IF - Responder com TTS?", type: "main", index: 0 }];
atendimento.connections["IF - Responder com TTS?"] = {
  main: [
    [{ node: "Gerar Áudio TTS", type: "main", index: 0 }],
    [{ node: "Separar Partes", type: "main", index: 0 }],
  ],
};
atendimento.connections["Gerar Áudio TTS"] = {
  main: [[{ node: "Preparar Envio TTS", type: "main", index: 0 }]],
};
atendimento.connections["Preparar Envio TTS"] = {
  main: [[{ node: "IF - TTS Gerado?", type: "main", index: 0 }]],
};
atendimento.connections["IF - TTS Gerado?"] = {
  main: [
    [{ node: "Enviar Áudio TTS", type: "main", index: 0 }],
    [{ node: "Separar Partes", type: "main", index: 0 }],
  ],
};
atendimento.connections["Enviar Áudio TTS"] = {
  main: [[{ node: "Avaliar Envio TTS", type: "main", index: 0 }]],
};
atendimento.connections["Avaliar Envio TTS"] = {
  main: [[{ node: "IF - Áudio Enviado?", type: "main", index: 0 }]],
};
atendimento.connections["IF - Áudio Enviado?"] = {
  main: [
    [{ node: "Fim - Áudio Enviado", type: "main", index: 0 }],
    [{ node: "Separar Partes", type: "main", index: 0 }],
  ],
};

await publicar(atendimento);
