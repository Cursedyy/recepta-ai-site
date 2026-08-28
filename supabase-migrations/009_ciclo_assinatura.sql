-- Ciclo de vida da assinatura: garante as colunas que /api/stripe/webhook e
-- /api/cron/expirar-trials escrevem.
--
-- Tudo com IF NOT EXISTS porque a tabela `clinicas` nasceu fora de migration
-- rastreada: parte destas colunas ja existe em producao, parte nao.
--
-- RODAR ANTES DO DEPLOY. Rota publicada que escreve coluna inexistente
-- derruba o fluxo inteiro (ver 008_agendamento_manual).

alter table public.clinicas
  add column if not exists status text,
  add column if not exists trial_fim timestamptz,
  add column if not exists plano text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

-- Estados possiveis: 'trial' | 'ativo' | 'suspensa' | 'cancelada'.
-- Sem status definido, o Atendimento nao tem como decidir se atende:
-- clinica sem status vira 'trial' (comportamento de hoje, ninguem perde acesso).
update public.clinicas set status = 'trial' where status is null;

-- O cron varre por (status, trial_fim) todo dia; o webhook busca por customer.
create index if not exists clinicas_status_trial_idx
  on public.clinicas (status, trial_fim);

create index if not exists clinicas_stripe_customer_idx
  on public.clinicas (stripe_customer_id);
