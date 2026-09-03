/**
 * Upstash Redis client via @upstash/redis (official SDK).
 *
 * Usado por rate-limit.js para rate limiting global entre instâncias Vercel.
 * Sem esta configuração, o rate limit fica em memória (só protege uma instância).
 *
 * Env vars obrigatórias:
 *   UPSTASH_REDIS_REST_URL  — endpoint do Upstash
 *   UPSTASH_REDIS_REST_TOKEN — token de autenticação
 */

let client = null;
let loading = false;

async function getClient() {
  if (client) return client;
  if (loading) return null;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  loading = true;
  try {
    const { Redis } = await import("@upstash/redis");
    client = new Redis({ url, token });
    return client;
  } catch {
    return null;
  } finally {
    loading = false;
  }
}

// Exporta uma Promise que resolve para o cliente ou null
export const redis = getClient();
