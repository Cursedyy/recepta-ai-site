/**
 * Upstash Redis client via REST API.
 *
 * Usado por rate-limit.js para rate limiting global entre instâncias Vercel.
 * Sem esta configuração, o rate limit fica em memória (só protege uma instância).
 *
 * Env vars obrigatórias:
 *   UPSTASH_REDIS_REST_URL  — endpoint do Upstash
 *   UPSTASH_REDIS_REST_TOKEN — token de autenticação
 */

let client = null;

function getClient() {
  if (client) return client;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  client = {
    pipeline() {
      const cmds = [];
      return {
        incr(key) {
          cmds.push({ cmd: "INCR", args: [key] });
          return this;
        },
        ttl(key) {
          cmds.push({ cmd: "TTL", args: [key] });
          return this;
        },
        async exec() {
          const results = [];
          for (const { cmd, args } of cmds) {
            const res = await fetch(url + "/pipeline", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify([{ cmd, args }]),
            });
            const data = await res.json();
            results.push(data?.result?.[0] ?? null);
          }
          return results;
        },
      };
    },

    async incr(key) {
      const res = await fetch(url + "/incr/" + encodeURIComponent(key), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return data?.result;
    },

    async ttl(key) {
      const res = await fetch(url + "/ttl/" + encodeURIComponent(key), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return data?.result;
    },

    async expire(key, seconds) {
      const res = await fetch(url + "/expire/" + encodeURIComponent(key) + "/" + seconds, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.ok;
    },
  };

  return client;
}

export const redis = getClient();
