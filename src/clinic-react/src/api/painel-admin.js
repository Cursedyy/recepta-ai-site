const BASE = '';

export async function fetchAdmin(action, params = {}) {
  const url = new URL(`${BASE}/api/painel/admin`);
  url.searchParams.set('acao', action);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  });

  const data = await res.json();
  if (!res.ok) {
    return { ok: false, status: res.status, body: data };
  }

  return { ok: true, body: data };
}

export async function postAdmin(body) {
  const res = await fetch(`${BASE}/api/painel/admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    return { ok: false, status: res.status, body: data };
  }

  return { ok: true, body: data };
}

export * from './supabase';
