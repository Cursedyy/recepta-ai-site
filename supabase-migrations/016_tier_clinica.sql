-- 016_tier_clinica.sql
-- Separa o tier de recursos da cadencia de cobranca armazenada em plano.
-- Idempotente: pode ser reaplicada sem alterar os tiers ja definidos.

begin;

alter table public.clinicas
  add column if not exists tier text;

update public.clinicas
set tier = 'essencial'
where tier is null;

alter table public.clinicas
  alter column tier set default 'essencial',
  alter column tier set not null;

alter table public.clinicas
  drop constraint if exists clinicas_tier_check;

alter table public.clinicas
  add constraint clinicas_tier_check
  check (tier in ('essencial', 'completo'));

commit;
