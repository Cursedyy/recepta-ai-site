import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AdminLayout } from './Admin';
import s from './Admin.module.scss';

export default function UsuarioView() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Placeholder — in production, load via API
  return (
    <AdminLayout>
      <div className="panel-header">
        <h1>Detalhes do Usuário</h1>
        <p className="panel-desc">Visualizar informações e atividade do usuário.</p>
      </div>

      <div className="panel-body">
        <div className="section-card" style={{ maxWidth: '500px' }}>
          {/* Profile Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'var(--brand-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 800,
              fontSize: '20px',
            }}>
              ?
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>Carregando…</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>ID: {id || '—'}</div>
            </div>
          </div>

          <div className="det-lista">
            <div className="det-linha">
              <span className="det-rotulo">Email</span>
              <span className="det-valor">—</span>
            </div>
            <div className="det-linha">
              <span className="det-rotulo">Clínica</span>
              <span className="det-valor">—</span>
            </div>
            <div className="det-linha">
              <span className="det-rotulo">Papel</span>
              <span className="det-valor">—</span>
            </div>
            <div className="det-linha">
              <span className="det-rotulo">Criado em</span>
              <span className="det-valor">—</span>
            </div>
          </div>

          <div style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-ghost"
              onClick={() => navigate(`/admin/usuarios/${id}/edit`)}
            >
              Editar
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => navigate('/admin/usuarios')}
            >
              Voltar
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
