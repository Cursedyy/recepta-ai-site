/**
 * Valida o hero da landing em producao nos breakpoints principais.
 * Uso: node check-hero-breakpoints.mjs [--base-url https://...]
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const argv = process.argv.slice(2);
const baseUrl = argv.includes("--base-url")
  ? argv[argv.indexOf("--base-url") + 1]
  : "https://www.receptaai.com.br";

const VIEWPORTS = [320, 375, 719, 720, 768, 1024, 1440, 1920];
const OUT = "screenshots/hero";
const TOL = 1.5; // px

mkdirSync(OUT, { recursive: true });

const measure = () => {
  const q = (s) => document.querySelector(s);
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      right: r.right,
      top: r.top,
      width: r.width,
      height: r.height,
    };
  };
  const inner = q(".hero-inner.container");
  const copy = q(".hero-copy");
  const demo = q(".demo-stage");
  const badge = q(".hero-badge");
  const h1 = q(".hero h1");
  const msgs = [...document.querySelectorAll(".hero .msg")].map((el) =>
    el.getBoundingClientRect(),
  );
  const ctas = [
    ...document.querySelectorAll(".hero-copy a.btn, .hero-copy .btn"),
  ].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      text: el.textContent.trim().slice(0, 30),
      w: r.width,
      h: r.height,
    };
  });
  return {
    docW: document.documentElement.clientWidth,
    scrollW: document.documentElement.scrollWidth,
    inner: box(inner),
    innerCS: inner
      ? (({
          marginLeft,
          marginRight,
          paddingLeft,
          paddingRight,
          maxWidth,
          display,
        }) => ({
          marginLeft,
          marginRight,
          paddingLeft,
          paddingRight,
          maxWidth,
          display,
        }))(getComputedStyle(inner))
      : null,
    copy: box(copy),
    demo: box(demo),
    badge: box(badge),
    badgeDisplay: badge ? getComputedStyle(badge).display : null,
    h1: box(h1),
    h1Size: h1 ? getComputedStyle(h1).fontSize : null,
    msgLeft: msgs.length ? Math.min(...msgs.map((m) => m.left)) : null,
    msgRight: msgs.length ? Math.max(...msgs.map((m) => m.right)) : null,
    ctas,
  };
};

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const failures = [];

  for (const width of VIEWPORTS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(600);
    const m = await page.evaluate(measure);

    const problems = [];
    if (!m.inner) problems.push(".hero-inner.container nao encontrado");
    if (m.scrollW > m.docW + TOL)
      problems.push(`overflow horizontal: scrollW ${m.scrollW} > ${m.docW}`);

    if (m.inner) {
      const gutterL = m.inner.left;
      const gutterR = m.docW - m.inner.right;
      if (Math.abs(gutterL - gutterR) > TOL) {
        problems.push(
          `hero nao centralizado: gutter esq ${gutterL.toFixed(1)}px vs dir ${gutterR.toFixed(1)}px`,
        );
      }
      for (const [name, b] of [
        ["hero-copy", m.copy],
        ["demo-stage", m.demo],
      ]) {
        if (
          b &&
          (b.left < m.inner.left - TOL || b.right > m.inner.right + TOL)
        ) {
          problems.push(
            `${name} sai do container (${b.left.toFixed(1)}..${b.right.toFixed(1)} vs ${m.inner.left.toFixed(1)}..${m.inner.right.toFixed(1)})`,
          );
        }
      }
    }

    // O badge e uma pilula: a largura vem do conteudo, nunca da coluna.
    // Regressao classica de por display:flex no .hero-copy — isso blockifica o
    // inline-flex do badge e o align-items:stretch estica ele na coluna inteira.
    // O sinal e o badge casar com a largura da coluna, nao uma proporcao dela:
    // em telas estreitas (320px) o conteudo legitimamente ocupa quase tudo.
    if (m.badge && m.copy) {
      if (m.badge.width >= m.copy.width - TOL) {
        problems.push(
          `hero-badge esticado na coluna inteira: ${m.badge.width.toFixed(0)}px = coluna de ${m.copy.width.toFixed(0)}px (display: ${m.badgeDisplay})`,
        );
      }
      if (m.badgeDisplay !== "inline-flex") {
        problems.push(
          `hero-badge com display "${m.badgeDisplay}", esperado "inline-flex"`,
        );
      }
    }

    const twoCol = m.copy && m.demo && m.demo.left >= m.copy.right - TOL;
    if (width >= 720 && !twoCol)
      problems.push(
        "esperado grid de 2 colunas acima de 720px, veio empilhado",
      );
    if (width < 720 && twoCol)
      problems.push("esperado empilhado abaixo de 720px, veio em 2 colunas");

    for (const c of m.ctas) {
      if (c.h < 44)
        problems.push(
          `CTA "${c.text}" com altura ${c.h.toFixed(0)}px (< 44px)`,
        );
    }

    // A sangria do chat e DESIGN PEDIDO (dono do produto, 2026-08-29; restaurada
    // em 2026-09-18): acima de 1200px os baloes passam ~10px da borda direita
    // do .hero-inner.container. E informativo, nao falha — o assert duro segue
    // sendo o overflow horizontal (scrollW <= docW), la em cima.
    const sangria =
      m.inner && m.msgRight != null
        ? `  sangria do chat: ${(m.msgRight - m.inner.right).toFixed(0)}px (>= 0 acima de 1200px é o design pedido)`
        : "";

    await page
      .locator(".hero")
      .screenshot({ path: `${OUT}/hero-${width}.png` });

    const status = problems.length ? "FAIL" : "PASS";
    if (problems.length) failures.push({ width, problems });
    console.log(
      `\n[${status}] ${width}px  layout=${twoCol ? "2col" : "stack"}  h1=${m.h1Size}` +
        `\n  container: left=${m.inner?.left.toFixed(1)} right=${m.inner?.right.toFixed(1)} width=${m.inner?.width.toFixed(1)} maxW=${m.innerCS?.maxWidth} pad=${m.innerCS?.paddingLeft}/${m.innerCS?.paddingRight} margin=${m.innerCS?.marginLeft}/${m.innerCS?.marginRight}` +
        `\n  copy: ${m.copy ? `${m.copy.left.toFixed(1)}..${m.copy.right.toFixed(1)}` : "n/a"}   demo: ${m.demo ? `${m.demo.left.toFixed(1)}..${m.demo.right.toFixed(1)}` : "n/a"}` +
        `\n  badge: ${m.badge ? `${m.badge.width.toFixed(0)}px (${m.badgeDisplay})` : "n/a"}   CTAs: ${m.ctas.map((c) => `${c.w.toFixed(0)}x${c.h.toFixed(0)}`).join(", ") || "nenhum"}` +
        `\n${sangria}` +
        (problems.length ? `\n  -> ${problems.join("\n  -> ")}` : ""),
    );
  }

  await browser.close();
  console.log(`\n${"=".repeat(60)}`);
  console.log(
    failures.length
      ? `FALHOU em ${failures.length} breakpoint(s)`
      : `Todos os ${VIEWPORTS.length} breakpoints OK`,
  );
  console.log(`Screenshots: src/${OUT}/`);
  process.exit(failures.length ? 1 : 0);
};

run();
