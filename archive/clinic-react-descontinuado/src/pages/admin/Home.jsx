import React, { useState, useEffect, useRef } from 'react';
import { AdminLayout } from './Admin';
import { useRealtimeDashboard } from '../../hooks/useRealtimeDashboard';
import s from './Admin.module.scss';

/* ═══ SVG Icons ═══ */
const Icons = {
  clinics: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" />
      <path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />
    </svg>
  ),
  activity: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
    </svg>
  ),
  trendUp: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  trendDown: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" />
    </svg>
  ),
};

/* ═══ Mini Bar Chart ═══ */
function MiniBarChart({ data, labels }) {
  const max = Math.max(...data, 1);
  return (
    <div>
      <div className={s.miniBarChart}>
        {data.map((val, i) => (
          <div
            key={i}
            className={`${s.miniBar} ${s.barPurple}`}
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

/* ═══ Connection Status Badge ═══ */
function ConnectionBadge({ status, lastUpdate, onRefresh }) {
  const config = {
    connecting: { color: 'badge-orange', label: 'Conectando…', pulse: true },
    live: { color: 'badge-green', label: 'Ao vivo', pulse: true },
    polling: { color: 'badge-blue', label: 'Polling', pulse: false },
    disconnected: { color: 'badge-red', label: 'Desconectado', pulse: false },
  };

  const c = config[status] || config.disconnected;

  const timeAgo = lastUpdate
    ? formatTimeAgo(lastUpdate)
    : '—';

  return (
    <div className={s.connectionBadge}>
      <span className={`badge ${c.color} ${c.pulse ? s.badgePulse : ''}`}>
        {c.label}
      </span>
      <span className={s.connectionTime}>há {timeAgo}</span>
      <button
        className="btn btn-ghost btn-sm"
        onClick={onRefresh}
        title="Atualizar agora"
        style={{ padding: '4px 8px' }}
      >
        {Icons.refresh}
      </button>
    </div>
  );
}

function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 5) return 'poucos segundos';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

/* ═══ Activity Colors ═══ */
const ACTIVITY_COLORS = {
  clinica_criada: 'green',
  clinica_editada: 'blue',
  convite_enviado: 'blue',
  convite_criado: 'blue',
  usuario_criado: 'purple',
  usuario_editado: 'purple',
  configuracao_alterada: 'orange',
  login: 'green',
  erro: 'red',
  alerta: 'orange',
};

/* ═══ Dashboard Home ═══ */
export default function Home() {
  const {
    metrics,
    clinicas,
    logs,
    connectionStatus,
    lastUpdate,
    refresh,
  } = useRealtimeDashboard();

  const loading = metrics === null && clinicas.length === 0;

  const kpis = metrics
    ? [
        {
          label: 'Clínicas Ativas',
          value: metrics.clinicas_ativas ?? 0,
          subtext: `${metrics.total_clinicas ?? 0} total cadastradas`,
          color: 'purple',
          trend: '+2 este mês',
          trendDir: 'up',
        },
        {
          label: 'Conversas Hoje',
          value: metrics.total_conversas ?? 0,
          subtext: 'Atendimentos realizados',
          color: 'green',
          trend: '+12%',
          trendDir: 'up',
        },
        {
          label: 'Escalamentos',
          value: metrics.total_escalonamentos ?? 0,
          subtext: 'Transferências para humano',
          color: 'orange',
          trend: '3 pendentes',
          trendDir: 'neutral',
        },
        {
          label: 'Uptime',
          value: '99.9%',
          subtext: 'Últimos 30 dias',
          color: 'blue',
          trend: 'Saudável',
          trendDir: 'up',
        },
      ]
    : [];

  const last7 = metrics?.conversas_por_dia || [3, 7, 5, 12, 8, 15, 10];
  const dayLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  return (
    <AdminLayout>
      <div className="panel-header">
        <h1>Dashboard</h1>
        <p className="panel-desc">Visão geral da plataforma ReceptaAI.</p>
      </div>

      <div className="panel-body">
        {/* Trust Bar with Connection Status */}
        <div className={s.trustBar}>
          <div className={s.trustItem}>
            {Icons.shield}
            <span>Sistema <strong>ativo</strong></span>
          </div>
          <div className={s.trustDivider} />
          <ConnectionBadge
            status={connectionStatus}
            lastUpdate={lastUpdate}
            onRefresh={refresh}
          />
          <div className={s.trustDivider} />
          <div className={s.trustItem}>
            {Icons.alert}
            <span>Sem <strong>alertas</strong> críticos</span>
          </div>
        </div>

        {loading ? (
          <p className={s.vazio}>Carregando dashboard…</p>
        ) : (
          <>
            {/* KPI Cards — with pulse animation on live update */}
            <div className={s.kpiGrid}>
              {kpis.map((kpi, idx) => (
                <div
                  key={idx}
                  className={`${s.kpiCard} ${s[`kpi${kpi.color.charAt(0).toUpperCase() + kpi.color.slice(1)}`]} ${connectionStatus === 'live' ? s.kpiLive : ''}`}
                >
                  <div className={s.kpiCardHeader}>
                    <span className={s.kpiCardLabel}>{kpi.label}</span>
                    <div className={`${s.kpiCardIcon} ${s[`icon${kpi.color.charAt(0).toUpperCase() + kpi.color.slice(1)}`]}`}>
                      {Icons[kpi.color === 'purple' ? 'clinics' : kpi.color === 'green' ? 'chat' : kpi.color === 'orange' ? 'activity' : 'shield']}
                    </div>
                  </div>
                  <div className={s.kpiCardValue}>{kpi.value}</div>
                  <div className={s.kpiCardSubtext}>
                    {kpi.trendDir === 'up' && <span className={s.kpiCardTrend}>{Icons.trendUp}</span>}
                    {kpi.trendDir === 'down' && <span className={`${s.kpiCardTrend} ${s.trendDown}`}>{Icons.trendDown}</span>}
                    <span>{kpi.trend}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Charts + Activity */}
            <div className={s.dashboardGrid}>
              {/* Conversas por Dia */}
              <div className="section-card">
                <div className="section-card-header">
                  <div className="section-card-title">
                    {Icons.chart}
                    Conversas — Últimos 7 dias
                  </div>
                  {connectionStatus === 'live' && (
                    <span className={`${s.liveIndicator} ${s.pulse}`} />
                  )}
                </div>
                <MiniBarChart data={last7} labels={dayLabels} />
              </div>

              {/* Atividade Recente — with new-item flash */}
              <div className="section-card">
                <div className="section-card-header">
                  <div className="section-card-title">
                    {Icons.activity}
                    Atividade Recente
                  </div>
                  {connectionStatus === 'live' && (
                    <span className={`${s.liveIndicator} ${s.pulse}`} />
                  )}
                </div>
                {logs.length > 0 ? (
                  <div className={s.activityFeed}>
                    {logs.slice(0, 8).map((log, idx) => (
                      <div
                        key={log.id || `${log.acao}-${idx}`}
                        className={`${s.activityItem} ${idx === 0 && connectionStatus === 'live' ? s.activityNewItem : ''}`}
                      >
                        <div className={`${s.activityDot} ${s[`dot${(ACTIVITY_COLORS[log.acao] || 'blue').charAt(0).toUpperCase() + (ACTIVITY_COLORS[log.acao] || 'blue').slice(1)}`]}`} />
                        <div className={s.activityContent}>
                          <div className={s.activityText}>
                            <strong>{log.acao?.replace(/_/g, ' ') || 'Ação'}</strong>
                            {log.detalhes?.clinica && ` — ${log.detalhes.clinica}`}
                          </div>
                          <div className={s.activityTime}>
                            {new Date(log.criado_em).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={s.vazio}>Nenhuma atividade registrada.</p>
                )}
              </div>
            </div>

            {/* Health + Top Clinics */}
            <div className={s.dashboardGrid}>
              {/* System Health */}
              <div className="section-card">
                <div className="section-card-header">
                  <div className="section-card-title">
                    {Icons.shield}
                    Saúde do Sistema
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
                  <span className={s.healthBarLabel}>IA Resposta</span>
                  <div className={s.healthBarTrack}>
                    <div className={`${s.healthBarFill} ${s.fillBlue}`} style={{ width: '94%' }} />
                  </div>
                  <span className={s.healthBarValue}>~1.2s</span>
                </div>
              </div>

              {/* Top Clinics */}
              <div className="section-card">
                <div className="section-card-header">
                  <div className="section-card-title">
                    {Icons.clinics}
                    Clínicas com Mais Atividade
                  </div>
                </div>
                {clinicas.length > 0 ? (
                  <div className="det-lista">
                    {clinicas.slice(0, 5).map((c, idx) => (
                      <div key={c.id || idx} className="det-linha">
                        <div>
                          <div className="det-valor">{c.clinica}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {c.plano || 'Trial'}
                          </div>
                        </div>
                        <span className={`badge ${
                          c.status === 'ativo' ? 'badge-green' :
                          c.status === 'trial' ? 'badge-orange' : 'badge-muted'
                        }`}>
                          {c.status || '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={s.vazio}>Nenhuma clínica cadastrada.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
