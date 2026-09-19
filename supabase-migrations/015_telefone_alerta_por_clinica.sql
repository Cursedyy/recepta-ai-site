-- 015_telefone_alerta_por_clinica.sql
-- Corrige clinicas ja cadastradas cujo `telefone_alerta` ficou no numero
-- pessoal do dono do produto (5553991635302), hardcoded no node "Config Fixa"
-- do workflow de Onboarding. O alerta de escalonamento ([HANDOFF]) ia todo
-- para o numero errado.
--
-- Fonte do numero certo: `clinicas.telefone_operador`, preenchido no briefing
-- (campo "Seu WhatsApp (com DDD)" -> whats_resp -> whatsapp_responsavel).
-- Ele chega SEM normalizacao ("53 99999-9999"), entao normalizamos aqui para
-- o mesmo E.164 sem "+" de 13 digitos que a UazAPI espera.
--
-- ANTES DE RODAR: confira o que vai mudar.
--   SELECT id, clinica, telefone_operador, telefone_alerta FROM clinicas;

WITH normalizado AS (
  SELECT
    id,
    regexp_replace(COALESCE(telefone_operador, ''), '\D', '', 'g') AS d
  FROM clinicas
),
alvo AS (
  SELECT
    id,
    CASE
      WHEN length(d) = 13 AND left(d, 2) = '55' THEN d
      WHEN length(d) = 12 AND left(d, 2) = '55' THEN left(d, 4) || '9' || substr(d, 5)
      WHEN length(d) = 11 THEN '55' || d
      WHEN length(d) = 10 THEN '55' || left(d, 2) || '9' || substr(d, 3)
      ELSE NULL
    END AS telefone
  FROM normalizado
)
UPDATE clinicas c
SET telefone_alerta = a.telefone
FROM alvo a
WHERE c.id = a.id
  AND a.telefone IS NOT NULL
  AND c.telefone_alerta = '5553991635302';

-- Clinicas sem telefone_operador confiavel ficam como estao (alerta continua
-- indo para o numero do dono). Liste-as depois de rodar:
--   SELECT id, clinica, telefone_operador FROM clinicas
--   WHERE telefone_alerta = '5553991635302';
