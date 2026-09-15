// F6 — Claim do Pedido, modo HARD (janela de go-live).
//
// Igual ao modo SOFT (onboarding-claim-pedido.js) no caminho pago: PATCH
// condicional em pedidos — UPDATE pedidos SET status='provisionando'
// WHERE id=pedido AND status='pago'; 0 linha → "Pedido Válido?" bloqueia.
//
// Diferença: briefing SEM ?pedido= (UUID válido) NÃO atravessa mais como
// trial. Falha fechada com mensagem legível → workflow error → Alerta de
// Falha. É o que fecha o critério de aceite "briefing direto sem pagamento
// não cria clínica" a partir da troca de copy.
//
// Deploy SOMENTE na janela, minutos antes da copy (patch script com --hard):
// enquanto a landing ainda promete teste, este node bloquearia o cliente.
const entrada = $input.first().json;
const corpo = $("Webhook Onboarding").first().json.body || {};
const pedido = String(corpo.pedido || "").trim();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (!pedido || !UUID_RE.test(pedido)) {
  const tel = corpo.whats_resp || corpo.numero || "desconhecido";
  throw new Error(
    "F6-HARD: briefing sem pedido pago válido (telefone " +
      tel +
      "). Provisionamento bloqueado — todo briefing deve vir do checkout " +
      "(landing → /api/checkout → /briefing?pedido=<uuid>).",
  );
}

const agora = new Date().toISOString();
const supabaseUrl = String($("Config Fixa").first().json.supabase_url || "").replace(/\/$/, "");
if (!supabaseUrl) throw new Error("F6-HARD: Config Fixa sem supabase_url");
return [
  {
    json: {
      ...entrada,
      modo: "pago",
      pedido_id: pedido,
      claim_url:
        supabaseUrl +
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
