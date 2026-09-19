// Redis resolvido de forma LAZY (mesmo padrão do rate-limit.js): se as env
// UPSTASH_* não existirem, a rota vira no-op em vez de quebrar no import.
let redisClient = null;
async function getRedis() {
  if (redisClient !== null) return redisClient;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    redisClient = false; // sem Redis: no-op permanente
    return redisClient;
  }
  try {
    const mod = await import("./_lib/redis.js");
    redisClient = await mod.redis;
    return redisClient;
  } catch {
    redisClient = false;
    return redisClient;
  }
}

/**
 * F2 — analytics sem cookies. Contadores agregados e anônimos, nada mais:
 *
 * - NÃO seta cookie, NÃO grava IP, user agent ou referer (promessa da seção
 *   10 da Política de Privacidade, que deve mudar junto com este código).
 * - Aceita os sete eventos do F2 e preserva `visit`, `cta_planos` e
 *   `checkout_start`. Aceitar um evento não comprova que o cliente o envia.
 * - Dimensões opcionais usam apenas enums de tier e ciclo; qualquer campo
 *   adicional é rejeitado antes de acessar o Redis.
 * - Chave = `an:<evento>:<YYYY-MM-DD>` em UTC, TTL 180 dias. Agregação por
 *   dia é o grão prometido ao dono; nada permite reconhecer um visitante.
 * - POST-only: GET devolve 405. Sem rate limit agressivo — é uma rota que
 *   não escreve dado pessoal; abuso custa só contadores falsos.
 * - Falha do Redis não quebra a página: payload válido recebe 204;
 *   payload inválido recebe 400 antes de qualquer escrita.
 *
 * Deploy em frente separada (decisão 14): o baseline precisa existir ANTES
 * da troca comercial (F8) para medir o impacto.
 */

const EVENTOS = new Set([
  "visit", "cta_planos", "checkout_start", // Preserve the existing counters.
  "ciclo_alterado", "checkout_iniciado", "checkout_abandonado",
  "briefing_iniciado", "briefing_enviado", "whatsapp_conectado", "reembolso_solicitado",
]);
const CAMPOS = new Set(["evento", "tier", "ciclo"]);
const TTL_DIAS = 180;

// Only fixed enums reach Redis keys. No identifier or arbitrary attribute is
// accepted, even when a client bypasses the anonymous tracking code.
export function chavesAnalytics(body, data = new Date()) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (Object.keys(body).some(key => !CAMPOS.has(key))) return null;
  if (!EVENTOS.has(body.evento)) return null;
  if (body.tier !== undefined && !["essencial", "completo"].includes(body.tier)) return null;
  if (body.ciclo !== undefined && !["mensal", "anual"].includes(body.ciclo)) return null;
  const base = `an:${body.evento}:${diaUtc(data)}`;
  const keys = [base];
  if (body.tier && body.ciclo) keys.push(`${base}:${body.tier}:${body.ciclo}`);
  else if (body.evento === "ciclo_alterado" && body.ciclo) keys.push(`${base}:${body.ciclo}`);
  return keys;
}

function diaUtc(data) {
  const y = data.getUTCFullYear();
  const m = String(data.getUTCMonth() + 1).padStart(2, "0");
  const d = String(data.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "https://www.receptaai.com.br");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "metodo_nao_permitido" });
  }

  const keys = chavesAnalytics(req.body);
  if (!keys) {
    return res.status(400).json({ erro: "evento_invalido" });
  }

  const redis = await getRedis();
  if (redis) {
    try {
      // INCR + EXPIRE. O EXPIRE roda a cada hit: se a primeira escrita cair no
      // meio (crash entre INCR e EXPIRE), o próximo hit conserta o TTL — com
      // EXPIRE só no n===1, a chave ficaria imortal.
      for (const key of keys) {
        await redis.incr(key);
        await redis.expire(key, TTL_DIAS * 24 * 3600);
      }
    } catch (e) {
      // Nunca quebra a página por falha de métrica.
      console.error("an_incr_falhou", e?.message || e);
    }
  }

  return res.status(204).end();
}
