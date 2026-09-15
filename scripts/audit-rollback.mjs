import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../src/package.json', import.meta.url));
const { chromium } = require('playwright');
const run = 'qa-audit-' + new Date().toISOString().replace(/[:.]/g, '-');
const dir = new URL('../tmp-auditoria/' + run + '/', import.meta.url);
mkdirSync(dir, { recursive: true });
const results = [];
const save = () => writeFileSync(new URL('resultados.json', dir), JSON.stringify({run, results}, null, 2));
function record(test, ok, evidence) { results.push({test, ok, evidence}); save(); console.log(JSON.stringify(results.at(-1))); }
const sb = process.env.SUPABASE_URL.replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = {apikey:key, Authorization:'Bearer '+key, 'Content-Type':'application/json'};
async function request(url, opts={}) { const r=await fetch(url,{...opts,signal:AbortSignal.timeout(30000)}); const text=await r.text(); let body; try {body=JSON.parse(text)}catch{body=text} return {status:r.status, body, headers:r.headers}; }
async function rest(path, method='GET', body, auth=headers) {return request(sb+'/rest/v1/'+path,{method,headers:{...auth,Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});}
async function sql(query) {const r=await request('https://api.supabase.com/v1/projects/vfyubktlmqytkcewicse/database/query',{method:'POST',headers:{Authorization:'Bearer '+process.env.SUPABASE_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query,read_only:true})});if(r.status!==201&&r.status!==200)throw Error('SQL '+r.status);return r.body;}
async function rpc(name, body, auth) {return rest('rpc/'+name,'POST',body,auth);}
const clinics=[],users=[]; let browser;
const site='https://www.receptaai.com.br';
const when='2090-10-20T15:00:00-03:00',later='2090-10-21T15:00:00-03:00';
const phone='5511000000000';
try {
  // Inspect triggers before creating fixtures; no webhook or cron is invoked.
  const triggers=await sql("select tgname,pg_get_triggerdef(oid) as definition from pg_trigger where not tgisinternal and tgrelid in ('public.clinicas'::regclass,'public.agendamentos'::regclass,'public.fila_espera'::regclass,'auth.users'::regclass)");
  if(triggers.length)throw Error('Revisar triggers antes de criar fixtures');
  const security=await sql("select p.proname,has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'fila_%'");
  record('PermissÃµes RPC fila (catÃ¡logo real)',!security.some(x=>x.anon_execute||x.authenticated_execute),security);
  for(const tier of ['completo','essencial']) {
    const id=randomUUID(),name=run+'-'+tier;
    const c=await rest('clinicas','POST',{id,clinica:name,uazapi_token:run+'-'+tier+'-invalid',uazapi_server:'https://invalid.invalid',status:'ativo',trial_inicio:null,trial_fim:null,plano:'mensal',tier,spreadsheet_id:null,ia_config:{system_prompt:'ClÃ­nica sintÃ©tica da auditoria'},config_editavel:{precos:[{nome:'Consulta QA',valor:123}],horarios:{},convenios:[],mensagem_identidade:run}});
    if(c.status!==201)throw Error('Criar clÃ­nica '+JSON.stringify(c.body)); clinics.push({id,name,tier});
    const email=name+'@example.invalid',password=randomUUID()+'!Aa1';
    const u=await request(sb+'/auth/v1/admin/users',{method:'POST',headers,body:JSON.stringify({email,password,email_confirm:true,user_metadata:{audit_run:run}})});
    if(u.status!==200&&u.status!==201)throw Error('Criar usuÃ¡rio '+JSON.stringify(u.body));
    users.push({id:u.body.id,email,password,clinic:clinics.at(-1)});
    const p=await rest('perfis','POST',{id:u.body.id,clinica_id:id,nome:name,papel:'clinica',ativo:true});
    if(p.status!==201)throw Error('Criar perfil '+JSON.stringify(p.body));
  }
  const [a,b]=users;
  for(const path of ['/api/clinica/painel-acoes?acao=conversas','/api/clinica/agenda-listar','/api/clinica/fila']) {const r=await request(site+path);record('Sem sessÃ£o '+path,r.status===401,{status:r.status,body:r.body});}
  for(const u of users) {
    const login=await request(site+'/api/clinica/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:site},body:JSON.stringify({email:u.email,senha:u.password})});
    u.cookies=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
    record('Login '+u.clinic.tier,login.status===200&&!!u.cookies,{status:login.status,httpOnly:login.headers.getSetCookie().every(x=>/HttpOnly/i.test(x)),secure:login.headers.getSetCookie().every(x=>/Secure/i.test(x))});
    if(login.status!==200)throw Error('Login bloqueado');
  }
  async function api(u,path,body) {return request(site+path,{method:body?'POST':'GET',headers:{Cookie:u.cookies,Origin:site,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
  const action=(u,body)=>api(u,'/api/clinica/painel-acoes',body);
  if (!process.argv.includes('--browser-only')) {
  for(const u of users) {const f=await api(u,'/api/clinica/fila');record('Gate fila '+u.clinic.tier,f.status===(u===a?200:403),{status:f.status,body:f.body});}
  const c=await action(a,{acao:'criar_agendamento',clinica_id:b.clinic.id,paciente_telefone:phone,paciente_nome:run,data_hora:when});
  record('Criar agenda ignora clÃ­nica forjada',c.status===200&&c.body.agendamento?.clinica_id===a.clinic.id,{status:c.status,body:c.body});
  const aid=c.body.agendamento?.id;
  if(aid) {
    const cross=await action(b,{acao:'cancelar_agendamento',agendamento_id:aid});record('Cancelar entre clÃ­nicas',cross.status===403,{status:cross.status,body:cross.body});
    const crossMove=await action(b,{acao:'remarcar_agendamento',agendamento_id:aid,nova_data_hora:later});record('Remarcar entre clÃ­nicas',crossMove.status===403,{status:crossMove.status,body:crossMove.body});
    const mv=await action(a,{acao:'remarcar_agendamento',agendamento_id:aid,nova_data_hora:later});record('RemarcaÃ§Ã£o autenticada',mv.status===200,{status:mv.status,stored:(await rest('agendamentos?id=eq.'+aid+'&select=id,data_hora')).body});
    const cancel=await action(a,{acao:'cancelar_agendamento',agendamento_id:aid});record('Cancelamento autenticado',cancel.status===200,{status:cancel.status,stored:(await rest('agendamentos?id=eq.'+aid+'&select=id,status,cancelado_em')).body});
  }
  const concurrent=await Promise.all([1,2].map(i=>action(a,{acao:'criar_agendamento',paciente_telefone:phone,paciente_nome:run+'-'+i,data_hora:when})));
  record('Conflito concorrente API',concurrent.filter(x=>x.status===200).length===1&&concurrent.some(x=>x.status===409),concurrent.map(x=>({status:x.status,body:x.body})));
  const second=await action(a,{acao:'criar_agendamento',paciente_telefone:phone,paciente_nome:run+'-remarcar',data_hora:later});
  if(second.body.agendamento?.id){const clash=await action(a,{acao:'remarcar_agendamento',agendamento_id:second.body.agendamento.id,nova_data_hora:when});record('RemarcaÃ§Ã£o para horÃ¡rio ocupado',clash.status===409,{status:clash.status,body:clash.body});}
  const entry={p_clinica:a.clinic.id,p_telefone:phone,p_nome:run,p_servico:'Consulta QA',p_inicio:'2091-01-01T12:00:00Z',p_fim:'2091-01-01T18:00:00Z'};
  const enter=await rpc('fila_entrar',entry);record('Fila entrada',enter.status===200,{status:enter.status,body:enter.body});
  const f=enter.body;
  const duplicate=await rpc('fila_entrar',entry);record('Fila duplicidade',duplicate.status>=400,{status:duplicate.status,body:duplicate.body});
  const noOffer=await rpc('fila_aceitar_oferta',{p_id:f.id});record('Paciente sem oferta nÃ£o aceita',noOffer.status>=400,{status:noOffer.status,body:noOffer.body});
  const wrongTier=await rpc('fila_entrar',{...entry,p_clinica:b.clinic.id});record('Gate fila RPC Essencial',wrongTier.status>=400,{status:wrongTier.status,body:wrongTier.body});
  const offeredAt='2091-01-01T15:00:00Z';
  const offer=await rpc('fila_ofertar_proximo',{p_clinica:a.clinic.id,p_servico:'Consulta QA',p_inicio:offeredAt,p_fim:'2091-01-01T15:30:00Z'});
  record('Fila oferta isolada',offer.status===200&&offer.body?.status==='ofertado',{status:offer.status,body:offer.body});
  const crossFila=await api(b,'/api/clinica/fila',{acao:'aceitar',id:f.id});record('Fila API isolamento',crossFila.status===403||(crossFila.status===404&&crossFila.body?.erro==='entrada_nao_encontrada'),{status:crossFila.status,body:crossFila.body});
  const accepted=await rpc('fila_aceitar_oferta',{p_id:f.id});record('Aceite usa horÃ¡rio ofertado',accepted.status===200&&new Date(accepted.body.data_hora).toISOString()===new Date(offeredAt).toISOString(),{status:accepted.status,body:accepted.body,offeredAt});
  const refuseEntry=await rpc('fila_entrar',{...entry,p_servico:'Recusa QA'});
  await rpc('fila_ofertar_proximo',{p_clinica:a.clinic.id,p_servico:'Recusa QA',p_inicio:offeredAt,p_fim:'2091-01-01T15:30:00Z'});
  const refused=await rpc('fila_recusar_oferta',{p_id:refuseEntry.body.id});record('Fila recusa',refused.status===200&&refused.body.status==='recusado',{status:refused.status,body:refused.body});
  const expiredEntry=await rpc('fila_entrar',{...entry,p_servico:'Expira QA'});
  await rest('fila_espera?id=eq.'+expiredEntry.body.id,'PATCH',{status:'ofertado',oferta_expira_em:'2000-01-01T00:00:00Z'});
  const expired=await rpc('fila_aceitar_oferta',{p_id:expiredEntry.body.id});record('Fila aceite expirado',expired.status>=400,{status:expired.status,body:expired.body});
  // Global expiry is intentionally not invoked: it can mutate customer rows.
  record('ExpiraÃ§Ã£o global',null,'NÃ£o executada em produÃ§Ã£o: RPC sem filtro de clÃ­nica. Teste transacional isolado em etapa separada.');
  // Test direct RPC isolation with only a synthetic user's JWT and synthetic rows.
  const session=await request(sb+'/auth/v1/token?grant_type=password',{method:'POST',headers,body:JSON.stringify({email:b.email,password:b.password})});
  const jwtHeaders={apikey:key,Authorization:'Bearer '+session.body.access_token,'Content-Type':'application/json'};
  const bypass=await rpc('fila_entrar',{...entry,p_servico:'Isolamento RPC QA'},jwtHeaders);
  record('Isolamento direto RPC entre clÃ­nicas',bypass.status>=400,{status:bypass.status,body:bypass.body});
  }
  const conversations=[{clinica:a.clinic.name,telefone:phone,role:'paciente',mensagem:run+' texto transcrito',mensagem_media:null},{clinica:a.clinic.name,telefone:phone,role:'ia',mensagem:run+' resposta sintÃ©tica',mensagem_media:null}];
  const persisted=await rest('conversas','POST',conversations);record('PersistÃªncia lote de conversas',persisted.status===201,{status:persisted.status,count:persisted.body.length});
  for(const u of users){const conv=await api(u,'/api/clinica/painel-acoes?acao=conversas&clinica='+encodeURIComponent(a.clinic.name));record('Conversas isolamento '+u.clinic.tier,u===a?JSON.stringify(conv.body).includes(run+' texto transcrito'):!JSON.stringify(conv.body).includes(run+' texto transcrito'),{status:conv.status,body:conv.body});}
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext();
  await context.addCookies(a.cookies.split('; ').map(pair=>{const i=pair.indexOf('=');return {name:pair.slice(0,i),value:pair.slice(i+1),domain:'www.receptaai.com.br',path:'/',secure:true,httpOnly:true}}));
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(site+'/clinica/painel',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(2000);
  record('Painel autenticado navegador',page.url().includes('/painel'),{url:page.url(),title:await page.title(),errors});
  const axePath=require.resolve('axe-core/axe.min.js');
  for(const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:900});
    await page.screenshot({path:fileURLToPath(new URL('painel-'+width+'.png',dir)),fullPage:true});
    const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
    record('Painel responsivo '+width,layout.scroll<=width,layout);
    await page.addScriptTag({path:axePath});
    const axe=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));});
    record('Painel acessibilidade '+width,axe.length===0,axe);
  }
  const nav=await page.locator('[data-tab]').evaluateAll(es=>es.map(e=>({tag:e.tagName,tab:e.dataset.tab,text:e.textContent.trim()})));record('NavegaÃ§Ã£o painel',true,nav);
  const convButton=page.locator('[data-tab="conversas"]').first();
  if(await convButton.count()){await convButton.click();await page.waitForTimeout(1000);record('Conversa exibida no painel',(await page.locator('body').innerText()).includes(run),{text:(await page.locator('body').innerText()).slice(-5000),errors});await page.screenshot({path:fileURLToPath(new URL('conversas.png',dir)),fullPage:true});}
} catch(e) {record('InterrupÃ§Ã£o da suÃ­te',false,{message:e.message,stack:e.stack});}
finally {
  if(browser)await browser.close();
  for(const c of clinics){for(const [table,filter] of [['fila_espera','clinica_id=eq.'+c.id],['agendamentos','clinica_id=eq.'+c.id],['conversas','clinica=eq.'+encodeURIComponent(c.name)],['perfis','clinica_id=eq.'+c.id]]){const r=await rest(table+'?'+filter,'DELETE');record('Limpeza '+table+' '+c.tier,r.status<300,{status:r.status,count:Array.isArray(r.body)?r.body.length:null});}}
  for(const u of users){const r=await request(sb+'/auth/v1/admin/users/'+u.id,{method:'DELETE',headers});record('Limpeza usuÃ¡rio sintÃ©tico',r.status<300,{status:r.status,id:u.id});}
  for(const c of clinics){const r=await rest('clinicas?id=eq.'+c.id,'DELETE');record('Limpeza clÃ­nica sintÃ©tica',r.status<300,{status:r.status,id:c.id});}
  const left=await rest('clinicas?select=id&clinica=like.'+run+'*');record('Limpeza verificada',left.status===200&&left.body.length===0,{status:left.status,remaining:left.body});
  console.log('ARTEFATOS '+dir.pathname);
}
