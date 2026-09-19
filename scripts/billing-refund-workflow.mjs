import fs from "node:fs";

export function buildRefundWorkflow(source) {
  const wf = structuredClone(source);
  if (wf.nodes.some(n => n.name === "Extrair Reembolso")) throw new Error("Ramo de reembolso já existe: revisar antes de substituir");
  const find = name => { const node = wf.nodes.find(n => n.name === name); if (!node) throw new Error(`Node ausente: ${name}`); return node; };
  const code = file => { const text = fs.readFileSync(new URL(`../src/n8n-patches/${file}`, import.meta.url), "utf8"); new Function(text); return text; };
  const original = find("Classificar Evento").parameters.jsCode;
  const anchor = "if (event.type === 'checkout.session.completed')";
  if (!original.includes(anchor)) throw new Error("Classificador mudou: não aplicar substituição presumida");
  find("Classificar Evento").parameters.jsCode = original.replace(anchor, "if (event.type === 'charge.refunded') return [{ json: { event, rota: 'reembolso' } }];\n\n" + anchor);
  const router = find("Rotear Evento");
  const rules = router.parameters.rules.values;
  const output = rules.length;
  const rule = structuredClone(rules[0]);
  rule.conditions.conditions[0].id = "refund-route";
  rule.conditions.conditions[0].rightValue = "reembolso";
  rule.outputKey = "reembolso";
  rules.push(rule);
  const routes = wf.connections[router.name].main;
  const fallback = routes[output] || [];
  routes[output] = [{ node: "Extrair Reembolso", type: "main", index: 0 }];
  routes[output + 1] = fallback;

  const stripe = find("Buscar Line Items Checkout Session");
  const supabase = find("Consultar Registro");
  const retry = { retryOnFail: true, maxTries: 3, waitBetweenTries: 1000 };
  let index = 0;
  const append = (name, type, parameters, template = {}) => {
    const node = { ...structuredClone(template), id: `refund-${++index}`, name, type,
      typeVersion: type === "n8n-nodes-base.code" ? 2 : template.typeVersion || 4,
      position: [1800 + index * 100, 1200], parameters, onError: "continueErrorOutput" };
    delete node.webhookId;
    wf.nodes.push(node); return node;
  };
  const js = (name, file) => append(name, "n8n-nodes-base.code", { jsCode: code(file) });
  const expression = body => "={{ " + body + " }}";
  const target = "$('Preparar Destino Reembolso').first().json";
  const dbbase = "$('Config Stripe Webhook').first().json.supabase_url";
  const http = (name, template, method, url, body, options = {}) => {
    const parameters = { method, url: expression(url), authentication: "predefinedCredentialType",
      nodeCredentialType: template.parameters.nodeCredentialType, options: { timeout: 15000, ...options } };
    if (body) Object.assign(parameters, { sendBody: true, specifyBody: "json", jsonBody: expression(`JSON.stringify(${body})`) });
    if (template === supabase) Object.assign(parameters, { sendHeaders: true, headerParameters: { parameters: [{ name: "Prefer", value: "return=representation" }] } });
    return append(name, template.type, parameters, { ...template, ...retry, alwaysOutputData: true });
  };
  const check = (name, value) => append(name, "n8n-nodes-base.if", {
    conditions: { options: { caseSensitive: true, typeValidation: "strict", version: 2 },
      conditions: [{ id: name, leftValue: expression(value), operator: { type: "boolean", operation: "true", singleValue: true } }], combinator: "and" }, options: {},
  }, { typeVersion: 2 });
  const link = (from, success, failure = "Respond 500 Falha") => { wf.connections[from] = { main: [[{ node: success, type: "main", index: 0 }], failure ? [{ node: failure, type: "main", index: 0 }] : []] }; };
  const choice = (from, yes, no) => link(from, yes, no);
  js("Extrair Reembolso", "billing-refund-evento.js");
  http("Buscar Cobrança Reembolso", stripe, "GET", "'https://api.stripe.com/v1/charges/' + encodeURIComponent($json.charge_id)");
  js("Validar Cobrança Reembolso", "billing-refund-cobranca.js");
  check("Cobrança Tem Fatura?", "Boolean($json.invoice_id)");
  http("Buscar Invoice Payments Reembolso", stripe, "GET", "'https://api.stripe.com/v1/invoice_payments?payment[type]=payment_intent&payment[payment_intent]=' + encodeURIComponent($json.payment_intent_id) + '&status=paid&limit=2'");
  js("Resolver Fatura Reembolso", "billing-refund-invoice-payment.js");
  http("Buscar Fatura Reembolso", stripe, "GET", "'https://api.stripe.com/v1/invoices/' + encodeURIComponent($json.invoice_id)");
  js("Validar Fatura Reembolso", "billing-refund-fatura.js");
  http("Buscar Assinatura Reembolso", stripe, "GET", "'https://api.stripe.com/v1/subscriptions/' + encodeURIComponent($json.subscription_id)");
  js("Validar Assinatura Reembolso", "billing-refund-assinatura.js");
  http("Buscar Pedido Reembolso", supabase, "GET", `${dbbase} + '/rest/v1/pedidos?stripe_subscription_id=eq.' + encodeURIComponent($json.subscription_id) + '&select=id,clinica_id,status,stripe_customer_id,stripe_subscription_id,encerrado_em,motivo_encerramento&limit=2'`);
  js("Validar Pedido Reembolso", "billing-refund-pedido.js");
  http("Buscar Clínica Reembolso", supabase, "GET", `${dbbase} + '/rest/v1/clinicas?id=eq.' + encodeURIComponent($json.clinica_id || '00000000-0000-0000-0000-000000000000') + '&stripe_subscription_id=eq.' + encodeURIComponent($json.subscription_id) + '&stripe_customer_id=eq.' + encodeURIComponent($json.customer_id) + '&select=id,status,pedido_id,stripe_subscription_id,stripe_customer_id,reembolsado_em,reembolso_motivo,reembolso_valor&limit=2'`);
  js("Preparar Destino Reembolso", "billing-refund-clinica.js");
  check("Reembolso Integral?", "$json.integral");
  check("Assinatura Já Cancelada?", "$json.subscription_status === 'canceled'");
  // Cancellation is a separate operation; do not create a final invoice or
  // proration credit. A canonical GET confirms the result even after a 404 or
  // uncertain DELETE response. No refund creation endpoint exists here.
  const cancel = http("Cancelar Assinatura Reembolso", stripe, "DELETE", `'https://api.stripe.com/v1/subscriptions/' + encodeURIComponent(${target}.subscription_id) + '?invoice_now=false&prorate=false'`, null,
    { response: { response: { neverError: true, fullResponse: true } } });
  cancel.retryOnFail = false;
  http("Confirmar Assinatura Cancelada", stripe, "GET", `'https://api.stripe.com/v1/subscriptions/' + encodeURIComponent(${target}.subscription_id)`);
  js("Validar Cancelamento Reembolso", "billing-refund-confirmar-cancelamento.js");
  check("Reembolso Tem Clínica?", `Boolean(${target}.clinica_alvo)`);
  const clinicPath = `${dbbase} + '/rest/v1/clinicas?id=eq.' + encodeURIComponent(${target}.clinica_alvo) + '&pedido_id=eq.' + encodeURIComponent(${target}.pedido_id) + '&stripe_subscription_id=eq.' + encodeURIComponent(${target}.subscription_id) + '&stripe_customer_id=eq.' + encodeURIComponent(${target}.customer_id)`;
  http("Registrar Reembolso Clínica", supabase, "PATCH", clinicPath + ` + '&reembolsado_em=is.null' + (${target}.integral ? '' : '&or=(reembolso_valor.is.null,reembolso_valor.lt.' + encodeURIComponent(${target}.valor) + ')')`,
    `${target}.integral ? {status:'expirado',reembolsado_em:${target}.data,reembolso_valor:${target}.valor,reembolso_motivo:${target}.motivo} : {reembolso_valor:${target}.valor,reembolso_motivo:${target}.motivo}`);
  http("Conferir Reembolso Clínica", supabase, "GET", clinicPath + " + '&select=id,status,pedido_id,stripe_customer_id,stripe_subscription_id,reembolsado_em,reembolso_valor' ");
  js("Validar Gravação Reembolso Clínica", "billing-refund-confirmar-clinica.js");
  check("Reembolso Integral Após Clínica?", `${target}.integral`);
  const pedidoPath = `${dbbase} + '/rest/v1/pedidos?id=eq.' + encodeURIComponent(${target}.pedido_id) + '&stripe_subscription_id=eq.' + encodeURIComponent(${target}.subscription_id) + '&stripe_customer_id=eq.' + encodeURIComponent(${target}.customer_id)`;
  http("Registrar Pedido Reembolsado", supabase, "PATCH", pedidoPath + " + '&status=in.(pago,provisionando,provisionado)'", `{status:'reembolsado',encerrado_em:${target}.encerrado_em,motivo_encerramento:${target}.motivo_encerramento}`);
  http("Conferir Pedido Reembolsado", supabase, "GET", pedidoPath + " + '&select=id,status,stripe_customer_id,stripe_subscription_id'");
  js("Validar Gravação Pedido Reembolso", "billing-refund-confirmar-pedido.js");
  const close = structuredClone(find("Fechar Evento Ignorado"));
  close.id = "refund-close"; close.name = "Fechar Evento Reembolso";
  close.parameters.jsonBody = expression(`JSON.stringify({processado_em:new Date().toISOString(),resultado:${target}.integral ? 'reembolso_integral' : 'reembolso_parcial'})`);
  wf.nodes.push(close);
  const respond = structuredClone(find("Respond 200 Ignorado"));
  respond.id = "refund-respond"; respond.name = "Respond 200 Reembolso";
  respond.parameters.responseBody = expression(`JSON.stringify({received:true,processed:'reembolso',integral:${target}.integral})`);
  wf.nodes.push(respond);

  link("Extrair Reembolso", "Buscar Cobrança Reembolso");
  link("Buscar Cobrança Reembolso", "Validar Cobrança Reembolso");
  link("Validar Cobrança Reembolso", "Cobrança Tem Fatura?");
  choice("Cobrança Tem Fatura?", "Buscar Fatura Reembolso", "Buscar Invoice Payments Reembolso");
  link("Buscar Invoice Payments Reembolso", "Resolver Fatura Reembolso");
  link("Resolver Fatura Reembolso", "Buscar Fatura Reembolso");
  link("Buscar Fatura Reembolso", "Validar Fatura Reembolso");
  link("Validar Fatura Reembolso", "Buscar Assinatura Reembolso");
  link("Buscar Assinatura Reembolso", "Validar Assinatura Reembolso");
  link("Validar Assinatura Reembolso", "Buscar Pedido Reembolso");
  link("Buscar Pedido Reembolso", "Validar Pedido Reembolso");
  link("Validar Pedido Reembolso", "Buscar Clínica Reembolso");
  link("Buscar Clínica Reembolso", "Preparar Destino Reembolso");
  link("Preparar Destino Reembolso", "Reembolso Integral?");
  choice("Reembolso Integral?", "Assinatura Já Cancelada?", "Reembolso Tem Clínica?");
  choice("Assinatura Já Cancelada?", "Confirmar Assinatura Cancelada", "Cancelar Assinatura Reembolso");
  link("Cancelar Assinatura Reembolso", "Confirmar Assinatura Cancelada");
  link("Confirmar Assinatura Cancelada", "Validar Cancelamento Reembolso");
  link("Validar Cancelamento Reembolso", "Reembolso Tem Clínica?");
  choice("Reembolso Tem Clínica?", "Registrar Reembolso Clínica", "Reembolso Integral Após Clínica?");
  link("Registrar Reembolso Clínica", "Conferir Reembolso Clínica");
  link("Conferir Reembolso Clínica", "Validar Gravação Reembolso Clínica");
  link("Validar Gravação Reembolso Clínica", "Reembolso Integral Após Clínica?");
  choice("Reembolso Integral Após Clínica?", "Registrar Pedido Reembolsado", "Fechar Evento Reembolso");
  link("Registrar Pedido Reembolsado", "Conferir Pedido Reembolsado");
  link("Conferir Pedido Reembolsado", "Validar Gravação Pedido Reembolso");
  link("Validar Gravação Pedido Reembolso", "Fechar Evento Reembolso");
  link("Fechar Evento Reembolso", "Respond 200 Reembolso");
  wf.settings = { executionOrder: source.settings?.executionOrder || "v1", ...(source.settings?.errorWorkflow ? { errorWorkflow: source.settings.errorWorkflow } : {}) };
  return wf;
}
