import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { chromium } from '../src/node_modules/playwright/index.mjs';

const sent=[];
const context=vm.createContext({window:{fetch:async(url,options)=>{sent.push({url,...options});return {};}}});
vm.runInContext(fs.readFileSync('src/analytics.js','utf8'),context);
for(const evento of ['ciclo_alterado','checkout_iniciado','checkout_abandonado','briefing_iniciado','briefing_enviado','whatsapp_conectado','reembolso_solicitado'])context.window.receptaAnalytics(evento,{tier:'essencial',ciclo:'anual',pedido:'must-not-leave',telefone:'must-not-leave'});
assert.equal(sent.length,7);
assert.ok(sent.every(x=>x.credentials==='omit'&&x.keepalive));
assert.ok(sent.every(x=>!x.body.includes('must-not-leave')));
context.window.receptaAnalytics('patient_123');assert.equal(sent.length,7);
context.window.fetch=()=>{throw Error('offline');};context.window.receptaAnalytics('visit');

const browser=await chromium.launch({headless:true});
try {
  const events=[], errors=[], submissions=[];
  const page=await browser.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.hostname!=='www.receptaai.com.br')return route.abort();
    if(u.pathname==='/api/an'){events.push(route.request().postDataJSON());return route.fulfill({status:204});}
    if(u.pathname==='/api/submit'){submissions.push(route.request().postDataJSON());return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});}
    if(u.pathname==='/api/checkout')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({url:'https://www.receptaai.com.br/mock-checkout',pedido_id:'12345678-abcd-4321-9876-123456789abc'})});
    if(u.pathname==='/mock-checkout')return route.fulfill({status:200,body:'checkout fixture'});
    const file=path.join('src',u.pathname==='/'?'index.html':u.pathname==='/briefing'?'briefing/index.html':u.pathname);
    if(!fs.existsSync(file)||fs.statSync(file).isDirectory())return route.fulfill({status:404});
    const ext=path.extname(file);return route.fulfill({status:200,contentType:ext==='.html'?'text/html':ext==='.js'?'application/javascript':ext==='.css'?'text/css':undefined,body:fs.readFileSync(file)});
  });
  await page.goto('https://www.receptaai.com.br/');
  await page.locator('[data-ciclo="anual"]').click();
  await page.locator('[data-ciclo="anual"]').click();
  assert.equal(events.filter(e=>e.evento==='ciclo_alterado').length,1);
  await page.locator('#essencial .btn').click();
  await page.waitForURL('**/mock-checkout');
  const checkout=events.find(e=>e.evento==='checkout_iniciado');
  assert.deepEqual(checkout,{evento:'checkout_iniciado',tier:'essencial',ciclo:'anual'});
  await page.goto('https://www.receptaai.com.br/?c=abandonado');
  assert.ok(events.some(e=>e.evento==='checkout_abandonado'));
  await page.evaluate(()=>sessionStorage.clear());
  await page.goto('https://www.receptaai.com.br/briefing');
  await assert.doesNotReject(()=>page.locator('#semPedido').waitFor({state:'visible'}));
  assert.equal(events.filter(e=>e.evento==='briefing_iniciado').length,0);
  await page.goto('https://www.receptaai.com.br/briefing?pedido=12345678-abcd-4321-9876-123456789abc');
  await page.locator('#form input').first().fill('Fixture');
  await page.locator('#form input').first().fill('Fixture again');
  assert.equal(events.filter(e=>e.evento==='briefing_iniciado').length,1);
  await page.evaluate(()=>{
    const fields={clinica:'Fixture Clínica',whats_resp:'11999999999',numero:'11988888888',cnpj:'11.222.333/0001-81',endereco:'Rua Fixture, 123, São Paulo',servicos:'Consulta',convenios:'Particular',horario_func:'Seg a sex 8h-18h',categoria:'geral'};
    for(const [id,value] of Object.entries(fields)){const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}
    document.querySelectorAll('#form input[type="checkbox"]').forEach(el=>{el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));});
    showStep(totalSteps-1);
  });
  await page.locator('#btn').click();
  await page.locator('#completion.active').waitFor();
  assert.equal(submissions.length,1);
  assert.equal(submissions[0].pedido,'12345678-abcd-4321-9876-123456789abc');
  assert.equal(events.filter(e=>e.evento==='briefing_enviado').length,1);
  assert.deepEqual(errors,[]);
  // Success events are tied to successful business responses, not button clicks.
  const briefing=fs.readFileSync('src/briefing/index.html','utf8');
  const panel=fs.readFileSync('src/clinica/painel.js','utf8');
  assert.match(briefing,/if \(!r.ok\) throw[\s\S]*?receptaAnalytics\("briefing_enviado"\)/);
  assert.match(panel,/if \(x.r.ok && x.j.ok\) \{\s*if \(x.j.registrado_em && window.receptaAnalytics\)/);
  console.log('PASS: seven anonymous emitters, offline tolerance, cycle deduplication, checkout dimensions, abandonment, briefing gate/start, no JS errors; all browser I/O mocked.');
} finally {await browser.close();}
