-- 021 — Pagamento antecipado com garantia de 7 dias (fases F3/F4/F5/F6/F7).
--
-- Aditiva e idempotente: nada é dropado, nenhum NOT NULL novo em tabela
-- existente, nenhum backfill. Rollback de banco é no-op (parar de escrever).
--
-- Cria:
--   pedidos          — o pedido que amarra checkout ↔ provisionamento ↔ garantia.
--                      client_reference_id do Checkout Session = pedidos.id.
--   stripe_eventos   — idempotência por event.id + log de auditoria do webhook.
--   clinicas.*       — colunas de garantia, reembolso, disputa, aceite dos
--                      Termos, event-ordering e vínculo com o pedido.
--
-- Todas as policies seguem o padrão da migration 009: "service only".
-- Rodar ANTES de publicar qualquer código que leia as colunas novas.

-- ── pedidos ────────────────────────────────────────────────────────────────
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'aberto'
    check (status in ('aberto','pago','provisionando','provisionado','cancelado','reembolsado')),
  tier text not null check (tier in ('essencial','completo')),
  ciclo text not null check (ciclo in ('mensal','anual')),
  price_id text,
  plano text,                      -- 'mensal' | 'anual' (espelho do ciclo)
  email text,
  clinica_id uuid references public.clinicas(id) on delete set null,
  stripe_session_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  criado_em timestamptz not null default now(),
  pago_em timestamptz,
  provisionando_em timestamptz,
  provisionado_em timestamptz,
  garantia_teto_em timestamptz,    -- pago_em + 30 dias, materializado no pagamento
  encerrado_em timestamptz,
  motivo_encerramento text,
  -- Aceite versionado dos Termos no checkout (C11 — defesa de chargeback).
  -- O claim no n8n copia versão/data para clinicas.termos_versao/termos_aceito_em.
  termos_versao text,
  termos_aceito_em timestamptz,
  termos_ip text,
  termos_ua text
);

create index if not exists pedidos_stripe_session_idx
  on public.pedidos (stripe_session_id);
create unique index if not exists pedidos_stripe_session_uniq
  on public.pedidos (stripe_session_id) where stripe_session_id is not null;
create index if not exists pedidos_clinica_idx on public.pedidos (clinica_id);
create index if not exists pedidos_status_idx on public.pedidos (status, criado_em);

-- ── stripe_eventos ─────────────────────────────────────────────────────────
create table if not exists public.stripe_eventos (
  event_id text primary key,
  tipo text,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  resultado text
);
comment on table public.stripe_eventos is 'Idempotência do webhook Stripe: event_id PK; POST com header Prefer: resolution=ignore-duplicates devolve 409 em duplicado — o gate F4 usa isso para descartar reenvios sem reprocessar.';

-- ── clinicas: colunas novas (todas nullable) ───────────────────────────────
alter table public.clinicas add column if not exists pedido_id uuid references public.pedidos(id);
alter table public.clinicas add column if not exists garantia_inicio timestamptz;
alter table public.clinicas add column if not exists garantia_fim timestamptz;
alter table public.clinicas add column if not exists garantia_teto timestamptz;
alter table public.clinicas add column if not exists reembolso_pedido_em timestamptz;
alter table public.clinicas add column if not exists reembolsado_em timestamptz;
alter table public.clinicas add column if not exists reembolso_motivo text;
alter table public.clinicas add column if not exists reembolso_valor numeric(12,2);
alter table public.clinicas add column if not exists reembolso_operador text;
alter table public.clinicas add column if not exists disputa_em timestamptz;
alter table public.clinicas add column if not exists pagamento_pendente_em timestamptz;
alter table public.clinicas add column if not exists assinatura_evento_em timestamptz;
alter table public.clinicas add column if not exists termos_versao text;
alter table public.clinicas add column if not exists termos_aceito_em timestamptz;

-- Índice único parcial: uma assinatura viva pertence a no máximo uma clínica.
-- Parcial por stripe_subscription_id IS NOT NULL (padrão do repo, migration 017).
create unique index if not exists clinicas_stripe_subscription_uniq
  on public.clinicas (stripe_subscription_id) where stripe_subscription_id is not null;

-- Ordenação de eventos: PATCH condicional usa esta coluna para rejeitar
-- eventos atrasados (R3/roteamento de reativação do desenho técnico).
create index if not exists clinicas_assinatura_evento_idx
  on public.clinicas (assinatura_evento_em);

-- ── RLS "service only" (padrão 009/019): anon/authenticated NÃO veem nada ──
REVOKE ALL ON TABLE public.pedidos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pedidos TO service_role;
GRANT DELETE ON TABLE public.pedidos TO service_role;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.stripe_eventos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.stripe_eventos TO service_role;
ALTER TABLE public.stripe_eventos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.clinicas FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.clinicas TO service_role;

-- Policies explícitas (mesmo com REVOKE, explicitamos a intenção):
drop policy if exists "pedidos service only" on public.pedidos;
create policy "pedidos service only" on public.pedidos
  for all to service_role using (true) with check (true);

drop policy if exists "stripe_eventos service only" on public.stripe_eventos;
create policy "stripe_eventos service only" on public.stripe_eventos
  for all to service_role using (true) with check (true);

NOTIFY pgrst, 'reload schema';
