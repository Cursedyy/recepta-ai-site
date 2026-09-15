import { writeFileSync } from 'node:fs';
import vm from 'node:vm';
const output=[];function log(test,ok,evidence){output.push({test,ok,evidence});console.log(JSON.stringify(output.at(-1)));writeFileSync(new URL('../tmp-auditoria/fila-isolada.json',import.meta.url),JSON.stringify(output,null,2));}
const endpoint='https://api.supabase.com/v1/projects/vfyubktlmqytkcewicse/database/query';
async function sql(query,read_only=true){const r=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+process.env.SUPABASE_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query,read_only})});const body=await r.json();if(!r.ok)throw Error(JSON.stringify(body));return body;}
const funcs=await sql("select proname,pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'fila_%'");
// Clone real definitions into session-local tables/functions. No public writes.
const defs=['fila_assert_tier_completo','fila_entrar','fila_ofertar_proximo','fila_aceitar_oferta','fila_recusar_oferta','fila_expirar_ofertas'].map(name=>funcs.find(x=>x.proname===name).def.replaceAll('public.','pg_temp.').replace(/(?<![.\w])(fila_\w+)\(/g,'pg_temp.$1(').replaceAll("SET search_path TO 'public'","SET search_path TO 'pg_temp'")).join(';\n')+';';
const id='00000000-0000-4000-8000-000000000001';
const query=`BEGIN;
CREATE TEMP TABLE clinicas (LIKE public.clinicas INCLUDING ALL) ON COMMIT DROP;
CREATE TEMP TABLE agendamentos (LIKE public.agendamentos INCLUDING ALL) ON COMMIT DROP;
CREATE TEMP TABLE fila_espera (LIKE public.fila_espera INCLUDING ALL) ON COMMIT DROP;
${defs}
INSERT INTO pg_temp.clinicas(id,clinica,uazapi_token,tier,trial_inicio,trial_fim) VALUES('${id}','qa-audit-temp','qa-invalid-temp','completo',null,null);
CREATE TEMP TABLE qa_results (name text, result jsonb) ON COMMIT DROP;
INSERT INTO qa_results SELECT 'entrada',to_jsonb(pg_temp.fila_entrar('${id}','5511000000000','qa-audit','QA servico',null,null));
INSERT INTO qa_results SELECT 'oferta',to_jsonb(pg_temp.fila_ofertar_proximo('${id}','QA servico','2091-02-01T15:00:00Z','2091-02-01T15:30:00Z'));
DO $test$ BEGIN
  BEGIN
    PERFORM pg_temp.fila_aceitar_oferta((SELECT id FROM pg_temp.fila_espera LIMIT 1));
    INSERT INTO qa_results VALUES ('aceite_janela_aberta',jsonb_build_object('unexpected_success',true));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO qa_results VALUES ('aceite_janela_aberta',jsonb_build_object('error',SQLERRM,'code',SQLSTATE));
  END;
END $test$;
UPDATE pg_temp.fila_espera SET oferta_expira_em=now()-interval '1 minute';
INSERT INTO qa_results SELECT 'expiracao',to_jsonb(pg_temp.fila_expirar_ofertas());
INSERT INTO qa_results SELECT 'estado_final',jsonb_agg(jsonb_build_object('status',status,'respondido',respondido_em is not null)) FROM pg_temp.fila_espera;
SELECT jsonb_agg(jsonb_build_object('test',name,'result',result)) AS evidence FROM qa_results;
ROLLBACK;`;
const isolated=await sql(query,false);log('Integração SQL isolada com funções reais',true,isolated);
const h={'X-N8N-API-KEY':process.env.N8N_API_KEY};
const get=async id=>(await fetch(process.env.N8N_BASE_URL+'/api/v1/executions/'+id+'?includeData=true',{headers:h})).json();
const previous=await get('95629');const wf=previous.workflowData;
const node=wf.nodes.find(n=>n.name==='Buscar Oferta Ativa do Paciente');
log('Paciente sem oferta na integração revertida',false,{sourceExecution:previous.id,workflowVersionId:previous.workflowVersionId,output:previous.data.resultData.runData[node.name].at(-1).data.main,alwaysOutputData:node.alwaysOutputData??false,reachesPrompt:!!previous.data.resultData.runData['Montar Prompt'],cause:'Zero itens encerra o ramo antes do prompt, embora execução tenha status success'});
const combine=wf.nodes.find(n=>n.name==='Combinar Resposta e Oferta').parameters.jsCode;
// Execute actual historical node code against isolated no-offer data.
const result=vm.runInNewContext('(function(){'+combine+'})()',{$input:{all:()=>[]},$:()=>({first:()=>({json:{mensagem:'QA sem oferta',oferta_resposta:'nenhuma'}})})},{timeout:3000});
log('Replay isolado do combinador sem oferta',result[0].json.oferta_id===null,{result,limitation:'O node recupera contexto se executado, mas n8n não o executa quando o HTTP anterior emite zero itens. Não é E2E n8n.'});
