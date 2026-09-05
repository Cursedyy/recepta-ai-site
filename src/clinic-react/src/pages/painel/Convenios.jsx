import React, { useEffect, useState } from 'react';
import { fetchConfig } from '../../api/painel';
import s from '../admin/Admin.module.scss';

export default function Convenios() {
  const [convenios, setConvenios] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      const result = await fetchConfig();
      if (!mounted) return;

      if (result.ok && result.body.config?.convenios) {
        setConvenios(result.body.config.convenios);
      }
      setLoading(false);
    }

    load();
    return () => { mounted = false; };
  }, []);

  return (
    <>
      <div className="panel-header">
        <h1>Convênios aceitos</h1>
        <p className="panel-desc">Lista de convênios que a clínica atende.</p>
      </div>
      <div className="panel-body">
        {loading ? (
          <p className={s.vazio}>Carregando convênios…</p>
        ) : convenios.length === 0 ? (
          <p className={s.vazio}>Nenhum convênio cadastrado.</p>
        ) : (
          <div className="section-card">
            {convenios.map((c, idx) => (
              <div key={idx} className="item-row">
                <span>{c}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
