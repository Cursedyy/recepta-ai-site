const cfg = $('Configuração da Clínica').first().json;
const iaConfig = cfg.ia_config || {};

let systemPrompt = iaConfig.system_prompt || '';
if (!systemPrompt) {
  throw new Error(`ia_config da clinica "${cfg.clinica}" nao tem system_prompt`);
}

const historico = $('Consolidar Histórico').first().json.historico || [];
const mensagemAtual = $('Parser da Mensagem').first().json.mensagem;

// ── REGRAS DE SAUDAÇÃO ──
const antiSaudacaoRule = `

[INSTRUÇÃO DE SAUDAÇÃO]: Se o histórico abaixo JÁ CONTER mensagens trocadas anteriormente nesta conversa, JAMAIS diga 'Oi', 'Olá', 'Bom dia', 'Boa tarde' ou se apresente novamente. Responda diretamente à solicitação do usuário sem rodeios.`;

systemPrompt += antiSaudacaoRule;

// ── TABELA DE PRÓXIMOS 14 DIAS ──
const NOMES_DIAS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
// Usar fuso horário de São Paulo (BRT) em vez do UTC do servidor
  const nowUTC = new Date();
  const hoje = new Date(nowUTC.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
const linhasCalendario = [];
for (let i = 0; i <= 13; i++) {
  const d = new Date(hoje);
  d.setDate(hoje.getDate() + i);
  const diaSemana = NOMES_DIAS[d.getDay()];
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const rotulo = i === 0 ? ' (HOJE)' : i === 1 ? ' (AMANHÃ)' : '';
  linhasCalendario.push(`- ${diaSemana} ${dd}/${mm}/${yyyy}${rotulo}`);
}
const calendarioBloco = `
REFÊNCIA DE DATAS (use para resolver "hoje", "amanhã", "próxima segunda", etc.):
Hoje é ${NOMES_DIAS[hoje.getDay()]}, ${String(hoje.getDate()).padStart(2,'0')}/${String(hoje.getMonth()+1).padStart(2,'0')}/${hoje.getFullYear()}.
${linhasCalendario.join('\n')}`;
systemPrompt += calendarioBloco;

// ── TELEFONE DO PACIENTE (já conhecido pelo WhatsApp) ──
const telefonePaciente = $('Parser da Mensagem').first().json.telefone;
const telefoneBloco = `
TELEFONE DO PACIENTE (já disponível, NÃO peça de novo):
${telefonePaciente}`;
systemPrompt += telefoneBloco;

// ── INSTRUÇÃO DE AGENDAMENTO ──
const agendamentoBloco = `

[AGENDAMENTO — REGRAS OBRIGATÓRIAS]:
IMPORTANTE SOBRE DATAS: Quando o paciente diz apenas o nome do dia (ex: "sexta", "segunda"), ele se refere à PRÓXIMA OCORRÊNÇA DAQUELE DIA a partir de HOJE. Se HOJE é aquele dia, significa HOJE. Se HOJE não é aquele dia, significa a próxima vez que aquele dia chega. NÃO pule para a semana seguinte sem necessidade.
Quando o paciente confirmar um agendamento (data + horário + serviço), você DEVE:
1. NÃO confirme nada ao paciente ainda. O agendamento será executado pelo sistema e você receberá o resultado.
2. Responda APENAS com: "Aguarde um momento, vou verificar a disponibilidade..." e na ÚLTIMA linha inclua este bloco:
[AGENDAMENTO]
NOME: nome do paciente
SERVICO: tipo de serviço (ex: limpeza, consulta)
DATA: DD/MM/AAAA
HORA: HH:MM
TELEFONE: número do paciente
FIM

IMPORTANTE:
- NÃO confirme o agendamento ao paciente. NÃO diga "agendado", "marcado", "confirmado".
- O paciente só receberá confirmação DEPOIS que o sistema validar e gravar o agendamento.
- DATA deve ser no formato DD/MM/AAAA (ex: 04/09/2026), NÃO por extenso.
- HORA deve ser no formato HH:MM (ex: 12:00), NÃO "meio-dia" ou "12h".
- Se faltar algum dado, NÃO inclua o bloco [AGENDAMENTO] — peça o dado faltante.
- O bloco [AGENDAMENTO] só deve aparecer quando TODOS os 5 campos estão completos.`;
systemPrompt += agendamentoBloco;

const agendamentoDeterministico = `

[AGENDAMENTO — GATE DETERMINÍSTICO]: O NOME, SERVICO, DATA e HORA podem estar na mensagem atual ou no histórico. Quando os quatro estiverem disponíveis, use o TELEFONE DO PACIENTE acima como quinto campo e emita obrigatoriamente o bloco [AGENDAMENTO]. Não peça confirmação adicional de modalidade (particular/convênio), disponibilidade, nome, serviço, data ou horário; o workflow valida a disponibilidade. A modalidade não é campo do bloco [AGENDAMENTO]. Em caso de conflito no histórico, use a informação mais recente do paciente.`;
systemPrompt += agendamentoDeterministico;

const pastDateInstr = "\n\n[VALIDAÇÃO DE DATA]: NUNCA inclua o bloco [AGENDAMENTO] para datas ou horários que já passaram. Se o paciente pedir um horário no passado, informe que aquele horário já passou e sugira horários futuros. O sistema rejeitará agendamentos no passado, mas é melhor prevenir no prompt.";
systemPrompt += pastDateInstr;


// ── config_editavel: dados mantidos pela clinica no painel ──
const NOME_DIA = {
  segunda: 'Segunda',
  terca: 'Terça',
  quarta: 'Quarta',
  quinta: 'Quinta',
  sexta: 'Sexta',
  sabado: 'Sábado',
  domingo: 'Domingo',
};
const cfgEdit = cfg.config_editavel || {};
const blocos = [];

const precos = Array.isArray(cfgEdit.precos)
  ? cfgEdit.precos.filter((p) => p && typeof p.nome === 'string' && p.nome.trim())
  : [];
if (precos.length) {
  blocos.push(
    'PREÇOS (exatos, pode informar):\n' +
      precos
        .map((p) => '- ' + p.nome.trim() + ': R$ ' + Number(p.valor || 0).toFixed(2).replace('.', ','))
        .join('\n')
  );
}

const convenios = Array.isArray(cfgEdit.convenios)
  ? cfgEdit.convenios.filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim())
  : [];
if (convenios.length) {
  blocos.push(
    'CONVÊNIOS ACEITOS (lista fechada — o que não está aqui, você não confirma):\n- ' +
      convenios.join('\n- ')
  );
}

const horarios = cfgEdit.horarios && typeof cfgEdit.horarios === 'object' ? cfgEdit.horarios : {};
const linhasHorario = Object.keys(NOME_DIA)
  .map((dia) => {
    const faixas = Array.isArray(horarios[dia]) ? horarios[dia].filter((f) => f && f.inicio && f.fim) : [];
    if (!faixas.length) return null;
    return '- ' + NOME_DIA[dia] + ': ' + faixas.map((f) => f.inicio + ' às ' + f.fim).join(' e ');
  })
  .filter(Boolean);
if (linhasHorario.length) {
  blocos.push('HORÁRIO DE ATENDIMENTO:\n' + linhasHorario.join('\n'));
}

const identidade =
  typeof cfgEdit.mensagem_identidade === 'string' ? cfgEdit.mensagem_identidade.trim() : '';
if (identidade) {
  blocos.push('COMO SE APRESENTAR (use este texto na abertura da conversa):\n' + identidade);
}

const regrasCategoria = typeof cfgEdit.regras_categoria === 'string' ? cfgEdit.regras_categoria.trim() : '';
if (regrasCategoria) {
  blocos.push(
    'REGRAS DO SEGMENTO (comportamento específico da área de atuação):\n' +
    regrasCategoria
  );
}

// regras_ia / faq / campos_extras: preenchidos pela clinica no painel e, ate
// 2026-09-09, gravados no Supabase sem NINGUEM ler. A clinica editava, via
// "salvo" e a IA nunca usava nada disso.
const regrasIa = typeof cfgEdit.regras_ia === 'string' ? cfgEdit.regras_ia.trim() : '';
if (regrasIa) {
  blocos.push(
    'REGRAS ADICIONAIS DA CLINICA (escritas pela propria clinica, obrigatorias):\n' +
    regrasIa
  );
}

const faqClinica = Array.isArray(cfgEdit.faq)
  ? cfgEdit.faq.filter(
      (f) =>
        f &&
        typeof f.pergunta === 'string' && f.pergunta.trim() &&
        typeof f.resposta === 'string' && f.resposta.trim()
    )
  : [];
if (faqClinica.length) {
  blocos.push(
    'PERGUNTAS FREQUENTES (respostas oficiais da clinica — use estas, nao invente outra):\n' +
    faqClinica
      .map((f) => 'P: ' + f.pergunta.trim() + '\nR: ' + f.resposta.trim())
      .join('\n\n')
  );
}

// campos_extras e um mapa { id_do_campo: valor } definido por categoria em
// src/_lib/categorias.js. Os rotulos legiveis moram no repo, nao no banco:
// aqui a chave e apenas humanizada (underscore vira espaco).
const camposExtras =
  cfgEdit.campos_extras &&
  typeof cfgEdit.campos_extras === 'object' &&
  !Array.isArray(cfgEdit.campos_extras)
    ? cfgEdit.campos_extras
    : {};
const linhasExtras = Object.keys(camposExtras)
  .map((chave) => {
    const bruto = camposExtras[chave];
    let valor = '';
    if (Array.isArray(bruto)) valor = bruto.filter(Boolean).join(', ');
    else if (typeof bruto === 'boolean') valor = bruto ? 'sim' : 'nao';
    else if (typeof bruto === 'number') valor = String(bruto);
    else if (typeof bruto === 'string') valor = bruto.trim();
    if (!valor) return null;
    const rotulo = chave.replace(/_/g, ' ');
    return '- ' + rotulo.charAt(0).toUpperCase() + rotulo.slice(1) + ': ' + valor;
  })
  .filter(Boolean);
if (linhasExtras.length) {
  blocos.push('DADOS DA CLINICA:\n' + linhasExtras.join('\n'));
}

if (blocos.length) {
  systemPrompt +=


    'Estes dados TÊM PRECEDÊNCIA sobre qualquer informação equivalente escrita antes neste prompt. ' +
    'Se o que o paciente pediu é do mesmo tipo de um bloco abaixo mas não aparece na lista, você NÃO tem esse dado: ' +
    'não deduza, não estime e não use valor antigo — escale.\n\n' +
    blocos.join('\n\n');
}

let messages = historico.map((h) => ({
  role: h.role === 'ia' ? 'assistant' : 'user',
  content: h.mensagem,
}));
messages.push({ role: 'user', content: mensagemAtual });

const consolidacaoRule = "\n[REGRA DE CONSOLIDAÇÃO DE INTENÇÃO]\nSempre use a informação MAIS RECENTE do paciente. Se houver contradições no histórico (ex: paciente disse \"sexta\" antes, mas depois disse \"hoje\"), ignore as informações anteriores e use a última declaração. NÃO repita perguntas sobre dados que o paciente já forneceu. Se o paciente já confirmou nome, telefone, serviço, data e horário, NÃO peça confirmação novamente — emita o bloco [AGENDAMENTO] conforme o gate determinístico.";
const systemWithConsolidation = systemPrompt + consolidacaoRule;


// === HISTÓRICO: limitar às últimas 10 mensagens ===
const MAX_HISTORY = 10;
if (messages.length > MAX_HISTORY) {
  messages = messages.slice(-MAX_HISTORY);
}

return [{
    json: {
      system: systemWithConsolidation, messages, ia_config: iaConfig } }];
