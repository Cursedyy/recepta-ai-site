// Montar body do INSERT no Supabase
const mapData = $("Mapear Campos Briefing").first().json;
const configData = $("Config Fixa").first().json;
const instData = $("UazAPI Criar Instância").first().json;
const extrairData = $("Extrair ia_config").first().json;

// F6 — modo do briefing: "pago" quando veio da URL de sucesso do Stripe com
// pedido válido (Preparar Claim → Supabase Claim Pedido → Pedido Válido? →
// Ramo Pedido Pago), "trial" caso contrário. O Ramo Pedido Pago anexa o row
// do pedido em $json.pedido; só o dereferenciamos no modo pago (no trial o
// node nem executou — referenciá-lo lançaria erro).
const modo = $("Preparar Claim").first().json.modo || "trial";
let pedido = null;
if (modo === "pago") {
  pedido = $("Ramo Pedido Pago").first().json.pedido || null;
}

// O alerta de escalonamento ([HANDOFF]) vai para o WhatsApp do responsavel
// informado no briefing (whats_resp -> telefone_operador), nao mais para um
// numero fixo. Ele chega com mascara ("53 99999-9999"), e a UazAPI espera
// E.164 sem "+", entao normaliza aqui. Sem numero confiavel no briefing,
// cai no fallback da Config Fixa (numero do dono) em vez de ficar sem alerta.
const normalizarTelefone = (bruto) => {
  const d = String(bruto || "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) return d;
  if (d.length === 12 && d.startsWith("55"))
    return d.slice(0, 4) + "9" + d.slice(4);
  if (d.length === 11) return "55" + d;
  if (d.length === 10) return "55" + d.slice(0, 2) + "9" + d.slice(2);
  return "";
};
const alertaDoBriefing = normalizarTelefone(mapData.telefone_operador);

const body = {
  clinica: mapData.clinica,
  cnpj: mapData.cnpj,
  uazapi_token: instData.token,
  uazapi_server: configData.uazapi_server,
  telefone_alerta: alertaDoBriefing || configData.telefone_alerta,
  telefone_operador: mapData.telefone_operador,
  mensagem_audio_padrao: configData.mensagem_audio_padrao,
  ia_config: extrairData.ia_config,
  categoria:
    mapData.briefing_raw && mapData.briefing_raw.categoria
      ? mapData.briefing_raw.categoria
      : "geral",
  status: "ativo",
  trial_inicio: null,
  trial_fim: null,
  tier:
    mapData.briefing_raw && mapData.briefing_raw.tier === "essencial"
      ? "essencial"
      : "completo",
};

// F6 — pedido pago: vincula a clínica ao pedido e sobrescreve tier/plano pelo
// que o Stripe confirmou (fonte de verdade = checkout, não o briefing).
// garantia_teto vem do pedido (pago_em + 30d, materializado no billing);
// garantia_inicio/fim são materializados no PRIMEIRO CONECTAR do WhatsApp
// (mesma política do trial_inicio — "o serviço começa quando conecta"), pela
// rota conectar.js do painel. Colunas novas exigem a migration 021 aplicada.
if (pedido && pedido.id) {
  body.pedido_id = pedido.id;
  body.tier = pedido.tier || body.tier;
  body.plano = pedido.plano || null;
  body.stripe_subscription_id = pedido.stripe_subscription_id || null;
  body.garantia_teto = pedido.garantia_teto_em || null;
}

return [{ json: body }];
