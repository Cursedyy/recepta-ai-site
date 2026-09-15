import fs from 'node:fs';

// Secrets remain in process memory. No credential or Checkout URL is logged.
const project = JSON.parse(fs.readFileSync(new URL('../.vercel/project.json', import.meta.url), 'utf8'));
const vercelHeaders = { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` };
async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
  const body = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return body;
}
const envs = await jsonRequest(`https://api.vercel.com/v9/projects/${project.projectId}/env?teamId=${project.orgId}`, { headers: vercelHeaders });
const env = envs.envs.find(e => e.key === 'STRIPE_SECRET_KEY' && e.target.includes('production'));
if (!env) throw new Error('STRIPE_SECRET_KEY Production ausente');
const detail = await jsonRequest(`https://api.vercel.com/v1/projects/${project.projectId}/env/${env.id}?teamId=${project.orgId}`, { headers: vercelHeaders });
const key = detail.decrypted && /^(sk|rk)_live_/.test(detail.value || '') ? detail.value : process.env.STRIPE_SECRET_KEY;
if (!key || !/^(sk|rk)_live_/.test(key)) throw new Error('Chave live indisponível para teardown; nenhum pedido criado');
const stripeHeaders = { Authorization: `Bearer ${key}` };
console.log(JSON.stringify({ verificacao: 'chave', modo: 'live', tipo: key.startsWith('rk_') ? 'restrita' : 'secreta' }));
if (!process.argv.includes('--run')) process.exit(0);
const supabase = process.env.SUPABASE_URL.replace(/\/$/, '');
const dbHeaders = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
const results = [];
for (const tier of ['essencial', 'completo']) {
  for (const ciclo of ['mensal', 'anual']) {
    let pedidoId;
    let sessionId;
    let error;
    const result = { tier, ciclo };
    try {
      const response = await fetch('https://www.receptaai.com.br/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Recepta-QA-Go-Live' }, body: JSON.stringify({ tier, ciclo }), signal: AbortSignal.timeout(40000) });
      const checkout = await response.json();
      result.checkout_http = response.status;
      pedidoId = checkout.pedido_id;
      result.pedido_id = pedidoId;
      if (response.status !== 200 || !pedidoId || !checkout.url?.startsWith('https://checkout.stripe.com/')) throw new Error(`Checkout recusado: ${checkout.erro || response.status}`);
      const rows = await jsonRequest(`${supabase}/rest/v1/pedidos?id=eq.${pedidoId}&select=id,status,stripe_session_id,price_id`, { headers: dbHeaders });
      if (rows.length !== 1 || rows[0].status !== 'aberto' || !rows[0].stripe_session_id) throw new Error('Pedido/Session sem persistência válida');
      sessionId = rows[0].stripe_session_id;
      const session = await jsonRequest(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, { headers: stripeHeaders });
      const price = await jsonRequest(`https://api.stripe.com/v1/prices/${rows[0].price_id}`, { headers: stripeHeaders });
      const amounts = { essencial: { mensal: 49700, anual: 416400 }, completo: { mensal: 99700, anual: 836400 } };
      if (!session.livemode || session.status !== 'open' || session.client_reference_id !== pedidoId || !price.livemode || price.currency !== 'brl' || price.unit_amount !== amounts[tier][ciclo] || price.recurring?.interval !== (ciclo === 'mensal' ? 'month' : 'year')) throw new Error('Pin/Session divergente');
      Object.assign(result, { session_id: sessionId, livemode: true, moeda: price.currency, centavos: price.unit_amount, intervalo: price.recurring.interval });
    } catch (e) { error = e; result.erro = e.message; }
    finally {
      if (pedidoId) {
        if (!sessionId) {
          const rows = await jsonRequest(`${supabase}/rest/v1/pedidos?id=eq.${pedidoId}&select=stripe_session_id`, { headers: dbHeaders });
          sessionId = rows[0]?.stripe_session_id;
        }
        if (!sessionId) throw new Error(`Teardown sem Session: pedido ${pedidoId}`);
        const expired = await jsonRequest(`https://api.stripe.com/v1/checkout/sessions/${sessionId}/expire`, { method: 'POST', headers: stripeHeaders });
        if (expired.status !== 'expired') throw new Error(`Session não expirou: ${sessionId}`);
        const ended = await jsonRequest(`${supabase}/rest/v1/pedidos?id=eq.${pedidoId}&status=eq.aberto&select=id,status,encerrado_em,motivo_encerramento`, { method: 'PATCH', headers: { ...dbHeaders, Prefer: 'return=representation' }, body: JSON.stringify({ status: 'cancelado', encerrado_em: new Date().toISOString(), motivo_encerramento: 'qa_go_live' }) });
        if (ended.length !== 1 || ended[0].status !== 'cancelado' || !ended[0].encerrado_em || ended[0].motivo_encerramento !== 'qa_go_live') throw new Error(`Pedido não encerrado: ${pedidoId}`);
        const verifiedSession = await jsonRequest(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, { headers: stripeHeaders });
        const verifiedOrder = await jsonRequest(`${supabase}/rest/v1/pedidos?id=eq.${pedidoId}&select=status,encerrado_em,motivo_encerramento`, { headers: dbHeaders });
        if (verifiedSession.status !== 'expired' || verifiedOrder[0]?.status !== 'cancelado' || verifiedOrder[0]?.motivo_encerramento !== 'qa_go_live' || !verifiedOrder[0]?.encerrado_em) throw new Error('Teardown não confirmado por releitura');
        result.teardown = 'session_expired_pedido_cancelado_qa_go_live';
      }
    }
    results.push(result);
    console.log(JSON.stringify(result));
    if (error) { process.exitCode = 1; break; }
  }
  if (process.exitCode) break;
}
console.log(JSON.stringify({ resumo: { checkouts: results.length, aprovados: results.filter(r => r.checkout_http === 200 && !r.erro).length, teardowns: results.filter(r => r.teardown).length } }));
