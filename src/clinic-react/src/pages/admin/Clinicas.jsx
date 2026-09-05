import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from './Admin';
import { fetchAdmin } from '../../api/painel-admin';
import s from './Admin.module.scss';

/* ═══ Clinic Types ═══ */
const CLINIC_TYPES = {
  odontologia: { label: 'Odontologia', color: 'blue' },
  ortodontia: { label: 'Ortodontia', color: 'purple' },
  dermatologia: { label: 'Dermatologia', color: 'green' },
  psicologia: { label: 'Psicologia', color: 'orange' },
  fisioterapia: { label: 'Fisioterapia', color: 'blue' },
  otorrinolaringologia: { label: 'Otorrino', color: 'purple' },
  oftalmologia: { label: 'Oftalmologia', color: 'green' },
  ginecologia: { label: 'Ginecologia', color: 'orange' },
  urologia: { label: 'Urologia', color: 'blue' },
  ortopedia: { label: 'Ortopedia', color: 'purple' },
  endocrinologia: { label: 'Endocrinologia', color: 'green' },
  cardiologia: { label: 'Cardiologia', color: 'red' },
  pediatria: { label: 'Pediatria', color: 'orange' },
  clinica_geral: { label: 'Clínica Geral', color: 'blue' },
  nutricao: { label: 'Nutrição', color: 'green' },
  estetica: { label: 'Estética', color: 'purple' },
  cirurgia_plastica: { label: 'Cirurgia Plástica', color: 'orange' },
  radiologia: { label: 'Radiologia', color: 'blue' },
  patologia: { label: 'Patologia', color: 'purple' },
  DEFAULT: { label: 'Clínica', color: 'muted' },
};

/* ═══ SVG Icons ═══ */
const Icons = {
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
    </svg>
  ),
  grid: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  edit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  mail: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" />
    </svg>
  ),
  eye: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
    </svg>
  ),
};

function getClinicType(type) {
  if (!type) return CLINIC_TYPES.DEFAULT;
  const key = type.toLowerCase().replace(/[\s-]/g, '_');
  return CLINIC_TYPES[key] || CLINIC_TYPES.DEFAULT;
}

function ClinicCard({ clinica }) {
  const ct = getClinicType(clinica.tipo);
  return (
    <div className={s.clinicCard}>
      <div className={s.clinicCardTop}>
        <div>
          <div className={s.clinicCardName}>{clinica.clinica}</div>
          <div className={s.clinicCardType}>{ct.label}</div>
        </div>
        <span className={`badge badge-${ct.color}`}>
          {clinica.status || '—'}
        </span>
      </div>

      {clinica.especialidades && clinica.especialidades.length > 0 && (
        <div className={s.specialtyTags} style={{ marginBottom: '12px' }}>
          {clinica.especialidades.slice(0, 3).map((esp, i) => (
            <span key={i} className={s.specialtyTag}>{esp}</span>
          ))}
          {clinica.especialidades.length > 3 && (
            <span className={s.specialtyTag}>+{clinica.especialidades.length - 3}</span>
          )}
        </div>
      )}

      <div className={s.clinicCardStats}>
        <div className={s.clinicStat}>
          <div className="val">{clinica.tempo_pausa_minutos || 10}</div>
          <div className="lbl">Pausa</div>
        </div>
        <div className={s.clinicStat}>
          <div className="val">{clinica.plano || 'Trial'}</div>
          <div className="lbl">Plano</div>
        </div>
        <div className={s.clinicStat}>
          <div className="val">{new Date(clinica.criado_em).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })}</div>
          <div className="lbl">Desde</div>
        </div>
      </div>

      <div className={s.clinicCardActions}>
        <button className="btn btn-ghost btn-sm">{Icons.edit} Editar</button>
        <button className="btn btn-ghost btn-sm">{Icons.mail} Convite</button>
        <button className="btn btn-ghost btn-sm">{Icons.eye} Ver</button>
      </div>
    </div>
  );
}

export default function Clinicas() {
  const [clinicas, setClinicas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [viewMode, setViewMode] = useState('grid');
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    fetchAdmin('clinicas').then((result) => {
      setLoading(false);
      if (result.ok) {
        setClinicas(result.body.clinicas || []);
      } else {
        setError('Não foi possível carregar as clínicas.');
      }
    });
  }, []);

  const filtered = clinicas.filter((c) => {
    const matchSearch = !search || c.clinica?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'todos' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statusCounts = {
    todos: clinicas.length,
    ativo: clinicas.filter((c) => c.status === 'ativo').length,
    trial: clinicas.filter((c) => c.status === 'trial').length,
    cancelado: clinicas.filter((c) => c.status === 'cancelado').length,
  };

  return (
    <AdminLayout>
      <div className="panel-header">
        <h1>Clínicas</h1>
        <p className="panel-desc">Gerenciar clínicas, planos e assinaturas.</p>
      </div>

      <div className="panel-body">
        {error ? (
          <div className="section-card" style={{ color: '#dc2626' }}>{error}</div>
        ) : (
          <>
            {/* Filter Bar */}
            <div className={s.filterBar}>
              <div className={s.filterSearch}>
                {Icons.search}
                <input
                  type="text"
                  placeholder="Buscar clínica..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className={s.filterChips}>
                {['todos', 'ativo', 'trial', 'cancelado'].map((st) => (
                  <button
                    key={st}
                    className={`${s.filterChip} ${statusFilter === st ? s.chipActive : ''}`}
                    onClick={() => setStatusFilter(st)}
                  >
                    {st === 'todos' ? 'Todos' : st.charAt(0).toUpperCase() + st.slice(1)}
                    <span style={{ marginLeft: 4, opacity: 0.7 }}>({statusCounts[st]})</span>
                  </button>
                ))}
              </div>
              <div className={s.viewToggle}>
                <button
                  className={`${s.viewToggleBtn} ${viewMode === 'grid' ? s.active : ''}`}
                  onClick={() => setViewMode('grid')}
                >
                  {Icons.grid}
                </button>
                <button
                  className={`${s.viewToggleBtn} ${viewMode === 'list' ? s.active : ''}`}
                  onClick={() => setViewMode('list')}
                >
                  {Icons.list}
                </button>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => navigate('/admin/clinicas/nova')}
              >
                + Nova clínica
              </button>
            </div>

            {/* Content */}
            {loading ? (
              <p className={s.vazio}>Carregando clínicas…</p>
            ) : filtered.length === 0 ? (
              <p className={s.vazio}>
                {search || statusFilter !== 'todos'
                  ? 'Nenhuma clínica encontrada com os filtros aplicados.'
                  : 'Nenhuma clínica cadastrada ainda.'}
              </p>
            ) : viewMode === 'grid' ? (
              <div className={s.clinicGrid}>
                {filtered.map((c) => (
                  <ClinicCard key={c.id} clinica={c} />
                ))}
              </div>
            ) : (
              <div className="section-card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Clínica</th>
                      <th>Tipo</th>
                      <th>Status</th>
                      <th>Plano</th>
                      <th>Pausa</th>
                      <th>Criada em</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => {
                      const ct = getClinicType(c.tipo);
                      return (
                        <tr key={c.id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{c.clinica}</div>
                            {c.especialidades && c.especialidades.length > 0 && (
                              <div className={s.specialtyTags} style={{ marginTop: '4px' }}>
                                {c.especialidades.slice(0, 2).map((esp, i) => (
                                  <span key={i} className={s.specialtyTag}>{esp}</span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td>
                            <span className={`badge badge-${ct.color}`}>{ct.label}</span>
                          </td>
                          <td>
                            <span className={`badge ${
                              c.status === 'ativo' ? 'badge-green' :
                              c.status === 'trial' ? 'badge-orange' : 'badge-muted'
                            }`}>
                              {c.status || '—'}
                            </span>
                          </td>
                          <td style={{ fontSize: '13px', fontWeight: 600 }}>{c.plano || 'Trial'}</td>
                          <td style={{ fontSize: '12px', color: '#64748b' }}>{c.tempo_pausa_minutos || 10} min</td>
                          <td style={{ fontSize: '12px', color: '#64748b' }}>
                            {new Date(c.criado_em).toLocaleString('pt-BR')}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button className="btn btn-ghost btn-sm">{Icons.edit}</button>
                              <button className="btn btn-ghost btn-sm">{Icons.mail}</button>
                              <button className="btn btn-ghost btn-sm">{Icons.eye}</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
