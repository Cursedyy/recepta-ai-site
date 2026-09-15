import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildF7Workflow } from './billing-f7-workflow.mjs';
const require = createRequire(new URL('../src/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const base = (process.env.N8N_BASE_URL || 'https://n8n.zapscout.com.br').replace(/\/$/, '');
const headers = { 'X-N8N-API-KEY': process.env.N8N_API_KEY, 'Content-Type': 'application/json' };
const stamp = Date.now().toString(36), dir = `tmp-qa-f7/${stamp}`;
fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync('tmp-backup-workflows-deletados', { recursive: true });
const fixtures = [], copies = [], events = [], proofs = [];
const check = r => { if (r.error) throw new Error(r.error.message); return r.data; };
async function api(method, path, body) { const r = await fetch(base + '/api/v1/' + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`${method} n8n HTTP ${r.status}`); return r.json(); }
async function fixture(label, customer, overrides = {}) {
  const f = { name: `ZZ QA F7 ${stamp} ${label}`, customer: customer || `cus_qa_f7_${stamp}_${label}`, subscription: `sub_qa_f7_${stamp}_${label}`, invoice: `in_qa_f7_${stamp}_${label}`, charge: `ch_qa_f7_${stamp}_${label}`, pi: `pi_qa_f7_${stamp}_${label}` }; fixtures.push(f);
  const c = check(await db.from('clinicas').insert({ clinica: f.name, uazapi_token: `qa_f7_${stamp}_${label}`, uazapi_server: 'https://sitemagic1.uazapi.com', status: 'ativo', tier: 'essencial', plano: 'mensal', stripe_customer_id: f.customer, stripe_subscription_id: f.subscription, trial_inicio: null, trial_fim: null, ...overrides }).select('id').single()); f.clinica = c.id;
  const p = check(await db.from('pedidos').insert({ status: 'provisionado', tier: 'essencial', ciclo: 'mensal', plano: 'mensal', origem: 'landing', clinica_id: c.id, stripe_customer_id: f.customer, stripe_subscription_id: f.subscription, pago_em: new Date().toISOString(), provisionado_em: new Date().toISOString() }).select('id').single()); f.pedido = p.id;
  check(await db.from('clinicas').update({ pedido_id: p.id }).eq('id', c.id)); return f;
}
async function state(f) { return check(await db.from('clinicas').select('id,status,disputa_em,reembolsado_em,garantia_inicio,garantia_fim,trial_inicio,trial_fim').eq('id', f.clinica).single()); }
function reachable(w, root) { const seen = new Set(), q = [root]; while(q.length) { const name=q.shift();if(seen.has(name))continue;seen.add(name);for(const links of w.connections[name]?.main||[])for(const l of links)q.push(l.node); } w.nodes=w.nodes.filter(n=>seen.has(n.name));w.connections=Object.fromEntries(Object.entries(w.connections).filter(([n])=>seen.has(n))); }
function codeMock(n, code, mode) { n.type='n8n-nodes-base.code';n.typeVersion=2;n.parameters={jsCode:code,...(mode?{mode}:{})};delete n.credentials; }
async function copy(candidate, mode) {
  const w=structuredClone(candidate), path=`qa-f7-${mode}-${stamp}`;
  if(mode==='billing') {
    const hook=w.nodes.find(n=>n.name==='Webhook Stripe Pagamento');hook.parameters={httpMethod:'POST',path,responseMode:'responseNode',options:{}};hook.webhookId=crypto.randomUUID();
    const sign=w.nodes.find(n=>n.name==='Assinatura Válida?');codeMock(sign,"const event=$('Webhook Stripe Pagamento').first().json.body;if(!event.id.startsWith('evt_qa_f7_'))throw new Error('Fixture only');return [{json:{event,valid:true}}];");
    w.connections['Config Stripe Webhook']={main:[[{node:sign.name,type:'main',index:0}]]};w.connections[sign.name]={main:[[{node:'Registrar Evento',type:'main',index:0}]]};reachable(w,hook.name);
  } else {
    const trigger=w.nodes.find(n=>n.name==='Schedule Reconciliação Stripe 15min');trigger.name='QA F7 Trigger';trigger.type='n8n-nodes-base.webhook';trigger.typeVersion=2;trigger.parameters={httpMethod:'POST',path,responseMode:'onReceived',options:{}};trigger.webhookId=crypto.randomUUID();w.connections[trigger.name]=w.connections['Schedule Reconciliação Stripe 15min'];delete w.connections['Schedule Reconciliação Stripe 15min'];reachable(w,trigger.name);
  }
  for(const n of w.nodes) {
    if(n.credentials?.stripeApi) {
      const expression=n.parameters.url.slice(3,-2).trim();
      codeMock(n,`const url=(${expression});const fixtures=${JSON.stringify(fixtures)};const f=fixtures.find(f=>[f.charge,f.invoice,f.subscription,f.pi].some(id=>url.includes(id)));if(!f)throw new Error('Unknown QA Stripe target');let value;if(url.includes('/charges/'))value={id:f.charge,object:'charge',livemode:true,currency:'brl',customer:f.customer,payment_intent:f.pi};else if(url.includes('/invoice_payments'))value={has_more:false,data:[{status:'paid',invoice:f.invoice,payment:{type:'payment_intent',payment_intent:f.pi}}]};else if(url.includes('/invoices/'))value={id:f.invoice,object:'invoice',livemode:true,customer:f.customer,parent:{subscription_details:{subscription:f.subscription}}};else if(url.includes('/subscriptions/'))value={id:f.subscription,object:'subscription',livemode:true,customer:f.customer,status:'active',metadata:{pedido_id:f.pedido}};else throw new Error('Unmocked Stripe path');return [{json:value}];`);
    }
    if(n.type==='n8n-nodes-base.httpRequest'&&n.parameters.url==='https://sitemagic1.uazapi.com/send/text') {
      const expression=n.parameters.jsonBody.slice(3,-2).trim();codeMock(n,`const body=JSON.parse(${expression});return [{json:{qa_alert:body.text,outbound:false}}];`);
    }
    if(n.name==='Consultar Instância Garantia') codeMock(n,"const body=$('QA F7 Trigger').first().json.body;return {json:{instance:{status:body.connected.includes($json.clinica_id)?'connected':'disconnected'}}};",'runOnceForEachItem');
    if(n.credentials?.supabaseApi&&n.parameters.url?.includes('/rest/v1/')) {
      const original=n.parameters.url.slice(3,-2).trim();
      n.parameters.url='={{ ('+original+') + '+JSON.stringify(mode==='observer' && /Stripe Órfãos/.test(n.name) ? `&event_id=like.evt_qa_f7_${stamp}*` : '')+' }}';
      if(mode==='observer'&&n.parameters.method==='GET') {
        const table=n.parameters.url.includes('/pedidos?')?'pedidos':n.parameters.url.includes('/clinicas?')?'clinicas':null;
        if(table)n.parameters.url='={{ ('+original+') + '+JSON.stringify('&id=in.('+fixtures.map(f=>table==='pedidos'?f.pedido:f.clinica).join(',')+')')+' }}';
      }
    }
  }
  const created=await api('POST','workflows',{name:`ZZ QA F7 ${mode} ${stamp}`,nodes:w.nodes,connections:w.connections,settings:{executionOrder:'v1'}});copies.push(created.id);
  const before=await api('GET',`workflows/${created.id}`);fs.writeFileSync(`tmp-backup-workflows-deletados/${created.id}-antes-ativar-qa-f7.json`,JSON.stringify(before));await api('POST',`workflows/${created.id}/activate`);return {id:created.id,path};
}
async function run(copy,label,body) {
  const r=await fetch(base+'/webhook/'+copy.path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});const text=await r.text();let execution;
  for(let i=0;i<30;i++) {
    const list=await api('GET',`executions?workflowId=${copy.id}&limit=3`);
    for(const e of list.data||[]) {const item=await api('GET',`executions/${e.id}?includeData=true`);if(!proofs.some(p=>p.executionId===item.id)&&(item.finished||item.status==='error')){execution=item;break;}}
    if(execution)break;await new Promise(r=>setTimeout(r,500));
  }
  assert.ok(execution,label+': execution missing');const runs=execution.data.resultData.runData;
  const proof={label,http:r.status,executionId:execution.id,nodes:Object.keys(runs),alerts:Object.entries(runs).filter(([name])=>/Alertar/.test(name)).flatMap(([,values])=>values.flatMap(v=>v.data?.main?.[0]?.map(x=>x.json.qa_alert)||[])),result:execution.status};
  fs.writeFileSync(dir+'/'+label+'.json',JSON.stringify(execution));proofs.push(proof);console.log(JSON.stringify(proof));return proof;
}
try {
  const source=await api('GET','workflows/cf1An4BYT9A0LuHi');fs.writeFileSync(`tmp-backup-workflows-deletados/cf1An4BYT9A0LuHi-antes-f7-${stamp}.json`,JSON.stringify(source));
  const a=await fixture('A'), control=await fixture('control',a.customer), observer=await fixture('observer'), offline=await fixture('offline');
  const candidate=buildF7Workflow(source);fs.writeFileSync('tmp-qa-f7/candidate.json',JSON.stringify(candidate));fs.writeFileSync('tmp-qa-f7/meta.json',JSON.stringify({versionId:source.versionId,backup:`tmp-backup-workflows-deletados/cf1An4BYT9A0LuHi-antes-f7-${stamp}.json`}));
  const billing=await copy(candidate,'billing');
  const event=(suffix,type,object)=>{const id=`evt_qa_f7_${stamp}_${suffix}`;events.push(id);return {id,type,created:Math.floor(Date.now()/1000),data:{object}};};
  const dispute=event('dispute','charge.dispute.created',{id:`dp_qa_${stamp}`,charge:a.charge});
  let p=await run(billing,'dispute',dispute);assert.equal(p.http,200);assert.ok(p.alerts[0]?.includes('DISPUTA'));const cut=await state(a);assert.equal(cut.status,'expirado');assert.ok(cut.disputa_em);assert.equal((await state(control)).status,'ativo');
  p=await run(billing,'dispute_duplicate',dispute);assert.equal(p.http,200);assert.equal(p.alerts.length,0);assert.equal((await state(a)).disputa_em,cut.disputa_em);
  const active=event('active','customer.subscription.updated',{id:a.subscription,customer:a.customer,status:'active'});await run(billing,'active_after_dispute',active);assert.equal((await state(a)).status,'expirado');
  const deleted=event('portal_deleted','customer.subscription.deleted',{id:control.subscription,customer:control.customer,status:'canceled'});p=await run(billing,'portal_subscription_deleted',deleted);assert.equal(p.http,200);assert.equal((await state(control)).status,'expirado');
  const obs=await copy(candidate,'observer');
  p=await run(obs,'observer_connected',{connected:[observer.clinica]});assert.equal(p.result,'success');assert.equal(p.http,200);const first=await state(observer);assert.ok(first.garantia_inicio);assert.ok(first.garantia_fim);assert.equal(first.trial_inicio,null);assert.equal(first.trial_fim,null);assert.equal((await state(offline)).garantia_inicio,null);
  for(let i=0;i<10;i++){p=await run(obs,'observer_repeat_'+i,{connected:[observer.clinica]});assert.equal(p.result,'success');assert.equal(p.http,200);}assert.deepEqual(await state(observer),first);
  // Build each threshold fixture only after the observer checks; avoid real alerts.
  check(await db.from('pedidos').update({status:'pago',pago_em:new Date(Date.now()-3*3600000).toISOString()}).eq('id',offline.pedido));
  check(await db.from('pedidos').update({status:'provisionando',provisionando_em:new Date(Date.now()-45*60000).toISOString()}).eq('id',observer.pedido));
  check(await db.from('clinicas').update({garantia_inicio:new Date().toISOString(),garantia_fim:new Date(Date.now()+24*3600000).toISOString()}).eq('id',observer.clinica));
  check(await db.from('clinicas').update({garantia_teto:new Date(Date.now()+24*3600000).toISOString()}).eq('id',offline.clinica));
  const audit=event('orphan','qa.fixture',{});check(await db.from('stripe_eventos').insert({event_id:audit.id,tipo:audit.type,recebido_em:new Date(Date.now()-20*60000).toISOString()}));
  p=await run(obs,'reconciliation',{connected:[]});assert.equal(p.result,'success');assert.equal(p.http,200);assert.ok(p.alerts[0]?.includes('eventos pendentes >15min=1'));assert.ok(p.alerts[0]?.includes('pedidos pagos >2h=1'));assert.ok(p.alerts[0]?.includes('provisionando >30min=1'));assert.ok(p.alerts[0]?.includes('garantias vencendo em 48h=2'));
  const prod=await api('GET','workflows/cf1An4BYT9A0LuHi');assert.equal(prod.versionId,source.versionId);
  fs.writeFileSync(dir+'/result.json',JSON.stringify({pass:true,fixtures,copies,proofs,productionUnchanged:true,externalIO:'simulated'},null,2));console.log(JSON.stringify({pass:true,scenarios:proofs.length,copies,dir}));
} finally {
  const teardown=[];
  for(const id of copies){await api('POST',`workflows/${id}/deactivate`);const w=await api('GET',`workflows/${id}`);assert.equal(w.active,false);}
  for(const f of fixtures){if(f.pedido)check(await db.from('pedidos').update({status:'cancelado',encerrado_em:new Date().toISOString(),motivo_encerramento:'qa_backlog_f7'}).eq('id',f.pedido));if(f.clinica){check(await db.from('clinicas').update({status:'expirado'}).eq('id',f.clinica));teardown.push(await state(f));}}
  for(const id of events)check(await db.from('stripe_eventos').update({processado_em:new Date().toISOString(),resultado:'qa_backlog_f7_encerrado'}).eq('event_id',id).is('processado_em',null));
  fs.writeFileSync(dir+'/teardown.json',JSON.stringify({copiesInactive:copies,fixtures:teardown},null,2));console.log(JSON.stringify({teardown:true,copies,fixtures:fixtures.length}));
}
