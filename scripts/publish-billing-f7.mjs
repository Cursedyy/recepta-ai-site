import fs from 'node:fs';
import assert from 'node:assert/strict';
import {buildF7Workflow} from './billing-f7-workflow.mjs';
const base=(process.env.N8N_BASE_URL||'https://n8n.zapscout.com.br').replace(/\/$/,''),id='cf1An4BYT9A0LuHi';
const headers={'X-N8N-API-KEY':process.env.N8N_API_KEY,'Content-Type':'application/json'};
async function api(method,path='',body){const r=await fetch(base+'/api/v1/workflows/'+id+path,{method,headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error(method+' workflow HTTP '+r.status);return r.json();}
const source=await api('GET'),meta=JSON.parse(fs.readFileSync('tmp-qa-f7/meta.json'));
assert.equal(source.versionId,meta.versionId,'Fonte mudou desde o QA');assert.equal(source.versionId,source.activeVersionId);assert.equal(source.active,true);
const candidate=JSON.parse(fs.readFileSync('tmp-qa-f7/candidate.json')),rebuilt=buildF7Workflow(source);
for(const key of ['nodes','connections','settings'])assert.deepEqual(candidate[key],rebuilt[key]);
const payload=w=>({name:w.name,nodes:w.nodes,connections:w.connections,settings:{executionOrder:w.settings?.executionOrder||'v1',...(w.settings?.errorWorkflow?{errorWorkflow:w.settings.errorWorkflow}:{})}});
const backup=`tmp-backup-workflows-deletados/${id}-antes-publicar-f7-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
fs.writeFileSync(backup,JSON.stringify(source));let changed=false;
try{
 await api('PUT','',payload(candidate));changed=true;await api('POST','/activate');const after=await api('GET');
 assert.equal(after.active,true);assert.equal(after.versionId,after.activeVersionId);assert.deepEqual(after.nodes,candidate.nodes);assert.deepEqual(after.connections,candidate.connections);
 const proof={id,backup,previousVersion:source.versionId,versionId:after.versionId,activeVersionId:after.activeVersionId,active:after.active,candidateEqual:true,addedNodes:after.nodes.length-source.nodes.length,date:new Date().toISOString()};fs.writeFileSync('tmp-qa-f7/publicacao.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}catch(error){if(changed){await api('PUT','',payload(source));await api('POST','/activate');const rollback=await api('GET');assert.deepEqual(rollback.nodes,source.nodes);assert.equal(rollback.versionId,rollback.activeVersionId);console.log(JSON.stringify({rollback:true,backup}));}throw error;}
