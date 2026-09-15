-- Restauracao do modelo de TRIAL GRATUITO de 7 dias.
-- Arquivado em 2026-09-12 ao trocar o trial por pagamento antecipado com
-- garantia de reembolso de 7 dias.
--
-- NAO EXECUTE ISTO SEM LER archive/trial-gratuito/LEIA-ME.md.
--
-- Contexto que torna tudo isto barato: no momento do arquivamento a tabela
-- `clinicas` tinha 3 linhas, todas de teste, NENHUMA com stripe_customer_id.
-- Nao havia cliente pagante nem trial em curso. Se voce esta lendo isto com
-- clientes reais no banco, a volta NAO e mais barata: e uma migracao de
-- verdade e precisa de plano proprio.

-- ---------------------------------------------------------------------------
-- 1. As colunas do trial NAO foram dropadas de proposito.
-- ---------------------------------------------------------------------------
-- `trial_inicio`, `trial_fim` e `ultimo_aviso_trial` continuam em `clinicas`,
-- apenas pararam de ser escritas. Se ainda estiverem la, nao ha DDL a rodar:
-- basta devolver o codigo (ver LEIA-ME) e religar o ramo do cron no n8n.
--
-- Confirme antes de qualquer coisa:
--   select column_name
--     from information_schema.columns
--    where table_name = 'clinicas'
--      and column_name in ('trial_inicio','trial_fim','ultimo_aviso_trial');
-- Tres linhas = nao precisa de DDL. Menos que tres = use o bloco 2.

-- ---------------------------------------------------------------------------
-- 2. Recriacao das colunas, SE alguem as tiver dropado depois.
-- ---------------------------------------------------------------------------
-- Nullable de proposito: o trial so comeca quando o WhatsApp conecta, entao
-- clinica recem-criada fica com os dois nulos. Isso e a migration 011.
alter table public.clinicas
  add column if not exists trial_inicio timestamptz,
  add column if not exists trial_fim timestamptz,
  add column if not exists ultimo_aviso_trial date;

-- ---------------------------------------------------------------------------
-- 3. O que NAO fazer ao voltar
-- ---------------------------------------------------------------------------
-- NAO reaproveite `garantia_fim` como `trial_fim`, nem o contrario. O node
-- `Expirar Clinicas` do workflow cf1An4BYT9A0LuHi faz PATCH cego em
--   clinicas?status=eq.ativo&trial_fim=lt.<agora>
-- Um campo servindo aos dois modelos expira cliente pagante as 9h da manha, em
-- silencio. Dois campos, dois donos.
--
-- NAO introduza o valor 'trial' em `clinicas.status`. O vocabulario e
-- 'ativo' | 'expirado' e so. Clinica em teste = status 'ativo' + trial_fim no
-- futuro. Ja houve producao com status 'trial' criando clinica imortal, que o
-- cron nunca expirava (corrigido no commit 04f6de4).
