/**
 * Rate limiter simples em memória para funções serverless.
 * Em Vercel, cada instância mantém seu próprio mapa — o limite é por
 * instância, não global. Para uso em produção com múltiplas instâncias,
 * considere Redis (Upstash) ou similar.
 *
 * Uso:
 *   if (rateLimit("login:" + ip, 5, 300_000)) { // 5 tentativas a cada 5min
 *     return res.status(429).json({ erro: "muitas_tentativas" });
 *   }
 */

const buckets = new Map();

// Limpa entradas antigas a cada 10 minutos
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now > entry.resetAt) buckets.delete(key);
  }
}, 600_000);

/**
 * @param {string} key - Chave única (ex: "login:1.2.3.4")
 * @param {number} max - Máximo de requests no window
 * @param {number} windowMs - Janela de tempo em ms
 * @returns {boolean} true se deve bloquear (rate limited)
 */
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  let entry = buckets.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + windowMs };
    buckets.set(key, entry);
    return false;
  }

  entry.count++;
  return entry.count > max;
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
