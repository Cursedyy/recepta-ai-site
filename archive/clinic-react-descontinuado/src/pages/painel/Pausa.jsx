import React, { useEffect, useState } from 'react';
import { fetchConfig, salvarTempoPausa } from '../../api/painel';
import s from '../admin/Admin.module.scss';

export default function Pausa() {
  const [tempo, setTempo] = useState(10);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      const result = await fetchConfig();
      if (!mounted) return;

      if (result.ok && typeof result.body.tempo_pausa_minutos === 'number') {
        setTempo(result.body.tempo_pausa_minutos);
      }
      setLoading(false);
    }

    load();
    return () => { mounted = false; };
  }, []);

  async function handleSalvar() {
    setSaving(true);
    setStatus('');
    const result = await salvarTempoPausa(tempo);
    setSaving(false);

    if (result.ok) {
      setStatus('Salvo!');
      setTimeout(() => setStatus(''), 2000);
    } else {
      setStatus('Erro ao salvar.');
    }
  }

  return (
    <>
      <div className="panel-header">
        <h1>Pausa da Recepta</h1>
        <p className="panel-desc">Tempo que a Recepta fica em silêncio após uma resposta manual sua.</p>
      </div>
      <div className="panel-body">
        <div className="section-card">
          <div className="field">
            <label className="field-label">Minutos de pausa</label>
            <p className="field-desc">
              Depois que você responder manualmente no WhatsApp, a Recepta fica pausada por esse tempo.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
              {loading ? (
                <p className={s.vazio}>Carregando…</p>
              ) : (
                <>
                  <input
                    type="number"
                    className="field-input"
                    min={1}
                    max={120}
                    step={1}
                    value={tempo}
                    onChange={(e) => setTempo(Number(e.target.value))}
                    style={{ width: '100px' }}
                  />
                  <span style={{ fontSize: '13px', color: '#64748b' }}>minutos</span>
                  <button
                    className={s.btn + ' ' + s.btnPrimary + ' ' + s.btnSm}
                    onClick={handleSalvar}
                    disabled={saving}
                  >
                    {saving ? 'Salvando…' : 'Salvar'}
                  </button>
                  {status && <span style={{ fontSize: '12px', color: '#64748b' }}>{status}</span>}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
