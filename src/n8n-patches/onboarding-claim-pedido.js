// F6 — Preparar Claim (Onboarding).
//
// Entrada: item de "Campos Obrigatórios OK?" (campos do briefing mapeados).
// Lê o pedido pago pela URL de sucesso do Stripe via $('Webhook Onboarding')
// (o Set "Mapear Campos Briefing" NÃO tem includeOtherFields — $json.body
// já não existe aqui).
//
// SEM pedido (ou UUID inválido): modo trial — repassa tudo intacto e o fluxo
// segue como sempre seguiu (soft claim; não derruba o onboarding no ar até
// o F8 trocar a copy).
//
// COM pedido: monta o PATCH CONDICIONAL — a mesma atomicidade do Confirmar
// Pagamento do billing. O PATCH em si roda no node HTTP "Supabase Claim
// Pedido" (credencial supabaseApi, nunca chave inline):
//   UPDATE pedidos SET status='provisionando', provisionando_em=now()
//   WHERE id=pedido AND status='pago'
//   [] → duplicado / não-pago → "Pedido Válido?" bloqueia e alerta. Nunca
//        provisiona de graça.
const entrada = $input.first().json;
const corpo = $("Webhook Onboarding").first().json.body || {};
const pedido = String(corpo.pedido || "").trim();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (!pedido || !UUID_RE.test(pedido)) {
  return [{ json: { ...entrada, modo: "trial", pedido_id: null } }];
}

const agora = new Date().toISOString();
return [
  {
    json: {
      ...entrada,
      modo: "pago",
      pedido_id: pedido,
      claim_url:
        $("Config Fixa").first().json.supabase_url +
        "/rest/v1/pedidos?id=eq." +
        pedido +
        "&status=eq.pago",
      patch_body: {
        status: "provisionando",
        provisionando_em: agora,
      },
    },
  },
];
