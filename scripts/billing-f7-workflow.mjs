import fs from 'node:fs';
export function buildF7Workflow(source) {
  const wf = structuredClone(source);
  const find = name => { const n = wf.nodes.find(n => n.name === name); if (!n) throw new Error('Node ausente: ' + name); return n; };
  if (wf.nodes.some(n => n.name === 'Extrair Disputa F7')) throw new Error('F7 já existe');
  const stripe = find('Buscar Cobrança Reembolso'), supabase = find('Consultar Registro');
  const read = file => fs.readFileSync(new URL('../src/n8n-patches/' + file, import.meta.url), 'utf8');
  const add = (name, type, parameters, template = {}) => {
    const n = { ...structuredClone(template), id: 'f7-' + name.normalize('NFD').replace(/[^a-zA-Z0-9]/g, '-'), name, type,
      typeVersion: type === 'n8n-nodes-base.code' ? 2 : template.typeVersion || 4.2, position: [2100, 1700 + wf.nodes.length * 20], parameters };
    delete n.webhookId; delete n.onError; wf.nodes.push(n); return n;
  };
  const js = (name, code, mode) => { new Function(code); return add(name, 'n8n-nodes-base.code', { jsCode: code, ...(mode ? { mode } : {}) }); };
  const expr = code => '={{ ' + code + ' }}';
  const http = (name, template, method, url, body) => add(name, 'n8n-nodes-base.httpRequest', {
    method, url: expr(url), authentication: 'predefinedCredentialType', nodeCredentialType: template.parameters.nodeCredentialType,
    ...(template === supabase ? { sendHeaders: true, headerParameters: { parameters: [{ name: 'Prefer', value: 'return=representation' }] } } : {}),
    ...(body ? { sendBody: true, specifyBody: 'json', jsonBody: expr('JSON.stringify(' + body + ')') } : {}), options: { timeout: 15000 },
  }, { ...template, retryOnFail: true, maxTries: 3, waitBetweenTries: 1000, alwaysOutputData: true });
  const link = (from, to, failure) => {
    wf.connections[from] = { main: [[{ node: to, type: 'main', index: 0 }], ...(failure ? [[{ node: failure, type: 'main', index: 0 }]] : [])] };
    if (failure) find(from).onError = 'continueErrorOutput';
  };
  const appendRoute = (route, to) => {
    const classify = find('Classificar Evento');
    classify.parameters.jsCode = classify.parameters.jsCode.replace("if (event.type === 'charge.refunded')", `if (event.type === 'charge.dispute.created') return [{json:{event,rota:'${route}'}}];\n\nif (event.type === 'charge.refunded')`);
    const router = find('Rotear Evento'), values = router.parameters.rules.values, index = values.length;
    const rule = structuredClone(values[0]); rule.conditions.conditions[0].id = 'f7-dispute'; rule.conditions.conditions[0].rightValue = route; rule.outputKey = route; values.push(rule);
    const routes = wf.connections[router.name].main, fallback = routes[index] || [];
    routes[index] = [{ node: to, type: 'main', index: 0 }]; routes[index + 1] = fallback;
  };
  const db = "$('Config Stripe Webhook').first().json.supabase_url";
  const target = "$('Preparar Destino Disputa').first().json";
  js('Extrair Disputa F7', "const event=$('Assinatura Válida?').first().json.event; const charge=event.data?.object?.charge; const id=typeof charge==='string'?charge:charge?.id; if(event.type!=='charge.dispute.created'||!/^ch_[a-zA-Z0-9_]+$/.test(id||'')||!/^dp_[a-zA-Z0-9_]+$/.test(event.data.object.id||'')||!Number.isInteger(event.created)||event.created<=0)throw new Error('Disputa: evento inválido'); return [{json:{charge_id:id}}];");
  http('Buscar Cobrança Disputa F7', stripe, 'GET', "'https://api.stripe.com/v1/charges/' + encodeURIComponent($json.charge_id)");
  js('Validar Cobrança Disputa', read('billing-dispute-cobranca.js'));
  add('Disputa Tem Fatura?', 'n8n-nodes-base.if', { conditions: { options: { typeValidation: 'strict', version: 2 }, conditions: [{ id: 'invoice', leftValue: expr('Boolean($json.invoice_id)'), operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} }, { typeVersion: 2 });
  http('Buscar Invoice Payments Disputa', stripe, 'GET', "'https://api.stripe.com/v1/invoice_payments?payment[type]=payment_intent&payment[payment_intent]=' + encodeURIComponent($json.payment_intent_id) + '&status=paid&limit=2'");
  const reuse = (file, pairs) => pairs.reduce((text, [from, to]) => text.replaceAll(from, to), read(file));
  const names = [['Validar Cobrança Reembolso', 'Validar Cobrança Disputa'], ['Resolver Fatura Reembolso', 'Resolver Fatura Disputa'], ['Validar Fatura Reembolso', 'Validar Fatura Disputa'], ['Validar Assinatura Reembolso', 'Validar Assinatura Disputa'], ['Validar Pedido Reembolso', 'Validar Pedido Disputa'], ['Reembolso:', 'Disputa:']];
  js('Resolver Fatura Disputa', reuse('billing-refund-invoice-payment.js', names));
  http('Buscar Fatura Disputa', stripe, 'GET', "'https://api.stripe.com/v1/invoices/' + encodeURIComponent($json.invoice_id)");
  js('Validar Fatura Disputa', reuse('billing-refund-fatura.js', names));
  http('Buscar Assinatura Disputa', stripe, 'GET', "'https://api.stripe.com/v1/subscriptions/' + encodeURIComponent($json.subscription_id)");
  js('Validar Assinatura Disputa', reuse('billing-refund-assinatura.js', names));
  http('Buscar Pedido Disputa', supabase, 'GET', `${db} + '/rest/v1/pedidos?stripe_subscription_id=eq.' + encodeURIComponent($json.subscription_id) + '&select=id,clinica_id,status,stripe_customer_id,stripe_subscription_id,encerrado_em,motivo_encerramento&limit=2'`);
  js('Validar Pedido Disputa', reuse('billing-refund-pedido.js', names));
  http('Buscar Clínica Disputa F7', supabase, 'GET', `${db} + '/rest/v1/clinicas?id=eq.' + encodeURIComponent($json.clinica_id || '00000000-0000-0000-0000-000000000000') + '&stripe_subscription_id=eq.' + encodeURIComponent($json.subscription_id) + '&stripe_customer_id=eq.' + encodeURIComponent($json.customer_id) + '&select=id,status,pedido_id,stripe_subscription_id,stripe_customer_id,disputa_em&limit=2'`);
  js('Preparar Destino Disputa', "const t=$('Validar Pedido Disputa').first().json; const rows=$input.all().map(x=>x.json).filter(x=>x.id); if(rows.length!==1||rows[0].id!==t.clinica_id||rows[0].pedido_id!==t.pedido_id||rows[0].stripe_customer_id!==t.customer_id||rows[0].stripe_subscription_id!==t.subscription_id)throw new Error('Disputa: clínica não confirma compra'); return [{json:{...t,clinica_id:rows[0].id}}];");
  const path = `${db} + '/rest/v1/clinicas?id=eq.' + encodeURIComponent(${target}.clinica_id) + '&pedido_id=eq.' + encodeURIComponent(${target}.pedido_id) + '&stripe_subscription_id=eq.' + encodeURIComponent(${target}.subscription_id) + '&stripe_customer_id=eq.' + encodeURIComponent(${target}.customer_id)`;
  http('Congelar Clínica Disputa F7', supabase, 'PATCH', path + " + '&disputa_em=is.null'", `{status:'expirado',disputa_em:${target}.data}`);
  http('Conferir Clínica Disputa F7', supabase, 'GET', path + " + '&select=id,status,disputa_em'");
  js('Confirmar Disputa F7', `const t=${target};const rows=$input.all().map(x=>x.json).filter(x=>x.id);if(rows.length!==1||rows[0].id!==t.clinica_id||rows[0].status!=='expirado'||!rows[0].disputa_em)throw new Error('Disputa: corte não confirmado');return [{json:t}];`);
  const alert = add('Alertar Disputa F7', 'n8n-nodes-base.httpRequest', structuredClone(find('Alertar Eventos Stripe Órfãos').parameters), find('Alertar Eventos Stripe Órfãos'));
  const originalAlertBody = alert.parameters.jsonBody;
  const number = originalAlertBody.match(/number:\s*'([^']+)'/)?.[1]; if (!number) throw new Error('Destino do alerta não confirmado');
  alert.parameters.jsonBody = expr(`JSON.stringify({number:'${number}',text:'🚨 DISPUTA Stripe: ' + ${target}.disputa_id + '; pedido ' + ${target}.pedido_id + '; clínica ' + ${target}.clinica_id + '. Acesso congelado. Revisar imediatamente; nenhum estorno automático realizado.'})`);
  const close = add('Fechar Evento Disputa F7', 'n8n-nodes-base.httpRequest', structuredClone(find('Fechar Evento Ignorado').parameters), find('Fechar Evento Ignorado'));
  close.parameters.jsonBody = expr("JSON.stringify({processado_em:new Date().toISOString(),resultado:'disputa_congelada'})");
  const respond = add('Respond 200 Disputa F7', 'n8n-nodes-base.respondToWebhook', { respondWith: 'json', responseBody: expr("JSON.stringify({received:true,processed:'disputa'})"), options: {} }, { typeVersion: 1.1 });
  appendRoute('disputa', 'Extrair Disputa F7');
  const disputeFlow = ['Extrair Disputa F7','Buscar Cobrança Disputa F7','Validar Cobrança Disputa','Disputa Tem Fatura?'];
  for (let i=0;i<disputeFlow.length-1;i++) link(disputeFlow[i],disputeFlow[i+1],'Respond 500 Falha');
  link('Disputa Tem Fatura?', 'Buscar Fatura Disputa', 'Buscar Invoice Payments Disputa'); delete find('Disputa Tem Fatura?').onError;
  link('Buscar Invoice Payments Disputa','Resolver Fatura Disputa','Respond 500 Falha'); link('Resolver Fatura Disputa','Buscar Fatura Disputa','Respond 500 Falha');
  const rest = ['Buscar Fatura Disputa','Validar Fatura Disputa','Buscar Assinatura Disputa','Validar Assinatura Disputa','Buscar Pedido Disputa','Validar Pedido Disputa','Buscar Clínica Disputa F7','Preparar Destino Disputa','Congelar Clínica Disputa F7','Conferir Clínica Disputa F7','Confirmar Disputa F7','Alertar Disputa F7','Fechar Evento Disputa F7',respond.name];
  for(let i=0;i<rest.length-1;i++) link(rest[i],rest[i+1],'Respond 500 Falha');

  // Independent observer: polls existing instances only, never creates one.
  const recon = find('Schedule Reconciliação Stripe 15min');
  wf.connections[recon.name].main[0].push({node:'Buscar Clínicas Sem Garantia',type:'main',index:0});
  http('Buscar Clínicas Sem Garantia',supabase,'GET', `${JSON.stringify(process.env.SUPABASE_URL || 'https://vfyubktlmqytkcewicse.supabase.co')} + '/rest/v1/clinicas?status=eq.ativo&stripe_customer_id=not.is.null&garantia_inicio=is.null&reembolsado_em=is.null&disputa_em=is.null&select=id,status,stripe_customer_id,uazapi_token,uazapi_server,garantia_inicio,reembolsado_em,disputa_em&limit=100'`);
  js('Preparar Observação Garantia',read('billing-garantia-preparar.js'));
  add('Consultar Instância Garantia','n8n-nodes-base.httpRequest',{method:'GET',url:expr("$json.uazapi_server + '/instance/status'"),sendHeaders:true,headerParameters:{parameters:[{name:'token',value:'={{ $json.uazapi_token }}'}]},options:{timeout:15000,response:{response:{neverError:true}}}},{typeVersion:4.2});
  js('Avaliar Observação Garantia',read('billing-garantia-observar.js'),'runOnceForEachItem');
  add('Instância Garantia Conectada?','n8n-nodes-base.if',{conditions:{options:{typeValidation:'strict',version:2},conditions:[{id:'connected',leftValue:expr('$json.connected'),operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}},{typeVersion:2});
  const observer = "$('Avaliar Observação Garantia').item.json";
  const clinic = `${JSON.stringify(process.env.SUPABASE_URL || 'https://vfyubktlmqytkcewicse.supabase.co')} + '/rest/v1/clinicas?id=eq.' + encodeURIComponent(${observer}.clinica_id)`;
  http('Materializar Garantia Observada',supabase,'PATCH',clinic + ` + '&status=eq.ativo&garantia_inicio=is.null&reembolsado_em=is.null&disputa_em=is.null&stripe_customer_id=eq.' + encodeURIComponent(${observer}.customer_id)`, `{garantia_inicio:${observer}.garantia_inicio,garantia_fim:${observer}.garantia_fim}`);
  http('Conferir Garantia Observada',supabase,'GET',clinic + " + '&select=id,garantia_inicio,garantia_fim'");
  js('Confirmar Garantia Observada',read('billing-garantia-confirmar.js'),'runOnceForEachItem');
  for(const [a,b] of [['Buscar Clínicas Sem Garantia','Preparar Observação Garantia'],['Preparar Observação Garantia','Consultar Instância Garantia'],['Consultar Instância Garantia','Avaliar Observação Garantia'],['Avaliar Observação Garantia','Instância Garantia Conectada?'],['Instância Garantia Conectada?','Materializar Garantia Observada'],['Materializar Garantia Observada','Conferir Garantia Observada'],['Conferir Garantia Observada','Confirmar Garantia Observada']])link(a,b);

  // Reconciliation adds reads and uses the existing operator alert destination.
  const reconDB = JSON.stringify(process.env.SUPABASE_URL || 'https://vfyubktlmqytkcewicse.supabase.co');
  http('Buscar Pedidos Pagos Travados',supabase,'GET',`${reconDB} + '/rest/v1/pedidos?status=eq.pago&pago_em=lt.' + encodeURIComponent(new Date(Date.now()-2*3600000).toISOString()) + '&select=id,pago_em&limit=100'`);
  http('Buscar Pedidos Provisionando Travados',supabase,'GET',`${reconDB} + '/rest/v1/pedidos?status=eq.provisionando&provisionando_em=lt.' + encodeURIComponent(new Date(Date.now()-30*60000).toISOString()) + '&select=id,provisionando_em&limit=100'`);
  http('Buscar Garantias Ativadas Vencendo',supabase,'GET',`${reconDB} + '/rest/v1/clinicas?status=eq.ativo&garantia_inicio=not.is.null&garantia_fim=gte.' + encodeURIComponent(new Date().toISOString()) + '&garantia_fim=lte.' + encodeURIComponent(new Date(Date.now()+48*3600000).toISOString()) + '&select=id,garantia_fim&limit=100'`);
  http('Buscar Garantias Não Ativadas Vencendo',supabase,'GET',`${reconDB} + '/rest/v1/clinicas?status=eq.ativo&garantia_inicio=is.null&garantia_teto=gte.' + encodeURIComponent(new Date().toISOString()) + '&garantia_teto=lte.' + encodeURIComponent(new Date(Date.now()+48*3600000).toISOString()) + '&select=id,garantia_teto&limit=100'`);
  const reconFlow=['Buscar Eventos Stripe Órfãos','Buscar Pedidos Pagos Travados','Buscar Pedidos Provisionando Travados','Buscar Garantias Ativadas Vencendo','Buscar Garantias Não Ativadas Vencendo','Consolidar Eventos Stripe Órfãos'];
  for(let i=0;i<reconFlow.length-1;i++)link(reconFlow[i],reconFlow[i+1]);
  find('Consolidar Eventos Stripe Órfãos').parameters.jsCode=read('billing-f7-reconciliar.js');
  find('Alertar Eventos Stripe Órfãos').parameters.jsonBody=expr(`JSON.stringify({number:'${number}',text:$json.alerta})`);
  wf.settings={executionOrder:source.settings?.executionOrder||'v1',...(source.settings?.errorWorkflow?{errorWorkflow:source.settings.errorWorkflow}:{})};
  return wf;
}
