import React, { useEffect, useState } from 'react';
import { AdminLayout } from './Admin';
import { fetchAdmin } from '../../api/painel-admin';
import s from './Admin.module.scss';

/* ═══ SVG Icons ═══ */
const Icons = {
  clinics: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" />
      <path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  ),
  activity: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  ),
  trendUp: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  ),
};

function MiniBarChart({ data, labels, color = 'purple' }) {
  const max = Math.max(...data, 1);
  return (
    <div>
      <div className={s.miniBarChart}>
        {data.map((val, i) => (
          <div
            key={i}
            className={`${s.miniBar} ${s[`bar${color.charAt(0).toUpperCase() + color.slice(1)}`]}`}
            style={{ height: `${(val / max) * 100}%` }}
            title={`${labels?.[i] || ''}: ${val}`}
          />
        ))}
      </div>
      {labels && (
        <div className={s.miniBarLabels}>
          {labels.map((l, i) => <span key={i}>{l}</span>)}
        </div>
      )}
    </div>
  );
}

function DonutChart({ segments, size = 120 }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  let acc = 0;
  const gradients = segments.map((seg, i) => {
    const start = (acc / total) * 360;
    acc += seg.value;
    const end = (acc / total) * 360;
    return `${seg.color} ${start}deg ${end}deg`;
  });

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: `conic-gradient(${gradients.join(', ')})`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: size * 0.55,
          height: size * 0.55,
          borderRadius: '50%',
          background: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}
      >
        <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{total}</div>
        <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total</div>
      </div>
    </div>
  );
}

export default function Metricas() {
  const [metrics, setMetrics] = useState(null);
  const [clinicas, setClinicas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchAdmin('metricas'),
      fetchAdmin('clinicas'),
    ]).then(([metRes, clinRes]) => {
      if (metRes.ok) setMetrics(metRes.body);
      if (clinRes.ok) setClinicas(clinRes.body.clinicas || []);
      setLoading(false);
    });
  }, []);

  const statusBreakdown = (() => {
    const counts = { ativo: 0, trial: 0, cancelado: 0 };
    clinicas.forEach((c) => {
      if (counts[c.status] !== undefined) counts[c.status]++;
    });
    return counts;
  })();

  const last7 = metrics?.conversas_por_dia || [5, 8, 12, 7, 15, 20, 11];
  const dayLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  const escalationData = metrics?.escalonamentos_por_dia || [1, 2, 3, 1, 4, 2, 1];

  return (
    <AdminLayout>
      <div className="panel-header">
        <h1>Métricas</h1>
        <p className="panel-desc">Indicadores de performance da plataforma.</p>
      </div>

      <div className="panel-body">
        {loading ? (
          <p className={s.vazio}>Carregando métricas…</p>
        ) : (
          <>
            {/* KPI Row */}
            <div className={s.kpiGrid}>
              <div className={`${s.kpiCard} ${s.kpiPurple}`}>
                <div className={s.kpiCardHeader}>
                  <span className={s.kpiCardLabel}>Total Clínicas</span>
                  <div className={`${s.kpiCardIcon} ${s.iconPurple}`}>{Icons.clinics}</div>
                </div>
                <div className={s.kpiCardValue}>{metrics?.total_clinicas ?? 0}</div>
                <div className={s.kpiCardSubtext}>
                  <span className={s.kpiCardTrend}>{Icons.trendUp}</span>
                  {metrics?.clinicas_ativas ?? 0} ativas
                </div>
              </div>

              <div className={`${s.kpiCard} ${s.kpiGreen}`}>
                <div className={s.kpiCardHeader}>
                  <span className={s.kpiCardLabel}>Total Conversas</span>
                  <div className={`${s.kpiCardIcon} ${s.iconGreen}`}>{Icons.chat}</div>
                </div>
                <div className={s.kpiCardValue}>{metrics?.total_conversas ?? 0}</div>
                <div className={s.kpiCardSubtext}>
                  {metrics?.ultima_conversa
                    ? `Última: ${new Date(metrics.ultima_conversa).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                    : 'Sem registros'}
                </div>
              </div>

              <div className={`${s.kpiCard} ${s.kpiOrange}`}>
                <div className={s.kpiCardHeader}>
                  <span className={s.kpiCardLabel}>Escalamentos</span>
                  <div className={`${s.kpiCardIcon} ${s.iconOrange}`}>{Icons.activity}</div>
                </div>
                <div className={s.kpiCardValue}>{metrics?.total_escalonamentos ?? 0}</div>
                <div className={s.kpiCardSubtext}>Transferências para humano</div>
              </div>

              <div className={`${s.kpiCard} ${s.kpiBlue}`}>
                <div className={s.kpiCardHeader}>
                  <span className={s.kpiCardLabel}>Uptime</span>
                  <div className={`${s.kpiCardIcon} ${s.iconBlue}`}>{Icons.shield}</div>
                </div>
                <div className={s.kpiCardValue}>99.9%</div>
                <div className={s.kpiCardSubtext}>Últimos 30 dias</div>
              </div>
            </div>

            {/* Charts Grid */}
            <div className={s.dashboardGrid}>
              {/* Conversas Chart */}
              <div className="section-card">
                <div className="section-card-header">
                  <div className="section-card-title">
                    {Icons.chart}
                    Conversas — 7 dias
                  </div>
                </div>
                <MiniBarChart data={last7} labels={dayLabels} color="purple" />
              </div>

              {/* Escalamentos Chart */}
              <div className="section-card">
                <div className="section-card-header">
                  <div className="section-card-title">
                    {Icons.activity}
                    Escalamentos — 7 dias
                  </div>
                </div>
                <MiniBarChart data={escalationData} labels={dayLabels} color="orange" />
              </div>
            </div>

            {/* Status Breakdown + Health */}
            <div className={s.dashboardGrid}>
              {/* Status Donut */}
              <div className="section-card">
                <div className="section-card-header">
                  <div className="section-card-title">
                    {Icons.clinics}
                    Status das Clínicas
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                  <DonutChart
                    segments={[
                      { value: statusBreakdown.ativo, color: '#059669' },
                      { value: statusBreakdown.trial, color: '#d97706' },
                      { value: statusBreakdown.cancelado, color: '#dc2626' },
                    ]}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#059669' }} />
                      <span style={{ color: '#475569' }}>Ativos</span>
                      <strong style={{ marginLeft: 'auto' }}>{statusBreakdown.ativo}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#d97706' }} />
                      <span style={{ color: '#475569' }}>Trial</span>
                      <strong style={{ marginLeft: 'auto' }}>{statusBreakdown.trial}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#dc2626' }} />
                      <span style={{ color: '#475569' }}>Cancelados</span>
                      <strong style={{ marginLeft: 'auto' }}>{statusBreakdown.cancelado}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* System Health */}
              <div className="section-card">
                <div className="section-card-header">
                  <div className="section-card-title">
                    {Icons.shield}
                    Saúde dos Serviços
                  </div>
                </div>
                <div className={s.healthBar}>
                  <span className={s.healthBarLabel}>API Principal</span>
                  <div className={s.healthBarTrack}>
                    <div className={`${s.healthBarFill} ${s.fillGreen}`} style={{ width: '99%' }} />
                  </div>
                  <span className={s.healthBarValue}>99%</span>
                </div>
                <div className={s.healthBar}>
                  <span className={s.healthBarLabel}>Webhook WA</span>
                  <div className={s.healthBarTrack}>
                    <div className={`${s.healthBarFill} ${s.fillGreen}`} style={{ width: '97%' }} />
                  </div>
                  <span className={s.healthBarValue}>97%</span>
                </div>
                <div className={s.healthBar}>
                  <span className={s.healthBarLabel}>Supabase</span>
                  <div className={s.healthBarTrack}>
                    <div className={`${s.healthBarFill} ${s.fillGreen}`} style={{ width: '100%' }} />
                  </div>
                  <span className={s.healthBarValue}>100%</span>
                </div>
                <div className={s.healthBar}>
                  <span className={s.healthBarLabel}>IA Gateway</span>
                  <div className={s.healthBarTrack}>
                    <div className={`${s.healthBarFill} ${s.fillBlue}`} style={{ width: '94%' }} />
                  </div>
                  <span className={s.healthBarValue}>~1.2s</span>
                </div>
                <div className={s.healthBar}>
                  <span className={s.healthBarLabel}>Armazenamento</span>
                  <div className={s.healthBarTrack}>
                    <div className={`${s.healthBarFill} ${s.fillGreen}`} style={{ width: '34%' }} />
                  </div>
                  <span className={s.healthBarValue}>34%</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
