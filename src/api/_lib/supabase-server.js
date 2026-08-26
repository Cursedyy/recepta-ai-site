import { createServerClient } from "@supabase/ssr";

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (name) out[name] = decodeURIComponent(value);
  });
  return out;
}

function serializeCookie(name, value, options = {}) {
  let str = name + "=" + encodeURIComponent(value);
  if (options.maxAge != null) str += "; Max-Age=" + options.maxAge;
  str += "; Path=" + (options.path || "/");
  if (options.domain) str += "; Domain=" + options.domain;
  str += "; SameSite=" + (options.sameSite || "Lax");
  // sempre HttpOnly: este app nunca le a sessao via JS client-side,
  // @supabase/ssr manda httpOnly:false por padrao assumindo client access
  str += "; HttpOnly";
  str += "; Secure";
  return str;
}

/**
 * Cliente Supabase server-side (helper oficial @supabase/ssr) usando cookies
 * httpOnly em vez de reinventar sessao propria. Funciona em qualquer funcao
 * Vercel Node (nao exige Next.js) via adapter getAll/setAll manual.
 */
export function createSupabaseServerClient(req, res) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("supabase_nao_configurado");

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        const parsed = parseCookies(req.headers.cookie);
        return Object.keys(parsed).map((name) => ({
          name,
          value: parsed[name],
        }));
      },
      setAll(cookiesToSet) {
        const existing = res.getHeader("Set-Cookie");
        const prev = existing
          ? Array.isArray(existing)
            ? existing
            : [existing]
          : [];
        const next = cookiesToSet.map(({ name, value, options }) =>
          serializeCookie(name, value, {
            ...options,
            // Forçar httpOnly em TODOS os cookies de sessão do Supabase.
            // O cliente JS NUNCA precisa ler esses cookies — o RLS e as
            // APIs server-side cuidam da autenticação. Isso impede que
            // XSS roube o access_token JWT.
            httpOnly: true,
            secure: true,
            sameSite: "Lax",
            path: "/",
          }),
        );
        res.setHeader("Set-Cookie", prev.concat(next));
      },
    },
  });
}
