// test-onboarding-alerta.mjs
// Roda o codigo REAL do node "Montar JSON Body" do Onboarding
// (src/n8n-patches/onboarding-montar-json-body.js) e prova que o
// telefone_alerta da clinica nova sai do briefing, normalizado, e nao mais do
// numero fixo do dono do produto.
//
// Uso: node src/test-onboarding-alerta.mjs

import { readFileSync } from "fs";

const codigo = readFileSync(
  new URL("./n8n-patches/onboarding-montar-json-body.js", import.meta.url),
  "utf8",
);
const rodarNode = new Function("$", codigo);

const NUMERO_DO_DONO = "5553991635302";

function montar(telefoneOperador, tier) {
  const contexto = {
    "Mapear Campos Briefing": {
      clinica: "Clinica Teste",
      cnpj: "12345678000199",
      telefone_operador: telefoneOperador,
      briefing_raw: { categoria: "odontologia", tier },
    },
    "Config Fixa": {
      uazapi_server: "https://sitemagic1.uazapi.com",
      telefone_alerta: NUMERO_DO_DONO,
      mensagem_audio_padrao: "texto padrao",
    },
    "UazAPI Criar Instância": { token: "tok-123" },
    "Extrair ia_config": { ia_config: { system_prompt: "x" } },
  };
  const $ = (nome) => ({ first: () => ({ json: contexto[nome] }) });
  return rodarNode($)[0].json;
}

let falhas = 0;
function checar(condicao, rotulo) {
  console.log(`  ${condicao ? "ok  " : "FAIL"} ${rotulo}`);
  if (!condicao) falhas += 1;
}

console.log("Onboarding — telefone_alerta da clinica nova:");
checar(
  montar("53 99163-5305").telefone_alerta === "5553991635305",
  "celular com mascara e DDD",
);
checar(
  montar("5553991635305").telefone_alerta === "5553991635305",
  "ja em E.164 de 13 digitos",
);
checar(
  montar("555391635305").telefone_alerta === "5553991635305",
  "E.164 de 12 digitos ganha o 9",
);
checar(
  montar("53 3216-5305").telefone_alerta === "5553932165305",
  "fixo de 10 digitos",
);
checar(
  montar("").telefone_alerta === NUMERO_DO_DONO,
  "sem numero cai no fallback da Config Fixa",
);
checar(
  montar("123").telefone_alerta === NUMERO_DO_DONO,
  "numero invalido cai no fallback",
);
checar(
  montar("53 99163-5305").telefone_operador === "53 99163-5305",
  "telefone_operador segue cru",
);
checar(
  montar("53 99163-5305").tier === "completo",
  "sem selecao explicita preserva compatibilidade com Completo",
);
checar(
  montar("53 99163-5305", "essencial").tier === "essencial",
  "selecao Essencial chega ao cadastro",
);
checar(
  montar("53 99163-5305", "completo").tier === "completo",
  "selecao Completo chega ao cadastro",
);

console.log(falhas === 0 ? "\nTudo ok." : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
