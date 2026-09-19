-- Preferência e oferta são instantes diferentes. timestamptz conserva o instante;
-- não somar/subtrair três horas ao aceitar uma oferta.
BEGIN;

ALTER TABLE public.fila_espera ADD COLUMN IF NOT EXISTS oferta_inicio timestamptz;
ALTER TABLE public.fila_espera ADD COLUMN IF NOT EXISTS oferta_fim timestamptz;
-- Sem backfill: não é possível inferir o horário de ofertas antigas pela preferência.

CREATE OR REPLACE FUNCTION public.fila_entrar(
  p_clinica uuid, p_telefone text, p_nome text, p_servico text,
  p_inicio timestamptz DEFAULT NULL, p_fim timestamptz DEFAULT NULL
) RETURNS public.fila_espera
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.fila_espera; v_servico text;
BEGIN
  PERFORM public.fila_assert_tier_completo(p_clinica);
  IF p_inicio IS NULL OR p_fim IS NULL OR NOT isfinite(p_inicio) OR NOT isfinite(p_fim) OR p_fim < p_inicio THEN
    RAISE EXCEPTION 'janela_invalida' USING ERRCODE = '22023';
  END IF;
  v_servico := lower(regexp_replace(trim(coalesce(p_servico,'')), '\s+', ' ', 'g'));
  IF v_servico = '' OR nullif(trim(p_telefone), '') IS NULL THEN
    RAISE EXCEPTION 'dados_fila_invalidos' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_clinica::text || '|' || p_telefone || '|' || v_servico, 0));
  IF EXISTS (SELECT 1 FROM public.fila_espera WHERE clinica_id = p_clinica
    AND paciente_telefone = p_telefone AND servico_normalizado = v_servico
    AND status IN ('aguardando','ofertado') AND janela_inicio = p_inicio AND janela_fim = p_fim) THEN
    RAISE EXCEPTION 'entrada_fila_duplicada';
  END IF;
  IF (SELECT count(*) FROM public.fila_espera WHERE clinica_id = p_clinica
    AND paciente_telefone = p_telefone AND status IN ('aguardando','ofertado')) >= 3 THEN
    RAISE EXCEPTION 'limite_fila_paciente';
  END IF;
  INSERT INTO public.fila_espera (clinica_id,paciente_telefone,paciente_nome,servico,janela_inicio,janela_fim)
    VALUES (p_clinica,p_telefone,p_nome,p_servico,p_inicio,p_fim) RETURNING * INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.fila_ofertar_proximo(
  p_clinica uuid, p_servico text, p_inicio timestamptz, p_fim timestamptz
) RETURNS public.fila_espera
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.fila_espera;
BEGIN
  IF p_inicio IS NULL OR p_fim IS NULL OR NOT isfinite(p_inicio) OR NOT isfinite(p_fim) OR p_fim < p_inicio THEN
    RAISE EXCEPTION 'janela_invalida' USING ERRCODE = '22023';
  END IF;
  PERFORM public.fila_assert_tier_completo(p_clinica);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_clinica::text || '|' || p_inicio::text, 0));
  SELECT * INTO r FROM public.fila_espera WHERE clinica_id = p_clinica
    AND servico_normalizado = lower(regexp_replace(trim(p_servico),'\s+',' ','g'))
    AND status = 'aguardando'
    AND janela_inicio IS NOT NULL AND janela_fim IS NOT NULL
    AND janela_inicio <= p_inicio AND janela_fim >= p_fim
    ORDER BY entrou_em,id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF r.id IS NULL THEN RETURN NULL; END IF;
  UPDATE public.fila_espera SET status = 'ofertado', ofertado_em = now(),
    oferta_expira_em = now() + interval '15 minutes', oferta_inicio = p_inicio, oferta_fim = p_fim
    WHERE id = r.id RETURNING * INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.fila_aceitar_oferta(p_id uuid, p_clinica uuid)
RETURNS public.agendamentos
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.fila_espera; a public.agendamentos;
BEGIN
  SELECT * INTO f FROM public.fila_espera WHERE id = p_id AND clinica_id = p_clinica FOR UPDATE;
  IF f.id IS NULL THEN RAISE EXCEPTION 'entrada_nao_encontrada' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.fila_assert_tier_completo(p_clinica);
  IF f.status <> 'ofertado' OR f.oferta_expira_em IS NULL OR f.oferta_expira_em <= now() THEN
    RAISE EXCEPTION 'oferta_expirada';
  END IF;
  IF f.janela_inicio IS NULL OR f.janela_fim IS NULL OR f.janela_fim < f.janela_inicio
    OR f.oferta_inicio IS NULL OR f.oferta_fim IS NULL OR f.oferta_fim < f.oferta_inicio
    OR NOT isfinite(f.oferta_inicio) OR NOT isfinite(f.oferta_fim)
    OR f.oferta_inicio < f.janela_inicio OR f.oferta_fim > f.janela_fim THEN
    RAISE EXCEPTION 'janela_invalida' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(f.clinica_id::text || '|' || f.oferta_inicio::text, 0));
  INSERT INTO public.agendamentos (clinica_id,paciente_telefone,paciente_nome,data_hora,observacao,status)
    VALUES (f.clinica_id,f.paciente_telefone,f.paciente_nome,f.oferta_inicio,f.servico,'agendado') RETURNING * INTO a;
  UPDATE public.fila_espera SET status = 'aceito', respondido_em = now(), agendamento_id = a.id WHERE id = f.id;
  RETURN a;
END $$;

CREATE OR REPLACE FUNCTION public.fila_recusar_oferta(p_id uuid, p_clinica uuid)
RETURNS public.fila_espera
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.fila_espera;
BEGIN
  PERFORM public.fila_assert_tier_completo(p_clinica);
  UPDATE public.fila_espera SET status = 'recusado', respondido_em = now()
    WHERE id = p_id AND clinica_id = p_clinica AND status = 'ofertado' RETURNING * INTO r;
  IF r.id IS NULL THEN RAISE EXCEPTION 'oferta_invalida'; END IF;
  RETURN r;
END $$;

-- Repetir a proteção também nas assinaturas novas: CREATE FUNCTION concede
-- EXECUTE a PUBLIC por padrão. Nunca depender da ordem de publicação da API.
DO $migration$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature, p.proname, p.pronargs
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'fila\_%' ESCAPE '\'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f.signature);
    IF f.proname <> 'fila_assert_tier_completo'
       AND NOT (f.proname IN ('fila_aceitar_oferta', 'fila_recusar_oferta') AND f.pronargs = 1) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.signature);
    END IF;
  END LOOP;
END $migration$;

NOTIFY pgrst, 'reload schema';
COMMIT;
