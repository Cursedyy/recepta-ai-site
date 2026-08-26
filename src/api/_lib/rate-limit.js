/**
 * Rate limiter com Upstash Redis (global) + fallback em memória.
 *
 * Uso:
 *   const rl = await rateLimit("login:" + ip, 5, 300);
 *   if (rl.blocked) {
 *     return res.status(429).json({ erro: "muitas_tentativas", restantes: rl.restantes });
 *   }
 */

// --- Fallback em memória (quando Redis não está configurado) ---
const buckets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now > entry.resetAt) buckets.delete(key);
  }
}, 600_000);

function rateLimitMem(key, max, windowMs) {
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + windowMs };
    buckets.set(key, entry);
    return { blocked: false, restantes: max - 1, resetMs: windowMs };
  }
  entry.count++;
  const restantes = Math.max(0, max - entry.count);
  return { blocked: entry.count > max, restantes, resetMs: entry.resetAt - now };
}

// --- Redis (Upstash) ---
let redisClient = null;
async function getRedis() {
  if (redisClient !== null) return redisClient;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  try {
    const { redis } = await import("./redis.js");
    redisClient = redis;
    return redisClient;
  } catch {
    return null;
  }
}

async function rateLimitRedis(key, max, windowSec) {
  const redis = await getRedis();
  if (!redis) return null;

  const now = Date.now();
  const ttlKey = key + ":ttl";

  // INCR + EXPIRE atômico via pipeline
  const [count, ttl] = await redis
    .pipeline()
    .incr(key)
    .ttl(key)
    .exec();

  const currentCount = Number(count) || 0;
  const currentTtl = Number(ttl) || 0;

  // Primeira requisição: definir TTL
  if (currentTtl === -1) {
    await redis.expire(key, windowSec);
  }

  const resetMs = currentTtl > 0 ? currentTtl * 1000 : windowSec * 1000;
  const restantes = Math.max(0, max - currentCount);

  return {
    blocked: currentCount > max,
    restantes,
    resetMs,
  };
}

/**
 * Rate limiter principal. Usa Redis se disponível, senão memória.
 * @param {string} key - Chave única (ex: "login:1.2.3.4")
 * @param {number} max - Máximo de requests no window
 * @param {number} windowMs - Janela de tempo em ms
 * @returns {Promise<{ blocked: boolean, restantes: number, resetMs: number }>}
 */
export async function rateLimit(key, max, windowMs) {
  const windowSec = Math.ceil(windowMs / 1000);

  // Tentar Redis primeiro
  const redisResult = await rateLimitRedis(key, max, windowSec);
  if (redisResult) return redisResult;

  // Fallback memória
  return rateLimitMem(key, max, windowMs);
}

/**
 * Retorna IP real do request, respeitando proxy headers do Vercel.
 */
export function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}
