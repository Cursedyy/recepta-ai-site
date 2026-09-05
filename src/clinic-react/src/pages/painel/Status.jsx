import React, { useEffect, useState } from 'react';
import { fetchConfig, fetchMetricas } from '../../api/painel';
import s from '../admin/Admin.module.scss';

export default function Status() {
  const [config, setConfig] = useState(null);
  const [metricas, setMetricas] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      const [cfgRes, metRes] = await Promise.all([fetchConfig(), fetchMetricas()]);
      if (!mounted) return;

      if (cfgRes.ok) setConfig(cfgRes.body);
      if (metRes.ok) setMetricas(metRes.body);
      setLoading(false);
    }

    load();
    return () => { mounted = false; };
  }, []);

  function formatarData(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    } catch {
      return iso;
    }
  }

  function statusLabel(status) {
    const map = {
      ativo: { text: 'Ativo', className: 'badge-green' },
      trial: { text: 'Trial', className: 'badge-orange' },
      cancelado: { text: 'Cancelado', className: 'badge-red' },
      trial_expirado: { text: 'Trial expirado', className: 'badge-red' },
    };
    return map[status] || { text: status || '—', className: 'badge-muted' };
  }

  if (loading) {
    return (
      <>
        <div className="panel-header">
          <h1>Status da conta</h1>
          <p className="panel-desc">Informações sobre assinatura e métricas de uso.</p>
        </div>
        <div className="panel-body"><p className={s.vazio}>Carregando…</p></div>
      </>
    );
  }

  const sl = config ? statusLabel(config.status) : null;

  return (
    <>
      <div className="panel-header">
        <h1>Status da conta</h1>
        <p className="panel-desc">Informações sobre assinatura e métricas de uso.</p>
      </div>
      <div className="panel-body">
        {/* Assinatura */}
        <div className="section-card">
          <div className="section-card-header">
            <div className="section-card-title">Assinatura</div>
          </div>
          {config ? (
            <div className="det-lista">
              <div className="det-linha">
                <span className="det-rotulo">Status</span>
                <span className="det-valor"><span className={`badge ${sl?.className}`}>{sl?.text}</span></span>
              </div>
              {config.plano && (
                <div className="det-linha">
                  <span className="det-rotulo">Plano</span>
                  <span className="det-valor">{config.plano}</span>
                </div>
              )}
              {config.criado_em && (
                <div className="det-linha">
                  <span className="det-rotulo">Criada em</span>
                  <span className="det-valor">{formatarData(config.criado_em)}</span>
                </div>
              )}
              {config.trial_fim && (
                <div className="det-linha">
                  <span className="det-rotulo">Trial até</span>
                  <span className="det-valor">{formatarData(config.trial_fim)}</span>
                </div>
              )}
            </div>
          ) : (
            <p className={s.vazio}>Sem dados de assinatura.</p>
          )}
        </div>

        {/* Métricas */}
        <div className="section-card" style={{ marginTop: '16px' }}>
          <div className="section-card-header">
            <div className="section-card-title">Métricas</div>
          </div>
          {metricas ? (
            <div className="metric-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
              <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>{metricas.total_conversas ?? 0}</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Conversas</div>
              </div>
              <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>{metricas.total_escalonamentos ?? 0}</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Escalamentos</div>
              </div>
              <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>{metricas.agendamentos_ativos ?? 0}</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Agendamentos</div>
              </div>
            </div>
          ) : (
            <p className={s.vazio}>Sem métricas disponíveis.</p>
          )}
        </div>
      </div>
    </>
  );
}
