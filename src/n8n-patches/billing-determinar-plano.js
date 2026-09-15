const li = $input.first().json;
const cfg = $("Config Stripe Webhook").first().json;
const ctx = $("Extrair Evento Checkout").first().json;

const precoId =
  li.data && li.data[0] && li.data[0].price && li.data[0].price.id;
const completoMensal = cfg.STRIPE_PRICE_COMPLETO_MENSAL;
const completoAnual = cfg.STRIPE_PRICE_COMPLETO_ANUAL;
const essencialMensal = cfg.STRIPE_PRICE_ESSENCIAL_MENSAL;
const essencialAnual = cfg.STRIPE_PRICE_ESSENCIAL_ANUAL;

let plano = null;
let tier = null;
if (precoId === completoMensal) {
  plano = "mensal";
  tier = "completo";
} else if (precoId === completoAnual) {
  plano = "anual";
  tier = "completo";
} else if (precoId === essencialMensal) {
  plano = "mensal";
  tier = "essencial";
} else if (precoId === essencialAnual) {
  plano = "anual";
  tier = "essencial";
}

// Fail closed: checkout com price desconhecido nunca ativa uma clínica.
if (!plano) return [];

return [
  {
    json: {
      ...ctx,
      plano,
      tier,
      price_id_encontrado: precoId,
    },
  },
];
