import assert from 'node:assert/strict';
import { chromium } from '../src/node_modules/playwright/index.mjs';

// Defaults to the saved local dev server. Never activate a purchase CTA.
const baseUrl = process.env.QA_BASE_URL || 'http://localhost:3333';
const paths = ['/', '/estetica/', '/ortopedia/', '/psicologia/', '/radiologia/',
  '/blog/', '/blog/erros-clinicas-atendimento/', '/blog/ia-whatsapp-atendimento/',
  '/blog/secretaria-virtual-clinica/', '/termos/', '/privacidade/', '/briefing'];
// Word boundaries avoid matching "trial" inside the legal term "industrial".
const obsoleteCopy = /grátis|gratuit[oa]|sem cartão|sem compromisso|\btrial\b|dias de teste|período de teste|experimente/gi;
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => route.abort());
  for (const pathname of paths) {
    const response = await page.goto(`${baseUrl}${pathname}`, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200, pathname);
    const html = await response.text();
    assert.deepEqual([...html.matchAll(obsoleteCopy)].map(m => m[0]), [], pathname);
    const invalidLinks = await page.locator('a[href]').evaluateAll(links => links
      .map(a => new URL(a.href)).filter(u => /^\/briefing\/?$/.test(u.pathname) && !u.searchParams.get('pedido'))
      .map(u => u.href));
    assert.deepEqual(invalidLinks, [], pathname);
  }
  await page.goto(`${baseUrl}/?c=abandonado#planos`, { waitUntil: 'networkidle' });
  const group = page.getByRole('radiogroup', { name: 'Ciclo de cobrança' });
  const radios = group.getByRole('radio');
  await radios.first().focus();
  for (const [key, cycle] of [['ArrowRight', 'anual'], ['ArrowLeft', 'mensal'],
    ['End', 'anual'], ['Home', 'mensal'], ['ArrowDown', 'anual'], ['ArrowUp', 'mensal']]) {
    await page.keyboard.press(key);
    const state = await radios.evaluateAll(elements => elements.map(e => ({
      cycle: e.dataset.ciclo, checked: e.getAttribute('aria-checked'), tab: e.tabIndex,
      focused: document.activeElement === e, visibleFocus: e.matches(':focus-visible'),
    })));
    assert.equal(state.filter(s => s.checked === 'true').length, 1);
    assert.ok(state.some(s => s.cycle === cycle && s.checked === 'true' && s.tab === 0 && s.focused && s.visibleFocus));
    assert.ok(state.some(s => s.cycle !== cycle && s.checked === 'false' && s.tab === -1));
  }
  const dismiss = page.getByRole('button', { name: 'Dispensar aviso de checkout cancelado' });
  await dismiss.focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.getByRole('alert').count(), 0);
  assert.equal(await page.locator('[role="radio"][aria-checked="true"]').evaluate(e => e === document.activeElement), true);
  const html = await (await page.goto(`${baseUrl}/`)).text();
  assert.doesNotMatch(html, /Sem compartilhar com terceiros|não são compartilhados com terceiros|Nenhum, com ninguém|sem processo de\s+retenção|Se não servir, some tudo/);
  const jsonld = await page.locator('script[type="application/ld+json"]').first().textContent();
  const graph = JSON.parse(jsonld)['@graph'];
  const faq = graph.find(e => e['@type'] === 'FAQPage');
  assert.match(faq.mainEntity.find(e => /LGPD/.test(e.name)).acceptedAnswer.text, /operadores necessários/);
  assert.match(faq.mainEntity.find(e => /cancelar/.test(e.name)).acceptedAnswer.text, /30 dias/);
  const offers = graph.find(e => Array.isArray(e['@type']) && e['@type'].includes('SoftwareApplication')).offers;
  assert.deepEqual(offers.map(o => Number(o.price)).sort((a, b) => a - b), [497, 997, 4164, 8364]);
  assert.ok(offers.every(o => o.priceCurrency === 'BRL' && o.hasMerchantReturnPolicy.merchantReturnDays === 7));
  assert.deepEqual(errors, []);
  console.log('PASS: 12 public pages, obsolete copy and briefing links, six keyboard actions, dismissal focus, JSON-LD prices and policy; no API requests sent.');
} finally {
  await browser.close();
}
