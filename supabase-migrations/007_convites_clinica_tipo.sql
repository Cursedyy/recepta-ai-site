-- Distingue convite de primeiro acesso (cria usuario) de convite de reset de
-- senha (atualiza usuario existente) na mesma tabela/pagina de definir-senha.
alter table public.convites_clinica
  add column tipo text not null default 'convite'
    check (tipo in ('convite', 'reset'));
