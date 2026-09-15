import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(new URL('../src/package.json',import.meta.url));
const {createClient}=require('@supabase/supabase-js');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const base=process.env.N8N_BASE_URL||'https://n8n.zapscout.com.br',headers={'X-N8N-API-KEY':process.env.N8N_API_KEY,'Content-Type':'application/json'};
const stamp=Date.now().toString(36);let appointment,qa;
const check=r=>{if(r.error)throw new Error(r.error.message);return r.data;};
async function api(method,path,body){const r=await fetch(base+'/api/v1/'+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw new Error('n8n HTTP '+r.status);return r.json();}
fs.mkdirSync('tmp-qa-f7',{recursive:true});fs.mkdirSync('tmp-backup-workflows-deletados',{recursive:true});
try{
 const c=check(await db.from('clinicas').select('id,clinica,status,reembolsado_em,uazapi_token').eq('id','6e880b3b-ce18-45ec-8992-c27849ffbd88').single());
 assert.ok(c.clinica.startsWith('ZZ QA Refund'));assert.equal(c.status,'expirado');assert.ok(c.reembolsado_em);
 const a=check(await db.from('agendamentos').insert({clinica_id:c.id,paciente_telefone:'5500000000000',paciente_nome:'ZZ QA Corte '+stamp,data_hora:new Date(Date.now()+2*3600000).toISOString(),status:'agendado',observacao:'qa_backlog_f7_corte'}).select('id').single());appointment=a.id;
 const reminders=await api('GET','workflows/sJzrlremPGkjZDxO');const query=[];
 for(const name of ['Buscar Lembretes 24h','Buscar Lembretes 3h']){
  const node=reminders.nodes.find(n=>n.name===name);const expression=node.parameters.url.slice(3,-2).trim();const url=new Function('$json','return '+expression)({supabase_url:process.env.SUPABASE_URL});
  const options={headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY}};
  const r=await fetch(url+'&id=eq.'+appointment,options);const rows=await r.json();assert.equal(r.status,200);assert.deepEqual(rows,[]);
  const control=await fetch(url.replace('&clinicas.status=eq.ativo','')+'&id=eq.'+appointment,options);const included=await control.json();assert.equal(included.length,1);query.push({name,http:r.status,withActiveGuard:rows.length,withoutActiveGuard:included.length});
 }
 const source=await api('GET','workflows/cxn5FxUNMJmlJ1WJ');fs.writeFileSync(`tmp-backup-workflows-deletados/cxn5FxUNMJmlJ1WJ-antes-qa-corte-${stamp}.json`,JSON.stringify(source));
 const names=['Buscar Clínica','Configuração da Clínica','IF - Clínica Expirada?'];const nodes=source.nodes.filter(n=>names.includes(n.name)).map(n=>structuredClone(n));
 nodes.push({id:'qa-hook',name:'QA Corte Trigger',type:'n8n-nodes-base.webhook',typeVersion:2,webhookId:crypto.randomUUID(),position:[0,0],parameters:{httpMethod:'POST',path:'qa-corte-'+stamp,responseMode:'lastNode',options:{}}},
 {id:'qa-parser',name:'Parser da Mensagem',type:'n8n-nodes-base.code',typeVersion:2,position:[200,0],parameters:{jsCode:`return [{json:{tipo:'atender',token:${JSON.stringify(c.uazapi_token)},telefone:'5500000000000',mensagem:'Fixture QA',telefone_alt:'5500000000000'}}];`}},
 {id:'qa-stop',name:'QA Corte Confirmado',type:'n8n-nodes-base.code',typeVersion:2,position:[800,0],parameters:{jsCode:"return [{json:{bloqueado:true,status:$json.status,ia_chamada:false}}];"}},
 {id:'qa-fail',name:'QA Falha Corte',type:'n8n-nodes-base.code',typeVersion:2,position:[800,200],parameters:{jsCode:"throw new Error('Clínica reembolsada alcançaria o ramo de atendimento');"}});
 const edge=node=>({node,type:'main',index:0});const connections={'QA Corte Trigger':{main:[[edge('Parser da Mensagem')]]},'Parser da Mensagem':{main:[[edge('Buscar Clínica')]]},'Buscar Clínica':{main:[[edge('Configuração da Clínica')]]},'Configuração da Clínica':{main:[[edge('IF - Clínica Expirada?')]]},'IF - Clínica Expirada?':{main:[[edge('QA Corte Confirmado')],[edge('QA Falha Corte')]]}};
 const created=await api('POST','workflows',{name:'ZZ QA Corte Reembolso '+stamp,nodes,connections,settings:{executionOrder:'v1'}});qa=created.id;
 const before=await api('GET','workflows/'+qa);fs.writeFileSync(`tmp-backup-workflows-deletados/${qa}-antes-ativar-qa-corte.json`,JSON.stringify(before));await api('POST','workflows/'+qa+'/activate');
 const r=await fetch(base+'/webhook/qa-corte-'+stamp,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const body=await r.json();assert.equal(r.status,200);assert.equal(body.bloqueado,true);assert.equal(body.ia_chamada,false);
 const list=await api('GET','executions?workflowId='+qa+'&limit=1');const execution=await api('GET','executions/'+list.data[0].id+'?includeData=true');assert.ok(execution.data.resultData.runData['QA Corte Confirmado']);assert.ok(!execution.data.resultData.runData['QA Falha Corte']);
 fs.writeFileSync('tmp-qa-f7/corte-execution.json',JSON.stringify(execution));const proof={clinica:c.id,appointment,qaId:qa,executionId:execution.id,http:r.status,body,reminders:query,externalMessages:0};fs.writeFileSync('tmp-qa-f7/corte-proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}finally{
 if(qa){await api('POST','workflows/'+qa+'/deactivate');assert.equal((await api('GET','workflows/'+qa)).active,false);}
 if(appointment)check(await db.from('agendamentos').update({status:'cancelado',cancelado_em:new Date().toISOString()}).eq('id',appointment));
 console.log(JSON.stringify({teardown:true,qaInactive:qa||null,appointmentCancelled:appointment||null}));
}
