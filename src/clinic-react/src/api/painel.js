/**
 * API client for the clinic painel (React app).
 * All endpoints are under /api/clinica/ and require session auth.
 */

const BASE = '';

async function request(url, options = {}) {
  const res = await fetch(`${BASE}${url}`, {
    headers: { Accept: 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    return { ok: false, status: res.status, body: data };
  }
  return { ok: true, body: data };
}

// ── Config (horarios, precos, convenios, mensagem) ──

export function fetchConfig() {
  return request('/api/clinica/painel-acoes?acao=config');
}

export function saveConfig(config) {
  return request('/api/clinica/config-salvar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}

// ── Agenda ──

export function fetchAgenda() {
  return request('/api/clinica/agenda-listar');
}

export function criarAgendamento(dados) {
  return request('/api/clinica/painel-acoes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'criar_agendamento', ...dados }),
  });
}

export function remarcarAgendamento(agendamento_id, nova_data_hora) {
  return request('/api/clinica/painel-acoes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'remarcar_agendamento', agendamento_id, nova_data_hora }),
  });
}

export function cancelarAgendamento(agendamento_id) {
  return request('/api/clinica/painel-acoes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'cancelar_agendamento', agendamento_id }),
  });
}

// ── Métricas ──

export function fetchMetricas() {
  return request('/api/clinica/painel-acoes?acao=metricas');
}

// ── Conversas ──

export function fetchConversas() {
  return request('/api/clinica/painel-acoes?acao=conversas');
}

// ── Feriados ──

export function fetchFeriados() {
  return request('/api/clinica/painel-acoes?acao=feriados');
}

export function adicionarFeriado(data, nome) {
  return request('/api/clinica/painel-acoes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'adicionar_feriado', data, nome }),
  });
}

export function removerFeriado(id) {
  return request('/api/clinica/painel-acoes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'remover_feriado', id }),
  });
}

// ── Pausa ──

export function salvarTempoPausa(tempo_pausa_minutos) {
  return request('/api/clinica/painel-acoes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'tempo_pausa', tempo_pausa_minutos }),
  });
}

// ── Conversa pausa/retomar ──

export function pausarConversa(telefone, clinica) {
  return request('/api/clinica/painel-acoes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'pausar_conversa', telefone, clinica }),
  });
}

export function retomarConversa(telefone, clinica) {
  return request('/api/clinica/painel-acoes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'retomar_conversa', telefone, clinica }),
  });
}

// ── Perfil ──

export function atualizarPerfil(dados) {
  return request('/api/clinica/painel-acoes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'atualizar_perfil', ...dados }),
  });
}

// ── Exportar CSV ──

export function exportarCSV(query = {}) {
  const params = new URLSearchParams(query).toString();
  return request(`/api/clinica/painel-acoes?acao=exportar${params ? '&' + params : ''}`);
}

// ── Logout ──

export function logout() {
  return request('/api/clinica/painel-acoes?acao=logout');
}
