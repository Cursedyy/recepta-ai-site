import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from '../src/node_modules/playwright/index.mjs';
const proof={at:new Date().toISOString(),domains:[],commercial:[],browser:[],portal:null};
for(const domain of ['www.receptaai.com.br','receptaai.com.br','briefing-recepta.vercel.app']) {
  const checks=[];
  for(const [url,file] of [['/','src/index.html'],['/briefing','src/briefing/index.html'],['/analytics.js','src/analytics.js'],['/clinica/painel.js','src/clinica/painel.js'],['/sitemap.xml','src/sitemap.xml']]){
    const r=await fetch('https://'+domain+url);const body=await r.text();
    assert.equal(r.status,200);assert.equal(body,fs.readFileSync(file,'utf8'),domain+url+' must match source');
    checks.push({path:url,http:r.status,sourceEqual:true,sha256:crypto.createHash('sha256').update(body).digest('hex')});
  }
  const r=await fetch('https://'+domain+'/api/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pedido:null})});
  assert.equal(r.status,400);assert.equal((await r.json()).erro,'pedido_invalido');
  proof.domains.push({domain,checks,invalidSubmit:400});
}
for(const url of ['/','/termos','/privacidade','/estetica','/ortopedia','/psicologia','/radiologia','/blog','/blog/erros-clinicas-atendimento','/blog/ia-whatsapp-atendimento','/blog/secretaria-virtual-clinica','/briefing']){
  const r=await fetch('https://www.receptaai.com.br'+url);const html=await r.text();assert.equal(r.status,200);
  const visible=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<!--[\s\S]*?-->/g,'');
  assert.ok(!/grátis|gratuit|sem cartão|teste de 7|dias de teste|período de teste/i.test(visible),'old promise '+url);
  assert.ok(!/href=["']\/briefing\/?["']/i.test(html),'unpaid briefing CTA '+url);
  proof.commercial.push({path:url,http:r.status,oldPromise:false,unpaidBriefingCta:false});
}
const root=await(await fetch('https://www.receptaai.com.br/')).text();
const schema=JSON.parse(root.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const offers=schema['@graph'].flatMap(x=>x.offers||[]);assert.equal(offers.length,4);
assert.equal(offers.filter(x=>['4164.00','8364.00'].includes(x.price)).length,2);
assert.ok(offers.every(x=>x.hasMerchantReturnPolicy.merchantReturnDays===7));
proof.structuredData={offers:4,annualTotals:true,returnPolicies:4,googleRichResults:'não confirmei: Google pediu login'};
const browser=await chromium.launch({headless:true});
try {
 for(const width of [320,390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  // Reading the real pages, with analytics suppressed to preserve the baseline.
  await page.route('**/api/an',route=>route.fulfill({status:204}));
  await page.goto('https://www.receptaai.com.br/briefing');
  await page.locator('#semPedido').waitFor({state:'visible'});
  assert.equal(await page.locator('#form').isVisible(),false);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
  assert.deepEqual(errors,[]);proof.browser.push({width,gateVisible:true,formHidden:true,overflow:false,errors:[]});await page.close();
 }
}finally{await browser.close();}
if(process.env.STRIPE_SECRET_KEY){
 const r=await fetch('https://api.stripe.com/v1/billing_portal/configurations?active=true',{headers:{Authorization:'Bearer '+process.env.STRIPE_SECRET_KEY}});assert.equal(r.status,200);
 const data=await r.json();proof.portal={http:r.status,activeLiveConfigurations:data.data.filter(x=>x.livemode&&x.active).length,cancellation:data.data.filter(x=>x.livemode&&x.active).map(x=>({enabled:x.features.subscription_cancel.enabled,mode:x.features.subscription_cancel.mode,invoiceHistory:x.features.invoice_history.enabled}))};
 assert.ok(proof.portal.activeLiveConfigurations>0);
}
fs.mkdirSync('tmp-pendencias',{recursive:true});fs.writeFileSync('tmp-pendencias/production-proof.json',JSON.stringify(proof,null,2));
console.log(JSON.stringify(proof));
