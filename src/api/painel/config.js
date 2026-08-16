export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  if (req.method !== 'GET') return res.status(405).json({ erro: 'metodo' });

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return res.status(500).json({ erro: 'supabase_nao_configurado' });

  // url + anonKey sao publicos por design (o Supabase Auth JS os expoe no
  // bundle do navegador de qualquer app) - RLS e' quem protege os dados, nao
  // o sigilo dessas duas strings. Nunca expor SUPABASE_SERVICE_ROLE_KEY aqui.
  return res.status(200).json({ url, anonKey });
}
