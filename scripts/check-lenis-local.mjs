/**
 * Lenis auto-hospedado: o arquivo existe, todas as paginas apontam pra ele, e
 * o smooth-scroll.js continua funcionando quando o Lenis NAO carrega.
 *
 * Existe porque o Lenis vinha de https://unpkg.com em 8 paginas, 7 delas em
 * `lenis@latest` — inclusive /clinica/login e /clinica/definir-senha. Depois de
 * trazer pra /vendor, o risco vira outro: referencia quebrada (404 silencioso)
 * ou alguem reintroduzindo o CDN.
 *
 * Uso: node scripts/check-lenis-local.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(RAIZ, "src");
let falhas = 0;

function ok(cond, msg) {
  console.log((cond ? "✓ " : "✗ ") + msg);
  if (!cond) falhas++;
}

/** Varre src/ ignorando node_modules e afins. */
function varrer(dir, saida = []) {
  for (const nome of readdirSync(dir)) {
    if (["node_modules", "screenshots", ".vercel", "vendor"].includes(nome)) continue;
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) varrer(p, saida);
    else if (/\.(html|js|json|mjs)$/.test(nome)) saida.push(p);
  }
  return saida;
}

const arquivos = varrer(SRC);

// 1. nenhum CDN de lenis sobrou
const comCdn = arquivos.filter((f) => /unpkg\.com\/lenis|jsdelivr\.net\/npm\/lenis/.test(readFileSync(f, "utf8")));
ok(comCdn.length === 0, `nenhuma pagina carrega Lenis de CDN${comCdn.length ? " — " + comCdn.join(", ") : ""}`);

// 2. toda referencia /vendor/ existe em disco
const refs = new Set();
for (const f of arquivos) {
  for (const m of readFileSync(f, "utf8").matchAll(/["'](\/vendor\/[\w.@-]+)["']/g)) refs.add(m[1]);
}
ok(refs.size > 0, `${refs.size} referencia(s) distinta(s) a /vendor/`);
for (const r of refs) ok(existsSync(join(SRC, r)), `existe em disco: ${r}`);

// 3. o bundle define o global que o smooth-scroll.js procura
const bundle = readFileSync(join(SRC, "vendor/lenis-1.3.26.min.js"), "utf8");
const escopo = {};
new Function("globalThis", "window", "document", "self", bundle)(escopo, {}, { documentElement: { classList: {} } }, {});
ok(typeof escopo.Lenis === "function", "o bundle define o global Lenis");

// 4. CSP nao libera mais unpkg
const csp = JSON.parse(readFileSync(join(SRC, "vercel.json"), "utf8"))
  .headers[0].headers.find((x) => x.key === "Content-Security-Policy").value;
ok(!csp.includes("unpkg.com"), "CSP nao lista mais unpkg.com em script-src");

// 5. as ancoras rolam mesmo sem Lenis (o caminho de degradacao)
const ss = readFileSync(join(SRC, "smooth-scroll.js"), "utf8");
let rolouPara = null;
const alvo = { classList: { add() {} }, offsetTop: 900, offsetParent: null };
const header = { getBoundingClientRect: () => ({ height: 71 }) };
let onClick = null;
const win = {
  matchMedia: () => ({ matches: false }),
  scrollTo: (o) => { rolouPara = o.top; },
  // window.__lenis fica indefinido de proposito: e o cenario "CDN/arquivo fora"
};
const doc = {
  addEventListener: (ev, fn) => { if (ev === "click") onClick = fn; },
  querySelector: (s) => (s === "header.top" ? header : s === "#painel" ? alvo : null),
  readyState: "complete",
};
new Function("window", "document", "history", "setTimeout", "requestAnimationFrame", "Lenis", ss)(
  win, doc, { pushState() {} }, () => {}, () => {}, undefined,
);
ok(typeof onClick === "function", "smooth-scroll registra o handler de clique");
onClick({
  target: { closest: (sel) => (sel === 'a[href^="#"]' ? { getAttribute: () => "#painel" } : null) },
  preventDefault() {},
});
// 900 (offsetTop) - 71 (header) - 12 (folga) = 817
ok(rolouPara === 817, `sem Lenis, a ancora cai em window.scrollTo no offset certo (esperado 817, veio ${rolouPara})`);

console.log(falhas === 0 ? "\n✓ Lenis local: tudo certo" : `\n✗ ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
