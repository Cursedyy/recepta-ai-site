// test-montar-prompt.mjs
// Roda o codigo REAL do node "Montar Prompt" (src/n8n-patches/montar-prompt.js,
// o mesmo arquivo publicado no n8n) contra um config_editavel completo e prova
// que regras_ia, faq e campos_extras entram no system prompt.
//
// Existe porque esses tres campos passaram meses sendo salvos no Supabase e
// nunca lidos: o painel dizia "salvo" e a IA nunca via nada.
//
// Uso: node src/test-montar-prompt.mjs

import { readFileSync } from "fs";

const codigo = readFileSync(
  new URL("./n8n-patches/montar-prompt.js", import.meta.url),
  "utf8",
);
const rodarNode = new Function("$", codigo);

const configEditavel = {
  precos: [{ nome: "Limpeza de pele", valor: 180 }],
  horarios: { segunda: [{ inicio: "09:00", fim: "18:00" }] },
  convenios: ["Unimed"],
  mensagem_identidade: "Oi! Aqui e a Ana, da Clinica Teste.",
  regras_categoria: "Sempre confirme alergia antes de agendar procedimento.",
  regras_ia:
    "Nunca informe valor de pacote fechado por WhatsApp.\nEstacionamento e gratuito para pacientes.",
  faq: [
    {
      pergunta: "Vocês tem estacionamento?",
      resposta: "Sim, gratuito no subsolo do predio.",
    },
    { pergunta: "Atendem aos sabados?", resposta: "Sim, das 9h as 13h." },
  ],
  campos_extras: {
    areas_atuacao: ["Botox", "Preenchimento"],
    duracao_padrao: "45 minutos",
    fotos_antes_depois: true,
    raio_x_local: false,
  },
};

const contexto = {
  "Configuração da Clínica": {
    clinica: "Clinica Teste",
    ia_config: { system_prompt: "Voce e a recepcionista da Clinica Teste." },
    config_editavel: configEditavel,
  },
  "Consolidar Histórico": { historico: [] },
  "Parser da Mensagem": {
    mensagem: "Vocês tem estacionamento?",
    telefone: "5553999999999",
  },
};

const $ = (nome) => ({ first: () => ({ json: contexto[nome] }) });

const [{ json: saida }] = rodarNode($);
const prompt = saida.system;

let falhas = 0;
function checar(condicao, rotulo) {
  if (condicao) {
    console.log(`  ok   ${rotulo}`);
  } else {
    console.log(`  FAIL ${rotulo}`);
    falhas += 1;
  }
}

console.log("Montar Prompt — campos do painel dentro do system prompt:");
checar(
  prompt.includes("REGRAS ADICIONAIS DA CLINICA"),
  "bloco de regras_ia presente",
);
checar(
  prompt.includes("Estacionamento e gratuito para pacientes."),
  "texto de regras_ia presente",
);
checar(prompt.includes("PERGUNTAS FREQUENTES"), "bloco de faq presente");
checar(
  prompt.includes("R: Sim, gratuito no subsolo do predio."),
  "resposta do faq presente",
);
checar(prompt.includes("DADOS DA CLINICA"), "bloco de campos_extras presente");
checar(
  prompt.includes("- Areas atuacao: Botox, Preenchimento"),
  "campo extra tipo lista",
);
checar(
  prompt.includes("- Duracao padrao: 45 minutos"),
  "campo extra tipo texto",
);
checar(
  prompt.includes("- Fotos antes depois: sim"),
  "campo extra booleano true",
);
checar(prompt.includes("- Raio x local: nao"), "campo extra booleano false");

// Nao pode ter quebrado o que ja funcionava.
checar(prompt.includes("PREÇOS"), "bloco de precos intacto");
checar(prompt.includes("CONVÊNIOS ACEITOS"), "bloco de convenios intacto");
checar(prompt.includes("HORÁRIO DE ATENDIMENTO"), "bloco de horarios intacto");
checar(prompt.includes("COMO SE APRESENTAR"), "bloco de identidade intacto");
checar(
  prompt.includes("REGRAS DO SEGMENTO"),
  "bloco de regras_categoria intacto",
);
checar(
  prompt.includes("AGENDAMENTO — GATE DETERMINÍSTICO"),
  "gate determinístico de agendamento presente",
);
checar(
  prompt.includes("A modalidade não é campo do bloco [AGENDAMENTO]"),
  "modalidade não bloqueia a tag de agendamento",
);

// config_editavel vazio nao pode gerar bloco fantasma nem quebrar.
contexto["Configuração da Clínica"].config_editavel = {};
const [{ json: vazio }] = rodarNode($);
checar(
  !vazio.system.includes("REGRAS ADICIONAIS DA CLINICA"),
  "config vazia nao inventa bloco",
);
checar(
  !vazio.system.includes("DADOS DA CLINICA"),
  "campos_extras vazio nao vira bloco",
);

console.log(falhas === 0 ? "\nTudo ok." : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
