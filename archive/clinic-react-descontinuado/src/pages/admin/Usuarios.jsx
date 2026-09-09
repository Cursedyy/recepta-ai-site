import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  edit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  eye: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ),
};

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    fetchAdmin('usuarios').then((result) => {
      setLoading(false);
      if (result.ok) {
        setUsuarios(result.body.usuarios || []);
      }
    });
  }, []);

  const filtered = usuarios.filter((u) =>
    !search || u.nome?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const papelBadge = (papel) => {
    const map = {
      admin: { text: 'Admin', className: 'badge-purple' },
      operador: { text: 'Operador', className: 'badge-blue' },
      atendente: { text: 'Atendente', className: 'badge-green' },
    };
    return map[papel] || { text: papel || '—', className: 'badge-muted' };
  };

  return (
    <AdminLayout>
      <div className="panel-header">
        <h1>Usuários</h1>
        <p className="panel-desc">Gerenciar contas de acesso ao painel.</p>
      </div>

      <div className="panel-body">
        {/* Filter */}
        <div className={s.filterBar}>
          <div className={s.filterSearch}>
            {Icons.search}
            <input
              type="text"
              placeholder="Buscar usuário..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <p className={s.vazio}>Carregando usuários…</p>
        ) : filtered.length === 0 ? (
          <p className={s.vazio}>
            {search ? 'Nenhum usuário encontrado.' : 'Nenhum usuário cadastrado.'}
          </p>
        ) : (
          <div className="section-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Clínica</th>
                  <th>Papel</th>
                  <th>Status</th>
                  <th>Criado em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const pb = papelBadge(u.papel);
                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: 'var(--brand-gradient)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontWeight: 700,
                            fontSize: '12px',
                            flexShrink: 0,
                          }}>
                            {(u.nome || u.email || '?').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '13px' }}>{u.nome || '—'}</div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: '13px' }}>{u.clinica_nome || '—'}</td>
                      <td>
                        <span className={`badge ${pb.className}`}>{pb.text}</span>
                      </td>
                      <td>
                        <span className={`badge ${u.ativo !== false ? 'badge-green' : 'badge-red'}`}>
                          {u.ativo !== false ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: '#64748b' }}>
                        {u.criado_em
                          ? new Date(u.criado_em).toLocaleString('pt-BR')
                          : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => navigate(`/admin/usuarios/${u.id}`)}
                          >
                            {Icons.eye}
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => navigate(`/admin/usuarios/${u.id}/edit`)}
                          >
                            {Icons.edit}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
