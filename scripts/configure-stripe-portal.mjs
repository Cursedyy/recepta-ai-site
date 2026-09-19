import fs from 'node:fs';
const key = process.env.STRIPE_SECRET_KEY?.trim();
if (!key) throw new Error('STRIPE_SECRET_KEY ausente');
const headers = { Authorization: 'Bearer ' + key };
async function stripe(path, body) {
  const r = await fetch('https://api.stripe.com/v1/' + path, { headers: { ...headers, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': 'recepta-portal-v1-2026-09-15' } : {}) }, ...(body ? { method: 'POST', body: body.toString() } : {}), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Stripe ${path.split('?')[0]} HTTP ${r.status}`);
  return r.json();
}
fs.mkdirSync('tmp-qa-portal', { recursive: true });
const before = await stripe('billing_portal/configurations?active=true&limit=100');
fs.writeFileSync('tmp-qa-portal/configurations-before.json', JSON.stringify(before));
let config = before.data.find(c => c.metadata?.recepta === 'v1');
if (!config) config = await stripe('billing_portal/configurations', new URLSearchParams({
  'features[invoice_history][enabled]': 'true', 'features[payment_method_update][enabled]': 'true',
  'features[subscription_cancel][enabled]': 'true', 'features[subscription_cancel][mode]': 'at_period_end',
  'features[subscription_cancel][proration_behavior]': 'none', 'features[subscription_update][enabled]': 'false',
  'business_profile[privacy_policy_url]': 'https://www.receptaai.com.br/privacidade',
  'business_profile[terms_of_service_url]': 'https://www.receptaai.com.br/termos',
  default_return_url: 'https://www.receptaai.com.br/clinica/painel', 'metadata[recepta]': 'v1',
}));
const after = await stripe('billing_portal/configurations?active=true&limit=100');
const found = after.data.find(c => c.id === config.id);
if (!found?.active || !found.livemode || found.features.subscription_cancel.mode !== 'at_period_end') throw new Error('Configuração não confirmada');
fs.writeFileSync('tmp-qa-portal/configurations-after.json', JSON.stringify(after));
console.log(JSON.stringify({ http: 200, id: found.id, active: found.active, livemode: found.livemode, features: found.features, moneyMoved: false }));
