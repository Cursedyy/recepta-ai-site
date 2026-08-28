/**
 * Ciclo de vida da assinatura de uma clinica.
 *
 * A FONTE DE VERDADE E O STRIPE. A coluna `clinicas.status` e um espelho,
 * mantido por `/api/stripe/webhook` (evento do Stripe) e por
 * `/api/cron/expirar-trials` (clinicas que nunca chegaram ao Stripe).
 *
 * Nada aqui decide sozinho que uma clinica deve ser cortada: quem corta o
 * atendimento e o workflow de Atendimento no n8n, lendo `status`. Este modulo
 * so traduz o vocabulario do Stripe para o nosso.
 */

/** Estados possiveis de `clinicas.status`. */
export const ESTADOS = ["trial", "ativo", "suspensa", "cancelada"];

/**
 * Traduz o status de uma subscription do Stripe para o nosso.
 *
 * `past_due` continua ATIVO de proposito: o Stripe ainda esta tentando cobrar
 * (smart retries duram dias). Cortar no primeiro boleto falho derruba clinica
 * que so trocou de cartao. Quem corta e `unpaid`, que e o Stripe desistindo.
 */
export function estadoDaSubscription(statusStripe) {
  switch (statusStripe) {
    case "trialing":
      return "trial";
    case "active":
    case "past_due":
      return "ativo";
    case "unpaid":
    case "incomplete_expired":
    case "paused":
      return "suspensa";
    case "canceled":
      return "cancelada";
    case "incomplete":
      // Checkout comecou e nao terminou (3DS pendente). Ainda nao e cliente,
      // mas tambem nao e para suspender: fica como esta ate resolver.
      return null;
    default:
      return null;
  }
}

/** Intervalo do preco -> nome do plano usado na coluna `clinicas.plano`. */
export function planoDoIntervalo(intervalo) {
  if (intervalo === "month") return "mensal";
  if (intervalo === "year") return "anual";
  return null;
}

/**
 * Monta o patch de `clinicas` a partir de uma subscription do Stripe.
 * Devolve `null` quando o estado do Stripe nao manda mudar nada.
 */
export function patchDaSubscription(subscription) {
  if (!subscription) return null;

  const estado = estadoDaSubscription(subscription.status);
  if (!estado) return null;

  const patch = { status: estado };

  const intervalo = subscription.items?.data?.[0]?.price?.recurring?.interval;
  const plano = planoDoIntervalo(intervalo);
  if (plano) patch.plano = plano;

  if (typeof subscription.id === "string") {
    patch.stripe_subscription_id = subscription.id;
  }

  // trial_end so existe enquanto ha trial. Quando o trial acaba o Stripe zera
  // o campo, e zerar aqui tambem e o certo: senao o cron de expiracao volta a
  // olhar uma data velha de uma clinica que ja e pagante.
  patch.trial_fim = subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : null;

  return patch;
}
