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
 * - Incrementa contadores diários por evento: `visit`, `cta_planos` e
 *   `checkout_start` (o CTA da landing chama antes de abrir o checkout).
 * - Chave = `an:<evento>:<YYYY-MM-DD>` em UTC, TTL 180 dias. Agregação por
 *   dia é o grão prometido ao dono; nada permite reconhecer um visitante.
 * - POST-only: GET devolve 405. Sem rate limit agressivo — é uma rota que
 *   não escreve dado pessoal; abuso custa só contadores falsos.
 * - Falha do Redis NUNCA quebra a página: resposta é sempre 204 e o fetch
 *   do cliente ignora o resultado.
 *
 * Deploy em frente separada (decisão 14): o baseline precisa existir ANTES
 * da troca comercial (F8) para medir o impacto.
 */

const EVENTOS = new Set(["visit", "cta_planos", "checkout_start"]);
const TTL_DIAS = 180;

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

  const evento = req.body?.evento;
  if (typeof evento !== "string" || !EVENTOS.has(evento)) {
    return res.status(400).json({ erro: "evento_invalido" });
  }

  const chave = `an:${evento}:${diaUtc(new Date())}`;

  const redis = await getRedis();
  if (redis) {
    try {
      // INCR + EXPIRE. O EXPIRE roda a cada hit: se a primeira escrita cair no
      // meio (crash entre INCR e EXPIRE), o próximo hit conserta o TTL — com
      // EXPIRE só no n===1, a chave ficaria imortal.
      await redis.incr(chave);
      await redis.expire(chave, TTL_DIAS * 24 * 3600);
    } catch (e) {
      // Nunca quebra a página por falha de métrica.
      console.error("an_incr_falhou", e?.message || e);
    }
  }

  return res.status(204).end();
}
