#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const mode = process.argv[2];
if (!['qa','prod'].includes(mode)) throw new Error('uso: f4-reconciliacao.mjs qa|prod');
const BASE=(process.env.N8N_BASE_URL||'https://n8n.zapscout.com.br').replace(/\/$/,'');
const KEY=process.env.N8N_API_KEY, ID='cf1An4BYT9A0LuHi';
const H={'X-N8N-API-KEY':KEY,'Content-Type':'application/json'};
async function api(method,path,body){const r=await fetch(BASE+path,{method,headers:H,body:body?JSON.stringify(body):undefined});const text=await r.text();if(!r.ok)throw new Error(`${method} ${path}: ${r.status} ${text.slice(0,400)}`);return text?JSON.parse(text):{};}
const source=await api('GET',`/api/v1/workflows/${ID}`);
mkdirSync('tmp-backup-workflows-deletados',{recursive:true});
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const backup=`tmp-backup-workflows-deletados/${ID}-pre-f4-reconciliacao-${mode}-${stamp}.json`;
writeFileSync(backup,JSON.stringify(source,null,2));
if(source.nodes.some(n=>n.name==='Buscar Eventos Stripe Órfãos')) throw new Error('reconciliação já existe na origem');
const supa=source.nodes.find(n=>n.name==='Registrar Evento').credentials;
const alertCred={httpHeaderAuth:{id:'RtzO2OiBb8MJcxN4',name:'UazAPI - Recepta'}};
const rnd=randomBytes(4).toString('hex');
const trigger=mode==='qa'?{
  id:'f4-recon-trigger',name:'Webhook QA Reconciliação',type:'n8n-nodes-base.webhook',typeVersion:2,position:[0,0],webhookId:`f4-recon-${rnd}`,
  parameters:{httpMethod:'POST',path:`recepta/qa-f4-recon-${rnd}`,responseMode:'lastNode',options:{}}
}:{
  id:'f4-recon-trigger',name:'Schedule Reconciliação Stripe 15min',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,position:[-400,720],
  parameters:{rule:{interval:[{field:'minutes',minutesInterval:15}]}}
};
const nodes=[trigger,
 {id:'f4-recon-config',name:'Config Reconciliação Stripe',type:'n8n-nodes-base.set',typeVersion:3.4,position:[-176,720],parameters:{assignments:{assignments:[{id:'url',name:'supabase_url',type:'string',value:process.env.SUPABASE_URL||'https://vfyubktlmqytkcewicse.supabase.co'}]},options:{}}},
 {id:'f4-recon-buscar',name:'Buscar Eventos Stripe Órfãos',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[48,720],retryOnFail:true,maxTries:3,waitBetweenTries:2000,alwaysOutputData:true,credentials:supa,parameters:{method:'GET',url:"={{ $json.supabase_url + '/rest/v1/stripe_eventos?processado_em=is.null&recebido_em=lt.' + encodeURIComponent(new Date(Date.now()-15*60*1000).toISOString()) + '&select=event_id,tipo,recebido_em&order=recebido_em.asc&limit=50' }}",authentication:'predefinedCredentialType',nodeCredentialType:'supabaseApi',options:{}}},
 {id:'f4-recon-consolidar',name:'Consolidar Eventos Stripe Órfãos',type:'n8n-nodes-base.code',typeVersion:2,position:[272,720],parameters:{jsCode:"const rows=$input.all().map(i=>i.json).filter(r=>r&&r.event_id); return [{json:{quantidade:rows.length,event_ids:rows.map(r=>r.event_id),mais_antigo:rows[0]?.recebido_em||null}}];"}},
 {id:'f4-recon-if',name:'Há Eventos Stripe Órfãos?',type:'n8n-nodes-base.if',typeVersion:2.2,position:[496,720],parameters:{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:'q',leftValue:'={{ $json.quantidade > 0 }}',rightValue:0,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}}},
 {id:'f4-recon-alerta',name:'Alertar Eventos Stripe Órfãos',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[720,672],retryOnFail:true,maxTries:3,waitBetweenTries:2000,credentials:alertCred,parameters:{method:'POST',url:'https://sitemagic1.uazapi.com/send/text',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:"={{ JSON.stringify({ number: '5553991635302', text: '⚠️ Stripe: ' + $json.quantidade + ' evento(s) sem processamento há mais de 15 min. IDs: ' + $json.event_ids.join(', ') + '. Mais antigo: ' + $json.mais_antigo }) }}",options:{}}}
];
let wf;
if(mode==='qa') wf={name:`zz-f4-reconciliacao-${stamp}`,nodes,connections:{},settings:{executionOrder:'v1'}};
else wf=structuredClone(source),wf.nodes.push(...nodes);
const tn=trigger.name;
wf.connections[tn]={main:[[{node:'Config Reconciliação Stripe',type:'main',index:0}]]};
wf.connections['Config Reconciliação Stripe']={main:[[{node:'Buscar Eventos Stripe Órfãos',type:'main',index:0}]]};
wf.connections['Buscar Eventos Stripe Órfãos']={main:[[{node:'Consolidar Eventos Stripe Órfãos',type:'main',index:0}]]};
wf.connections['Consolidar Eventos Stripe Órfãos']={main:[[{node:'Há Eventos Stripe Órfãos?',type:'main',index:0}]]};
wf.connections['Há Eventos Stripe Órfãos?']={main:[[{node:'Alertar Eventos Stripe Órfãos',type:'main',index:0}],[]]};
const payload={name:wf.name,nodes:wf.nodes,connections:wf.connections,settings:{executionOrder:'v1',...(mode==='prod'&&source.settings?.errorWorkflow?{errorWorkflow:source.settings.errorWorkflow}:{})}};
const saved=mode==='qa'?await api('POST','/api/v1/workflows',payload):await api('PUT',`/api/v1/workflows/${ID}`,payload);
const target=saved.id||ID; await api('POST',`/api/v1/workflows/${target}/activate`); const after=await api('GET',`/api/v1/workflows/${target}`);
if(after.versionId!==after.activeVersionId)throw new Error('versionId != activeVersionId');
console.log(JSON.stringify({mode,id:target,path:mode==='qa'?trigger.parameters.path:null,backup,versionId:after.versionId,activeVersionId:after.activeVersionId,active:after.active},null,2));
