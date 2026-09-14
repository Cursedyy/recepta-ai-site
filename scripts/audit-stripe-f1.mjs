#!/usr/bin/env node

const secret = process.env.STRIPE_SECRET_KEY;
if (!secret) throw new Error("STRIPE_SECRET_KEY ausente");

const priceKeys = [
  "STRIPE_PRICE_ESSENCIAL_MENSAL",
  "STRIPE_PRICE_ESSENCIAL_ANUAL",
  "STRIPE_PRICE_COMPLETO_MENSAL",
  "STRIPE_PRICE_COMPLETO_ANUAL",
];
const linkKeys = [
  "STRIPE_LINK_ESSENCIAL_MENSAL",
  "STRIPE_LINK_ESSENCIAL_ANUAL",
  "STRIPE_LINK_COMPLETO_MENSAL",
  "STRIPE_LINK_COMPLETO_ANUAL",
];

async function stripe(path) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Stripe ${path}: HTTP ${response.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

function paymentLinkId(value) {
  if (!value) return null;
  const match = value.match(/(?:^|\/)(plink_[A-Za-z0-9]+)/);
  return match?.[1] || null;
}

const prices = {};
for (const key of priceKeys) {
  const id = process.env[key];
  if (!id) throw new Error(`${key} ausente`);
  const value = await stripe(`/v1/prices/${encodeURIComponent(id)}?expand[]=product`);
  prices[key] = {
    id: value.id,
    active: value.active,
    livemode: value.livemode,
    currency: value.currency,
    unit_amount: value.unit_amount,
    recurring: value.recurring && {
      interval: value.recurring.interval,
      interval_count: value.recurring.interval_count,
      usage_type: value.recurring.usage_type,
    },
    product: {
      id: value.product?.id,
      name: value.product?.name,
      active: value.product?.active,
      livemode: value.product?.livemode,
    },
  };
}

const paymentLinks = {};
for (const key of linkKeys) {
  const id = paymentLinkId(process.env[key]);
  if (!id) throw new Error(`${key} não contém um plink válido`);
  const link = await stripe(`/v1/payment_links/${encodeURIComponent(id)}`);
  const items = await stripe(`/v1/payment_links/${encodeURIComponent(id)}/line_items?limit=10&expand[]=data.price.product`);
  paymentLinks[key] = {
    id: link.id,
    active: link.active,
    livemode: link.livemode,
    after_completion: link.after_completion?.type,
    price_ids: items.data.map((item) => item.price?.id).filter(Boolean),
    products: items.data.map((item) => item.price?.product?.name).filter(Boolean),
  };
}

const portal = await stripe("/v1/billing_portal/configurations?active=true&limit=100");
const portalConfigurations = portal.data.map((config) => ({
  id: config.id,
  active: config.active,
  livemode: config.livemode,
  is_default: config.is_default,
  features: Object.fromEntries(
    Object.entries(config.features || {}).map(([name, feature]) => [name, Boolean(feature?.enabled)]),
  ),
}));

const modes = new Set([
  ...Object.values(prices).map((price) => price.livemode),
  ...Object.values(paymentLinks).map((link) => link.livemode),
  ...portalConfigurations.map((config) => config.livemode),
]);

console.log(JSON.stringify({
  credential_mode: secret.startsWith("sk_live_") ? "live" : secret.startsWith("sk_test_") ? "test" : "unknown",
  object_modes_consistent: modes.size === 1,
  prices,
  payment_links: paymentLinks,
  portal_configurations: portalConfigurations,
}, null, 2));
