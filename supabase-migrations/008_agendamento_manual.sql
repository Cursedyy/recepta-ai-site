-- Nome e observacao do paciente no agendamento.
--
-- Nasceram do agendamento manual (a clinica marca a consulta de quem ligou e
-- quer registrar de quem e' e o motivo), mas as colunas valem para qualquer
-- linha da tabela: quando a Recepta passar a coletar o nome na conversa, e' aqui
-- que ele entra, sem migration nova.
--
-- Ambas NULLABLE de proposito: toda linha que ja existe foi criada pela Recepta
-- e nao tem nome nenhum. O painel cai no telefone quando paciente_nome e' null,
-- entao os agendamentos antigos continuam exibidos como antes.
--
-- Sem limite de tamanho no banco: o app valida (120 e 500 caracteres) e um
-- varchar(n) aqui so obrigaria outra migration quando o limite mudasse.

alter table public.agendamentos
  add column if not exists paciente_nome text,
  add column if not exists observacao text;
