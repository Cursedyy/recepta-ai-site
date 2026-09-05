import React, { useEffect, useState } from 'react';
import { fetchAgenda } from '../../api/painel';
import { formatarHora } from '../../utils/panel';
import s from '../admin/Admin.module.scss';

export default function Agenda() {
  const [agendamentos, setAgendamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      const result = await fetchAgenda();
      if (!mounted) return;

      if (result.ok) {
        setAgendamentos(result.body.agendamentos || []);
        setError('');
      } else {
        setError('Não foi possível carregar a agenda.');
      }
      setLoading(false);
    }

    load();
    return () => { mounted = false; };
  }, []);

  const agora = new Date();
  const proximos = agendamentos.filter(
    (a) => a.status !== 'cancelado' && new Date(a.data_hora) >= agora,
  );
  const anteriores = agendamentos.filter(
    (a) => a.status === 'cancelado' || new Date(a.data_hora) < agora,
  );

  function formatarData(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  function formatarTelefone(tel) {
    if (!tel) return '';
    const d = tel.replace(/\D/g, '');
    if (d.length === 13) return `(${d.slice(2, 4)}) ${d.slice(4, 5)}${d.slice(5, 9)}-${d.slice(9)}`;
    if (d.length === 12) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
    return tel;
  }

  return (
    <>
      <div className="panel-header">
        <h1>Agenda</h1>
        <p className="panel-desc">Consultas marcadas pela secretária virtual e pela clínica.</p>
      </div>
      <div className="panel-body">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
          <button className={s.btn + ' ' + s.btnPrimary + ' ' + s.btnSm}>+ Novo agendamento</button>
        </div>

        {error && (
          <div style={{ color: '#dc2626', fontSize: '13px', marginBottom: '12px' }}>{error}</div>
        )}

        <div className="section-card">
          {loading ? (
            <p className={s.vazio}>Carregando agendamentos…</p>
          ) : proximos.length === 0 ? (
            <p className={s.vazio}>Nenhum agendamento futuro.</p>
          ) : (
            proximos.map((a) => (
              <div key={a.id} className="ag-item">
                <div className="ag-date">
                  <div>{formatarData(a.data_hora)}</div>
                </div>
                <div className="ag-info">
                  <div className="ag-nome">{a.paciente_nome || 'Sem nome'}</div>
                  <div className="ag-phone">{formatarTelefone(a.paciente_telefone)}</div>
                  {a.observacao && <div className="ag-obs">{a.observacao}</div>}
                </div>
                <div className="ag-actions">
                  <button className={s.btn + ' ' + s.btnGhost + ' ' + s.btnSm}>Remarcar</button>
                  <button className={s.btn + ' ' + s.btnDanger + ' ' + s.btnSm}>Cancelar</button>
                </div>
              </div>
            ))
          )}
        </div>

        {anteriores.length > 0 && (
          <details style={{ marginTop: '12px' }}>
            <summary style={{ cursor: 'pointer', fontSize: '12px', color: '#64748b', padding: '6px 0' }}>
              Agendamentos anteriores ({anteriores.length})
            </summary>
            <div className="section-card" style={{ marginTop: '6px' }}>
              {anteriores.map((a) => (
                <div
                  key={a.id}
                  className="ag-item"
                  style={{ opacity: a.status === 'cancelado' ? 0.5 : 0.7 }}
                >
                  <div className="ag-date">
                    <div>{formatarData(a.data_hora)}</div>
                  </div>
                  <div className="ag-info">
                    <div className="ag-nome">{a.paciente_nome || 'Sem nome'}</div>
                    <div className="ag-phone">{formatarTelefone(a.paciente_telefone)}</div>
                  </div>
                  {a.status === 'cancelado' && (
                    <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: 600 }}>Cancelado</span>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </>
  );
}
