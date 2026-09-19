-- Fila: impede entradas ativas duplicadas mesmo sob corrida.
create or replace function public.fila_entrar(p_clinica uuid, p_telefone text, p_nome text, p_servico text, p_inicio timestamptz default null, p_fim timestamptz default null)
returns public.fila_espera language plpgsql security definer set search_path = public as $$
declare r public.fila_espera; v_servico text;
begin
  perform public.fila_assert_tier_completo(p_clinica);
  v_servico := lower(regexp_replace(trim(coalesce(p_servico,'')), '\s+', ' ', 'g'));
  perform pg_advisory_xact_lock(hashtextextended(p_clinica::text || '|' || p_telefone || '|' || v_servico, 0));
  if exists (select 1 from public.fila_espera where clinica_id=p_clinica and paciente_telefone=p_telefone and servico_normalizado=v_servico and status in ('aguardando','ofertado') and coalesce(janela_inicio,'infinity'::timestamptz)=coalesce(p_inicio,'infinity'::timestamptz) and coalesce(janela_fim,'infinity'::timestamptz)=coalesce(p_fim,'infinity'::timestamptz)) then
    raise exception 'entrada_fila_duplicada';
  end if;
  if (select count(*) from public.fila_espera where clinica_id=p_clinica and paciente_telefone=p_telefone and status in ('aguardando','ofertado')) >= 3 then raise exception 'limite_fila_paciente'; end if;
  insert into public.fila_espera (clinica_id,paciente_telefone,paciente_nome,servico,janela_inicio,janela_fim) values (p_clinica,p_telefone,p_nome,p_servico,p_inicio,p_fim) returning * into r;
  return r;
end $$;
