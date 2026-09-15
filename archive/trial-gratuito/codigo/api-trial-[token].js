import { createClient } from '@supabase/supabase-js';
import { rateLimit, getClientIp } from '../_lib/rate-limit.js';

// 10 consultas por IP a cada 5 minutos (evita枚scraping de tokens)
const MAX_CONSULTAS = 10;
const JANELA_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ erro: 'metodo' });

  // rateLimit e' async: sem await a condicao testava a Promise (sempre truthy)
  // e TODA consulta virava 429 — o rate limit nao existia e a pagina /t/:token
  // ficava permanentemente quebrada.
  const ip = getClientIp(req);
  const rl = await rateLimit('trial:' + ip, MAX_CONSULTAS, JANELA_MS);
  if (rl.blocked) {
    return res.status(429).json({ erro: 'muitas_tentativas' });
  }

  const { token } = req.query;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ erro: 'token_invalido' });
  }

  // Validar formato do token (nanoid gera strings alfanuméricas)
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) {
    return res.status(400).json({ erro: 'token_invalido' });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return res.status(500).json({ erro: 'supabase_nao_configurado' });
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false }
  });

  try {
    const { data, error } = await supabase
      .from('trials')
      .select('clinica,status,inicio_teste,expira_em')
      .eq('token', token)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ erro: 'falha_consulta' });
    }
    if (!data) {
      return res.status(404).json({ erro: 'nao_encontrado' });
    }
    // Nao retornar o campo 'token' de volta — o cliente ja conhece o token
    // que enviou. Expor o token na resposta é informacao desnecessaria.
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ erro: 'falha' });
  }
}
