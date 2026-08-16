import { nanoid } from 'nanoid';

const LIMITE = 3200;

function montarTexto(body, token) {
  const nome = (body?.bruto?.clinica || 'Clínica sem nome').trim();
  const resp = (body?.bruto?.responsavel || '-').trim();
  const zap = (body?.bruto?.whats_resp || '-').trim();
  const linhas = [];
  linhas.push('*NOVO BRIEFING — RECEPTA AI*');
  linhas.push('*' + nome + '*');
  linhas.push('Token: ' + token);
  linhas.push('Responsável: ' + resp + ' | ' + zap);
  linhas.push('Recebido: ' + new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }));
  linhas.push('');

  (body?.campos || []).forEach((sec) => {
    linhas.push('━━━ *' + sec.secao.toUpperCase() + '* ━━━');
    (sec.itens || []).forEach((it) => {
      const v = Array.isArray(it.valor) ? it.valor.join(', ') : (it.valor || '');
      if (!String(v).trim()) return;
      linhas.push('*' + it.label + '*');
      linhas.push(String(v).trim());
      linhas.push('');
    });
  });
  return linhas.join('\n');
}

function fatiar(texto) {
  const partes = [];
  let atual = '';
  texto.split('\n').forEach((linha) => {
    if ((atual + linha).length > LIMITE) {
      if (atual) partes.push(atual.trimEnd());
      atual = '';
    }
    atual += linha + '\n';
  });
  if (atual.trim()) partes.push(atual.trimEnd());
  return partes.map((p, i) => (partes.length > 1 ? '(' + (i + 1) + '/' + partes.length + ')\n' + p : p));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'metodo' });

  const webhook = process.env.N8N_BRIEFING_WEBHOOK;
  if (!webhook) return res.status(500).json({ erro: 'N8N_BRIEFING_WEBHOOK nao configurada' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const token = nanoid(16);
    const texto = montarTexto(body, token);
    const partes = fatiar(texto);

    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        clinica: body?.bruto?.clinica || '',
        responsavel: body?.bruto?.responsavel || '',
        whatsapp_responsavel: body?.bruto?.whats_resp || '',
        partes,
        texto,
        briefing: body?.bruto || {},
        recebido_em: new Date().toISOString()
      })
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(502).json({ erro: 'webhook', detalhe: t.slice(0, 300) });
    }
    return res.status(200).json({ ok: true, token, partes: partes.length });
  } catch (e) {
    return res.status(500).json({ erro: 'falha', detalhe: String(e).slice(0, 300) });
  }
}
