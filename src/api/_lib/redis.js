import { Redis } from "@upstash/redis";

/**
 * Cliente Upstash Redis via REST API.
 * Funciona em serverless (Vercel) sem pool de conexões.
 *
 * Variáveis de ambiente obrigatórias:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 */
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
