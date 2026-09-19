import { readFileSync, writeFileSync } from 'node:fs';
const migrations=['019_fila_service_only.sql','020_fila_horario_ofertado.sql'].map(name=>readFileSync(new URL('../supabase-migrations/'+name,import.meta.url),'utf8').replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,''));
const checks=`
DO $tests$
DECLARE a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); f public.fila_espera; g public.fila_espera; ap public.agendamentos; before_count int;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'fila_%'
    AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))) THEN
    RAISE EXCEPTION 'RPC exposta ao navegador';
  END IF;
  IF has_table_privilege('authenticated','public.fila_espera','SELECT') OR has_table_privilege('anon','public.fila_espera','INSERT') THEN
    RAISE EXCEPTION 'Tabela exposta ao navegador';
  END IF;
  IF has_function_privilege('service_role','public.fila_aceitar_oferta(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Assinatura legada exposta'; END IF;
  IF NOT has_function_privilege('service_role','public.fila_aceitar_oferta(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Caminho server-side bloqueado'; END IF;
  INSERT INTO public.clinicas(id,clinica,uazapi_token,uazapi_server,tier,trial_inicio,trial_fim)
    VALUES (a,'qa-fix-sql-'||a,'qa-invalid-'||a,'https://invalid.invalid','completo',null,null),
      (b,'qa-fix-sql-'||b,'qa-invalid-'||b,'https://invalid.invalid','completo',null,null);
  f := public.fila_entrar(a,'5511000000000','QA','Consulta','2092-02-01T12:00:00-03:00','2092-02-01T18:00:00-03:00');
  ASSERT f.janela_inicio = '2092-02-01T15:00:00Z'::timestamptz, 'BRT convertido incorretamente';
  BEGIN
    PERFORM public.fila_entrar(a,'5511000000000','QA','Consulta','2092-02-01T15:00:00Z','2092-02-01T21:00:00Z');
    RAISE EXCEPTION 'Duplicidade aceita';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM <> 'entrada_fila_duplicada' THEN RAISE; END IF; END;
  f := public.fila_ofertar_proximo(a,'Consulta','2092-02-01T15:00:00-03:00','2092-02-01T15:30:00-03:00');
  ASSERT f.oferta_inicio = '2092-02-01T18:00:00Z'::timestamptz, 'Oferta incorreta';
  ASSERT f.janela_inicio = '2092-02-01T15:00:00Z'::timestamptz, 'Preferência sobrescrita';
  BEGIN
    PERFORM public.fila_aceitar_oferta(f.id,b); RAISE EXCEPTION 'Aceite entre clínicas permitido';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;
  BEGIN
    PERFORM public.fila_recusar_oferta(f.id,b); RAISE EXCEPTION 'Recusa entre clínicas permitida';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM <> 'oferta_invalida' THEN RAISE; END IF; END;
  ASSERT (SELECT status FROM public.fila_espera WHERE id=f.id) = 'ofertado', 'Outra clínica alterou oferta';
  ap := public.fila_aceitar_oferta(f.id,a);
  ASSERT ap.data_hora = '2092-02-01T18:00:00Z'::timestamptz, 'Aceite não usa oferta';
  ASSERT to_char(ap.data_hora AT TIME ZONE 'America/Sao_Paulo','HH24:MI') = '15:00', 'Aceite não exibe 15h BRT';
  -- UTC de entrada e oferta preserva o mesmo instante no segundo cenário.
  g := public.fila_entrar(a,'5511000000001','QA','UTC','2092-02-02T15:00:00Z','2092-02-02T21:00:00Z');
  g := public.fila_ofertar_proximo(a,'UTC','2092-02-02T18:00:00Z','2092-02-02T18:30:00Z');
  ap := public.fila_aceitar_oferta(g.id,a);
  ASSERT ap.data_hora = '2092-02-02T18:00:00Z'::timestamptz, 'UTC convertido duas vezes';
  BEGIN PERFORM public.fila_entrar(a,'5511000000002','QA','Aberta',null,null); RAISE EXCEPTION 'Janela aberta aceita'; EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN PERFORM public.fila_entrar(a,'5511000000002','QA','Incompleta',now(),null); RAISE EXCEPTION 'Janela incompleta aceita'; EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN PERFORM public.fila_entrar(a,'5511000000002','QA','Invertida',now(),now()-interval '1 hour'); RAISE EXCEPTION 'Janela invertida aceita'; EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN PERFORM public.fila_ofertar_proximo(a,'Consulta',null,null); RAISE EXCEPTION 'Oferta aberta aceita'; EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  -- Oferta legada sem o slot explícito não pode aceitar a preferência por engano.
  INSERT INTO public.fila_espera(clinica_id,paciente_telefone,servico,status,oferta_expira_em)
    VALUES(a,'5511000000003','Legada','ofertado',now()+interval '15 minutes') RETURNING * INTO g;
  BEGIN PERFORM public.fila_aceitar_oferta(g.id,a); RAISE EXCEPTION 'Oferta legada aceita'; EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  UPDATE public.fila_espera SET status='cancelado' WHERE id=g.id;
  -- Unique violation de uma oferta ocupada deve fazer rollback integral do aceite.
  g := public.fila_entrar(a,'5511000000004','QA','Conflito','2092-02-02T15:00:00Z','2092-02-02T21:00:00Z');
  g := public.fila_ofertar_proximo(a,'Conflito','2092-02-02T18:00:00Z','2092-02-02T18:30:00Z');
  SELECT count(*) INTO before_count FROM public.agendamentos WHERE clinica_id=a;
  BEGIN PERFORM public.fila_aceitar_oferta(g.id,a); RAISE EXCEPTION 'Horário duplicado aceito'; EXCEPTION WHEN unique_violation THEN NULL; END;
  ASSERT (SELECT count(*) FROM public.agendamentos WHERE clinica_id=a)=before_count, 'Conflito alterou agenda';
  ASSERT (SELECT status FROM public.fila_espera WHERE id=g.id)='ofertado', 'Conflito alterou fila';
END $tests$;
SELECT 'ok' AS isolamento_horario_janela_conflito;
`;
// Tudo ocorre em uma transação não publicada; rollback inclui DDL e fixtures.
const query='BEGIN; SET LOCAL statement_timeout = \'30s\';\n'+migrations.join('\n')+'\n'+migrations.join('\n')+'\n'+checks+'\nROLLBACK;';
const r=await fetch('https://api.supabase.com/v1/projects/vfyubktlmqytkcewicse/database/query',{method:'POST',headers:{Authorization:'Bearer '+process.env.SUPABASE_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query,read_only:false})});
const result=await r.json();writeFileSync('tmp-fila-fix-2026-09-11/migrations-test.json',JSON.stringify({at:new Date().toISOString(),status:r.status,result,rollback:true,idempotenceRuns:2},null,2));console.log(JSON.stringify(result));if(!r.ok)process.exitCode=1;
