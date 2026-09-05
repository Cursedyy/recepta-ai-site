import React, { useEffect, useState } from 'react';
import { fetchConfig } from '../../api/painel';
import { DIAS, NOME_DIA } from '../../utils/panel';
import s from '../admin/Admin.module.scss';

export default function Horarios() {
  const [horarios, setHorarios] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      const result = await fetchConfig();
      if (!mounted) return;

      if (result.ok && result.body.config?.horarios) {
        setHorarios(result.body.config.horarios);
      }
      setLoading(false);
    }

    load();
    return () => { mounted = false; };
  }, []);

  function formatarFaixas(faixas) {
    if (!faixas || faixas.length === 0) return 'Fechado';
    return faixas.map((f) => `${f.inicio} às ${f.fim}`).join(', ');
  }

  return (
    <>
      <div className="panel-header">
        <h1>Horários de atendimento</h1>
        <p className="panel-desc">Configure os dias e faixas horárias da clínica.</p>
      </div>
      <div className="panel-body">
        {loading ? (
          <p className={s.vazio}>Carregando horários…</p>
        ) : (
          <div className="section-card">
            {DIAS.map((dia) => (
              <div key={dia} className="day-block">
                <div className="day-header">
                  <span><b>{NOME_DIA[dia]}</b></span>
                  <span className="closed">
                    {formatarFaixas(horarios[dia])}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
