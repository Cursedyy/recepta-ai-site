-- Schema de agenda por clinica (Google Sheets + IA sem confirmacao humana).
-- Nao mexe em ia_config, config_editavel nem colunas existentes.

alter table public.clinicas
  add column spreadsheet_id text,
  add column config_agenda jsonb;

-- Shape esperado de config_agenda (validado no server, nao no banco):
-- {
--   "dias_atendimento": ["segunda","terca","quarta","quinta","sexta"],
--   "duracao_consulta_min": 30,
--   "intervalo_min": 10,
--   "email_compartilhamento": "clinica@exemplo.com"
-- }

create table public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  paciente_telefone text not null,
  data_hora timestamptz not null,
  status text not null default 'agendado',
  lembrete_24h_em timestamptz,
  lembrete_3h_em timestamptz,
  cancelado_em timestamptz,
  criado_em timestamptz not null default now()
);

create index agendamentos_clinica_id_idx on public.agendamentos (clinica_id);
create index agendamentos_data_hora_idx on public.agendamentos (data_hora);

-- RLS ligada sem nenhuma policy ainda: bloqueia anon/authenticated por
-- padrao, mesmo padrao de convites_clinica. Todo acesso hoje e via
-- service_role (n8n). Policy de leitura pra papel 'clinica' (agenda
-- dentro do /clinica/painel) fica pra quando essa tela existir.
alter table public.agendamentos enable row level security;
