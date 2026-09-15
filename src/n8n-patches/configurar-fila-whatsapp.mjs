import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const id = 'elFchoRzp2dzbweH';
const base = (process.env.N8N_BASE_URL || 'https://n8n.zapscout.com.br').replace(/\/$/, '');
const key = process.env.N8N_API_KEY;
if (!key) throw new Error('N8N_API_KEY ausente');
const headers = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' };
const api = async (method, path, body) => {
  const r = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
};

const wf = await api('GET', `/api/v1/workflows/${id}`);
const backupDir = resolve('tmp-backup-workflows-deletados');
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = join(backupDir, `${id}-pre-fila-whatsapp-${stamp}.json`);
writeFileSync(backup, JSON.stringify(wf, null, 2));
console.log(`backup=${backup}`);

const config = wf.nodes.find((n) => n.name === 'Config Fixa');
if (!config) throw new Error('Node Config Fixa não encontrado');
const assignments = config.parameters?.assignments?.assignments || [];
const existing = assignments.find((a) => a.name === 'fila_whatsapp_enabled');
if (existing) {
  existing.type = 'boolean';
  existing.value = false;
} else {
  assignments.push({ id: 'fila_whatsapp_enabled', name: 'fila_whatsapp_enabled', type: 'boolean', value: false });
}
config.parameters.assignments.assignments = assignments;

const payload = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: { executionOrder: wf.settings?.executionOrder || 'v1', ...(wf.settings?.errorWorkflow ? { errorWorkflow: wf.settings.errorWorkflow } : {}) } };
await api('PUT', `/api/v1/workflows/${id}`, payload);
if (wf.active) await api('POST', `/api/v1/workflows/${id}/activate`);
const after = await api('GET', `/api/v1/workflows/${id}`);
const live = after.nodes.find((n) => n.name === 'Config Fixa');
const flag = live?.parameters?.assignments?.assignments?.find((a) => a.name === 'fila_whatsapp_enabled');
console.log(JSON.stringify({ versionId: after.versionId, activeVersionId: after.activeVersionId, active: after.active, fila_whatsapp_enabled: flag?.value, backup }, null, 2));
if (after.versionId !== after.activeVersionId || flag?.value !== false) throw new Error('Publicação/configuração não comprovada');
