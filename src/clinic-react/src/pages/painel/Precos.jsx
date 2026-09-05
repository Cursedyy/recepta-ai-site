import React, { useEffect, useState } from 'react';
import { fetchConfig } from '../../api/painel';
import s from '../admin/Admin.module.scss';

export default function Precos() {
  const [precos, setPrecos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      const result = await fetchConfig();
      if (!mounted) return;

      if (result.ok && result.body.config?.precos) {
        setPrecos(result.body.config.precos);
      }
      setLoading(false);
    }

    load();
    return () => { mounted = false; };
  }, []);

  function formatarValor(valor) {
    if (typeof valor !== 'number') return 'R$ 0,00';
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  return (
    <>
      <div className="panel-header">
        <h1>Preços dos serviços</h1>
        <p className="panel-desc">Nome do serviço e valor em reais.</p>
      </div>
      <div className="panel-body">
        {loading ? (
          <p className={s.vazio}>Carregando preços…</p>
        ) : precos.length === 0 ? (
          <p className={s.vazio}>Nenhum preço cadastrado.</p>
        ) : (
          <div className="section-card">
            {precos.map((p, idx) => (
              <div key={idx} className="item-row">
                <input type="text" value={p.nome || ''} readOnly style={{ flex: 1 }} />
                <input
                  type="text"
                  value={formatarValor(p.valor)}
                  readOnly
                  style={{ width: '130px', textAlign: 'right' }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
