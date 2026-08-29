/**
 * Valida que os links do menu levam cada secao para logo abaixo do header.
 *
 * Cobre os tres caminhos de scroll, porque eles ja divergiram entre si:
 *   1. Lenis carregado (padrao)
 *   2. prefers-reduced-motion (Lenis desligado de proposito)
 *   3. CDN do Lenis fora do ar (fallback em window.scrollTo)
 *
 * Sobe um servidor estatico efemero: em file:// o script do Lenis nao carrega,
 * entao um teste local sem servidor testa silenciosamente o caminho errado.
 *
 * Uso: node check-ancoras.mjs                       # arquivos locais
 *      node check-ancoras.mjs --base-url https://…  # producao
 */
import { chromium } from "playwright";
import { createServer } from "http";
import { readFile } from "fs/promises";
import { extname, join, normalize } from "path";

const argv = process.argv.slice(2);
const baseUrlArg = argv.includes("--base-url")
  ? argv[argv.indexOf("--base-url") + 1]
  : null;

const SECOES = ["#como-funciona", "#recursos", "#painel", "#clinica", "#custo"];
const VIEWPORTS = [1440, 1024, 768, 390];
const FOLGA_MIN = 0; // a secao nunca pode ficar escondida sob o header
const FOLGA_MAX = 28; // nem deixar um buraco visivel abaixo dele
const VARIACAO_MAX = 2; // todas as secoes tem que parar no MESMO lugar

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

async function servidorLocal() {
  const raiz = process.cwd();
  const srv = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      const arq = join(raiz, normalize(p).replace(/^([/\\])+/, ""));
      if (!arq.startsWith(raiz)) {
        res.writeHead(403).end();
        return;
      }
      const corpo = await readFile(arq);
      res.writeHead(200, {
        "content-type": TIPOS[extname(arq)] || "application/octet-stream",
      });
      res.end(corpo);
    } catch {
      res.writeHead(404).end("nao encontrado");
    }
  });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  return { srv, url: `http://127.0.0.1:${srv.address().port}/index.html` };
}

/** Bloqueia ate o scroll ficar parado por ~5 frames, com teto de seguranca. */
async function esperarScrollParar(p, limiteMs = 8000) {
  await p.evaluate(
    (limite) =>
      new Promise((ok) => {
        var ultimo = -1;
        var parados = 0;
        var t0 = performance.now();
        (function tick() {
          var y = Math.round(window.scrollY);
          parados = y === ultimo ? parados + 1 : 0;
          ultimo = y;
          if (parados >= 5 || performance.now() - t0 > limite) return ok();
          requestAnimationFrame(tick);
        })();
      }),
    limiteMs,
  );
  /* margem pra transicao do .reveal (0.5s) terminar de mexer o alvo */
  await p.waitForTimeout(600);
}

const posicao = (sel) => {
  const el = document.querySelector(sel);
  const h = document.querySelector("header.top");
  return {
    topo: el.getBoundingClientRect().top,
    header: h ? h.getBoundingClientRect().height : 0,
  };
};

async function rodar(browser, url, cenario) {
  const ctx = await browser.newContext(
    cenario.reduzido ? { reducedMotion: "reduce" } : {},
  );
  const p = await ctx.newPage();
  if (cenario.semCdn) {
    await p.route(/lenis/i, (r) => r.abort());
  }

  const falhas = [];
  console.log(`\n${cenario.nome}:`);

  for (const w of VIEWPORTS) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.goto(url, { waitUntil: "load" });
    await p.waitForTimeout(900);

    const temLenis = await p.evaluate(() => !!window.__lenis);
    const folgas = [];

    for (const sel of SECOES) {
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.waitForTimeout(400);
      await p
        .locator(`a[href="${sel}"]`)
        .first()
        .evaluate((el) => el.click());
      /* Espera o scroll parar em vez de cronometrar: o Lenis tem lerp proprio
         e o scrollTo nativo com behavior:smooth demora conforme a distancia
         (#custo fica a ~8800px). Tempo fixo dava falso negativo. */
      await esperarScrollParar(p);

      const r = await p.evaluate(posicao, sel);
      const folga = Math.round(r.topo - r.header);
      folgas.push(folga);
      if (folga < FOLGA_MIN || folga > FOLGA_MAX) {
        falhas.push(`${cenario.nome} ${w}px ${sel}: folga de ${folga}px`);
      }
    }

    const variacao = Math.max(...folgas) - Math.min(...folgas);
    if (variacao > VARIACAO_MAX) {
      falhas.push(
        `${cenario.nome} ${w}px: secoes param em pontos diferentes (${variacao}px de variacao)`,
      );
    }
    console.log(
      `  ${String(w).padStart(5)}px  lenis=${temLenis ? "sim" : "nao"}  folgas=[${folgas.join(", ")}]  variacao=${variacao}px`,
    );
  }

  await ctx.close();
  return falhas;
}

let servidor = null;
let url = baseUrlArg;
if (!url) {
  servidor = await servidorLocal();
  url = servidor.url;
}
console.log(`alvo: ${url}`);

const browser = await chromium.launch();
let falhas = [];
for (const cenario of [
  { nome: "Lenis (padrao)" },
  { nome: "prefers-reduced-motion", reduzido: true },
  { nome: "CDN do Lenis fora do ar", semCdn: true },
]) {
  falhas = falhas.concat(await rodar(browser, url, cenario));
}
await browser.close();
if (servidor) servidor.srv.close();

console.log("\n" + "=".repeat(64));
if (falhas.length) {
  falhas.forEach((f) => console.log("FAIL " + f));
  console.log(`\nFALHOU: ${falhas.length}`);
  process.exit(1);
}
console.log("Todas as ancoras assentam logo abaixo do header, nos 3 caminhos");
