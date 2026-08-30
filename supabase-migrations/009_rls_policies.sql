-- 009: Policies RLS explícitas
--
-- Todas as tabelas já têm RLS habilitado (enable row level security),
-- mas sem policies explícitas. Isso significa que access via anon key
-- é bloqueado por padrão, mas é uma defesa frágil: qualquer policy
-- futura mal escrita pode abrir acesso indevido.
--
-- Este arquivo cria policies restritivas que:
-- 1. Bloqueiam acesso anônimo (anon role)
-- 2. Exigem autenticação para authenticated role
-- 3. Usam service_role para operações server-side (que ignora RLS)

-- ============================================================
-- convites_clinica
-- ============================================================
ALTER TABLE public.convites_clinica ENABLE ROW LEVEL SECURITY;

CREATE POLICY "convites_clinica_service_only"
  ON public.convites_clinica
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- ============================================================
-- clinicas
-- ============================================================
ALTER TABLE public.clinicas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinicas_service_only"
  ON public.clinicas
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- ============================================================
-- perfis
-- ============================================================
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perfis_service_only"
  ON public.perfis
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- ============================================================
-- conversas
-- ============================================================
ALTER TABLE public.conversas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversas_service_only"
  ON public.conversas
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- ============================================================
-- agendamentos
-- ============================================================
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agendamentos_service_only"
  ON public.agendamentos
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- ============================================================
-- config_editavel
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'config_editavel' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.config_editavel ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "config_editavel_service_only" ON public.config_editavel FOR ALL USING (false) WITH CHECK (false)';
  END IF;
END $$;

-- ============================================================
-- feriados
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'feriados' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.feriados ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "feriados_service_only" ON public.feriados FOR ALL USING (false) WITH CHECK (false)';
  END IF;
END $$;

-- ============================================================
-- logs_auditoria
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'logs_auditoria' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.logs_auditoria ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "logs_auditoria_service_only" ON public.logs_auditoria FOR ALL USING (false) WITH CHECK (false)';
  END IF;
END $$;

-- ============================================================
-- conversas_pausadas
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversas_pausadas' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.conversas_pausadas ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "conversas_pausadas_service_only" ON public.conversas_pausadas FOR ALL USING (false) WITH CHECK (false)';
  END IF;
END $$;

-- ============================================================
-- trials
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trials' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.trials ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "trials_service_only" ON public.trials FOR ALL USING (false) WITH CHECK (false)';
  END IF;
END $$;

-- NOTA: Todas as operações server-side usam service_role, que ignora
-- RLS. Estas policies protegem contra acesso via anon key ou
-- authenticated role com RLS habilitado. Nenhuma operação client-side
-- deve acessar essas tabelas diretamente.
