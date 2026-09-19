/**
 * Contraste dos pares que ja reprovaram no tema escuro do painel da clinica.
 *
 * Existe porque .conv-pausada e .gate-btn-anual nasceram com cor fixa no
 * <style> inline de painel-view.js: no escuro o texto do card pausado ficava
 * em 1.10:1 e o hover do botao de renovar assinatura em 1.69:1.
 *
 * Le os tokens direto de painel.css (:root e html[data-theme="dark"]), entao
 * mexer num token errado quebra este check em vez de quebrar a tela.
 *
 * Uso: node scripts/check-contraste-painel.mjs
 */
import { readFileSync } from "node:fs";

const CSS = readFileSync(new URL("../src/clinica/painel.css", import.meta.url), "utf8");
const AA_TEXTO = 4.5;

/** Le os tokens de um bloco delimitado por `seletor {` ... `}`. */
function tokensDe(seletor) {
  const i = CSS.indexOf(seletor + " {");
  if (i === -1) throw new Error("bloco nao encontrado em painel.css: " + seletor);
  const corpo = CSS.slice(i, CSS.indexOf("\n}", i));
  const mapa = {};
  for (const m of corpo.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    mapa[m[1]] = m[2];
  }
  return mapa;
}

const claro = tokensDe(":root");
const escuro = { ...claro, ...tokensDe('html[data-theme="dark"]') };

function canal(v) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminancia(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function razao(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** [descricao, token do texto, token do fundo] */
const PARES = [
  ["card pausado: telefone", "--ink", "--warn-bg"],
  ["card pausado: previa da mensagem", "--muted", "--warn-bg"],
  ["card pausado: badge Pausada", "--warn-bg", "--warn-ink"],
  ["banner WhatsApp: texto", "--warn-ink", "--warn-bg"],
  ["gate anual: repouso", "--primary", "--primary-soft"],
  ["gate anual: hover", "--primary", "--primary-soft-hover"],
];

let falhas = 0;
for (const [tema, tokens] of [["claro", claro], ["escuro", escuro]]) {
  for (const [nome, fg, bg] of PARES) {
    const corFg = tokens[fg];
    const corBg = tokens[bg];
    if (!corFg || !corBg) {
      console.log(`✗ ${tema.padEnd(6)} ${nome} — token ausente (${fg} / ${bg})`);
      falhas++;
      continue;
    }
    const r = razao(corFg, corBg);
    const ok = r >= AA_TEXTO;
    if (!ok) falhas++;
    console.log(
      `${ok ? "✓" : "✗"} ${tema.padEnd(6)} ${nome.padEnd(34)} ${r.toFixed(2)}:1  ${corFg} sobre ${corBg}`,
    );
  }
}

console.log(falhas === 0 ? `\n✓ ${PARES.length * 2} pares passam em AA (>= ${AA_TEXTO}:1)` : `\n✗ ${falhas} par(es) abaixo de ${AA_TEXTO}:1`);
process.exit(falhas === 0 ? 0 : 1);
