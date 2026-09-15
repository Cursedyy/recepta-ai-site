import { readFileSync } from "node:fs";

function executar(arquivo, { input, refs = {}, json = {} }) {
  const codigo = readFileSync(new URL(arquivo, import.meta.url), "utf8");
  return new Function("$input", "$", "$json", codigo)(
    input,
    (nome) => ({ first: () => ({ json: refs[nome] }) }),
    json,
  );
}

let falhas = 0;
function checar(condicao, rotulo) {
  console.log(`  ${condicao ? "ok  " : "FAIL"} ${rotulo}`);
  if (!condicao) falhas += 1;
}

const billingRefs = {
  "Config Stripe Webhook": {
    STRIPE_PRICE_COMPLETO_MENSAL: "price-cm",
    STRIPE_PRICE_COMPLETO_ANUAL: "price-ca",
    STRIPE_PRICE_ESSENCIAL_MENSAL: "price-em",
    STRIPE_PRICE_ESSENCIAL_ANUAL: "price-ea",
  },
  "Extrair Evento Checkout": { clinica_id: "clinica-qa" },
};
const lineItems = (id) => ({
  first: () => ({ json: { data: [{ price: { id } }] } }),
});
const executarBilling = (id) =>
  executar("./n8n-patches/billing-determinar-plano.js", {
    input: lineItems(id),
    refs: billingRefs,
  });
const completoMensal = executarBilling("price-cm");
const completoAnual = executarBilling("price-ca");
const essencialMensal = executarBilling("price-em");
const essencialAnual = executarBilling("price-ea");
const desconhecido = executar("./n8n-patches/billing-determinar-plano.js", {
  input: lineItems("price-x"),
  refs: billingRefs,
});

console.log("Billing:");
checar(completoMensal[0].json.plano === "mensal", "Completo mensal mapeado");
checar(
  completoMensal[0].json.tier === "completo",
  "Completo mensal define tier",
);
checar(completoAnual[0].json.plano === "anual", "Completo anual mapeado");
checar(completoAnual[0].json.tier === "completo", "Completo anual define tier");
checar(essencialMensal[0].json.plano === "mensal", "Essencial mensal mapeado");
checar(
  essencialMensal[0].json.tier === "essencial",
  "Essencial mensal define tier",
);
checar(essencialAnual[0].json.plano === "anual", "Essencial anual mapeado");
checar(
  essencialAnual[0].json.tier === "essencial",
  "Essencial anual define tier",
);
checar(desconhecido.length === 0, "price desconhecido falha fechado");

const audioRefs = {
  "Configuração da Clínica": {
    clinica: "Clinica QA",
    mensagem_audio_padrao: "Envie a mensagem em texto.",
  },
};
const sttOk = executar("./n8n-patches/audio-aplicar-transcricao.js", {
  input: { first: () => ({ json: {} }) },
  refs: audioRefs,
  json: { text: "Quero marcar amanhã" },
});
const sttFalhou = executar("./n8n-patches/audio-aplicar-transcricao.js", {
  input: { first: () => ({ json: {} }) },
  refs: audioRefs,
  json: { error: "provider indisponivel" },
});

console.log("Áudio:");
checar(
  sttOk[0].json.mensagem === "Quero marcar amanhã",
  "STT alimenta o prompt",
);
checar(
  sttOk[0].json.transcricao_audio_ok === true,
  "sucesso do STT sinalizado",
);
checar(
  sttFalhou[0].json.mensagem === "Envie a mensagem em texto.",
  "falha do STT usa fallback textual",
);
checar(
  sttFalhou[0].json.transcricao_audio_ok === false,
  "falha do STT sinalizada",
);

console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo ok.");
process.exit(falhas ? 1 : 0);
