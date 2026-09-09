-- 014_pausa_manual.sql
-- Unifica a pausa por conversa numa tabela so: pausas_ia.
--
-- Contexto: o botao "Pausar/Retomar" do painel gravava em `conversas_pausadas`,
-- tabela que o workflow de Atendimento NUNCA le. O n8n le apenas `pausas_ia`
-- (node "Checar Pausa Ativa": pausado_ate > now()). Resultado: o botao nao
-- pausava nada de verdade.
--
-- Modelo escolhido: a MESMA tabela atende os dois gatilhos.
--   - pausa automatica (operador responde no WhatsApp): pausado_ate = now + N min
--   - pausa manual (botao do painel):                   pausado_ate = 2999-12-31
-- "Manual" e' simplesmente uma data absurdamente no futuro (>= 2900-01-01).
-- Retomar apaga a linha.
--
-- O trigger abaixo existe porque os dois gatilhos disputam a mesma linha:
-- sem ele, a clinica pausa manualmente, responde o paciente no WhatsApp, o
-- node "Registrar Pausa" faz upsert com now+10min e a pausa manual vira uma
-- pausa de 10 minutos em silencio -- justamente no caso de uso principal.
-- GREATEST garante que um gatilho nunca ENCURTA a pausa do outro.

-- ─────────────────────────────────────────────
-- 1. Trigger: pausa nunca encurta
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pausas_ia_nunca_encurta()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.pausado_ate := GREATEST(NEW.pausado_ate, OLD.pausado_ate);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pausas_ia_nunca_encurta ON pausas_ia;
CREATE TRIGGER trg_pausas_ia_nunca_encurta
  BEFORE UPDATE ON pausas_ia
  FOR EACH ROW
  EXECUTE FUNCTION pausas_ia_nunca_encurta();

-- ─────────────────────────────────────────────
-- 2. Migrar as pausas manuais que ja existiam
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'conversas_pausadas'
  ) THEN
    INSERT INTO pausas_ia (telefone, clinica, pausado_ate)
    SELECT telefone, clinica, TIMESTAMPTZ '2999-12-31 00:00:00+00'
    FROM conversas_pausadas
    WHERE pausada = true
    ON CONFLICT (telefone, clinica)
    DO UPDATE SET pausado_ate = TIMESTAMPTZ '2999-12-31 00:00:00+00';
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 3. conversas_pausadas fica DEPRECIADA
-- ─────────────────────────────────────────────
-- Depois do passo 2 nenhum codigo le ou escreve nessa tabela.
-- O DROP nao roda automaticamente (guardrail: nada e' deletado sem
-- confirmacao explicita). Quando quiser, rode a mao:
--
--   DROP TABLE public.conversas_pausadas;
