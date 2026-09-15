import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const dir='tmp-fila-fix-2026-09-11';mkdirSync(dir,{recursive:true});
const paths=['src/api/clinica/fila.js','src/api/clinica/painel-acoes.js','src/api/clinica/painel-view.js','src/clinica/painel.js'];
for(const path of paths)copyFileSync(path,dir+'/'+path.replaceAll('/','__')+'.before');
const h={'X-N8N-API-KEY':process.env.N8N_API_KEY};
const response=await fetch(process.env.N8N_BASE_URL+'/api/v1/workflows?limit=250',{headers:h});const list=await response.json();if(!list.data?.length||list.nextCursor)throw Error('Inventário incompleto');
const callers=[];const workflows=[];
for(const brief of list.data){const w=await(await fetch(process.env.N8N_BASE_URL+'/api/v1/workflows/'+brief.id,{headers:h})).json();
 workflows.push({id:w.id,name:w.name,active:w.active,versionId:w.versionId,activeVersionId:w.activeVersionId,hash:createHash('sha256').update(JSON.stringify({nodes:w.nodes,connections:w.connections})).digest('hex')});
 for(const node of w.nodes){const params=JSON.stringify(node.parameters);const rpc=[...new Set(params.match(/fila_(?:entrar|ofertar_proximo|aceitar_oferta|recusar_oferta|expirar_ofertas|assert_tier_completo)/g)||[])];if(rpc.length)callers.push({workflowId:w.id,workflow:w.name,active:w.active,node:node.name,rpc,authentication:node.parameters.authentication,credentialType:node.parameters.nodeCredentialType,credentialNames:Object.values(node.credentials||{}).map(c=>c.name),body:node.parameters.jsonBody});}}
writeFileSync(dir+'/callers-live.json',JSON.stringify({at:new Date().toISOString(),workflows,callers},null,2));console.log(JSON.stringify(callers,null,2));
const query="select proname,pg_get_functiondef(p.oid) as definition,proacl::text as acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'fila_%'";
const r=await fetch('https://api.supabase.com/v1/projects/vfyubktlmqytkcewicse/database/query',{method:'POST',headers:{Authorization:'Bearer '+process.env.SUPABASE_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query,read_only:true})});if(!r.ok)throw Error('Inventário SQL '+r.status);writeFileSync(dir+'/functions-before.json',JSON.stringify(await r.json(),null,2));
