import { writeFileSync, mkdirSync } from 'node:fs';
import vm from 'node:vm';
const dir=new URL('../tmp-auditoria/',import.meta.url);mkdirSync(dir,{recursive:true});
const evidence=[];const log=(test,ok,detail)=>{evidence.push({test,ok,detail});console.log(JSON.stringify(evidence.at(-1)));writeFileSync(new URL('workflows-evidence.json',dir),JSON.stringify(evidence,null,2));};
const h={'X-N8N-API-KEY':process.env.N8N_API_KEY},base=process.env.N8N_BASE_URL;
const get=async path=>{const r=await fetch(base+'/api/v1/'+path,{headers:h});if(!r.ok)throw Error(r.status);return r.json()};
const w=await get('workflows/cxn5FxUNMJmlJ1WJ');
log('Versão publicada Atendimento',w.active&&w.versionId===w.activeVersionId,{versionId:w.versionId,activeVersionId:w.activeVersionId,nodeCount:w.nodes.length});
function exec(code,input,lookup={}) {return vm.runInNewContext('(function(){'+code+'})()',{$json:input,$input:{first:()=>({json:input}),all:()=>[{json:input}]},$:name=>({first:()=>({json:lookup[name]||{}}),all:()=>[{json:lookup[name]||{}}]})},{timeout:3000});}
const code=name=>w.nodes.find(n=>n.name===name).parameters.jsCode;
const cfg={clinica:'QA audit isolated',id:'00000000-0000-4000-8000-000000000001',tier:'completo',ia_config:{system_prompt:'Atendimento sintético'},config_editavel:{precos:[],horarios:{},convenios:[]}};
for(const kind of ['texto','audio','imagem']) {
 const parsed=exec(code('Parser da Mensagem'),{body:{token:'qa-invalid',message:{chatid:'5511000000000@s.whatsapp.net',content:kind==='texto'?'QA TEXTO SENTINELA':'',mimetype:kind==='audio'?'audio/ogg':kind==='imagem'?'image/png':'text/plain',fileurl:kind==='texto'?null:'https://invalid.invalid/qa',messagetype:kind==='texto'?'text':kind==='audio'?'audio':'image'}}})[0].json;
 const lookup={'Parser da Mensagem':parsed,'Configuração da Clínica':{...cfg,...parsed},'Consolidar Histórico':{historico:[]},'Buscar Clínica':cfg};
 let current=parsed;
 if(kind==='audio')current=exec(code('Aplicar Transcrição'),{text:'QA TRANSCRICAO SENTINELA'},lookup)[0].json;
 if(kind==='imagem')current=exec(code('Aplicar Resultado da Imagem'),{output_text:'QA IMAGEM SENTINELA'},lookup)[0].json;
 const prompt=exec(code('Montar Prompt'),current,lookup)[0].json;
 lookup['Montar Prompt']=prompt;
 const result=exec(code('Processar Resposta IA'),{content:[{text:'Resposta QA'}]},lookup)[0].json;
 const expected=kind==='texto'?'QA TEXTO SENTINELA':kind==='audio'?'QA TRANSCRICAO SENTINELA':'QA IMAGEM SENTINELA';
 log('Contrato local do código publicado: '+kind,prompt.messages.at(-1).content===expected&&result.supabase_insert[0].mensagem===expected,{promptLast:prompt.messages.at(-1),persistedPatient:result.supabase_insert[0].mensagem,sameKeys:JSON.stringify(Object.keys(result.supabase_insert[0]).sort())===JSON.stringify(Object.keys(result.supabase_insert[1]).sort()),level:'Teste de integração de nodes em VM; STT/visão/LLM não invocados'});
}
const configCode=code('Configuração da Clínica');
log('Configuração mantém supabase_url',/supabase_url\s*:/.test(configCode),{hasSupabaseUrl:/supabase_url\s*:/.test(configCode)});
log('Integração fila no Atendimento',false,{nodes:w.nodes.filter(n=>/Oferta|Intenção Fila|Entrar.*Fila/.test(n.name)).map(n=>n.name),note:'Inserir na Fila é debounce de mensagens, não fila de espera'});
log('Cancelamento/remarcação no Atendimento',false,{executeWorkflows:w.nodes.filter(n=>n.type==='n8n-nodes-base.executeWorkflow').map(n=>({name:n.name,workflowId:n.parameters.workflowId})),parserHasCancel:/CANCELAMENTO|REMARCACAO|REMARCAR/.test(code('Processar Resposta IA'))});
for(const name of ['IF - É Áudio?','IF - Imagem Completo?','IF - Responder com TTS?']){
 const n=w.nodes.find(n=>n.name===name);
 log('Gate publicado '+name,null,{parameters:n.parameters,connections:w.connections[name]});
}
const billing=await get('workflows/cf1An4BYT9A0LuHi');
const billingCode=billing.nodes.find(n=>n.name==='Determinar Plano').parameters.jsCode;
const priceCfg=Object.fromEntries(billing.nodes.find(n=>n.name==='Config Stripe Webhook').parameters.assignments.assignments.map(x=>[x.name,x.value]));
for(const name of ['ESSENCIAL_MENSAL','ESSENCIAL_ANUAL','COMPLETO_MENSAL','COMPLETO_ANUAL']){
 const id=priceCfg['STRIPE_PRICE_'+name];
 const result=exec(billingCode,{data:[{price:{id}}]},{'Config Stripe Webhook':priceCfg,'Extrair Evento Checkout':{}});
 log('Preço '+name,!!id&&result.length===1,{priceId:id,result:result[0]?.json});
}
log('Preço desconhecido',exec(billingCode,{data:[{price:{id:'price_qa_invalid'}}]},{'Config Stripe Webhook':priceCfg}).length===0,'Não ativa plano');
// Read-only Stripe price queries; key remains inside this process.
const stripeSecret=process.env.STRIPE_SECRET_KEY||process.env.STRIPE_API_KEY||Object.entries(priceCfg).find(([k,v])=>/STRIPE.*(SECRET|KEY)/i.test(k)&&typeof v==='string'&&v.startsWith('sk_'))?.[1];
if(stripeSecret){for(const name of ['ESSENCIAL_MENSAL','ESSENCIAL_ANUAL','COMPLETO_MENSAL','COMPLETO_ANUAL']){const id=priceCfg['STRIPE_PRICE_'+name];const r=await fetch('https://api.stripe.com/v1/prices/'+id,{headers:{Authorization:'Bearer '+stripeSecret}});const p=await r.json();log('Stripe preço real '+name,r.ok,{status:r.status,id:p.id,amount:p.unit_amount,currency:p.currency,recurring:p.recurring,active:p.active});}}
else log('Stripe preço real',null,'Credencial não localizada na configuração consultada; nenhuma cobrança criada');
const ex=await get('executions?workflowId=cxn5FxUNMJmlJ1WJ&limit=35');
for(const item of ex.data){const e=await get('executions/'+item.id+'?includeData=true');const rd=e.data?.resultData?.runData||{};const val=n=>rd[n]?.at(-1)?.data?.main?.[0]?.[0]?.json;const parser=val('Parser da Mensagem');if(parser?.telefone!=='5519982206746')continue;const prompt=val('Montar Prompt');log('Execução QA anterior '+item.id,null,{startedAt:item.startedAt,status:item.status,versionId:e.data?.workflowData?.versionId||e.workflowData?.versionId,media:parser?.midia_tipo,stt:val('Aplicar Transcrição')?.transcricao_audio_ok,vision:val('Aplicar Resultado da Imagem')?.visao_imagem_ok,actualTextReachesPrompt:!!prompt?.messages?.at(-1)?.content,turnSaved:!!rd['Gravar Turno']&&!rd['Gravar Turno'].some(x=>x.error),delivery:val('Enviar Parte')?.status||val('Enviar Áudio TTS')?.status,errors:Object.entries(rd).filter(([k,v])=>v.some(x=>x.error)).map(([k,v])=>({node:k,error:v.find(x=>x.error).error.message})),nodes:Object.keys(rd)});}
