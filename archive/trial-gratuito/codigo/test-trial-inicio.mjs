/**
 * Check de quando o trial COMECA.
 *
 * O relogio so pode ser ligado uma vez, e nunca para quem ja paga: o n8n zera
 * `trial_fim` ao confirmar pagamento, entao reescrever aqui daria sete dias
 * gratis a um cliente ativo. O gatilho e o polling de status, que roda a cada
 * 3s na pagina de conexao — chamado muitas vezes para a mesma clinica.
 *
 * Rodar: node src/test-trial-inicio.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fonte = readFileSync(
  new URL("./api/clinica/conectar.js", import.meta.url),
  "utf8",
);

// Mesma tecnica de test-conectar.mjs: a funcao nao e exportada de proposito
// (superficie interna do handler), entao reavaliamos o modulo sem os imports.
const semImports = fonte
  .replace(/^import[\s\S]*?;$/gm, "")
  .replace(/export default async function handler[\s\S]*$/, "");
const { deveIniciarTrial } = await import(
  "data:text/javascript," +
    encodeURIComponent(semImports + "\nexport { deveIniciarTrial };")
);

// ── O caso que liga o relogio ─────────────────────────────────────────────
assert.equal(
  deveIniciarTrial({ trial_inicio: null, stripe_customer_id: null }),
  true,
  "clinica nova conectando pela primeira vez: comeca o trial",
);

// ── Uma vez so ────────────────────────────────────────────────────────────
assert.equal(
  deveIniciarTrial({
    trial_inicio: "2026-08-25T10:00:00.000Z",
    stripe_customer_id: null,
  }),
  false,
  "reconectar o WhatsApp no meio do trial nao pode renovar os 7 dias",
);

// ── Nunca para quem paga ──────────────────────────────────────────────────
assert.equal(
  deveIniciarTrial({ trial_inicio: null, stripe_customer_id: "cus_123" }),
  false,
  "cliente pagante nao ganha trial: o n8n zera trial_fim no checkout",
);
assert.equal(
  deveIniciarTrial({
    trial_inicio: "2026-08-25T10:00:00.000Z",
    stripe_customer_id: "cus_123",
  }),
  false,
  "quem pagou depois de um trial tambem nao reabre",
);

// ── A janela e de 7 dias, igual a copy publica ────────────────────────────
const TRIAL_DIAS = Number(fonte.match(/const TRIAL_DIAS = (\d+);/)?.[1]);
assert.equal(
  TRIAL_DIAS,
  7,
  "index.html, /termos, blog e paginas de nicho prometem 7 dias",
);

// A conta que o handler faz, conferida contra a promessa da copy.
const agora = new Date("2026-08-30T12:00:00.000Z");
const fim = new Date(agora.getTime() + TRIAL_DIAS * 86400000);
assert.equal(
  fim.toISOString(),
  "2026-09-06T12:00:00.000Z",
  "trial_fim tem que cair 7 dias depois da conexao",
);

// O node "Expirar Clinicas" do n8n filtra `trial_fim=lt.<agora>`, entao a data
// precisa estar no futuro no instante em que e gravada, senao a clinica seria
// expirada no proximo ciclo das 9h.
assert.ok(fim > agora, "trial_fim gravado tem que estar no futuro");

console.log("trial inicio: OK");
