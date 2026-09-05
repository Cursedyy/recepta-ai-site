import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AdminLayout } from './Admin';
import s from './Admin.module.scss';

export default function UsuariosEdicao() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState('atendente');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    // TODO: POST to API
    setTimeout(() => {
      setSaving(false);
      navigate(`/admin/usuarios/${id}`);
    }, 800);
  }

  return (
    <AdminLayout>
      <div className="panel-header">
        <h1>Editar Usuário</h1>
        <p className="panel-desc">Alterar informações do usuário.</p>
      </div>

      <div className="panel-body">
        <div className="section-card" style={{ maxWidth: '500px' }}>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label className="field-label">Nome</label>
              <input
                className="field-input"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do usuário"
              />
            </div>

            <div className="field">
              <label className="field-label">Email</label>
              <input
                className="field-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
              />
            </div>

            <div className="field">
              <label className="field-label">Papel</label>
              <select
                className="field-input"
                value={papel}
                onChange={(e) => setPapel(e.target.value)}
              >
                <option value="admin">Admin</option>
                <option value="operador">Operador</option>
                <option value="atendente">Atendente</option>
              </select>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => navigate(`/admin/usuarios/${id}`)}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={saving}
              >
                {saving ? 'Salvando…' : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}
