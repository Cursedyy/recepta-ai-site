-- 010_categoria_clinica.sql
-- Adiciona coluna categoria na tabela clinicas.
-- Valor padrão 'geral' para clínicas existentes.
-- Categorias filhas usam a mesma config da categoria-pai via aplicação.

alter table public.clinicas
  add column if not exists categoria text not null default 'geral';

-- Índice para buscas por categoria (dashboard admin futuro)
create index if not exists idx_clinicas_categoria
  on public.clinicas (categoria);
