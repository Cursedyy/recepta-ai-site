import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ erro: 'metodo' });

  const { token } = req.query;
  if (!token || typeof token !== 'string') {
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
      .select('token,clinica,status,inicio_teste,expira_em')
      .eq('token', token)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ erro: 'falha_consulta' });
    }
    if (!data) {
      return res.status(404).json({ erro: 'nao_encontrado' });
    }
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ erro: 'falha' });
  }
}
