import React, { useEffect, useState } from 'react';
import { AdminLayout } from './Admin';
import { fetchAdmin } from '../../api/painel-admin';
import s from './Admin.module.scss';

/* ═══ SVG Icons ═══ */
const Icons = {
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
};

const ACTION_COLORS = {
  clinica_criada: 'green',
  clinica_editada: 'blue',
  convite_enviado: 'blue',
  convite_criado: 'blue',
  usuario_criado: 'purple',
  usuario_editado: 'purple',
  configuracao_alterada: 'orange',
  login: 'green',
  logout: 'muted',
  erro: 'red',
  alerta: 'orange',
};

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchAdmin('logs', { limit: 100 }).then((result) => {
      setLoading(false);
      if (result.ok) {
        setLogs(result.body.logs || []);
      }
    });
  }, []);

  const filtered = logs.filter((l) =>
    !search ||
    l.acao?.toLowerCase().includes(search.toLowerCase()) ||
    JSON.stringify(l.detalhes || {}).toLowerCase().includes(search.toLowerCase())
  );

  const actionBadge = (acao) => {
    const color = ACTION_COLORS[acao] || 'muted';
    return (
      <span className={`badge badge-${color}`}>
        {(acao || '—').replace(/_/g, ' ')}
      </span>
    );
  };

  return (
    <AdminLayout>
      <div className="panel-header">
        <h1>Auditoria</h1>
        <p className="panel-desc">Registro de ações administrativas do sistema.</p>
      </div>

      <div className="panel-body">
        {/* Filter */}
        <div className={s.filterBar}>
          <div className={s.filterSearch}>
            {Icons.search}
            <input
              type="text"
              placeholder="Buscar nos logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <p className={s.vazio}>Carregando logs…</p>
        ) : filtered.length === 0 ? (
          <p className={s.vazio}>
            {search ? 'Nenhum log encontrado.' : 'Nenhum registro de auditoria.'}
          </p>
        ) : (
          <div className="section-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Data / Hora</th>
                  <th>Ação</th>
                  <th>Detalhes</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                        {new Date(l.criado_em).toLocaleDateString('pt-BR')}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {new Date(l.criado_em).toLocaleTimeString('pt-BR')}
                      </div>
                    </td>
                    <td>{actionBadge(l.acao)}</td>
                    <td>
                      <div
                        style={{
                          fontSize: '12px',
                          maxWidth: '300px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: '#475569',
                        }}
                      >
                        {l.detalhes?.clinica && (
                          <span style={{ fontWeight: 600 }}>{l.detalhes.clinica}</span>
                        )}
                        {l.detalhes?.mensagem && ` — ${l.detalhes.mensagem}`}
                        {!l.detalhes?.clinica && !l.detalhes?.mensagem && (
                          <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                            {JSON.stringify(l.detalhes || {})}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace' }}>
                        {l.ip || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
