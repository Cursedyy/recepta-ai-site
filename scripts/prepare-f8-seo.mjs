import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const dir='tmp-preparacao-f8';fs.mkdirSync(dir,{recursive:true});
const source=fs.readFileSync('src/index.html','utf8');
const match=source.match(/(<script[^>]*type=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/);
assert.ok(match,'JSON-LD não encontrado');const graph=JSON.parse(match[2]);
const changes=[];
function walk(x){
 if(!x||typeof x!=='object')return;
 if(x['@type']==='Offer'){
  if(x.priceSpecification?.billingDuration===12){
   const total={'347.00':'4164.00','697.00':'8364.00'}[x.price];assert.ok(total,'Preço anual inesperado');
   changes.push({from:x.price,to:total});x.price=total;
   if(x.priceSpecification?.price!==undefined)x.priceSpecification.price=total;
   x.priceSpecification.billingIncrement=12;
  }
  x.hasMerchantReturnPolicy={'@type':'MerchantReturnPolicy',applicableCountry:'BR',returnPolicyCategory:'https://schema.org/MerchantReturnFiniteReturnWindow',merchantReturnDays:7,refundType:'https://schema.org/FullRefund'};
 }
 for(const value of Object.values(x))if(value&&typeof value==='object')Array.isArray(value)?value.forEach(walk):walk(value);
}
walk(graph);assert.equal(changes.length,2);
const indent=match[2].match(/\n([ \t]*)\{/)?.[1]||'';
const formatted=JSON.stringify(graph,null,2).split('\n').map(line=>indent+line).join('\n');
const trailing=match[2].match(/\n([ \t]*)$/)?.[1]||'';
const candidate=source.replace(match[0],match[1]+'\n'+formatted+'\n'+trailing+match[3]);
assert.equal(candidate.replace(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/,''),source.replace(match[0],''));
const sitemap=fs.readFileSync('src/sitemap.xml','utf8'),day=new Date().toISOString().slice(0,10);
const candidateSitemap=sitemap.replace(/<lastmod>[^<]*<\/lastmod>/g,'<lastmod>'+day+'</lastmod>');
assert.equal([...candidateSitemap.matchAll(/<lastmod>/g)].length,11);
fs.writeFileSync(dir+'/index.html',candidate);fs.writeFileSync(dir+'/sitemap.xml',candidateSitemap);
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const manifest={sourceHashes:{'src/index.html':hash(source),'src/sitemap.xml':hash(sitemap)},changes,offersWithPolicy:4,lastmod:day,protectedSourceChanged:false};
fs.writeFileSync(dir+'/manifest.json',JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest));
