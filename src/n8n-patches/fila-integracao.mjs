// Integracao da fila de espera no workflow Atendimento.
//
// FONTE UNICA: este modulo e importado tanto pelo construtor da copia QA
// (qa-copia-atendimento-fila.mjs) quanto pelo aplicador de producao
// (aplicar-fila-producao.mjs). Se os dois tivessem copias separadas do mesmo
// codigo, a bateria QA deixaria de provar o que vai para producao no primeiro
// dia em que uma delas fosse editada sozinha.
//
// Contratos das RPCs conforme migrations 019/020 -- ver a nota de memoria
// "fila-espera" para o porque de cada um:
//   - fila_entrar exige janela (p_inicio/p_fim); nula da 22023;
//   - aceitar/recusar usam a assinatura de DOIS argumentos (a de 1 perdeu
//     EXECUTE na 019);
//   - o agendamento nasce em oferta_inicio, nunca em janela_inicio.

const CFG = "$('Configuração da Clínica').first().json";
const PARSER = "$('Parser da Mensagem').first().json";

/**
 * Aplica, in-place, os nodes e as ligacoes da fila sobre um workflow Atendimento.
 *
 * @param {object} wf            workflow (objeto ja parseado; e mutado)
 * @param {object} opts
 * @param {object} opts.credSupabase  credenciais a usar nos nodes httpRequest
 * @param {string} opts.supabaseUrl   URL do Supabase, injetada em "Configuração da Clínica"
 */
export function aplicarIntegracaoFila(wf, { credSupabase, supabaseUrl }) {
  const http = (name, position, extra) => ({
    name,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position,
    parameters: {
      authentication: "predefinedCredentialType",
      nodeCredentialType: "supabaseApi",
      options: {},
      ...extra,
    },
    credentials: credSupabase,
    alwaysOutputData: true,
    onError: "continueRegularOutput",
  });
  const code = (name, position, jsCode) => ({
    name,
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position,
    parameters: { jsCode },
  });
  const iff = (name, position, expr) => ({
    name,
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position,
    parameters: {
      conditions: {
        options: { typeValidation: "loose", version: 2 },
        conditions: [
          {
            id: name,
            leftValue: expr,
            rightValue: true,
            operator: { type: "boolean", operation: "true", singleValue: true },
          },
        ],
        combinator: "and",
      },
      looseTypeValidation: true,
      options: {},
    },
  });

  // ---- Configuracao da Clinica: tier, clinica_id e supabase_url ------------
  const cfg = wf.nodes.find((n) => n.name === "Configuração da Clínica");
  if (!cfg) throw new Error('node "Configuração da Clínica" ausente');
  if (!cfg.parameters.jsCode.includes("clinica_id: c.id")) {
    cfg.parameters.jsCode = cfg.parameters.jsCode.replace(
      "    clinica: c.clinica,\n",
      "    clinica: c.clinica,\n" +
        "    clinica_id: c.id,\n" +
        "    tier: c.tier || 'essencial',\n" +
        `    supabase_url: '${supabaseUrl}',\n`,
    );
  }
  if (!cfg.parameters.jsCode.includes("clinica_id: c.id")) {
    throw new Error(
      "nao consegui injetar clinica_id em Configuração da Clínica",
    );
  }

  const novos = [
    // -- Porta de entrada do ramo da fila -----------------------------------
    // Clinica que nao e Completo nem entra aqui: segue o atendimento de sempre,
    // sem request extra e sem resposta canned chegando ao paciente.
    // Le o tier da linha crua do Supabase, como "IF - Imagem Completo?" ja faz.
    iff(
      "Gate Fila Tier Completo",
      [-280, 640],
      "={{ ($('Buscar Clínica').first().json.tier || 'essencial') === 'completo' }}",
    ),

    // -- Resposta a uma oferta ativa (SIM / NAO) ----------------------------
    code(
      "Detectar Resposta Oferta",
      [-60, 760],
      `
const t = String($json.mensagem || '').trim().toLowerCase();
const afirm = /^(sim|s|aceito|aceitar|confirmo|pode reservar|quero|ok|ta bom|tá bom|pode ser)\\b/i.test(t);
const rec = /^(nao|não|recuso|recusar|desisto|desisti|cancelar|nao quero|não quero)\\b/i.test(t);
const amb = !afirm && !rec && /(oferta|horario|horário|vaga)/i.test(t);
return [{ json: { ...$json, oferta_resposta: afirm ? 'aceite' : rec ? 'recusa' : amb ? 'ambigua' : 'nenhuma' } }];`,
    ),

    http("Buscar Oferta Ativa do Paciente", [160, 760], {
      url: `={{ ${CFG}.supabase_url + '/rest/v1/fila_espera?clinica_id=eq.' + encodeURIComponent(${CFG}.clinica_id) + '&paciente_telefone=eq.' + encodeURIComponent(${PARSER}.telefone) + '&status=eq.ofertado&select=id,status,servico,oferta_expira_em,oferta_inicio,oferta_fim,janela_inicio,janela_fim&limit=1' }}`,
    }),

    // oferta_inicio, NAO janela_inicio: sao instantes diferentes. Usar a
    // preferencia como horario de aceite reintroduz o bug de 15h virar 12h.
    code(
      "Combinar Resposta e Oferta",
      [380, 760],
      `
const r = $('Detectar Resposta Oferta').first().json;
const f = $input.all().map((i) => i.json).find((x) => x && x.id) || null;
return [{ json: { ...r,
  oferta: f,
  oferta_id: f?.id || null,
  oferta_servico: f?.servico || null,
  oferta_inicio: f?.oferta_inicio || null,
  oferta_fim: f?.oferta_fim || null,
} }];`,
    ),

    iff(
      "IF - Resposta de Oferta?",
      [600, 760],
      '={{ $json.oferta_resposta !== "nenhuma" && $json.oferta_id !== null }}',
    ),
    iff(
      "IF - Oferta Ambigua?",
      [820, 860],
      '={{ $json.oferta_resposta === "ambigua" }}',
    ),
    iff(
      "Gate Tier Completo Oferta",
      [1040, 900],
      `={{ ${CFG}.tier === 'completo' }}`,
    ),
    iff(
      "IF - Aceite ou Recusa?",
      [1260, 840],
      '={{ $json.oferta_resposta === "aceite" }}',
    ),

    // Assinaturas de DOIS argumentos: as de 1 arg ficaram sem EXECUTE na 019.
    http("Aceitar Oferta", [1480, 760], {
      method: "POST",
      url: `={{ ${CFG}.supabase_url + '/rest/v1/rpc/fila_aceitar_oferta' }}`,
      sendBody: true,
      specifyBody: "json",
      jsonBody: `={{ JSON.stringify({ p_id: $json.oferta_id, p_clinica: ${CFG}.clinica_id }) }}`,
    }),
    http("Recusar Oferta", [1480, 940], {
      method: "POST",
      url: `={{ ${CFG}.supabase_url + '/rest/v1/rpc/fila_recusar_oferta' }}`,
      sendBody: true,
      specifyBody: "json",
      jsonBody: `={{ JSON.stringify({ p_id: $json.oferta_id, p_clinica: ${CFG}.clinica_id }) }}`,
    }),
    // Slot pontual: p_inicio/p_fim vem da OFERTA recusada, nao da preferencia.
    http("Ofertar Proximo Apos Recusa", [1700, 940], {
      method: "POST",
      url: `={{ ${CFG}.supabase_url + '/rest/v1/rpc/fila_ofertar_proximo' }}`,
      sendBody: true,
      specifyBody: "json",
      jsonBody: `={{ JSON.stringify({ p_clinica: ${CFG}.clinica_id, p_servico: $('Combinar Resposta e Oferta').first().json.oferta_servico, p_inicio: $('Combinar Resposta e Oferta').first().json.oferta_inicio, p_fim: $('Combinar Resposta e Oferta').first().json.oferta_fim }) }}`,
    }),

    // Caminho explicito para "nao havia proximo da fila": sem isto o item vazio
    // some e o paciente que recusou fica sem resposta nenhuma.
    code(
      "Avaliar Proxima Oferta",
      [1920, 940],
      `
const rows = $input.all().map((i) => i.json).filter((x) => x && Object.keys(x).length);
const prox = rows.find((x) => x && x.id) || null;
return [{ json: { ...$('Combinar Resposta e Oferta').first().json,
  rpc_resultado: rows[0] || null,
  proxima_oferta_id: prox?.id || null,
  houve_proxima_oferta: Boolean(prox),
} }];`,
    ),

    code(
      "Montar Resposta Oferta",
      [2140, 840],
      `
const base = $('Combinar Resposta e Oferta').first().json;
const cfg = $('Configuração da Clínica').first().json;
const raw = $json || {};
const erro = String(raw.error?.message || raw.message || '');
const ok = Boolean(raw.id || raw[0]?.id);
let texto;
if (cfg.tier !== 'completo') {
  // Quem le isto e o PACIENTE: nunca expor o plano comercial da clinica.
  texto = 'Nao consigo registrar fila de espera por aqui. Vou pedir para a equipe falar com voce.';
} else if (base.oferta_resposta === 'aceite' && ok) {
  texto = 'Horario reservado com sucesso. Sua consulta foi confirmada.';
} else if (base.oferta_resposta === 'aceite' && /expirada|oferta_expirada/i.test(erro)) {
  texto = 'Essa oferta expirou e nao pode mais ser reservada.';
} else if (base.oferta_resposta === 'recusa' && ('houve_proxima_oferta' in raw)) {
  texto = raw.houve_proxima_oferta
    ? 'Tudo bem, recusei a oferta. Ja repassei o horario para a proxima pessoa da fila.'
    : 'Tudo bem, recusei a oferta. Nao havia mais ninguem na fila para esse horario.';
} else {
  texto = 'Nao consegui processar a oferta. Responda SIM para aceitar ou NAO para recusar.';
}
return [{ json: { ...base, partes: [texto], oferta_resposta_texto: texto } }];`,
    ),

    code(
      "Montar Esclarecimento Oferta",
      [1040, 1060],
      `
return [{ json: { ...$json, partes: ['Para responder a oferta, diga SIM para aceitar ou NAO para recusar.'] } }];`,
    ),

    // -- Entrada na fila ----------------------------------------------------
    // A 020 rejeita janela nula (22023 janela_invalida). Sem janela explicita
    // na mensagem usamos [agora, agora+14d]: janela valida e honesta
    // ("qualquer horario nas proximas duas semanas").
    code(
      "Detectar Intencao Fila",
      [-60, 520],
      `
const ctx = { ...$json };
const text = String(ctx.mensagem || '').toLowerCase();
const hit = /(entrar|entra|colocar|coloque|incluir|me poe|me põe|lista|fila|encaixe|avise|avisar).{0,30}(fila|espera|encaixe|vaga)|fila.{0,30}(entrar|espera|encaixe)/i.test(text);
const m = text.match(/(?:para|de|pra)\\s+([a-zà-ú ]{3,40})/i);
const servico = (m?.[1] || 'consulta').replace(/[^a-zà-ú ]/gi, ' ').replace(/\\s+/g, ' ').trim().toLowerCase();
const agora = new Date();
const fim = new Date(agora.getTime() + 14 * 24 * 60 * 60 * 1000);
return [{ json: { ...ctx,
  fila_intencao: hit,
  fila_servico: servico,
  fila_servico_normalizado: servico.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\\s+/g, ' '),
  fila_inicio: agora.toISOString(),
  fila_fim: fim.toISOString(),
} }];`,
    ),

    iff("IF - Intencao de Fila?", [160, 520], "={{ $json.fila_intencao }}"),

    http("Verificar Entrada Fila", [380, 520], {
      url: `={{ ${CFG}.supabase_url + '/rest/v1/fila_espera?clinica_id=eq.' + encodeURIComponent(${CFG}.clinica_id) + '&paciente_telefone=eq.' + encodeURIComponent(${PARSER}.telefone) + '&servico_normalizado=eq.' + encodeURIComponent($json.fila_servico_normalizado) + '&status=in.(aguardando,ofertado)&select=id,status&limit=1' }}`,
    }),

    code(
      "Checar Duplicidade Fila",
      [600, 520],
      `
const rows = $input.all().map((i) => i.json).filter((r) => r && r.id);
return [{ json: { ...$('Detectar Intencao Fila').first().json, fila_duplicada: rows.length > 0 } }];`,
    ),

    iff("IF - Fila Duplicada?", [820, 520], "={{ $json.fila_duplicada }}"),
    iff(
      "IF - Fila Completo?",
      [1040, 620],
      `={{ ${CFG}.tier === 'completo' }}`,
    ),

    http("Entrar na Fila", [1260, 560], {
      method: "POST",
      url: `={{ ${CFG}.supabase_url + '/rest/v1/rpc/fila_entrar' }}`,
      sendBody: true,
      specifyBody: "json",
      jsonBody: `={{ JSON.stringify({ p_clinica: ${CFG}.clinica_id, p_telefone: ${PARSER}.telefone, p_nome: ${PARSER}.pushname || 'Paciente', p_servico: $json.fila_servico, p_inicio: $json.fila_inicio, p_fim: $json.fila_fim }) }}`,
    }),

    code(
      "Montar Resposta Fila",
      [1480, 600],
      `
// "Checar Duplicidade Fila", nao "Detectar Intencao Fila": e la que
// fila_duplicada nasce. Lendo do detector o campo vem sempre undefined e o
// paciente ja na fila recebia "nao consegui registrar" em vez do aviso certo.
// Os dois caminhos ate aqui passam pelo checador, entao ele sempre existe.
const ctx = $('Checar Duplicidade Fila').first().json;
const cfg = $('Configuração da Clínica').first().json;
const raw = $json || {};
const erro = String(raw.error?.message || raw.message || '');
const ok = Boolean(raw.id || raw[0]?.id);
let texto;
if (ctx.fila_duplicada || /duplicada|limite_fila_paciente/i.test(erro)) {
  texto = 'Voce ja esta na fila para este servico. Posso verificar sua posicao se quiser.';
} else if (cfg.tier !== 'completo') {
  // Quem le isto e o PACIENTE: nunca expor o plano comercial da clinica.
  texto = 'Nao consigo registrar fila de espera por aqui. Posso ajudar com o agendamento normal?';
} else if (ok) {
  texto = 'Voce entrou na fila de espera. Avisaremos quando surgir um horario compativel.';
} else {
  texto = 'Nao consegui registrar sua entrada na fila agora. Tente novamente em instantes.';
}
return [{ json: { ...ctx, partes: [texto], fila_resposta: texto, fila_entrada_ok: ok, fila_erro: erro || null } }];`,
    ),
  ];

  for (const n of novos) {
    const old = wf.nodes.find((x) => x.name === n.name);
    if (old) Object.assign(old, n);
    else wf.nodes.push(n);
  }

  // ---- Ligacoes -----------------------------------------------------------
  const c = wf.connections;
  const link = (from, branches) => {
    c[from] = {
      main: branches.map((b) =>
        b.map((node) => ({ node, type: "main", index: 0 })),
      ),
    };
  };

  link("Consolidar Histórico", [["Gate Fila Tier Completo"]]);
  link("Gate Fila Tier Completo", [
    ["Detectar Resposta Oferta"],
    ["IF - É Áudio?"],
  ]);
  link("Detectar Resposta Oferta", [["Buscar Oferta Ativa do Paciente"]]);
  link("Buscar Oferta Ativa do Paciente", [["Combinar Resposta e Oferta"]]);
  link("Combinar Resposta e Oferta", [["IF - Resposta de Oferta?"]]);
  link("IF - Resposta de Oferta?", [
    ["IF - Oferta Ambigua?"],
    ["Detectar Intencao Fila"],
  ]);
  link("IF - Oferta Ambigua?", [
    ["Montar Esclarecimento Oferta"],
    ["Gate Tier Completo Oferta"],
  ]);
  link("Gate Tier Completo Oferta", [
    ["IF - Aceite ou Recusa?"],
    ["Montar Resposta Oferta"],
  ]);
  link("IF - Aceite ou Recusa?", [["Aceitar Oferta"], ["Recusar Oferta"]]);
  link("Aceitar Oferta", [["Montar Resposta Oferta"]]);
  link("Recusar Oferta", [["Ofertar Proximo Apos Recusa"]]);
  link("Ofertar Proximo Apos Recusa", [["Avaliar Proxima Oferta"]]);
  link("Avaliar Proxima Oferta", [["Montar Resposta Oferta"]]);
  link("Montar Resposta Oferta", [["Separar Partes"]]);
  link("Montar Esclarecimento Oferta", [["Separar Partes"]]);

  link("Detectar Intencao Fila", [["IF - Intencao de Fila?"]]);
  link("IF - Intencao de Fila?", [
    ["Verificar Entrada Fila"],
    ["IF - É Áudio?"],
  ]);
  link("Verificar Entrada Fila", [["Checar Duplicidade Fila"]]);
  link("Checar Duplicidade Fila", [["IF - Fila Duplicada?"]]);
  link("IF - Fila Duplicada?", [
    ["Montar Resposta Fila"],
    ["IF - Fila Completo?"],
  ]);
  link("IF - Fila Completo?", [["Entrar na Fila"], ["Montar Resposta Fila"]]);
  link("Entrar na Fila", [["Montar Resposta Fila"]]);
  link("Montar Resposta Fila", [["Separar Partes"]]);

  return novos.map((n) => n.name);
}
