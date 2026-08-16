-- Fundacao de login por clinica (reusa perfis.papel='clinica' + clinica_id,
-- ja usado pelo /painel existente). Nao adiciona coluna em clinicas nem em
-- perfis -- so a tabela de convite de uso unico pro fluxo de definir senha.

create table public.convites_clinica (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  token text not null unique,
  expira_em timestamptz not null,
  usado_em timestamptz,
  criado_em timestamptz not null default now()
);

create index convites_clinica_token_idx on public.convites_clinica (token);

-- RLS ligada sem nenhuma policy: bloqueia anon/authenticated por padrao.
-- Todo acesso a essa tabela e via service_role nas funcoes serverless
-- (que ignora RLS), nunca client-side.
alter table public.convites_clinica enable row level security;
