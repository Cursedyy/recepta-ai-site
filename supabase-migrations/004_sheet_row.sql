-- sheet_row: numero da linha fisica que o agendamento ocupa na planilha Google Sheets
-- da clinica (retornado pelo values.append quando o workflow Criar Agendamento
-- escrever la, futuro). Permite update/cancelamento por posicao direta, sem buscar
-- por telefone+data/hora (risco de ambiguidade ja levantado no PRD). Nullable ate
-- a integracao de planilha existir de verdade - nao afeta nada que ja roda hoje
-- (lembretes nao usam essa coluna).
alter table public.agendamentos
  add column sheet_row integer;
