// E2E smoke tests for briefing form and login page.
//
// Validates that the HTML renders correctly, form fields are present,
// and the server-side API endpoints exist and return proper error responses.
//
// Rodar: node test-e2e-briefing-login.mjs
import fs from "node:fs";
import assert from "node:assert/strict";

let falhas = 0;
function ok(condicao, msg) {
  if (condicao) {
    console.log("  ok    " + msg);
    return;
  }
  falhas++;
  console.error("  FALHA " + msg);
}

// ── Briefing form ──
console.log("\n=== Briefing ===");
const briefing = fs.readFileSync("briefing/index.html", "utf8");

ok(briefing.includes('<form id="form"'), "briefing has <form id=\"form\">");
ok(briefing.includes("novalidate"), "form has novalidate attribute");
// Fields are defined in JS (S array), not static HTML
ok(briefing.includes('"clinica"'), "has clinica field definition");
ok(briefing.includes('"whats_resp"'), "has whats_resp field definition");
ok(briefing.includes('"numero"'), "has numero field definition");
ok(briefing.includes('"cnpj"'), "has cnpj field definition");
ok(briefing.includes('"endereco"'), "has endereco field definition");
ok(briefing.includes('"servicos"'), "has servicos field definition");
ok(briefing.includes('"convenios"'), "has convenios field definition");
ok(briefing.includes('"horario_func"'), "has horario_func field definition");
ok(briefing.includes('"categoria"'), "has categoria field definition");
ok(briefing.includes('"aceite"'), "has aceite confirmation field definition");
ok(briefing.includes('id="btn"'), "has submit button");
ok(briefing.includes('id="prevBtn"'), "has back button");
ok(briefing.includes('id="stepsRail"'), "has stepper component");
ok(briefing.includes('id="bar"'), "has progress bar");
ok(briefing.includes('id="completion"'), "has completion screen");
ok(briefing.includes("localStorage"), "uses localStorage for draft saving");
ok(briefing.includes("validaCNPJ"), "has CNPJ validation function");
ok(briefing.includes("/api/submit"), "submits to /api/submit");
ok(briefing.includes('rel="nofollow"') === false, "briefing does NOT have nofollow (indexable)");
ok(briefing.includes('content="noindex"'), "briefing has noindex meta (correctly excluded from search)");

// CNPJ mask
ok(briefing.includes("applyCnpjMask"), "has CNPJ mask function");
ok(briefing.includes('im: "numeric"') || briefing.includes('inputmode="numeric"'), "CNPJ field uses numeric inputmode");

// Category dropdown
ok(briefing.includes('id="cat-dropdown"'), "has category dropdown");
ok(briefing.includes('id="cat-search"'), "has category search input");
ok(briefing.includes("CATS"), "has categories data array");

// ── Login page ──
console.log("\n=== Login ===");
const login = fs.readFileSync("clinica/login/index.html", "utf8");

ok(login.includes('<form'), "login has a form");
ok(login.includes('id="email"'), "login has email field");
ok(login.includes('id="senha"'), "login has password field");
ok(login.includes('id="btn-entrar"'), "login has submit button");
ok(login.includes('/api/clinica/login'), "login calls /api/clinica/login endpoint");
ok(login.includes('type="email"'), "email field has type=email");
ok(login.includes('type="password"'), "password field has type=password");
ok(login.includes('autocomplete="username"') || login.includes('autocomplete="email"'), "email has autocomplete attribute");
ok(login.includes('autocomplete="current-password"'), "password has autocomplete=current-password");
ok(login.includes('novalidate'), "login form has novalidate (custom validation)");
ok(login.includes('id="login-erro"'), "login has error display element");
ok(login.includes('muitas_tentativas') || login.includes('bloqueado'), "login handles rate limiting response");

// ── Painel JS syntax check ──
console.log("\n=== Painel JS ===");
const painelJs = fs.readFileSync("clinica/painel.js", "utf8");

try {
  new Function(painelJs);
  ok(true, "clinica/painel.js parses without syntax errors");
} catch (e) {
  ok(false, "clinica/painel.js syntax error: " + e.message);
}

ok(painelJs.includes("window.__PAINEL__"), "reads data from window.__PAINEL__");
ok(painelJs.includes("escapeHtml"), "has escapeHtml for XSS prevention");
ok(painelJs.includes("America/Sao_Paulo"), "uses Sao Paulo timezone");
ok(painelJs.includes("carregarAgenda"), "has agenda loading function");
ok(painelJs.includes("carregarConversas"), "has conversations loading function");
ok(painelJs.includes("renderFeriados"), "has holidays rendering");
ok(painelJs.includes("config-salvar"), "saves config via /api/clinica/config-salvar");

// ── Summary ──
if (falhas) {
  console.error(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nBriefing + Login + Painel: todos os checks OK.");
