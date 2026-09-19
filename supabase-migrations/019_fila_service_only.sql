-- Fila: nenhuma RPC ou tabela pode ser acessada diretamente pelo navegador.
-- Os callers n8n usam credenciais Supabase server-side. Não altera workflows.
BEGIN;

REVOKE ALL ON TABLE public.fila_espera FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fila_espera TO service_role;
ALTER TABLE public.fila_espera ENABLE ROW LEVEL SECURITY;

DO $migration$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS signature, p.proname, p.pronargs
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'fila\_%' ESCAPE '\'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f.signature);
    -- O helper só é chamado pelo owner das funções SECURITY DEFINER.
    -- Assinaturas legadas sem clínica não são mais um caminho suportado.
    IF f.proname <> 'fila_assert_tier_completo'
       AND NOT (f.proname IN ('fila_aceitar_oferta', 'fila_recusar_oferta') AND f.pronargs = 1) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.signature);
    END IF;
  END LOOP;
END $migration$;

NOTIFY pgrst, 'reload schema';
COMMIT;
