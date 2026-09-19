import fs from 'node:fs';
import assert from 'node:assert/strict';
import { buildRefundWorkflow } from './billing-refund-workflow.mjs';

const base = (process.env.N8N_BASE_URL || 'https://n8n.zapscout.com.br').replace(/\/$/, '');
const id = 'cf1An4BYT9A0LuHi';
const headers = { 'X-N8N-API-KEY': process.env.N8N_API_KEY, 'Content-Type': 'application/json' };
async function api(method, path = '', body) {
  const response = await fetch(`${base}/api/v1/workflows/${id}${path}`, {
    method, headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`${method} workflow${path}: HTTP ${response.status}`);
  return response.json();
}
const source = await api('GET');
const meta = JSON.parse(fs.readFileSync('tmp-qa-reembolso/candidate-meta.json', 'utf8'));
assert.equal(source.versionId, meta.versionId, 'Produção mudou desde o QA; não sobrescrever');
assert.equal(source.activeVersionId, source.versionId);
assert.equal(source.active, true);
const candidate = JSON.parse(fs.readFileSync('tmp-qa-reembolso/candidate.json', 'utf8'));
const rebuilt = buildRefundWorkflow(source);
for (const key of ['nodes', 'connections', 'settings']) assert.deepEqual(candidate[key], rebuilt[key], `Candidato diverge: ${key}`);
const payload = wf => ({ name: wf.name, nodes: wf.nodes, connections: wf.connections,
  settings: { executionOrder: wf.settings?.executionOrder || 'v1', ...(wf.settings?.errorWorkflow ? { errorWorkflow: wf.settings.errorWorkflow } : {}) } });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.mkdirSync('tmp-backup-workflows-deletados', { recursive: true });
const backup = `tmp-backup-workflows-deletados/${id}-antes-publicacao-reembolso-${stamp}.json`;
fs.writeFileSync(backup, JSON.stringify(source));
let changed = false;
try {
  await api('PUT', '', payload(candidate)); changed = true;
  await api('POST', '/activate');
  const published = await api('GET');
  assert.equal(published.active, true);
  assert.equal(published.versionId, published.activeVersionId);
  for (const key of ['nodes', 'connections']) assert.deepEqual(published[key], candidate[key], `Publicado diverge: ${key}`);
  const proof = { id, backup, previousVersion: source.versionId, versionId: published.versionId,
    activeVersionId: published.activeVersionId, active: published.active, candidateEqual: true, date: new Date().toISOString() };
  fs.writeFileSync('tmp-qa-reembolso/publicacao.json', JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof));
} catch (error) {
  if (changed) {
    await api('PUT', '', payload(source)); await api('POST', '/activate');
    const rolled = await api('GET');
    assert.deepEqual(rolled.nodes, source.nodes); assert.deepEqual(rolled.connections, source.connections);
    assert.equal(rolled.versionId, rolled.activeVersionId);
    console.log(JSON.stringify({ rollback: true, backup, versionId: rolled.versionId }));
  }
  throw error;
}
