const BASE = '';

export async function loginClinica(credentials) {
  const res = await fetch(`${BASE}/api/clinica/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });

  const data = await res.json();

  if (!res.ok) {
    return { ok: false, status: res.status, body: data };
  }

  return { ok: true, body: data };
}

export * from './supabase';
