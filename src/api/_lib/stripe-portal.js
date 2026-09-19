const RETURN_URL = 'https://www.receptaai.com.br/clinica/painel';
const unavailable = () => ({ status: 503, corpo: { erro: 'portal_nao_configurado', detalhe: 'O gerenciamento da assinatura está indisponível. Entre em contato com o suporte.' } });

export async function criarSessaoPortal(customer, stripeKey, stripeFetch = fetch) {
  const headers = { Authorization: 'Bearer ' + stripeKey.trim() };
  const response = await stripeFetch('https://api.stripe.com/v1/billing_portal/configurations?active=true&limit=100', { headers, signal: AbortSignal.timeout(15000) });
  if (response.status === 401 || response.status === 403) return unavailable();
  if (!response.ok) return { status: 502, corpo: { erro: 'falha_stripe', detalhe: 'Erro ao comunicar com o Stripe. Tente novamente.' } };
  const configurations = (await response.json()).data?.filter(c => c.active && c.livemode) || [];
  const configuration = configurations.find(c => c.metadata?.recepta === 'v1') || configurations.find(c => c.is_default);
  if (!configuration) return unavailable();
  const params = new URLSearchParams({ customer, configuration: configuration.id, return_url: RETURN_URL });
  const session = await stripeFetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(), signal: AbortSignal.timeout(15000),
  });
  const body = await session.json();
  if (!session.ok) {
    console.error('stripe_portal_erro', session.status, body.error?.type, body.error?.code);
    if (session.status >= 400 && session.status < 500 && session.status !== 429) return unavailable();
    return { status: 502, corpo: { erro: 'falha_stripe', detalhe: 'Erro ao comunicar com o Stripe. Tente novamente.' } };
  }
  if (typeof body.url !== 'string' || !body.url.startsWith('https://billing.stripe.com/')) return unavailable();
  return { status: 200, corpo: { ok: true, url: body.url } };
}
