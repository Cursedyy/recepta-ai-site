// categorias.js
//
// Mapeamento de categorias de clínica.
// Cada categoria-pai define: tabs, campos extras, regras padrão e FAQ.
// Sub-categorias herdam da pai automaticamente via getCategoriaConfig().
//
// Para adicionar uma nova categoria-pai, adicione aqui.
// Para adicionar sub-categorias, adicione com o campo `pai`.

const CATEGORIAS_RAW = [
  // ── Estética ──
  { id: "estetica", nome: "Estética", icon: "✨", pai: null },
  { id: "estetica_facial", nome: "Estética Facial", icon: "✨", pai: "estetica" },
  { id: "estetica_corporal", nome: "Estética Corporal", icon: "✨", pai: "estetica" },
  { id: "depilacao", nome: "Depilação", icon: "✨", pai: "estetica" },
  { id: "maquiagem", nome: "Maquiagem / Design de Sobrancelhas", icon: "💄", pai: "estetica" },
  { id: "sobrancelhas", nome: "Sobrancelhas / Cílios", icon: "👁️", pai: "estetica" },

  // ── Odontologia ──
  { id: "odontologia", nome: "Odontologia", icon: "🦷", pai: null },
  { id: "ortodontia", nome: "Ortodontia", icon: "🦷", pai: "odontologia" },
  { id: "implantes", nome: "Implantes Dentários", icon: "🦷", pai: "odontologia" },
  { id: "endodontia", nome: "Endodontia", icon: "🦷", pai: "odontologia" },
  { id: "odontopediatria", nome: "Odontopediatria", icon: "👶", pai: "odontologia" },
  { id: "estetica_dental", nome: "Estética Dental", icon: "🦷", pai: "odontologia" },
  { id: "periodontia", nome: "Periodontia", icon: "🦷", pai: "odontologia" },

  // ── Psicologia ──
  { id: "psicologia", nome: "Psicologia", icon: "🧠", pai: null },
  { id: "psicanalise", nome: "Psicanálise", icon: "🧠", pai: "psicologia" },
  { id: "tcc", nome: "Terapia Cognitivo-Comportamental", icon: "🧠", pai: "psicologia" },
  { id: "terapia_casal", nome: "Terapia de Casal / Família", icon: "👨‍👩‍👧", pai: "psicologia" },
  { id: "neuropsicologia", nome: "Neuropsicologia", icon: "🧠", pai: "psicologia" },
  { id: "psiquiatria", nome: "Psiquiatria", icon: "💊", pai: "psicologia" },
  { id: "terapia_infantil", nome: "Psicologia Infantil", icon: "🧒", pai: "psicologia" },

  // ── Nutrição ──
  { id: "nutricao", nome: "Nutrição", icon: "🥗", pai: null },
  { id: "nutri_esportiva", nome: "Nutrição Esportiva", icon: "💪", pai: "nutricao" },
  { id: "nutri_clinica", nome: "Nutrição Clínica", icon: "🏥", pai: "nutricao" },
  { id: "emagrecimento", nome: "Emagrecimento", icon: "⚖️", pai: "nutricao" },
  { id: "nutri_gestante", nome: "Nutrição Gestante", icon: "🤰", pai: "nutricao" },
  { id: "nutri_infantil", nome: "Nutrição Infantil", icon: "👶", pai: "nutricao" },

  // ── Fisioterapia ──
  { id: "fisioterapia", nome: "Fisioterapia", icon: "🏃", pai: null },
  { id: "fisio_ortopedica", nome: "Fisioterapia Ortopédica", icon: "🦴", pai: "fisioterapia" },
  { id: "fisio_respiratoria", nome: "Fisioterapia Respiratória", icon: "🫁", pai: "fisioterapia" },
  { id: "fisio_neurologica", nome: "Fisioterapia Neurológica", icon: "🧠", pai: "fisioterapia" },
  { id: "fisio_pelvica", nome: "Fisioterapia Pélvica", icon: "🏥", pai: "fisioterapia" },
  { id: "fisio_esportiva", nome: "Fisioterapia Esportiva", icon: "⚽", pai: "fisioterapia" },
  { id: "pilates", nome: "Pilates", icon: "🧘", pai: "fisioterapia" },
  { id: "acupuntura", nome: "Acupuntura", icon: "📍", pai: "fisioterapia" },

  // ── Medicina Geral ──
  { id: "geral", nome: "Medicina Geral", icon: "🏥", pai: null },
  { id: "clinica_geral", nome: "Clínica Geral", icon: "🩺", pai: "geral" },
  { id: "pediatria", nome: "Pediatria", icon: "👶", pai: "geral" },
  { id: "cardiologia", nome: "Cardiologia", icon: "❤️", pai: "geral" },
  { id: "dermatologia", nome: "Dermatologia", icon: "🩹", pai: "geral" },
  { id: "ginecologia", nome: "Ginecologia", icon: "♀️", pai: "geral" },
  { id: "oftalmologia", nome: "Oftalmologia", icon: "👁️", pai: "geral" },
  { id: "otorrino", nome: "Otorrinolaringologia", icon: "👂", pai: "geral" },
  { id: "urologia", nome: "Urologia", icon: "♂️", pai: "geral" },
  { id: "ortopedia", nome: "Ortopedia", icon: "🦴", pai: "geral" },
  { id: "endocrinologia", nome: "Endocrinologia", icon: "🧪", pai: "geral" },
  { id: "gastro", nome: "Gastroenterologia", icon: "🫄", pai: "geral" },

  // ── Outros ──
  { id: "veterinaria", nome: "Veterinária", icon: "🐾", pai: null },
  { id: "farmacia", nome: "Farmácia / Drogaria", icon: "💊", pai: null },
  { id: "estetica_automotiva", nome: "Estética Automotiva", icon: "🚗", pai: null },
  { id: "salao", nome: "Salão de Beleza", icon: "💇", pai: null },
  { id: "academia", nome: "Academia / Personal", icon: "🏋️", pai: null },
  { id: "escritorio", nome: "Escritório / Advocacia", icon: "⚖️", pai: null },
  { id: "consultoria", nome: "Consultoria", icon: "💼", pai: null },
  { id: "educacao", nome: "Educação / Cursos", icon: "📚", pai: null },
];

// ── Config por categoria-pai ──
// Cada chave é o id de uma categoria-pai.
// Campos extras: array de objetos { id, label, tipo, placeholder?, desc?, opcoes? }
// tabs: array de ids de tabs visíveis
// regrasPadrao: string com regras pré-configuradas
// faqPadrao: array de { pergunta, resposta }

const CONFIGS_POR_CATEGORIA = {
  estetica: {
    tabs: [
      "agenda", "horarios", "precos", "procedimentos",
      "mensagem", "regras", "faq", "conversas",
      "pausa", "perfil", "feriados", "status",
    ],
    camposExtras: [
      { id: "areas_atuacao", label: "Áreas de atuação", tipo: "tags", placeholder: "Ex: Botox, Preenchimento, Limpeza de pele", desc: "Procedimentos que a clínica realiza" },
      { id: "duracao_padrao", label: "Duração padrão da consulta", tipo: "select", opcoes: ["30 minutos", "45 minutos", "1 hora", "1h30", "2 horas"], desc: "Tempo médio de cada atendimento" },
      { id: "fotos_antes_depois", label: "Fotos de antes e depois", tipo: "check", desc: "Exibir galeria de resultados no perfil" },
    ],
    regrasPadrao:
      "Ao paciente pedir orçamento, sempre informe que o valor pode variar conforme a avaliação presencial.\n" +
      "Nunca agende procedimentos sem antes confirmar se o paciente tem alergia a algum produto.\n" +
      "Ao paciente solicitar cancelamento, ofereça remarcação e informe sobre taxa de cancelamento.",
    faqPadrao: [
      { pergunta: "Vocês fazem botox?", resposta: "Sim! Trabalhamos com toxina botulínica de marcas certificadas. O valor é a partir de R$ 400, dependendo da área tratada." },
      { pergunta: "Preciso marcar consulta primeiro?", resposta: "Recomendamos uma avaliação inicial para verificar suas necessidades. É grátis e sem compromisso." },
    ],
  },

  odontologia: {
    tabs: [
      "agenda", "horarios", "precos", "convenios", "procedimentos",
      "mensagem", "regras", "faq", "conversas",
      "pausa", "perfil", "feriados", "status",
    ],
    camposExtras: [
      { id: "especialidades", label: "Especialidades", tipo: "tags", placeholder: "Ex: Ortodontia, Implantes, Endodontia", desc: "Áreas de especialização da clínica" },
      { id: "conv_odonto", label: "Convênios odontológicos", tipo: "tags", placeholder: "Ex: Odonto Company, Amil Dental", desc: "Planos odontológicos aceitos" },
      { id: "raio_x_local", label: "Raio-X no local", tipo: "check", desc: "Possui equipamento de raio-X na clínica" },
    ],
    regrasPadrao:
      "Ao paciente informar dor ou urgência, sempre priorize o agendamento para o mesmo dia ou próximo.\n" +
      "Ao confirmar consulta de implante, solicite exames anteriores (raio-X, tomografia).\n" +
      "Convênios odontológicos têm carência — sempre confirme no momento do agendamento.",
    faqPadrao: [
      { pergunta: "Vocês fazem clareamento dental?", resposta: "Sim, trabalhamos com clareamento em consultório e caseiro. O valor começa em R$ 800." },
      { pergunta: "Aceitam meu convênio?", resposta: "Trabalhamos com diversos convênios odontológicos. Qual é o nome do seu plano?" },
    ],
  },

  psicologia: {
    tabs: [
      "agenda", "horarios",
      "mensagem", "regras", "faq", "conversas",
      "pausa", "perfil", "feriados", "status",
    ],
    camposExtras: [
      { id: "abordagens", label: "Abordagens terapêuticas", tipo: "tags", placeholder: "Ex: TCC, Psicanálise, Gestalt, Sistêmica", desc: "Linhas de atendimento" },
      { id: "duracao_sessao", label: "Duração da sessão", tipo: "select", opcoes: ["30 minutos", "45 minutos", "50 minutos", "1 hora", "1h30"], desc: "Tempo padrão de cada sessão" },
      { id: "atendimento_online", label: "Atendimento online", tipo: "check", desc: "Realiza atendimentos por videochamada" },
      { id: "valores", label: "Valores (opcional)", tipo: "textarea", placeholder: "Particular: R$ 200/sessão\nConvênio: verificar carência", desc: "Informações sobre valores" },
    ],
    regrasPadrao:
      "Nunca agende a primeira sessão sem perguntar se o paciente já fez terapia antes.\n" +
      "Ao paciente relatar crise de ansiedade ou ideação suicida, encaminhe imediatamente para o CAPS ou CVV (188).\n" +
      "Reserve sempre 15 minutos entre sessões para documentos e preparo.\n" +
      "Respeite o sigilo: nunca mencione nomes de outros pacientes.",
    faqPadrao: [
      { pergunta: "Quanto tempo dura cada sessão?", resposta: "Nossas sessões duram 50 minutos, padrão da SBP. O primeiro atendimento pode ser mais longo para anamnese." },
      { pergunta: "Vocês atendem por convênio?", resposta: "Alguns psicólogos aceitam convênios. Consulte a disponibilidade no momento do agendamento." },
    ],
  },

  nutricao: {
    tabs: [
      "agenda", "horarios", "precos",
      "mensagem", "regras", "faq", "conversas",
      "pausa", "perfil", "feriados", "status",
    ],
    camposExtras: [
      { id: "especialidades_nutri", label: "Especialidades", tipo: "tags", placeholder: "Ex: Emagrecimento, Nutrição Esportiva, Gestante", desc: "Áreas de foco" },
      { id: "planos_alimentares", label: "Planos alimentares", tipo: "check", desc: "Fornece planos alimentares personalizados" },
      { id: "bioimpedancia", label: "Bioimpedância", tipo: "check", desc: "Possui equipamento de bioimpedância" },
      { id: "duracao_consulta", label: "Duração da consulta", tipo: "select", opcoes: ["30 minutos", "45 minutos", "1 hora"], desc: "Tempo padrão de cada consulta" },
    ],
    regrasPadrao:
      "Ao agendar primeira consulta, solicite que o paciente traga exames de sangue recentes (últimos 90 dias).\n" +
      "Nunca prescreva dietas restritivas sem avaliação completa.\n" +
      "Para pacientes diabéticos ou hipertensos, sempre confirme medicações em uso.",
    faqPadrao: [
      { pergunta: "Preciso trazer exames para a primeira consulta?", resposta: "Sim! Traga hemograma completo, colesterol, glicemia e tireoide dos últimos 3 meses, se possível." },
      { pergunta: "Vocês fazem planos alimentares?", resposta: "Sim, todos os nossos nutricionistas elaboram planos personalizados após avaliação completa." },
    ],
  },

  fisioterapia: {
    tabs: [
      "agenda", "horarios", "precos", "convenios",
      "mensagem", "regras", "faq", "conversas",
      "pausa", "perfil", "feriados", "status",
    ],
    camposExtras: [
      { id: "modalidades", label: "Modalidades", tipo: "tags", placeholder: "Ex: Ortopédica, Neurológica, Respiratória, Pélvica", desc: "Áreas de atuação" },
      { id: "equipamentos", label: "Equipamentos", tipo: "tags", placeholder: "Ex: Ultrassom, TENS, Ondas de Choque", desc: "Recursos disponíveis na clínica" },
      { id: "duracao_sessao", label: "Duração da sessão", tipo: "select", opcoes: ["30 minutos", "45 minutos", "1 hora", "1h30"], desc: "Tempo padrão de cada sessão" },
      { id: "avaliacao_inicial", label: "Avaliação inicial gratuita", tipo: "check", desc: "Oferece avaliação sem custo" },
    ],
    regrasPadrao:
      "Ao agendar primeira sessão, pergunte qual é a queixa principal e desde quando começaram os sintomas.\n" +
      "Para reabilitação pós-cirúrgica, solicite laudo médico no primeiro atendimento.\n" +
      "Sempre oriente sobre exercícios domiciliares entre as sessões.",
    faqPadrao: [
      { pergunta: "Preciso de encaminhamento médico?", resposta: "Não é obrigatório, mas o laudo médico ajuda no tratamento. Traga se tiver." },
      { pergunta: "Quantas sessões preciso?", resposta: "Depende do caso. A avaliação inicial define o plano de tratamento estimado." },
    ],
  },

  geral: {
    tabs: [
      "agenda", "horarios", "precos", "convenios",
      "mensagem", "regras", "faq", "conversas",
      "pausa", "perfil", "feriados", "status",
    ],
    camposExtras: [
      { id: "especialidades_med", label: "Especialidades", tipo: "tags", placeholder: "Ex: Clínica Geral, Pediatria, Cardiologia", desc: "Especialidades médicas disponíveis" },
      { id: "exames", label: "Exames realizados", tipo: "tags", placeholder: "Ex: ECG, Holter, Ecocardiograma", desc: "Exames que a clínica realiza" },
      { id: "unidades_saude", label: "Unidades de saúde", tipo: "check", desc: "Possui unidades de coleta de exames" },
    ],
    regrasPadrao:
      "Ao paciente relatar dor no peito ou dificuldade para respirar, oriente ir ao pronto-socorro imediatamente.\n" +
      "Sempre confirme o tempo de jejum antes de agendar exames de sangue.\n" +
      "Para crianças, pergunte sempre a idade exata do paciente.",
    faqPadrao: [
      { pergunta: "Vocês atendem por convênio?", resposta: "Sim! Trabalhamos com os principais convênios da região. Qual é o seu?" },
      { pergunta: "Preciso marcar consulta para exames?", resposta: "Alguns exames precisam de agendamento. Ligue para confirmar sua necessidade." },
    ],
  },

  // Categorias sem config própria usam o padrão genérico
  _default: {
    tabs: [
      "agenda", "horarios", "precos", "convenios",
      "mensagem", "regras", "faq", "conversas",
      "pausa", "perfil", "feriados", "status",
    ],
    camposExtras: [],
    regrasPadrao: "",
    faqPadrao: [],
  },
};

// ── Funções públicas ──

/**
 * Retorna o id da categoria-pai para qualquer categoria (incluindo ela mesma).
 * Se a categoria não existir, retorna 'geral'.
 */
export function getCategoriaPai(categoriaId) {
  if (!categoriaId) return "geral";
  const cat = CATEGORIAS_RAW.find((c) => c.id === categoriaId);
  if (!cat) return "geral";
  return cat.pai || cat.id;
}

/**
 * Retorna a config completa para uma categoria (com herança da pai).
 * Se a categoria for uma sub, herda da pai. Se for uma pai, usa sua própria config.
 * Se não encontrar, usa _default.
 */
export function getCategoriaConfig(categoriaId) {
  const paiId = getCategoriaPai(categoriaId);
  return CONFIGS_POR_CATEGORIA[paiId] || CONFIGS_POR_CATEGORIA._default;
}

/**
 * Retorna os metadados de uma categoria (nome, icon, etc).
 */
export function getCategoriaMeta(categoriaId) {
  return CATEGORIAS_RAW.find((c) => c.id === categoriaId) || null;
}

/**
 * Retorna a lista de todas as categorias (para o autocomplete do briefing).
 */
export function listarCategorias() {
  return CATEGORIAS_RAW;
}

/**
 * Busca categorias por texto (para o autocomplete).
 * Busca em nome, id e descrição.
 */
export function buscarCategorias(query) {
  const q = (query || "").toLowerCase().trim();
  if (!q) return CATEGORIAS_RAW;
  return CATEGORIAS_RAW.filter(
    (c) =>
      c.nome.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      (c.pai && c.pai.toLowerCase().includes(q)),
  );
}

/**
 * Retorna a lista de tabs visíveis para uma categoria.
 */
export function getCategoriaTabs(categoriaId) {
  return getCategoriaConfig(categoriaId).tabs;
}

/**
 * Retorna os campos extras para uma categoria.
 */
export function getCategoriaCamposExtras(categoriaId) {
  return getCategoriaConfig(categoriaId).camposExtras;
}

/**
 * Retorna as regras padrão da IA para uma categoria.
 */
export function getCategoriaRegras(categoriaId) {
  return getCategoriaConfig(categoriaId).regrasPadrao;
}

/**
 * Retorna o FAQ padrão para uma categoria.
 */
export function getCategoriaFaq(categoriaId) {
  return getCategoriaConfig(categoriaId).faqPadrao;
}
