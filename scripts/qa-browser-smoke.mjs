// Read-only browser smoke: navega no site REAL, coleta título/meta/texto/console,
// tira screenshot e grava evidência JSON. NÃO clica em CTA, NÃO submete formulário,
// NÃO inicia compra/checkout. Somente navegação GET + leitura de DOM.
// Uso: node scripts/qa-browser-smoke.mjs   (da raiz do repo)
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const require = createRequire(new URL("../src/package.json", import.meta.url));
const { chromium } = require("playwright");

const BASE = "https://www.receptaai.com.br";
const OUT = new URL("../tmp-qa-browser/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const resultados = [];
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (QA smoke read-only; ReceptaAuditoria/1.0)",
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 300)));

  const grab = async (path, checks) => {
    const before = consoleErrors.length;
    const resp = await page.goto(BASE + path, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForTimeout(1500);
    const title = await page.title();
    const metaDesc = await page
      .locator('meta[name="description"]')
      .first()
      .getAttribute("content")
      .catch(() => null);
    const text = await page.evaluate(() => document.body?.innerText || "");
    const found = {};
    for (const [name, re] of Object.entries(checks)) {
      const m = text.match(new RegExp(re, "gi"));
      found[name] = m ? m.length : 0;
    }
    const shotName = (path === "/" ? "home" : path.replace(/[^a-z0-9]+/gi, "-")) + ".png";
    await page.screenshot({ path: new URL(shotName, OUT).pathname.replace(/^\/([A-Za-z]:)/, "$1"), fullPage: false }).catch(() => {});
    const out = {
      path,
      httpStatus: resp?.status() ?? null,
      finalUrl: page.url(),
      title,
      metaDesc,
      checks: found,
      consoleErrors: consoleErrors.slice(before),
    };
    resultados.push(out);
    console.log(JSON.stringify(out, null, 1));
  };

  // 1. Landing: promessas de trial e preços visíveis
  await grab("/", {
    trialPromises: "7 dias|gr[áa]tis|sem cart[ãa]o",
    priceEssencial: "R\\$\\s?497",
    priceCompleto: "R\\$\\s?997",
    anual: "anual",
    checkoutCta: "assinar|contratar|começar agora",
  });

  // 2. Briefing: carrega sem gate de pagamento?
  await grab("/briefing/", {
    trialTitle: "teste gr[áa]tis",
    paymentGate: "pagamento|checkout",
    formFields: "cnpj|cl[íi]nica",
  });

  // 3. Painel: gate de auth (esperado redirect para /clinica/login, sem sessão)
  await grab("/clinica/painel", {});

  // 4. /t/ (página de status de trial): carrega e não tem checkout
  await grab("/t/", {
    checkoutRefs: "checkout|stripe|pagar",
  });

  await writeFileSync(
    new URL("resultados.json", OUT),
    JSON.stringify({ base: BASE, when: new Date().toISOString(), resultados }, null, 2),
  );
  console.log("\nevidência: tmp-qa-browser/resultados.json");
} catch (e) {
  console.error("FALHA DO HARNES (não é falha do site):", e.message);
  process.exitCode = 2;
} finally {
  if (browser) await browser.close();
}
