import React, { useEffect, useState } from 'react';
import { fetchFeriados, adicionarFeriado, removerFeriado } from '../../api/painel';
import s from '../admin/Admin.module.scss';

export default function Feriados() {
  const [feriados, setFeriados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState('');
  const [nome, setNome] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      const result = await fetchFeriados();
      if (!mounted) return;

      if (result.ok) {
        setFeriados(result.body.feriados || []);
        setError('');
      } else {
        setError('Não foi possível carregar os feriados.');
      }
      setLoading(false);
    }

    load();
    return () => { mounted = false; };
  }, []);

  async function handleAdicionar() {
    if (!data) return;
    setAdding(true);
    setError('');

    const result = await adicionarFeriado(data, nome.trim() || null);
    setAdding(false);

    if (result.ok) {
      // Recarregar lista
      const lista = await fetchFeriados();
      if (lista.ok) setFeriados(lista.body.feriados || []);
      setData('');
      setNome('');
    } else {
      setError(result.body?.erro === 'data_ja_cadastrada'
        ? 'Data já cadastrada.'
        : 'Erro ao adicionar feriado.');
    }
  }

  async function handleRemover(id) {
    const result = await removerFeriado(id);
    if (result.ok) {
      setFeriados((prev) => prev.filter((f) => f.id !== id));
    }
  }

  function formatarData(dataStr) {
    if (!dataStr) return '—';
    try {
      const [y, m, d] = dataStr.split('-');
      return `${d}/${m}/${y}`;
    } catch {
      return dataStr;
    }
  }

  return (
    <>
      <div className="panel-header">
        <h1>Feriados e datas especiais</h1>
        <p className="panel-desc">Dias em que a clínica não atende.</p>
      </div>
      <div className="panel-body">
        <div className="section-card">
          {loading ? (
            <p className={s.vazio}>Carregando feriados…</p>
          ) : feriados.length === 0 ? (
            <p className={s.vazio}>Nenhum feriado cadastrado.</p>
          ) : (
            feriados.map((f) => (
              <div key={f.id} className="item-row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{formatarData(f.data)}</span>
                  {f.nome && <span style={{ marginLeft: '8px', color: '#64748b' }}>— {f.nome}</span>}
                </div>
                <button
                  className={s.btn + ' ' + s.btnDanger + ' ' + s.btnSm}
                  onClick={() => handleRemover(f.id)}
                >
                  Remover
                </button>
              </div>
            ))
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center' }}>
            <input
              type="date"
              className="field-input"
              value={data}
              onChange={(e) => setData(e.target.value)}
              style={{ width: '160px' }}
            />
            <input
              type="text"
              className="field-input"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome (ex: Natal)"
              style={{ flex: 1 }}
            />
            <button
              className={s.btn + ' ' + s.btnPrimary + ' ' + s.btnSm}
              onClick={handleAdicionar}
              disabled={adding || !data}
            >
              {adding ? 'Adicionando…' : 'Adicionar'}
            </button>
          </div>

          {error && (
            <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '6px' }}>{error}</div>
          )}
        </div>
      </div>
    </>
  );
}
