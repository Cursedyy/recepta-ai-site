-- Fila de espera FIFO para tier Completo. Idempotente e sem envio externo.
create table if not exists public.fila_espera (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  paciente_telefone text not null,
  paciente_nome text,
  servico text not null,
  servico_normalizado text generated always as (lower(regexp_replace(trim(servico), '\s+', ' ', 'g'))) stored,
  janela_inicio timestamptz,
  janela_fim timestamptz,
  status text not null default 'aguardando' check (status in ('aguardando','ofertado','aceito','recusado','expirado','cancelado')),
  entrou_em timestamptz not null default now(),
  ofertado_em timestamptz,
  oferta_expira_em timestamptz,
  respondido_em timestamptz,
  agendamento_id uuid references public.agendamentos(id),
  observacao text,
  criado_em timestamptz not null default now()
);

alter table public.fila_espera enable row level security;
create index if not exists fila_espera_fifo_idx on public.fila_espera (clinica_id, servico_normalizado, entrou_em, id);
create unique index if not exists fila_espera_oferta_ativa_idx on public.fila_espera (clinica_id) where status = 'ofertado';
create unique index if not exists fila_espera_agendamento_idx on public.fila_espera (agendamento_id) where agendamento_id is not null;
create unique index if not exists agendamentos_horario_ativo_idx on public.agendamentos (clinica_id, data_hora) where status = 'agendado';

create or replace function public.fila_assert_tier_completo(p_clinica uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from clinicas where id = p_clinica and tier = 'completo') then
    raise exception 'fila_disponivel_apenas_no_completo' using errcode = '22023';
  end if;
end $$;

create or replace function public.fila_entrar(p_clinica uuid, p_telefone text, p_nome text, p_servico text, p_inicio timestamptz default null, p_fim timestamptz default null)
returns public.fila_espera language plpgsql security definer set search_path = public as $$
declare r fila_espera;
begin
  perform fila_assert_tier_completo(p_clinica);
  if (select count(*) from fila_espera where clinica_id=p_clinica and paciente_telefone=p_telefone and status in ('aguardando','ofertado')) >= 3 then raise exception 'limite_fila_paciente'; end if;
  insert into fila_espera (clinica_id,paciente_telefone,paciente_nome,servico,janela_inicio,janela_fim) values (p_clinica,p_telefone,p_nome,p_servico,p_inicio,p_fim) returning * into r;
  return r;
end $$;

create or replace function public.fila_ofertar_proximo(p_clinica uuid, p_servico text, p_inicio timestamptz, p_fim timestamptz)
returns public.fila_espera language plpgsql security definer set search_path = public as $$
declare r fila_espera;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_clinica::text || '|' || p_inicio::text, 0));
  perform fila_assert_tier_completo(p_clinica);
  select * into r from fila_espera where clinica_id=p_clinica and servico_normalizado=lower(regexp_replace(trim(p_servico),'\s+',' ','g')) and status='aguardando' and (janela_inicio is null or janela_inicio <= p_inicio) and (janela_fim is null or janela_fim >= p_fim) order by entrou_em,id limit 1 for update skip locked;
  if r.id is null then return null; end if;
  update fila_espera set status='ofertado',ofertado_em=now(),oferta_expira_em=now()+interval '15 minutes' where id=r.id returning * into r;
  return r;
end $$;

create or replace function public.fila_aceitar_oferta(p_id uuid)
returns public.agendamentos language plpgsql security definer set search_path = public as $$
declare f fila_espera; a agendamentos;
begin
  select * into f from fila_espera where id=p_id for update;
  if f.id is null or f.status <> 'ofertado' or f.oferta_expira_em <= now() then raise exception 'oferta_expirada'; end if;
  perform pg_advisory_xact_lock(hashtextextended(f.clinica_id::text || '|' || f.janela_inicio::text, 0));
  insert into agendamentos (clinica_id,paciente_telefone,paciente_nome,data_hora,observacao,status) values (f.clinica_id,f.paciente_telefone,f.paciente_nome,f.janela_inicio,f.servico,'agendado') returning * into a;
  update fila_espera set status='aceito',respondido_em=now(),agendamento_id=a.id where id=f.id;
  return a;
end $$;

create or replace function public.fila_recusar_oferta(p_id uuid)
returns public.fila_espera language plpgsql security definer set search_path = public as $$
declare r fila_espera;
begin update fila_espera set status='recusado',respondido_em=now() where id=p_id and status='ofertado' returning * into r; if r.id is null then raise exception 'oferta_invalida'; end if; return r; end $$;

create or replace function public.fila_expirar_ofertas()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin update fila_espera set status='expirado',respondido_em=now() where status='ofertado' and oferta_expira_em <= now(); get diagnostics n = row_count; return n; end $$;
