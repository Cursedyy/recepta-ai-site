-- ============================================================
-- CLEANUP: Delete test appointments created during debugging
-- Run this manually in Supabase SQL Editor
-- ============================================================

-- Option 1: Delete by test phone numbers (safest)
DELETE FROM agendamentos
WHERE paciente_telefone IN (
  '5553999999999',   -- Teste Livre
  '5553888888888',   -- Teste Conflito
  '5553999998888'    -- Teste TZ
);

-- Option 2: Delete by paciente_nome patterns
DELETE FROM agendamentos
WHERE paciente_nome LIKE 'Teste%';

-- Option 3: Delete all appointments for the test clinic
-- (WARNING: This deletes ALL appointments for clinica_id 07073852...)
-- Uncomment only if you want to start fresh:
-- DELETE FROM agendamentos
-- WHERE clinica_id = '07073852-10c6-4702-8233-317813b95d55';

-- Verify cleanup
SELECT id, paciente_nome, paciente_telefone, data_hora, status
FROM agendamentos
ORDER BY criado_em DESC
LIMIT 10;
