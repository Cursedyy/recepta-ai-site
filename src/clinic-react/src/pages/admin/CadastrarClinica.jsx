import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from './Admin';
import { postAdmin } from '../../api/painel-admin';
import s from './Admin.module.scss';

const SPECIALTIES = [
  'Odontologia', 'Ortodontia', 'Dermatologia', 'Psicologia',
  'Fisioterapia', 'Otorrino', 'Oftalmologia', 'Ginecologia',
  'Urologia', 'Ortopedia', 'Endocrinologia', 'Cardiologia',
  'Pediatria', 'Clínica Geral', 'Nutrição', 'Estética',
  'Cirurgia Plástica', 'Radiologia', 'Patologia',
];

const CLINIC_TYPES = [
  { value: 'odontologia', label: 'Odontologia' },
  { value: 'ortodontia', label: 'Ortodontia' },
  { value: 'dermatologia', label: 'Dermatologia' },
  { value: 'psicologia', label: 'Psicologia' },
  { value: 'fisioterapia', label: 'Fisioterapia' },
  { value: 'otorrinolaringologia', label: 'Otorrino' },
  { value: 'oftalmologia', label: 'Oftalmologia' },
  { value: 'ginecologia', label: 'Ginecologia' },
  { value: 'urologia', label: 'Urologia' },
  { value: 'ortopedia', label: 'Ortopedia' },
  { value: 'endocrinologia', label: 'Endocrinologia' },
  { value: 'cardiologia', label: 'Cardiologia' },
  { value: 'pediatria', label: 'Pediatria' },
  { value: 'clinica_geral', label: 'Clínica Geral' },
  { value: 'nutricao', label: 'Nutrição' },
  { value: 'estetica', label: 'Estética' },
  { value: 'cirurgia_plastica', label: 'Cirurgia Plástica' },
  { value: 'outro', label: 'Outro' },
];

export default function CadastrarClinica() {
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('');
  const [especialidades, setEspecialidades] = useState([]);
  const [plano, setPlano] = useState('trial');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sucesso, setSucesso] = useState(false);
  const navigate = useNavigate();

  function toggleEspecialidade(esp) {
    setEspecialidades((prev) =>
      prev.includes(esp) ? prev.filter((e) => e !== esp) : [...prev, esp]
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    const result = await postAdmin({
      acao: 'criar_clinica',
      nome: nome.trim(),
      tipo,
      especialidades,
      plano,
    });
    setSubmitting(false);

    if (result.ok) {
      setSucesso(true);
      setTimeout(() => navigate('/admin/clinicas'), 1500);
    } else {
      setError(result.body?.erro || 'Erro ao criar clínica.');
    }
  }

  return (
    <AdminLayout>
      <div className="panel-header">
        <h1>Nova Clínica</h1>
        <p className="panel-desc">Criar clínica e configurar ambiente de trial.</p>
      </div>

      <div className="panel-body">
        <div className="section-card" style={{ maxWidth: '600px' }}>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label className="field-label">Nome da clínica *</label>
              <input
                className="field-input"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Clínica Saúde+"
                required
              />
            </div>

            <div className="field">
              <label className="field-label">Especialidade principal</label>
              <select
                className="field-input"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
              >
                <option value="">Selecione...</option>
                {CLINIC_TYPES.map((ct) => (
                  <option key={ct.value} value={ct.value}>{ct.label}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field-label">Especialidades adicionais</label>
              <div className={s.specialtyTags} style={{ marginTop: '4px' }}>
                {SPECIALTIES.map((esp) => (
                  <button
                    key={esp}
                    type="button"
                    className={`${s.filterChip} ${especialidades.includes(esp) ? s.chipActive : ''}`}
                    onClick={() => toggleEspecialidade(esp)}
                    style={{ fontSize: '11px' }}
                  >
                    {esp}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label className="field-label">Plano inicial</label>
              <select
                className="field-input"
                value={plano}
                onChange={(e) => setPlano(e.target.value)}
              >
                <option value="trial">Trial (14 dias)</option>
                <option value="basico">Básico</option>
                <option value="profissional">Profissional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>

            {error && <div className="modal-error">{error}</div>}

            {sucesso && (
              <div style={{
                background: '#ecfdf5',
                color: '#059669',
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 600,
                marginBottom: '16px',
              }}>
                ✓ Clínica criada com sucesso! Redirecionando…
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => navigate('/admin/clinicas')}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={submitting || !nome.trim()}
              >
                {submitting ? 'Criando…' : 'Criar Clínica'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}
