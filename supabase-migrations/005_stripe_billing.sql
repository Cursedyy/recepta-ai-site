-- stripe_customer_id: id do customer no Stripe (cus_...), gravado quando o checkout
-- e concluido (evento checkout.session.completed no workflow "Recepta AI - Stripe Webhook").
-- plano: 'mensal' ou 'anual', derivado do price_id da line item da checkout session.
-- stripe_subscription_id ja existe na tabela (adicionado fora de migration rastreada).
alter table public.clinicas
  add column stripe_customer_id text,
  add column plano text;
