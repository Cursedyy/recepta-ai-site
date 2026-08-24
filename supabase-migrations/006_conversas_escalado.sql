-- Marca se o turno da IA (role='ia') disparou escalonamento humano ([HANDOFF]).
-- O marcador [HANDOFF] hoje e removido do texto antes de gravar em conversas.mensagem
-- (node "Processar Resposta IA" do workflow n8n) e a flag precisa_escalar so existe em
-- memoria durante a execucao -- nunca foi persistida. Esta coluna passa a guardar isso
-- dali pra frente; nao reconstroi o historico ja perdido.
alter table public.conversas
  add column escalado boolean not null default false;
