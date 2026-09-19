// processar-resposta-ia.js — CÓDIGO CANÔNICO do node "Processar Resposta IA"
// (workflow Atendimento cxn5FxUNMJmlJ1WJ). Fonte: código LIVE do n8n
// (atualizado em 2026-09-08: debounce/identidade, is_agendamento, mensagem_media,
//  fuso BRT→UTC no [AGENDAMENTO]). deploy-media-fix.mjs copia este arquivo verbatim
// para o node — NÃO edite sem re-deploy e re-teste. Contrato de saída:
// partes, precisa_escalar, texto_final, telefone, clinica, clinica_id,
// mensagem_paciente, supabase_insert, agendamento, is_agendamento.
const resp = $input.first().json;
const blocks = resp.content || [];
let texto = blocks.map((b) => b.text || '').join('\n').trim();

const precisaEscalar = /\[HANDOFF\]/i.test(texto);
texto = texto.replace(/\[HANDOFF\]/gi, '').trim();

// ── Parse [AGENDAMENTO] tag ──
let agendamento = null;
const agendamentoMatch = texto.match(/\[AGENDAMENTO\]\n([\s\S]*?)(?:\nFIM|$)/i);
if (agendamentoMatch) {
  const bloco = agendamentoMatch[1];
  const extrair = (campo) => {
    const m = bloco.match(new RegExp(campo + ':\\s*(.+)'));
    return m ? m[1].trim() : null;
  };
  const nome = extrair('NOME');
  const servico = extrair('SERVICO');
  const data = extrair('DATA');
  const hora = extrair('HORA');
  const telefone = extrair('TELEFONE');

  if (nome && servico && data && hora && telefone) {
    // Parse DD/MM/AAAA → ISO
    const partesData = data.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    const partesHora = hora.match(/(\d{2}):(\d{2})/);
    if (partesData && partesHora) {
      const iso = new Date(`${partesData[3]}-${partesData[2]}-${partesData[1]}T${partesHora[1]}:${partesHora[2]}:00-03:00`).toISOString();
      agendamento = { nome, servico, data_hora: iso, telefone };
    }
  }
  // Remove the tag from displayed text
  texto = texto.replace(/\[AGENDAMENTO\][\s\S]*?(?:\nFIM|$)/gi, '').trim();
}

const partes = texto.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
const partesFinal = partes.length > 0 ? partes : [texto];

const clinica = $('Configuração da Clínica').first().json.clinica;
const telefone = $('Parser da Mensagem').first().json.telefone;
const clinicaId = $('Buscar Clínica').first().json.id;
// O que o paciente "disse" e o que de fato foi para a IA: em imagem isso e a
// extracao da visao, em audio a transcricao, em tier Essencial o texto de
// limitacao. Ler do Parser gravava so o rotulo cru ("[imagem]"), escondendo
// do painel o conteudo que a clinica precisa ver. Montar Prompt e entrada
// unica deste node (Montar Prompt -> Chamar Claude -> aqui), entao sempre
// existe; o Parser fica de rede de seguranca.
const mensagemPaciente =
  $('Montar Prompt').first().json.messages?.slice(-1)[0]?.content ||
  $('Parser da Mensagem').first().json.mensagem;
const mensagemMedia = $('Parser da Mensagem').first().json.mensagem_media || null;

const supabaseInsert = [
  {
    telefone,
    clinica,
    role: 'paciente',
    mensagem: mensagemPaciente,
    mensagem_media: mensagemMedia,
    escalado: false,
  },
  {
    telefone,
    clinica,
    role: 'ia',
    mensagem: texto,
    mensagem_media: null,
    escalado: precisaEscalar,
  },
];

return [
  {
    json: {
      partes: partesFinal,
      precisa_escalar: precisaEscalar,
      texto_final: texto,
      telefone,
      clinica,
      clinica_id: clinicaId,
      mensagem_paciente: mensagemPaciente,
      supabase_insert: supabaseInsert,
      agendamento,
      is_agendamento: agendamento !== null,
    },
  },
];
