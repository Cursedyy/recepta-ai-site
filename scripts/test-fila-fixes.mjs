import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { instanteUtc, validarJanela } from '../src/api/_lib/fila-janela.js';
const require=createRequire(new URL('../src/package.json',import.meta.url));
const {chromium}=require('playwright');
const dir='tmp-fila-fix-2026-09-11';mkdirSync(dir,{recursive:true});
const run='qa-fix-'+Date.now(),results=[],clinics=[],users=[];
let browser,barrier=null;const calls=[];
const realFetch=globalThis.fetch;
const sb=process.env.SUPABASE_URL.replace(/\/$/,'');
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
// Os handlers desta suíte só podem conversar com Supabase; nenhuma integração
// de WhatsApp/email/Stripe/Sheets pode escapar do caminho isolado.
globalThis.fetch=async (input,options={})=>{
 const url=String(input?.url||input),method=options.method||input?.method||'GET';
 if(![new URL(sb).host,'api.supabase.com'].includes(new URL(url).host))throw Error('Destino bloqueado no teste: '+new URL(url).host);
 calls.push({path:new URL(url).pathname,method});
 if(barrier&&method==='PATCH'&&url.includes('/rest/v1/agendamentos'))await barrier();
 return realFetch(input,{...options,signal:options.signal||AbortSignal.timeout(15000)});
};
process.env.UPSTASH_REDIS_REST_URL='';process.env.UPSTASH_REDIS_REST_TOKEN='';
function record(test,ok,evidence){results.push({test,ok,evidence});writeFileSync(dir+'/regression-results.json',JSON.stringify({run,results},null,2));console.log(JSON.stringify(results.at(-1)));}
async function test(name,fn){try{record(name,true,await fn());}catch(e){record(name,false,{message:e.message,stack:e.stack});}}
async function request(path,method='GET',body,auth=headers){const r=await fetch(sb+path,{method,headers:{...auth,Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{data=raw}return {status:r.status,data};}
const rest=(path,method,body,auth)=>request('/rest/v1/'+path,method,body,auth);
const rpc=(name,body,auth)=>rest('rpc/'+name,'POST',body,auth);
async function invoke(handler,user,path,body){const url=new URL(path,'https://localhost:4466');const res={code:200,headers:{},body:null,status(n){this.code=n;return this;},setHeader(k,v){this.headers[k.toLowerCase()]=v;},getHeader(k){return this.headers[k.toLowerCase()];},json(x){this.body=x;this.headers['content-type']='application/json';return this;},send(x){this.body=x;return this;},end(x){this.body=x;return this;},redirect(n,p){this.code=n;this.headers.location=p;return this;}};
 await handler({method:body===undefined?'GET':'POST',url:url.pathname+url.search,query:Object.fromEntries(url.searchParams),headers:{cookie:user?.cookie||'',origin:'https://localhost:4466',host:'localhost:4466'},socket:{remoteAddress:'127.0.0.1'},body},res);return res;}
try{
 if(process.env.SUPABASE_ANON_KEY){
  // Anon key já fornecida (ex.: npx vercel env pull). Pula a API de Management,
  // que exige SUPABASE_ACCESS_TOKEN — ausente em sessões de teste.
 }else{
 const keysResponse=await fetch('https://api.supabase.com/v1/projects/vfyubktlmqytkcewicse/api-keys',{headers:{Authorization:'Bearer '+process.env.SUPABASE_ACCESS_TOKEN}});
 if(!keysResponse.ok)throw Error('Não foi possível obter anon key: '+keysResponse.status);
 const keys=await keysResponse.json();process.env.SUPABASE_ANON_KEY=keys.find(k=>k.name==='anon')?.api_key;
 }
 if(!process.env.SUPABASE_ANON_KEY)throw Error('Anon key ausente');
 const [{default:login},{default:acoes},{default:view},{default:agenda}]=await Promise.all([
   import('../src/api/clinica/login.js'),import('../src/api/clinica/painel-acoes.js'),import('../src/api/clinica/painel-view.js'),import('../src/api/clinica/agenda-listar.js')]);
 const fila=acoes; // endpoint da fila vive dentro de painel-acoes.js desde 2026-09-11 (limite Vercel Hobby de 12 functions)
 for(const suffix of ['a','b']){
   const id=randomUUID(),name=run+'-'+suffix;const c=await rest('clinicas','POST',{id,clinica:name,uazapi_token:run+'-'+suffix,uazapi_server:'https://invalid.invalid',tier:'completo',status:'ativo',trial_inicio:null,trial_fim:null,spreadsheet_id:null,categoria:'odontologia'});
   assert.equal(c.status,201);clinics.push({id,name});
   const email=name+'@example.invalid',password=randomUUID()+'Aa1!';const u=await request('/auth/v1/admin/users','POST',{email,password,email_confirm:true});assert.ok(u.status<300);users.push({id:u.data.id,email,password,clinic:clinics.at(-1)});
   const p=await rest('perfis','POST',{id:u.data.id,clinica_id:id,nome:name,papel:'clinica',ativo:true});assert.equal(p.status,201);
   const user=users.at(-1);const logged=await invoke(login,null,'/api/clinica/login',{email,senha:password});assert.equal(logged.code,200);
   user.cookie=logged.headers['set-cookie'].map(c=>c.split(';')[0]).join('; ');
   const token=await request('/auth/v1/token?grant_type=password','POST',{email,password});assert.equal(token.status,200);user.auth={apikey:process.env.SUPABASE_ANON_KEY,Authorization:'Bearer '+token.data.access_token,'Content-Type':'application/json'};
 }
 const [a,b]=users;
 const entry={p_clinica:a.clinic.id,p_telefone:'5511000000000',p_nome:run,p_servico:'Consulta',p_inicio:'2092-03-01T12:00:00-03:00',p_fim:'2092-03-01T18:00:00-03:00'};
 const entered=await rpc('fila_entrar',entry);assert.equal(entered.status,200);const fid=entered.data.id;
 await test('P0: leitura da clínica B ignora clinica_id forjado',async()=>{const r=await invoke(fila,b,'/api/clinica/painel-acoes?acao=fila&clinica_id='+a.clinic.id);assert.equal(r.code,200);assert.deepEqual(r.body.entradas,[]);return {status:r.code,entradas:r.body.entradas.length};});
 for(const acao of ['aceitar','recusar','cancelar'])await test('P0: '+acao+' de A pela sessão B bloqueado',async()=>{const r=await invoke(fila,b,'/api/clinica/painel-acoes',{acao,id:fid,clinica_id:a.clinic.id});assert.equal(r.code,404);assert.equal(r.body.erro,'entrada_nao_encontrada');return {status:r.code};});
 const anonymous={apikey:process.env.SUPABASE_ANON_KEY,Authorization:'Bearer '+process.env.SUPABASE_ANON_KEY,'Content-Type':'application/json'};
 for(const [label,auth] of [['B',b.auth],['anon',anonymous]]){
  await test('P0: '+label+' sem leitura REST direta',async()=>{const r=await rest('fila_espera?clinica_id=eq.'+a.clinic.id,'GET',undefined,auth);assert.ok([401,403].includes(r.status));return {status:r.status};});
  await test('P0: '+label+' sem alteração REST direta',async()=>{const r=await rest('fila_espera?id=eq.'+fid,'PATCH',{status:'cancelado'},auth);assert.ok([401,403].includes(r.status));return {status:r.status};});
  const rpcCases=[['fila_entrar',entry],['fila_ofertar_proximo',{p_clinica:a.clinic.id,p_servico:'Consulta',p_inicio:entry.p_inicio,p_fim:entry.p_fim}],['fila_aceitar_oferta',{p_id:fid,p_clinica:a.clinic.id}],['fila_recusar_oferta',{p_id:fid,p_clinica:a.clinic.id}],['fila_assert_tier_completo',{p_clinica:a.clinic.id}]];
  for(const [name,body] of rpcCases)await test('P0: '+label+' bloqueado em '+name,async()=>{const r=await rpc(name,body,auth);assert.ok([401,403].includes(r.status));return {status:r.status};});
 }
 // Não chamar expiração global, nem no teste negativo: a verificação de grants
 // e o teste SQL transacional cobrem essa função sem risco de tocar clientes.
 await test('P0: registro de A permaneceu intacto',async()=>{const r=await rest('fila_espera?id=eq.'+fid);assert.equal(r.data[0].status,'aguardando');return {status:r.data[0].status};});
 await test('P0: API exige sessão',async()=>{const r=await invoke(fila,null,'/api/clinica/painel-acoes');assert.equal(r.code,401);return {status:r.code};});
 await test('P1: normalização BRT/UTC e janela',async()=>{assert.equal(instanteUtc('2092-03-01T15:00:00-03:00'),'2092-03-01T18:00:00.000Z');assert.equal(instanteUtc('2092-03-01T18:00:00Z'),'2092-03-01T18:00:00.000Z');for(const pair of [[null,null],['2092-03-01T15:00:00',null],['2092-03-01T15:00:00','2092-03-01T16:00:00']])assert.equal(validarJanela(...pair),null);return {BRT:'15:00-03:00',UTC:'18:00Z'};});
 const offered=await rpc('fila_ofertar_proximo',{p_clinica:a.clinic.id,p_servico:'Consulta',p_inicio:'2092-03-01T15:00:00-03:00',p_fim:'2092-03-01T15:30:00-03:00'});assert.equal(offered.status,200);
 await test('P1: entrada/oferta/aceite preservam 15h BRT',async()=>{const r=await invoke(fila,a,'/api/clinica/painel-acoes',{acao:'aceitar',id:fid,clinica_id:b.clinic.id});assert.equal(r.code,200);assert.equal(r.body.resultado.clinica_id,a.clinic.id);assert.equal(new Date(r.body.resultado.data_hora).toISOString(),'2092-03-01T18:00:00.000Z');return {status:r.code,preferencia:offered.data.janela_inicio,oferta:offered.data.oferta_inicio,agendado:r.body.resultado.data_hora};});
 const malformed=[];
 for(const [name,extra] of [['aberta',{}],['incompleta',{janela_inicio:entry.p_inicio}],['sem_oferta',{janela_inicio:entry.p_inicio,janela_fim:entry.p_fim}]]){
  const row=await rest('fila_espera','POST',{clinica_id:a.clinic.id,paciente_telefone:'5511000000001',paciente_nome:run,servico:name,status:'aguardando',...extra});assert.equal(row.status,201);malformed.push(row.data[0]);
  await test('P1: janela '+name+' retorna 400 antes da RPC',async()=>{const start=calls.length;const r=await invoke(fila,a,'/api/clinica/painel-acoes',{acao:'aceitar',id:row.data[0].id});assert.equal(r.code,400);assert.ok(r.body.mensagem);assert.ok(!calls.slice(start).some(c=>c.path.includes('/rpc/')));return {status:r.code,body:r.body,rpcCalls:0};});
 }
 await test('P1: JSON inválido retorna 400',async()=>{const r=await invoke(fila,a,'/api/clinica/painel-acoes','{');assert.equal(r.code,400);return {status:r.code};});
 const dates=['2092-04-01T15:00:00Z','2092-04-02T15:00:00Z'];const appointments=[];
 for(const data_hora of dates){const r=await invoke(acoes,a,'/api/clinica/painel-acoes',{acao:'criar_agendamento',paciente_telefone:'5511000000000',paciente_nome:run,data_hora,clinica_id:b.clinic.id});assert.equal(r.code,200);appointments.push(r.body.agendamento);}
 await test('P1: remarcação ocupada 409 e original intacto',async()=>{const r=await invoke(acoes,a,'/api/clinica/painel-acoes',{acao:'remarcar_agendamento',agendamento_id:appointments[0].id,nova_data_hora:dates[1]});assert.equal(r.code,409);const stored=await rest('agendamentos?id=eq.'+appointments[0].id);assert.equal(new Date(stored.data[0].data_hora).toISOString(),new Date(dates[0]).toISOString());return {status:r.code,original:stored.data[0].data_hora};});
 await test('P1: corrida de remarcação exercita unique violation',async()=>{
   let release,count=0;const gate=new Promise(r=>{release=r});const timer=setTimeout(()=>release(),10000);
   barrier=async()=>{count++;if(count===2)release();await gate;};
   let moved;try{moved=await Promise.all(appointments.map(ap=>invoke(acoes,a,'/api/clinica/painel-acoes',{acao:'remarcar_agendamento',agendamento_id:ap.id,nova_data_hora:'2092-04-03T15:00:00Z'})));}finally{barrier=null;clearTimeout(timer);}
   assert.equal(count,2);assert.deepEqual(moved.map(r=>r.code).sort(),[200,409]);const loser=moved.findIndex(r=>r.code===409);const stored=await rest('agendamentos?id=eq.'+appointments[loser].id);assert.equal(new Date(stored.data[0].data_hora).toISOString(),new Date(dates[loser]).toISOString());return {statuses:moved.map(r=>r.code),unchanged:stored.data[0].data_hora,patches:count};
 });
 // Browser: Playwright intercepta as rotas e invoca os handlers locais. Auth e
 // banco são reais/sintéticos; nenhum servidor ou deploy precisa ser iniciado.
 browser=await chromium.launch({headless:true});const context=await browser.newContext();
 await context.addCookies(a.cookie.split('; ').map(c=>{const i=c.indexOf('=');return {name:c.slice(0,i),value:c.slice(i+1),domain:'localhost',path:'/',secure:true,httpOnly:true}}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://localhost:4466/**',async route=>{
  const req=route.request(),url=new URL(req.url());const endpoints={'/clinica/painel':view,'/api/clinica/painel-acoes':acoes,'/api/clinica/agenda-listar':agenda};const handler=endpoints[url.pathname];
  if(handler){const body=req.method()==='POST'?req.postData():undefined;const response=await invoke(handler,a,url.pathname+url.search,body);await route.fulfill({status:response.code,contentType:response.headers['content-type']||'text/html',body:typeof response.body==='string'?response.body:JSON.stringify(response.body)});return;}
  if(url.pathname==='/clinica/painel.js'){await route.fulfill({contentType:'application/javascript',body:readFileSync('src/clinica/painel.js','utf8')});return;}
  if(url.pathname.startsWith('/img/')&&!url.pathname.includes('..')){try{await route.fulfill({body:readFileSync('src'+url.pathname)});return;}catch{}}
  await route.fulfill({status:404,body:''});
 });
 await page.goto('https://localhost:4466/clinica/painel',{waitUntil:'domcontentloaded'});await page.waitForTimeout(1500);
 for(const width of [320,390])await test('P2: Axe no painel local autenticado '+width,async()=>{
   await page.setViewportSize({width,height:900});await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});const violations=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)}));});await page.screenshot({path:dir+'/painel-'+width+'.png',fullPage:true});assert.deepEqual(violations,[]);assert.deepEqual(errors,[]);return {violations,width,errors};
 });
 await test('P1: janela inválida é explicada no navegador',async()=>{await page.getByRole('button',{name:'Fila de espera',exact:true}).click();await page.waitForTimeout(500);
   // Usar uma oferta sintética legada para exercitar o botão real.
   const bad=malformed[0];const patch=await rest('fila_espera?id=eq.'+bad.id,'PATCH',{status:'ofertado',oferta_expira_em:'2092-03-01T00:00:00Z'});assert.equal(patch.status,200);
   await page.getByRole('button',{name:'Fila de espera',exact:true}).click();await page.getByRole('button',{name:'Aceitar',exact:true}).click();await page.waitForFunction(()=>document.getElementById('fila-status').textContent.includes('Informe início e fim'));
   const text=await page.locator('#fila-status').innerText();await page.screenshot({path:dir+'/janela-400.png',fullPage:true});return {message:text};
 });
}catch(e){record('Preparação/execução da suíte',false,{message:e.message,stack:e.stack});}
finally{
 if(browser)await browser.close();
 for(const c of clinics)for(const [table,filter] of [['fila_espera','clinica_id=eq.'+c.id],['agendamentos','clinica_id=eq.'+c.id],['perfis','clinica_id=eq.'+c.id]]){const r=await rest(table+'?'+filter,'DELETE');record('Limpeza '+table+' '+c.name,r.status<300,{status:r.status,count:r.data?.length});}
 for(const u of users){const r=await request('/auth/v1/admin/users/'+u.id,'DELETE');record('Limpeza usuário sintético',r.status<300,{status:r.status,id:u.id});}
 for(const c of clinics){const r=await rest('clinicas?id=eq.'+c.id,'DELETE');const after=await rest('clinicas?id=eq.'+c.id);record('Limpeza clínica verificada',r.status<300&&after.data.length===0,{id:c.id,remaining:after.data.length});}
 globalThis.fetch=realFetch;
 const failures=results.filter(r=>!r.ok);console.log(JSON.stringify({run,total:results.length,failures:failures.map(f=>f.test)}));process.exitCode=failures.length?1:0;
}
