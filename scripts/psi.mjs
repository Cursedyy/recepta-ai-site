/* Roda PageSpeed Insights (mobile) nas páginas-chave e anexa o resultado
   ao relatório da auditoria SEO. Uso:
     node scripts/psi.mjs            # 4 páginas padrão
     node scripts/psi.mjs /foo/      # página específica
   Requer quota da API PSI (reseta à meia-noite PT). Sem API key o limite
   diário é baixo — se der HTTP 429, rode mais tarde.
   Fonte: docs/seo/auditoria-tecnica-2026-09-19.md (seção Core Web Vitals). */

import https from 'node:https';
import fs from 'node:fs';

const BASE = 'https://www.receptaai.com.br';
const REPORT = 'docs/seo/auditoria-tecnica-2026-09-19.md';
const DEFAULT_PATHS = ['/', '/quanto-custa-secretaria-virtual-clinica/', '/cardiologia/', '/blog/reduzir-no-show-consultas/'];

const paths = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_PATHS;

const getJson = (url) =>
  new Promise((res, rej) => {
    https
      .get(url, (r) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => {
          if (r.statusCode !== 200) {
            let msg = 'HTTP ' + r.statusCode;
            try { msg += ' — ' + JSON.parse(d).error.message; } catch (_) {}
            return rej(new Error(msg));
          }
          try { res(JSON.parse(d)); } catch (e) { rej(e); }
        });
      })
      .on('error', rej);
  });

const L = ['', '## Core Web Vitals — PageSpeed Insights (rodada de ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC, mobile)', ''];
let ok = 0;
for (const p of paths) {
  const url =
    'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=' +
    encodeURIComponent(BASE + p) +
    '&strategy=mobile&category=performance&category=seo';
  try {
    const data = await getJson(url);
    const a = data.lighthouseResult.audits;
    const c = data.lighthouseResult.categories;
    ok++;
    L.push('- `' + p + '`');
    L.push('  - Performance: **' + Math.round(c.performance.score * 100) + '/100** · SEO: ' + Math.round(c.seo.score * 100) + '/100');
    L.push('  - FCP ' + a['first-contentful-paint'].displayValue + ' · LCP **' + a['largest-contentful-paint'].displayValue + '** · TBT ' + a['total-blocking-time'].displayValue + ' · CLS **' + a['cumulative-layout-shift'].displayValue + '** · Speed Index ' + a['speed-index'].displayValue);
    const rb = a['render-blocking-resources'];
    const items = rb?.details?.items ?? [];
    if (items.length) L.push('  - Render-blocking: ' + items.map((i) => i.url.split('/').pop()).join(', '));
    else L.push('  - Render-blocking: nenhum');
  } catch (e) {
    L.push('- `' + p + '` → PSI indisponível: ' + e.message);
  }
}
L.push('');

if (ok) {
  fs.appendFileSync(REPORT, L.join('\n'), 'utf8');
  console.log('Resultado anexado em ' + REPORT);
} else {
  console.log('Nenhuma página medida (provável 429 — quota diária). Nada anexado. Tente novamente após a meia-noite PT.');
}
console.log(L.join('\n'));
