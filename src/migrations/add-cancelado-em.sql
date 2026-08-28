-- NOTA: bancos criados a partir de add-tables-painel.sql JA possuem a coluna
-- cancelado_em e o indice idx_agendamentos_status. Este arquivo existe apenas
-- para atualizar bancos provisionados antes dessas linhas. E idempotente:
-- rodar em um banco ja atualizado nao faz nada.
-- Adicionar coluna cancelado_em na tabela agendamentos
-- Execute este SQL no Supabase Dashboard → SQL Editor

-- Verificar se a coluna já existe (seguro para rodar múltiplas vezes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agendamentos'
    AND column_name = 'cancelado_em'
  ) THEN
    ALTER TABLE agendamentos ADD COLUMN cancelado_em TIMESTAMPTZ;
    RAISE NOTICE 'Coluna cancelado_em adicionada com sucesso';
  ELSE
    RAISE NOTICE 'Coluna cancelado_em já existe';
  END IF;
END $$;

-- Criar índice para consultas por status (opcional, melhora performance)
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos(status);
