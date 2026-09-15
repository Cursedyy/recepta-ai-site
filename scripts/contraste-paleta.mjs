#!/usr/bin/env node
// Checagem de contraste WCAG AA da paleta da marca nos painéis.
//
// Por que existe: a identidade da Recepta é roxo escuro + lilás, e o lilás é
// claro o bastante para passar despercebido num par que na verdade falha. Este
// script lê os tokens direto do CSS (não uma cópia colada aqui) e falha com
// exit 1 se algum par cair abaixo do mínimo. Rode depois de mexer em cor.
//
//   node scripts/contraste-paleta.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const lin = (c) => {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminancia = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * lin((n >> 16) & 255) +
    0.7152 * lin((n >> 8) & 255) +
    0.0722 * lin(n & 255)
  );
};
const razao = (a, b) => {
  const [alto, baixo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (alto + 0.05) / (baixo + 0.05);
};
/** Achata uma cor translúcida sobre um fundo opaco, para poder medir rgba(). */
const sobre = (hex, alfa, fundo) => {
  const c = parseInt(hex.slice(1), 16);
  const f = parseInt(fundo.slice(1), 16);
  const canal = (s) =>
    Math.round(alfa * ((c >> s) & 255) + (1 - alfa) * ((f >> s) & 255));
  return (
    "#" + [16, 8, 0].map((s) => canal(s).toString(16).padStart(2, "0")).join("")
  );
};

/** Lê um token do primeiro `:root` de um arquivo. Falha alto se sumir. */
function token(arquivo, nome) {
  const texto = fs.readFileSync(path.join(RAIZ, arquivo), "utf8");
  const raiz = texto.slice(texto.indexOf(":root"));
  const achado = raiz.match(new RegExp(`--${nome}:[ ]*(#[0-9a-fA-F]{6})`));
  if (!achado) throw new Error(`token --${nome} não encontrado em ${arquivo}`);
  return achado[1].toLowerCase();
}

const PAINEL = "src/clinica/painel.css";
const AUTH = "src/clinica/auth.css";
const ADMIN = "src/painel/index.html";
const BRIEFING = "src/briefing/index.html";
const LP = "src/index.html";

const t = {
  primary: token(PAINEL, "primary"),
  primaryHover: token(PAINEL, "primary-hover"),
  primarySoft: token(PAINEL, "primary-soft"),
  lilac: token(PAINEL, "lilac"),
  bg: token(PAINEL, "bg"),
  surface: token(PAINEL, "surface"),
  borderInput: token(PAINEL, "border-input"),
  muted: token(PAINEL, "muted"),
  placeholder: token(PAINEL, "placeholder"),
  green: token(PAINEL, "green"),
  greenBg: token(PAINEL, "green-bg"),
  orange: token(PAINEL, "orange"),
  orangeBg: token(PAINEL, "orange-bg"),
  redBg: token(PAINEL, "red-bg"),
  warnInk: token(ADMIN, "warn-ink"),
  warnBg: token(ADMIN, "warn-bg"),
  red: token(PAINEL, "red"),
  chatBg: token(PAINEL, "chat-bg"),
  authInk: token(AUTH, "auth-ink"),
  authMuted: token(AUTH, "auth-muted"),
  authAccent: token(AUTH, "auth-accent"),
  authBorderInput: token(AUTH, "auth-border-input"),
  adminInk: token(ADMIN, "ink"),
  adminAccent: token(ADMIN, "accent"),
  adminBorderInput: token(ADMIN, "border-input"),
  // O briefing e a LP sao a porta de entrada: se a marca divergir aqui, o
  // usuario clica num botao e cai no que parece outra empresa.
  briefAccent: token(BRIEFING, "accent"),
  briefAccentHover: token(BRIEFING, "accent-hover"),
  briefAccent2: token(BRIEFING, "accent-2"),
  briefInk: token(BRIEFING, "ink"),
  briefMuted: token(BRIEFING, "muted"),
  briefSurface: token(BRIEFING, "surface"),
  briefHeaderBg: token(BRIEFING, "header-bg"),
  lpAccent: token(LP, "accent"),
  lpInk: token(LP, "ink"),
  lpHeaderBg: token(LP, "header-bg"),
};

// [rótulo, frente, fundo, mínimo]
const pares = [
  // Texto — AA exige 4.5:1
  ["texto principal sobre card", t.primary, t.surface, 4.5],
  ["texto principal sobre fundo da página", t.primary, t.bg, 4.5],
  ["texto no balão da IA", t.primary, t.primarySoft, 4.5],
  ["texto sobre o fundo do chat", t.primary, t.chatBg, 4.5],
  ["texto secundário sobre card", t.muted, t.surface, 4.5],
  ["texto secundário sobre fundo da página", t.muted, t.bg, 4.5],
  ["placeholder de campo", t.placeholder, t.surface, 4.5],
  ["rótulo do botão primário", t.surface, t.primary, 4.5],
  ["rótulo do botão primário (hover)", t.surface, t.primaryHover, 4.5],
  ["texto da topbar roxa", t.surface, t.primary, 4.5],
  ["status de sucesso", t.green, t.surface, 4.5],
  ["status de erro", t.red, t.surface, 4.5],
  // Os avisos nao ficam sobre branco: cada um tem seu proprio fundo tingido,
  // que come parte do contraste. Medir so contra branco deixa passar falha.
  ["aviso de sucesso sobre seu fundo", t.green, t.greenBg, 4.5],
  ["aviso de erro sobre seu fundo", t.red, t.redBg, 4.5],
  ["aviso de atencao sobre seu fundo", t.orange, t.orangeBg, 4.5],
  ["aviso amarelo do admin", t.warnInk, t.warnBg, 4.5],
  ["botao laranja do banner de WhatsApp", t.surface, t.orange, 4.5],
  ["texto do admin sobre card", t.adminInk, t.surface, 4.5],
  ["texto do login sobre card", t.authInk, t.surface, 4.5],
  ["texto secundário do login", t.authMuted, t.surface, 4.5],
  ["wordmark lilás sobre o painel roxo do login", t.lilac, t.authAccent, 4.5],
  ["texto branco 62% sobre o painel do login", sobre("#ffffff", 0.62, t.authAccent), t.authAccent, 4.5],

  // Não-texto (bordas de campo, anel de foco) — AA exige 3:1
  // Briefing: o gradiente do CTA "Continuar" e do badge numerado carrega
  // texto branco. Terminava em --accent-2 (lilas) e dava 2.18:1.
  ["rotulo branco no fim do gradiente do briefing", t.briefSurface, t.briefAccentHover, 4.5],
  ["rotulo branco no inicio do gradiente do briefing", t.briefSurface, t.briefAccent, 4.5],
  ["texto do briefing sobre card", t.briefInk, t.briefSurface, 4.5],
  ["texto secundario do briefing", t.briefMuted, t.briefSurface, 4.5],
  ["wordmark lilas na topbar do briefing", t.briefAccent2, t.briefHeaderBg, 4.5],

  ["borda de campo no painel", t.borderInput, t.surface, 3],
  ["borda de campo no painel (sobre o fundo)", t.borderInput, t.bg, 3],
  ["borda de campo no admin", t.adminBorderInput, t.surface, 3],
  ["borda de campo no login", t.authBorderInput, t.surface, 3],
  ["anel de foco sobre card", t.primary, t.surface, 3],
  ["anel de foco sobre fundo da página", t.primary, t.bg, 3],
  ["halo de foco lilás sobre a topbar roxa", sobre(t.lilac, 0.55, t.primary), t.primary, 3],
  ["marca da logo sobre a topbar roxa", t.lilac, t.primary, 3],
];

let falhas = 0;
for (const [rotulo, frente, fundo, minimo] of pares) {
  const r = razao(frente, fundo);
  const ok = r >= minimo;
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok  " : "FALHA"} ${r.toFixed(2).padStart(5)}:1 (min ${minimo})  ${rotulo}  [${frente} / ${fundo}]`,
  );
}
// Trava de marca: o briefing e o destino de todo CTA da LP. Se estes tokens
// divergirem, a pagina de conversao deixa de parecer a mesma empresa.
const marca = [
  ["--accent", t.briefAccent, t.lpAccent],
  ["--ink", t.briefInk, t.lpInk],
  ["--header-bg", t.briefHeaderBg, t.lpHeaderBg],
];
let divergiu = 0;
for (const [nome, brief, lp] of marca) {
  const igual = brief === lp;
  if (!igual) divergiu++;
  console.log(
    `${igual ? "ok  " : "FALHA"} briefing ${nome} == LP ${nome}  [${brief} / ${lp}]`,
  );
}
if (divergiu) falhas += divergiu;

console.log(`\n${pares.length} pares, ${falhas} falha(s).`);
process.exit(falhas ? 1 : 0);
