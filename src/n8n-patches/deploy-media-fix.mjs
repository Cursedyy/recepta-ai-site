#!/usr/bin/env node
// deploy-media-fix.mjs
// Deploy Parser da Mensagem + Processar Resposta IA updates to n8n
//
// Usage: N8N_API_KEY=... node src/n8n-patches/deploy-media-fix.mjs
//
// Prerequisites:
// 1. Run migration 015_mensagem_media.sql in Supabase
// 2. Make sure N8N_API_KEY env var is set and valid

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const N8N_KEY = process.env.N8N_API_KEY;
const N8N_URL = process.env.N8N_BASE_URL || 'https://n8n.zapscout.com.br';
const WORKFLOW_ID = 'cxn5FxUNMJmlJ1WJ';

if (!N8N_KEY) {
  console.error('Set N8N_API_KEY env var');
  process.exit(1);
}

const headers = {
  'X-N8N-API-KEY': N8N_KEY,
  'Content-Type': 'application/json',
};

async function api(method, path, body) {
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${N8N_URL}${path}`, opts);
  const text = await res.text();
  if (!res.ok) {
    console.error(`API ${method} ${path} → ${res.status}`);
    console.error(text.substring(0, 500));
    process.exit(1);
  }
  return JSON.parse(text);
}

async function main() {
  console.log('Fetching workflow...');
  const wf = await api('GET', `/api/v1/workflows/${WORKFLOW_ID}`);
  console.log(`Workflow: ${wf.name} (${wf.nodes?.length} nodes)`);

  // 1. Update Parser da Mensagem
  const parserCode = readFileSync(join(__dirname, 'parser-da-mensagem.js'), 'utf8');
  const parser = wf.nodes.find(n => n.name === 'Parser da Mensagem');
  if (!parser) {
    console.error('Parser da Mensagem node not found');
    console.error('Available nodes:', wf.nodes.map(n => n.name).join(', '));
    process.exit(1);
  }
  parser.parameters.jsCode = parserCode;
  console.log('✓ Parser da Mensagem updated');

  // 2. Update Processar Resposta IA
  const processarCode = readFileSync(join(__dirname, 'processar-resposta-ia.js'), 'utf8');
  const processar = wf.nodes.find(n => n.name === 'Processar Resposta IA');
  if (!processar) {
    console.error('Processar Resposta IA node not found');
    process.exit(1);
  }
  processar.parameters.jsCode = processarCode;
  console.log('✓ Processar Resposta IA updated');

  // 3. Publish
  console.log('Publishing workflow...');
  const result = await api('PUT', `/api/v1/workflows/${WORKFLOW_ID}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: { executionOrder: wf.settings?.executionOrder || 'v1' },
  });

  console.log(`\n✅ Published! Version: ${result.versionId}`);
  console.log(`   Active: ${result.active}`);
  console.log(`\nNext: send a test image via WhatsApp and check the panel.`);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
