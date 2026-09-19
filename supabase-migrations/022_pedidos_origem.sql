-- F5 — distingue checkout novo da landing e reativação autenticada do painel.
-- Aditiva e idempotente; não altera linhas existentes.
alter table public.pedidos
  add column if not exists origem text not null default 'landing';

alter table public.pedidos
  drop constraint if exists pedidos_origem_check;
alter table public.pedidos
  add constraint pedidos_origem_check
  check (origem in ('landing', 'painel_reativacao'));

NOTIFY pgrst, 'reload schema';
