import React, { useEffect, useState } from 'react';
import { AdminLayout } from './Admin';
import { fetchAdmin } from '../../api/painel-admin';
import s from './Admin.module.scss';

/* ═══ SVG Icons ═══ */
const Icons = {
  copy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  ),
  mail: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" />
    </svg>
  ),
  reset: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
    </svg>
  ),
};

export default function Convites() {
  const [convites, setConvites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchAdmin('convites').then((result) => {
      setLoading(false);
      if (result.ok) {
        setConvites(result.body.convites || []);
      }
    });
  }, []);

  function copiarLink(token) {
    const link = `https://www.receptaai.com.br/clinica/definir-senha/${token}`;
    navigator.clipboard.writeText(link);
  }

  const tipoLabel = (tipo) => {
    const map = {
      convite: { text: 'Convite', className: 'badge-blue' },
      reset_senha: { text: 'Reset Senha', className: 'badge-orange' },
    };
    return map[tipo] || { text: tipo || '—', className: 'badge-muted' };
  };

  return (
    <AdminLayout>
      <div className="panel-header">
        <h1>Convites Pendentes</h1>
        <p className="panel-desc">Links de convite e reset de senha aguardando uso.</p>
      </div>

      <div className="panel-body">
        {loading ? (
          <p className={s.vazio}>Carregando convites…</p>
        ) : convites.length === 0 ? (
          <p className={s.vazio}>Nenhum convite pendente.</p>
        ) : (
          <div className="section-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Clínica</th>
                  <th>Tipo</th>
                  <th>Expira em</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {convites.map((c) => {
                  const tl = tipoLabel(c.tipo);
                  const expirado = new Date(c.expira_em) < new Date();
                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.clinica_nome || '—'}</div>
                      </td>
                      <td>
                        <span className={`badge ${tl.className}`}>{tl.text}</span>
                      </td>
                      <td style={{ fontSize: '12px', color: '#64748b' }}>
                        {new Date(c.expira_em).toLocaleString('pt-BR')}
                      </td>
                      <td>
                        <span className={`badge ${expirado ? 'badge-red' : 'badge-green'}`}>
                          {expirado ? 'Expirado' : 'Pendente'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => copiarLink(c.token)}
                            title="Copiar link"
                          >
                            {Icons.copy} Copiar
                          </button>
                          <button className="btn btn-ghost btn-sm" title="Reenviar">
                            {Icons.mail}
                          </button>
                          <button className="btn btn-icon btn-sm" title="Excluir">
                            {Icons.trash}
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
