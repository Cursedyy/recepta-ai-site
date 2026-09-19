// Harness E2E da copia QA do Atendimento (workflow BSfSGponuUhJRJsH).
//
// Dispara o webhook da COPIA (nunca o de producao), espera a execucao terminar,
// le o runData com ?includeData=true e afirma sobre o que os nodes produziram.
// Nenhuma chamada externa sai: os nodes UazAPI/Claude/OpenAI da copia sao mocks.
//
// Uso:  node scripts/qa-fila-e2e.mjs [nome-do-cenario ...]
//       node scripts/qa-fila-e2e.mjs --list
// Env:  N8N_BASE_URL, N8N_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const QA_NOME = "[QA] Atendimento - Fila E2E (nao usar em producao)";
let QA_WF = null; // resolvido por nome no boot: recriar a copia gera id novo
const HOOK = "qa/qafila7f3c/in";
const CLINICA_NOME = "zz-qa-fila-7f3c";
const TOKEN = "zz-qa-token-7f3c";
// Faixa 5599 9000 0xxx: numero sintetico, nunca atribuido a paciente real.
const TEL = (n) => `55999000000${String(n).padStart(2, "0")}`;

const n8n = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(
  /\/$/,
  "",
);
const NH = { "X-N8N-API-KEY": process.env.N8N_API_KEY };
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SH = {
  apikey: SK,
  Authorization: `Bearer ${SK}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

// ---- fixture ---------------------------------------------------------------
let CLINICA_ID = null;
async function clinicaId() {
  if (CLINICA_ID) return CLINICA_ID;
  const { body } = await sb(
    `/clinicas?clinica=eq.${CLINICA_NOME}&select=id,tier,status`,
  );
  if (!body?.length) throw new Error(`clinica ${CLINICA_NOME} nao existe`);
  CLINICA_ID = body[0].id;
  return CLINICA_ID;
}
const setTier = (tier) =>
  sb(`/clinicas?clinica=eq.${CLINICA_NOME}`, {
    method: "PATCH",
    body: JSON.stringify({ tier }),
  });

// Limpa SO o que este harness cria: esta clinica sintetica e mais nada.
async function limparDadosDoTeste() {
  const id = await clinicaId();
  await sb(`/agendamentos?clinica_id=eq.${id}`, { method: "DELETE" });
  await sb(`/fila_espera?clinica_id=eq.${id}`, { method: "DELETE" });
  await sb(`/conversas?clinica=eq.${CLINICA_NOME}`, { method: "DELETE" });
  await sb(`/mensagens_pendentes?clinica=eq.${CLINICA_NOME}`, {
    method: "DELETE",
  });
}

// ---- disparo + leitura da execucao ----------------------------------------
async function ultimaExecId() {
  const r = await fetch(
    `${n8n}/api/v1/executions?workflowId=${QA_WF}&limit=1`,
    { headers: NH },
  );
  const j = await r.json();
  return j.data?.[0]?.id ?? 0;
}

// Erros de INFRA, nao do que esta sendo testado: o Supabase devolve 504 no
// debounce de vez em quando e derruba a execucao antes do Parser rodar. Tratar
// isso como "cenario falhou" produz vermelho que nao aponta para bug nenhum --
// e, pior, esconde o resultado real do cenario.
const ERRO_DE_INFRA =
  /gateway tim|timed out|ETIMEDOUT|ECONNRESET|socket hang up|502|503|504/i;

async function disparar(payload, { timeoutMs = 90000, tentativas = 2 } = {}) {
  for (let i = 1; i <= tentativas; i++) {
    const exec = await dispararUmaVez(payload, { timeoutMs });
    const erro = exec?.data?.resultData?.error?.message || "";
    if (!erro || !ERRO_DE_INFRA.test(erro) || i === tentativas) return exec;
    console.log(
      `  [infra instavel (${erro.slice(0, 40)}), repetindo ${i}/${tentativas - 1}]`,
    );
    await sleep(3000);
  }
}

async function dispararUmaVez(payload, { timeoutMs = 90000 } = {}) {
  const antes = await ultimaExecId();
  const r = await fetch(`${n8n}/webhook/${HOOK}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const httpStatus = r.status;
  const httpBody = (await r.text()).slice(0, 200);
  if (!r.ok && r.status !== 200) {
    throw new Error(`webhook ${httpStatus}: ${httpBody}`);
  }
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    await sleep(2000);
    const lista = await (
      await fetch(`${n8n}/api/v1/executions?workflowId=${QA_WF}&limit=5`, {
        headers: NH,
      })
    ).json();
    // Uma execucao que falhou tem finished=false mas status "error": esperar
    // por finished sozinho trava os 90s em todo cenario que quebra.
    const nova = (lista.data || []).find(
      (e) =>
        Number(e.id) > Number(antes) &&
        (e.finished || ["error", "success", "crashed"].includes(e.status)),
    );
    if (nova) {
      // ?includeData=true e obrigatorio, senao a execucao parece vazia.
      const full = await (
        await fetch(`${n8n}/api/v1/executions/${nova.id}?includeData=true`, {
          headers: NH,
        })
      ).json();
      const err = full?.data?.resultData?.error;
      if (err) {
        console.log(
          `  [execucao ${nova.id} parou em "${full.data.resultData.lastNodeExecuted}": ${err.message}]`,
        );
      }
      // O status HTTP do webhook faz parte da evidencia do cenario.
      full.__http = { status: httpStatus, body: httpBody };
      return full;
    }
  }
  throw new Error("timeout esperando execucao da copia QA");
}

// Saida do node, por nome, ja achatada em array de json.
const saida = (exec, node) => {
  const run = exec?.data?.resultData?.runData?.[node];
  if (!run) return null;
  return run.flatMap((r) =>
    (r.data?.main?.[0] || []).map((i) => i.json ?? null),
  );
};
const rodou = (exec, node) =>
  Boolean(exec?.data?.resultData?.runData?.[node]?.length);
const nodesComErro = (exec) =>
  Object.entries(exec?.data?.resultData?.runData || {})
    .filter(([, runs]) => runs.some((r) => r.error))
    .map(([n, runs]) => `${n}: ${runs.find((r) => r.error)?.error?.message}`);

// Tudo que os coletores capturaram no lugar de um envio UazAPI real.
const enviosCapturados = (exec) => {
  const out = [];
  for (const [nome, runs] of Object.entries(
    exec?.data?.resultData?.runData || {},
  )) {
    for (const r of runs) {
      for (const item of r.data?.main?.[0] || []) {
        if (item?.json?.qa_envio) out.push({ nome, ...item.json.qa_envio });
      }
    }
  }
  return out;
};

// ---- payloads --------------------------------------------------------------
const msgTexto = (
  texto,
  { tel = 11, qa = {}, pushname = "QA Paciente" } = {},
) => ({
  token: TOKEN,
  message: {
    chatid: `${TEL(tel)}@s.whatsapp.net`,
    content: texto,
    text: texto,
    messagetype: "conversation",
    fromMe: false,
    wasSentByApi: false,
    pushname,
  },
  qa,
});

const msgMidia = (mimetype, { tel = 11, qa = {}, caption = "" } = {}) => ({
  token: TOKEN,
  message: {
    chatid: `${TEL(tel)}@s.whatsapp.net`,
    content: caption,
    messagetype: mimetype.startsWith("audio") ? "audioMessage" : "imageMessage",
    mimetype,
    fileurl: "https://qa-noop.invalid/arquivo-sintetico",
    seconds: mimetype.startsWith("audio") ? 5 : undefined,
    fromMe: false,
    wasSentByApi: false,
    pushname: "QA Paciente",
  },
  qa,
});

// ---- assercoes -------------------------------------------------------------
const resultados = [];
function checar(cenario, nome, ok, detalhe) {
  resultados.push({ cenario, nome, ok: Boolean(ok), detalhe });
  console.log(
    `  ${ok ? "PASS" : "FALHA"}  ${nome}${detalhe ? ` -- ${detalhe}` : ""}`,
  );
}

// ---- cenarios --------------------------------------------------------------
const cenarios = {
  // 1. Caminho normal: nada de fila, resposta da IA sai em partes.
  async "texto-simples"() {
    await limparDadosDoTeste();
    await setTier("completo");
    const exec = await disparar(
      msgTexto("bom dia, voces atendem convenio?", {
        qa: { claude: "Bom dia! Atendemos Unimed e Bradesco Saude." },
      }),
    );
    checar("texto-simples", "execucao terminou", exec.finished);
    checar(
      "texto-simples",
      "nao entrou no ramo da fila",
      !rodou(exec, "Entrar na Fila"),
    );
    const partes = saida(exec, "Processar Resposta IA")?.[0]?.partes;
    checar(
      "texto-simples",
      "IA respondeu",
      partes?.[0]?.includes("Unimed"),
      JSON.stringify(partes),
    );
    const envios = enviosCapturados(exec);
    checar(
      "texto-simples",
      "envio interceptado pelo coletor (nada saiu)",
      envios.some((e) => e.node === "Enviar Parte"),
      `${envios.length} envio(s)`,
    );
    const { body } = await sb(
      `/conversas?clinica=eq.${CLINICA_NOME}&select=role,mensagem`,
    );
    checar(
      "texto-simples",
      "turno gravado em conversas",
      body?.length >= 2,
      `${body?.length} linha(s)`,
    );
  },

  // 2. Entrada na fila: a 020 exige janela valida; janela nula da 22023.
  async "fila-entrar"() {
    await limparDadosDoTeste();
    await setTier("completo");
    const exec = await disparar(
      msgTexto("quero entrar na fila de espera para limpeza"),
    );
    const resp = saida(exec, "Montar Resposta Fila")?.[0];
    checar(
      "fila-entrar",
      "fila_entrar aceitou a janela",
      resp?.fila_entrada_ok === true,
      resp?.fila_erro || "",
    );
    const id = await clinicaId();
    const { body } = await sb(
      `/fila_espera?clinica_id=eq.${id}&select=id,status,servico_normalizado,janela_inicio,janela_fim`,
    );
    checar("fila-entrar", "linha criada na fila", body?.length === 1);
    checar(
      "fila-entrar",
      "status aguardando",
      body?.[0]?.status === "aguardando",
    );
    checar(
      "fila-entrar",
      "janela gravada (nao nula)",
      Boolean(body?.[0]?.janela_inicio && body?.[0]?.janela_fim),
    );
  },

  // 3. Segunda tentativa identica nao pode criar segunda linha.
  async "fila-duplicada"() {
    await limparDadosDoTeste();
    await setTier("completo");
    // O setup precisa de assercao propria: se a primeira entrada falhar (ja
    // aconteceu com um 504 do Supabase no debounce), a segunda vira a primeira
    // e o teste "passa" sem nunca ter exercitado a duplicidade.
    const setup = await disparar(
      msgTexto("quero entrar na fila de espera para limpeza"),
    );
    const primeira = saida(setup, "Montar Resposta Fila")?.[0];
    if (primeira?.fila_entrada_ok !== true) {
      throw new Error(
        `setup nao entrou na fila: ${primeira?.fila_erro || setup?.data?.resultData?.error?.message || "sem resposta da fila"}`,
      );
    }
    const exec = await disparar(
      msgTexto("quero entrar na fila de espera para limpeza"),
    );
    const resp = saida(exec, "Montar Resposta Fila")?.[0];
    checar(
      "fila-duplicada",
      "detectou duplicidade",
      resp?.fila_duplicada === true,
    );
    checar(
      "fila-duplicada",
      "avisou o paciente",
      /ja esta na fila/i.test(resp?.fila_resposta || ""),
      resp?.fila_resposta,
    );
    checar(
      "fila-duplicada",
      "nao chamou fila_entrar de novo",
      !rodou(exec, "Entrar na Fila"),
    );
    const id = await clinicaId();
    const { body } = await sb(`/fila_espera?clinica_id=eq.${id}&select=id`);
    checar("fila-duplicada", "continua com 1 linha", body?.length === 1);
  },

  // 4. Gate de tier: Essencial nao entra na fila, e nao pode vazar erro cru.
  async "fila-tier-essencial"() {
    await limparDadosDoTeste();
    await setTier("essencial");
    const exec = await disparar(
      msgTexto("quero entrar na fila de espera para limpeza"),
    );
    checar(
      "fila-tier-essencial",
      "nao chamou fila_entrar",
      !rodou(exec, "Entrar na Fila"),
    );
    // O gate de tier tem de barrar na ENTRADA: clinica Essencial nao paga o
    // custo do ramo da fila nem recebe resposta canned no lugar do atendimento.
    checar(
      "fila-tier-essencial",
      "gate barrou antes do detector de fila",
      !rodou(exec, "Detectar Intencao Fila"),
    );
    checar(
      "fila-tier-essencial",
      "nao consultou oferta ativa (sem request extra)",
      !rodou(exec, "Buscar Oferta Ativa do Paciente"),
    );
    checar(
      "fila-tier-essencial",
      "nao montou resposta de fila",
      !rodou(exec, "Montar Resposta Fila"),
    );
    // O que o paciente recebe e o atendimento normal, nao um aviso sobre plano.
    const proc = saida(exec, "Processar Resposta IA")?.[0];
    checar(
      "fila-tier-essencial",
      "paciente recebeu o atendimento normal da IA",
      Boolean(proc?.partes?.[0]),
      JSON.stringify(proc?.partes),
    );
    checar(
      "fila-tier-essencial",
      "nada sobre plano comercial foi dito ao paciente",
      !/plano|completo|essencial/i.test(JSON.stringify(proc?.partes || [])),
      JSON.stringify(proc?.partes),
    );
    const id = await clinicaId();
    const { body } = await sb(`/fila_espera?clinica_id=eq.${id}&select=id`);
    checar("fila-tier-essencial", "nenhuma linha criada", body?.length === 0);
    await setTier("completo");
  },

  // 5. Aceite: o agendamento tem de nascer em oferta_inicio, NAO na preferencia
  //    (usar janela_inicio e o bug de 15h virar 12h).
  async "oferta-aceite"() {
    await limparDadosDoTeste();
    await setTier("completo");
    const id = await clinicaId();
    const inicio = new Date(Date.now() + 3 * 86400000);
    inicio.setUTCHours(18, 0, 0, 0); // 15h BRT
    const fim = new Date(inicio.getTime() + 3600000);
    const janelaIni = new Date(inicio.getTime() - 5 * 86400000).toISOString();
    const janelaFim = new Date(inicio.getTime() + 5 * 86400000).toISOString();

    await sb("/rpc/fila_entrar", {
      method: "POST",
      body: JSON.stringify({
        p_clinica: id,
        p_telefone: TEL(11),
        p_nome: "QA Paciente",
        p_servico: "limpeza",
        p_inicio: janelaIni,
        p_fim: janelaFim,
      }),
    });
    const ofertou = await sb("/rpc/fila_ofertar_proximo", {
      method: "POST",
      body: JSON.stringify({
        p_clinica: id,
        p_servico: "limpeza",
        p_inicio: inicio.toISOString(),
        p_fim: fim.toISOString(),
      }),
    });
    checar(
      "oferta-aceite",
      "oferta criada pela RPC",
      ofertou.body?.status === "ofertado",
      JSON.stringify(ofertou.body).slice(0, 150),
    );

    const exec = await disparar(msgTexto("sim"));
    checar(
      "oferta-aceite",
      "chamou fila_aceitar_oferta",
      rodou(exec, "Aceitar Oferta"),
    );
    const resp = saida(exec, "Montar Resposta Oferta")?.[0];
    checar(
      "oferta-aceite",
      "confirmou ao paciente",
      /reservado com sucesso/i.test(resp?.oferta_resposta_texto || ""),
      resp?.oferta_resposta_texto,
    );
    const { body } = await sb(
      `/agendamentos?clinica_id=eq.${id}&select=id,data_hora,status`,
    );
    checar("oferta-aceite", "agendamento criado", body?.length === 1);
    checar(
      "oferta-aceite",
      "data_hora == oferta_inicio (nao a preferencia)",
      body?.[0] && new Date(body[0].data_hora).getTime() === inicio.getTime(),
      `esperado ${inicio.toISOString()} / obtido ${body?.[0]?.data_hora}`,
    );
    const fila = await sb(`/fila_espera?clinica_id=eq.${id}&select=status`);
    checar(
      "oferta-aceite",
      "fila marcada como aceito",
      fila.body?.[0]?.status === "aceito",
    );
  },

  // 6. Recusa com fila atras: o horario tem de ser repassado.
  async "oferta-recusa-com-proximo"() {
    await limparDadosDoTeste();
    await setTier("completo");
    const id = await clinicaId();
    const inicio = new Date(Date.now() + 4 * 86400000);
    inicio.setUTCHours(17, 0, 0, 0);
    const fim = new Date(inicio.getTime() + 3600000);
    const jIni = new Date(inicio.getTime() - 5 * 86400000).toISOString();
    const jFim = new Date(inicio.getTime() + 5 * 86400000).toISOString();

    for (const tel of [TEL(11), TEL(12)]) {
      await sb("/rpc/fila_entrar", {
        method: "POST",
        body: JSON.stringify({
          p_clinica: id,
          p_telefone: tel,
          p_nome: "QA " + tel.slice(-2),
          p_servico: "limpeza",
          p_inicio: jIni,
          p_fim: jFim,
        }),
      });
    }
    await sb("/rpc/fila_ofertar_proximo", {
      method: "POST",
      body: JSON.stringify({
        p_clinica: id,
        p_servico: "limpeza",
        p_inicio: inicio.toISOString(),
        p_fim: fim.toISOString(),
      }),
    });

    const exec = await disparar(msgTexto("nao, obrigado", { tel: 11 }));
    checar(
      "oferta-recusa-com-proximo",
      "chamou fila_recusar_oferta",
      rodou(exec, "Recusar Oferta"),
    );
    const aval = saida(exec, "Avaliar Proxima Oferta")?.[0];
    checar(
      "oferta-recusa-com-proximo",
      "repassou para o proximo",
      aval?.houve_proxima_oferta === true,
      JSON.stringify(aval?.rpc_resultado || {}).slice(0, 160),
    );
    const { body } = await sb(
      `/fila_espera?clinica_id=eq.${id}&select=paciente_telefone,status,oferta_inicio&order=entrou_em`,
    );
    checar(
      "oferta-recusa-com-proximo",
      "primeiro recusado, segundo ofertado",
      body?.[0]?.status === "recusado" && body?.[1]?.status === "ofertado",
      JSON.stringify(
        body?.map((r) => [r.paciente_telefone.slice(-2), r.status]),
      ),
    );
    checar(
      "oferta-recusa-com-proximo",
      "nova oferta preservou o horario do slot",
      body?.[1] &&
        new Date(body[1].oferta_inicio).getTime() === inicio.getTime(),
      `${body?.[1]?.oferta_inicio}`,
    );
  },

  // 7. Recusa sem ninguem atras: precisa de resposta explicita, nao silencio.
  async "oferta-recusa-sem-proximo"() {
    await limparDadosDoTeste();
    await setTier("completo");
    const id = await clinicaId();
    const inicio = new Date(Date.now() + 5 * 86400000);
    inicio.setUTCHours(16, 0, 0, 0);
    const fim = new Date(inicio.getTime() + 3600000);
    await sb("/rpc/fila_entrar", {
      method: "POST",
      body: JSON.stringify({
        p_clinica: id,
        p_telefone: TEL(11),
        p_nome: "QA Paciente",
        p_servico: "limpeza",
        p_inicio: new Date(inicio.getTime() - 86400000).toISOString(),
        p_fim: new Date(inicio.getTime() + 86400000).toISOString(),
      }),
    });
    await sb("/rpc/fila_ofertar_proximo", {
      method: "POST",
      body: JSON.stringify({
        p_clinica: id,
        p_servico: "limpeza",
        p_inicio: inicio.toISOString(),
        p_fim: fim.toISOString(),
      }),
    });

    const exec = await disparar(msgTexto("nao quero", { tel: 11 }));
    const aval = saida(exec, "Avaliar Proxima Oferta")?.[0];
    checar(
      "oferta-recusa-sem-proximo",
      "branch de fila vazia executou",
      aval !== undefined && aval !== null,
    );
    checar(
      "oferta-recusa-sem-proximo",
      "reconheceu que nao havia proximo",
      aval?.houve_proxima_oferta === false,
    );
    const resp = saida(exec, "Montar Resposta Oferta")?.[0];
    checar(
      "oferta-recusa-sem-proximo",
      "paciente recebeu resposta (nao ficou mudo)",
      /nao havia mais ninguem/i.test(resp?.oferta_resposta_texto || ""),
      resp?.oferta_resposta_texto,
    );
  },

  // 8. Resposta ambigua nao pode ser tratada como aceite nem recusa.
  async "oferta-ambigua"() {
    await limparDadosDoTeste();
    await setTier("completo");
    const id = await clinicaId();
    const inicio = new Date(Date.now() + 6 * 86400000);
    inicio.setUTCHours(14, 0, 0, 0);
    await sb("/rpc/fila_entrar", {
      method: "POST",
      body: JSON.stringify({
        p_clinica: id,
        p_telefone: TEL(11),
        p_nome: "QA Paciente",
        p_servico: "limpeza",
        p_inicio: new Date(inicio.getTime() - 86400000).toISOString(),
        p_fim: new Date(inicio.getTime() + 86400000).toISOString(),
      }),
    });
    await sb("/rpc/fila_ofertar_proximo", {
      method: "POST",
      body: JSON.stringify({
        p_clinica: id,
        p_servico: "limpeza",
        p_inicio: inicio.toISOString(),
        p_fim: new Date(inicio.getTime() + 3600000).toISOString(),
      }),
    });

    const exec = await disparar(msgTexto("esse horario ficou estranho"));
    checar("oferta-ambigua", "nao aceitou", !rodou(exec, "Aceitar Oferta"));
    checar("oferta-ambigua", "nao recusou", !rodou(exec, "Recusar Oferta"));
    const resp = saida(exec, "Montar Esclarecimento Oferta")?.[0];
    checar(
      "oferta-ambigua",
      "pediu SIM ou NAO",
      /SIM para aceitar/i.test(resp?.partes?.[0] || ""),
      resp?.partes?.[0],
    );
    const { body } = await sb(`/fila_espera?clinica_id=eq.${id}&select=status`);
    checar(
      "oferta-ambigua",
      "oferta segue ativa",
      body?.[0]?.status === "ofertado",
    );
  },

  // 9. Audio: STT alimenta o prompt, e no Completo a resposta volta em TTS.
  async "audio-stt-tts"() {
    await limparDadosDoTeste();
    await setTier("completo");
    const exec = await disparar(
      msgMidia("audio/ogg; codecs=opus", {
        qa: {
          transcricao: "queria saber o preco da limpeza",
          claude: "A limpeza custa R$ 180.",
        },
      }),
    );
    const trans = saida(exec, "Aplicar Transcrição")?.[0];
    checar(
      "audio-stt-tts",
      "transcricao virou a mensagem",
      trans?.mensagem === "queria saber o preco da limpeza",
      trans?.mensagem,
    );
    checar(
      "audio-stt-tts",
      "STT marcado como ok",
      trans?.transcricao_audio_ok === true,
    );
    const tts = saida(exec, "Preparar Envio TTS")?.[0];
    checar(
      "audio-stt-tts",
      "TTS gerou audio (base64 nao vazio)",
      tts?.tts_ok === true && (tts?.audio_base64 || "").length > 0,
      tts?.tts_conversion_error || "",
    );
    const envios = enviosCapturados(exec);
    checar(
      "audio-stt-tts",
      "audio interceptado pelo coletor",
      envios.some((e) => e.node === "Enviar Audio TTS"),
      JSON.stringify(envios.map((e) => e.node)),
    );
  },

  // 10. Audio com TTS indisponivel: tem de cair para texto, nao sumir.
  async "audio-tts-falha"() {
    await limparDadosDoTeste();
    await setTier("completo");
    const exec = await disparar(
      msgMidia("audio/ogg; codecs=opus", {
        qa: {
          tts_falha: true,
          transcricao: "tem vaga amanha?",
          claude: "Amanha temos as 14h.",
        },
      }),
    );
    const tts = saida(exec, "Preparar Envio TTS")?.[0];
    checar("audio-tts-falha", "TTS reportou falha", tts?.tts_ok === false);
    checar(
      "audio-tts-falha",
      "caiu para envio em texto",
      rodou(exec, "Separar Partes"),
    );
    const envios = enviosCapturados(exec);
    checar(
      "audio-tts-falha",
      "nao tentou enviar audio",
      !envios.some((e) => e.node === "Enviar Audio TTS"),
    );
  },

  // 11. Imagem no Completo: a visao alimenta o prompt.
  async "imagem-visao-completo"() {
    await limparDadosDoTeste();
    await setTier("completo");
    const exec = await disparar(
      msgMidia("image/jpeg", {
        qa: {
          visao: "Receita: Amoxicilina 500mg de 8 em 8 horas por 7 dias.",
          claude: "Recebi sua receita de Amoxicilina.",
        },
      }),
    );
    const img = saida(exec, "Aplicar Resultado da Imagem")?.[0];
    checar(
      "imagem-visao-completo",
      "visao aplicada",
      img?.visao_imagem_ok === true && /Amoxicilina/.test(img?.mensagem || ""),
      img?.mensagem,
    );
    checar(
      "imagem-visao-completo",
      "sem fallback de ilegivel",
      img?.imagem_fallback === false,
    );
  },

  // 12. Imagem ilegivel: sentinela nao pode vazar cru para a IA.
  async "imagem-ilegivel"() {
    await limparDadosDoTeste();
    await setTier("completo");
    const exec = await disparar(
      msgMidia("image/jpeg", { qa: { visao: "FOTO_ILEGIVEL_NOVA_FOTO" } }),
    );
    const img = saida(exec, "Aplicar Resultado da Imagem")?.[0];
    checar(
      "imagem-ilegivel",
      "detectou ilegivel",
      img?.imagem_ilegivel === true,
    );
    checar(
      "imagem-ilegivel",
      "sentinela nao vazou para a mensagem",
      !/FOTO_ILEGIVEL/i.test(img?.mensagem || ""),
      img?.mensagem,
    );
  },

  // 13. Imagem no Essencial: limitacao explicada, sem chamar visao.
  async "imagem-tier-essencial"() {
    await limparDadosDoTeste();
    await setTier("essencial");
    const exec = await disparar(
      msgMidia("image/jpeg", { qa: { claude: "Pode me contar por texto?" } }),
    );
    checar(
      "imagem-tier-essencial",
      "nao chamou a visao",
      !rodou(exec, "Ler Imagem com Visão"),
    );
    checar(
      "imagem-tier-essencial",
      "aplicou limitacao",
      rodou(exec, "Aplicar Limitação de Imagem"),
    );
    await setTier("completo");
  },

  // 14. Handoff: [HANDOFF] tem de gerar alerta e marcar escalado.
  async escalonamento() {
    await limparDadosDoTeste();
    await setTier("completo");
    const exec = await disparar(
      msgTexto("quero falar com um humano agora", {
        qa: { claude: "Vou chamar a equipe. [HANDOFF]" },
      }),
    );
    const proc = saida(exec, "Processar Resposta IA")?.[0];
    checar(
      "escalonamento",
      "precisa_escalar marcado",
      proc?.precisa_escalar === true,
    );
    checar(
      "escalonamento",
      "tag [HANDOFF] removida do texto",
      !/HANDOFF/i.test(proc?.texto_final || ""),
      proc?.texto_final,
    );
    const envios = enviosCapturados(exec);
    checar(
      "escalonamento",
      "alerta interceptado pelo coletor",
      envios.some((e) => e.node === "Enviar Alerta"),
      JSON.stringify(envios.map((e) => e.node)),
    );
    const { body } = await sb(
      `/conversas?clinica=eq.${CLINICA_NOME}&escalado=is.true&select=id`,
    );
    checar(
      "escalonamento",
      "conversa marcada como escalada",
      body?.length >= 1,
    );
  },

  // 15. Agendamento: a IA emite [AGENDAMENTO] em BRT e o subworkflow grava.
  //     O instante gravado tem de ser o mesmo em UTC -- gravar o horario local
  //     como se fosse UTC adianta todo agendamento em 3h.
  async agendamento() {
    await limparDadosDoTeste();
    await setTier("completo");
    const id = await clinicaId();
    const d = new Date(Date.now() + 7 * 86400000);
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const aaaa = d.getUTCFullYear();
    const esperado = new Date(`${aaaa}-${mm}-${dd}T15:30:00-03:00`);

    const exec = await disparar(
      msgTexto("quero marcar limpeza", {
        qa: {
          claude: `Perfeito, vou marcar.\n\n[AGENDAMENTO]\nNOME: QA Paciente\nSERVICO: limpeza\nDATA: ${dd}/${mm}/${aaaa}\nHORA: 15:30\nTELEFONE: ${TEL(11)}\nFIM`,
          claude_resposta: "Agendamento confirmado para as 15:30.",
        },
      }),
    );

    const proc = saida(exec, "Processar Resposta IA")?.[0];
    checar(
      "agendamento",
      "tag [AGENDAMENTO] parseada",
      proc?.is_agendamento === true,
    );
    checar(
      "agendamento",
      "tag removida do texto ao paciente",
      !/\[AGENDAMENTO\]/i.test(proc?.texto_final || ""),
    );
    checar(
      "agendamento",
      "BRT convertido para UTC antes de gravar",
      proc?.agendamento &&
        new Date(proc.agendamento.data_hora).getTime() === esperado.getTime(),
      `esperado ${esperado.toISOString()} / obtido ${proc?.agendamento?.data_hora}`,
    );
    checar(
      "agendamento",
      "subworkflow de agendamento executado",
      rodou(exec, "Executar Agendamento"),
    );
    const { body } = await sb(
      `/agendamentos?clinica_id=eq.${id}&select=id,data_hora,status,paciente_nome`,
    );
    checar(
      "agendamento",
      "agendamento gravado",
      body?.length === 1,
      JSON.stringify(body),
    );
    checar(
      "agendamento",
      "instante correto no banco",
      body?.[0] && new Date(body[0].data_hora).getTime() === esperado.getTime(),
      `${body?.[0]?.data_hora}`,
    );
  },

  // 16. Conflito: horario ja ocupado nao pode virar segundo agendamento.
  async "agendamento-conflito"() {
    await limparDadosDoTeste();
    await setTier("completo");
    const id = await clinicaId();
    const d = new Date(Date.now() + 8 * 86400000);
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const aaaa = d.getUTCFullYear();
    const ocupado = new Date(`${aaaa}-${mm}-${dd}T10:00:00-03:00`);

    const pre = await sb("/agendamentos", {
      method: "POST",
      body: JSON.stringify({
        clinica_id: id,
        paciente_telefone: TEL(12),
        paciente_nome: "QA Ocupante",
        data_hora: ocupado.toISOString(),
        status: "agendado",
      }),
    });
    checar(
      "agendamento-conflito",
      "horario pre-ocupado",
      pre.status === 201,
      JSON.stringify(pre.body).slice(0, 150),
    );

    const exec = await disparar(
      msgTexto("quero marcar limpeza nesse horario", {
        qa: {
          claude: `Vou verificar.\n\n[AGENDAMENTO]\nNOME: QA Paciente\nSERVICO: limpeza\nDATA: ${dd}/${mm}/${aaaa}\nHORA: 10:00\nTELEFONE: ${TEL(11)}\nFIM`,
          claude_resposta:
            "Esse horario acabou de ser preenchido. Posso sugerir outro?",
        },
      }),
    );

    checar(
      "agendamento-conflito",
      "subworkflow executado",
      rodou(exec, "Executar Agendamento"),
    );
    const res = saida(exec, "Montar Resposta Agendamento")?.[0];
    checar(
      "agendamento-conflito",
      "conflito reportado ao fluxo",
      JSON.stringify(res || {})
        .toLowerCase()
        .includes("conflit"),
      JSON.stringify(res || {}).slice(0, 220),
    );
    const { body } = await sb(
      `/agendamentos?clinica_id=eq.${id}&data_hora=eq.${encodeURIComponent(ocupado.toISOString())}&select=id,paciente_telefone`,
    );
    checar(
      "agendamento-conflito",
      "nao criou agendamento duplicado no mesmo horario",
      body?.length === 1,
      `${body?.length} linha(s)`,
    );
    checar(
      "agendamento-conflito",
      "o horario continua com o ocupante original",
      body?.[0]?.paciente_telefone === TEL(12),
    );
  },
};

// ---- runner ----------------------------------------------------------------
const pedidos = process.argv.slice(2);
if (pedidos.includes("--list")) {
  console.log(Object.keys(cenarios).join("\n"));
  process.exit(0);
}
const alvos = pedidos.length ? pedidos : Object.keys(cenarios);

// Resolvido por NOME: recriar a copia QA gera id novo, e id hardcoded no script
// vira 404 silencioso (o polling de execucao so acha lista vazia e estoura no
// timeout, sem dizer por que).
const listaWf = await (
  await fetch(`${n8n}/api/v1/workflows?limit=250`, { headers: NH })
).json();
QA_WF = (listaWf.data || []).find((w) => w.name === QA_NOME)?.id;
if (!QA_WF) throw new Error(`copia QA nao encontrada: ${QA_NOME}`);

const id = await clinicaId();
console.log(`clinica QA: ${CLINICA_NOME} (${id})`);
console.log(`workflow QA: ${QA_WF}\n`);

const erros = [];
for (const nome of alvos) {
  if (!cenarios[nome]) {
    console.log(`?? cenario desconhecido: ${nome}`);
    continue;
  }
  console.log(`\n=== ${nome} ===`);
  try {
    await cenarios[nome]();
  } catch (e) {
    console.log(`  ERRO  ${e.message}`);
    erros.push({ cenario: nome, erro: e.message });
    resultados.push({
      cenario: nome,
      nome: "cenario executou",
      ok: false,
      detalhe: e.message,
    });
  }
}

await limparDadosDoTeste();
await setTier("completo");

const passou = resultados.filter((r) => r.ok).length;
const falhou = resultados.length - passou;
console.log(`\n===== ${passou} PASS / ${falhou} FALHA =====`);
if (falhou) {
  for (const r of resultados.filter((x) => !x.ok)) {
    console.log(
      `  FALHA ${r.cenario} > ${r.nome}${r.detalhe ? ` (${r.detalhe})` : ""}`,
    );
  }
}

const outDir = resolve("tmp-qa-fila-e2e");
mkdirSync(outDir, { recursive: true });
const arquivo = join(
  outDir,
  `resultado-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
);
writeFileSync(
  arquivo,
  JSON.stringify(
    { clinica_id: id, workflow: QA_WF, resultados, erros },
    null,
    2,
  ),
);
console.log(`\nevidencia: ${arquivo}`);
process.exit(falhou ? 1 : 0);
