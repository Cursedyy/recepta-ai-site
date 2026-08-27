-- ============================================================
-- MIGRAÇÃO COMPLETA — Painel Admin + Clínica
-- Execute no Supabase Dashboard → SQL Editor
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. Tabela: conversas_pausadas
-- Usada pelo admin para pausar/retomar a Recepta por conversa
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversas_pausadas (
  telefone TEXT NOT NULL,
  clinica TEXT NOT NULL,
  pausada BOOLEAN NOT NULL DEFAULT true,
  pausada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (telefone, clinica)
);

-- RLS: apenas service_role acessa (via API server-side)
ALTER TABLE conversas_pausadas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'svc_conversas_pausadas'
  ) THEN
    CREATE POLICY svc_conversas_pausadas ON conversas_pausadas
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;


-- ─────────────────────────────────────────────
-- 2. Tabela: agendamentos
-- Consultas marcadas pela Recepta para cada clínica
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agendamentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id UUID NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  paciente_telefone TEXT NOT NULL,
  data_hora TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'agendado',
  cancelado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_clinica_id ON agendamentos(clinica_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data_hora ON agendamentos(data_hora);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos(status);

ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'svc_agendamentos'
  ) THEN
    CREATE POLICY svc_agendamentos ON agendamentos
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;


-- ─────────────────────────────────────────────
-- 3. Tabela: convites_clinica
-- Tokens de convite/reset de senha para clínicas
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS convites_clinica (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id UUID NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL DEFAULT 'convite',
  expira_em TIMESTAMPTZ NOT NULL,
  usado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_convites_clinica_token ON convites_clinica(token);
CREATE INDEX IF NOT EXISTS idx_convites_clinica_clinica_id ON convites_clinica(clinica_id);

ALTER TABLE convites_clinica ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'svc_convites_clinica'
  ) THEN
    CREATE POLICY svc_convites_clinica ON convites_clinica
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;


-- ─────────────────────────────────────────────
-- 4. Coluna: perfis.ativo
-- Permite desativar usuários sem deletar
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'perfis' AND column_name = 'ativo'
  ) THEN
    ALTER TABLE perfis ADD COLUMN ativo BOOLEAN NOT NULL DEFAULT true;
    RAISE NOTICE 'Coluna perfis.ativo adicionada';
  ELSE
    RAISE NOTICE 'Coluna perfis.ativo já existe';
  END IF;
END $$;


-- ─────────────────────────────────────────────
-- 5. Coluna: conversas.escalado
-- Indica se a conversa foi escalada para humano
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversas' AND column_name = 'escalado'
  ) THEN
    ALTER TABLE conversas ADD COLUMN escalado BOOLEAN NOT NULL DEFAULT false;
    RAISE NOTICE 'Coluna conversas.escalado adicionada';
  ELSE
    RAISE NOTICE 'Coluna conversas.escalado já existe';
  END IF;
END $$;


-- ─────────────────────────────────────────────
-- 6. Tabela: logs_auditoria
-- Registro de ações administrativas
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS logs_auditoria (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id UUID,
  acao TEXT NOT NULL,
  detalhes JSONB,
  ip TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logs_auditoria_usuario_id ON logs_auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_logs_auditoria_criado_em ON logs_auditoria(criado_em);

ALTER TABLE logs_auditoria ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'svc_logs_auditoria'
  ) THEN
    CREATE POLICY svc_logs_auditoria ON logs_auditoria
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;


-- ─────────────────────────────────────────────
-- 7. Tabela: feriados
-- Datas especiais/feriados por clínica
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feriados (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id UUID NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  nome TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(clinica_id, data)
);

CREATE INDEX IF NOT EXISTS idx_feriados_clinica_id ON feriados(clinica_id);

ALTER TABLE feriados ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'svc_feriados'
  ) THEN
    CREATE POLICY svc_feriados ON feriados
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;
