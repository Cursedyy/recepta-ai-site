-- Adiciona coluna nome_cliente na tabela conversas para permitir
-- ao admin renomear o paciente associado a um telefone.
-- Quando vazio, o painel mostra o telefone formatado como fallback.

ALTER TABLE public.conversas
  ADD COLUMN IF NOT EXISTS nome_cliente text;
