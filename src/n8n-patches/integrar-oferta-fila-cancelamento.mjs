import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const id = 'elFchoRzp2dzbweH';
const base = (process.env.N8N_BASE_URL || 'https://n8n.zapscout.com.br').replace(/\/$/, '');
const key = process.env.N8N_API_KEY;
if (!key) throw new Error('N8N_API_KEY ausente');
const headers = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' };
async function api(method, path, body) {
  const r = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} ${r.status}: ${t.slice(0, 500)}`);
  return t ? JSON.parse(t) : {};
}
const wf = await api('GET', `/api/v1/workflows/${id}`);
const dir = resolve('tmp-backup-workflows-deletados'); mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = join(dir, `${id}-pre-oferta-fila-${stamp}.json`); writeFileSync(backup, JSON.stringify(wf, null, 2));

const node = (name) => wf.nodes.find((n) => n.name === name);
const buscar = node('Buscar Agendamento');
buscar.parameters.url = "={{ $('Config Fixa').item.json.supabase_url + '/rest/v1/agendamentos?' + $json.filtro + '&status=eq.agendado&select=id,clinica_id,paciente_telefone,data_hora,sheet_row,observacao' }}";
const achou = node('Achou Agendamento?');
achou.parameters.jsCode = `const rows = $input.all().filter((i) => i.json && i.json.id);\nif (!rows.length) return [{ json: { encontrado: false, erro: 'agendamento_nao_encontrado' } }];\nconst a = rows[0].json;\nreturn [{ json: { encontrado: true, id: a.id, clinica_id: a.clinica_id, paciente_telefone: a.paciente_telefone, data_hora: a.data_hora, sheet_row: a.sheet_row, servico: a.observacao || 'consulta' } }];`;

const httpBase = {
  type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1200, 420],
  parameters: { method: 'POST', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, specifyBody: 'json', options: {} },
  credentials: { supabaseApi: { id: '4zaHsNSDG0FPIvQK', name: 'Recepta - Secret recepta/onboarding' } },
};
const oferta = { ...httpBase, name: 'Ofertar Próximo na Fila', parameters: { ...httpBase.parameters, url: "={{ $('Config Fixa').item.json.supabase_url + '/rest/v1/rpc/fila_ofertar_proximo' }}", jsonBody: "={{ JSON.stringify({ p_clinica: $('Achou Agendamento?').first().json.clinica_id, p_servico: $('Achou Agendamento?').first().json.servico, p_inicio: $('Achou Agendamento?').first().json.data_hora, p_fim: $('Achou Agendamento?').first().json.data_hora }) }}" }, position: [1240, 260] };
const preparar = { name: 'Preparar Oferta da Fila', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1460, 260], parameters: { jsCode: `const rows = $input.all().map(i => i.json).filter(r => r && r.id);\nconst a = $('Achou Agendamento?').first().json;\nconst c = $('Buscar Dados da Clínica').first().json || {};\nconst oferta = rows[0] || null;\nreturn [{ json: { oferta_criada: Boolean(oferta), oferta_id: oferta?.id || null, oferta_status: oferta?.status || null, oferta_expira_em: oferta?.oferta_expira_em || null, oferta_telefone: oferta?.paciente_telefone || null, oferta_nome: oferta?.paciente_nome || null, clinica_id: a.clinica_id, servico: a.servico, data_hora: a.data_hora, uazapi_server: c.uazapi_server, uazapi_token: c.uazapi_token, fila_whatsapp_enabled: $('Config Fixa').first().json.fila_whatsapp_enabled === true } }];` } };
const gate = { name: 'IF - Enviar Oferta WhatsApp?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [1680, 260], parameters: { conditions: { options: { typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: '={{ $json.fila_whatsapp_enabled && $json.oferta_criada }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} } };
const painel = { name: 'Oferta Disponível no Painel', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1920, 380], parameters: { jsCode: `return [{ json: { ...$json, envio_oferta_bloqueado: true, motivo: 'fila_whatsapp_enabled_false', painel_disponivel: true } }];` } };
const montarEnvio = { name: 'Montar Oferta WhatsApp', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1920, 140], parameters: { jsCode: `return [{ json: { ...$json, number: $json.oferta_telefone, text: 'Surgiu um horário para ' + ($json.servico || 'seu atendimento') + ' em ' + new Date($json.data_hora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + '. Responda SIM para aceitar ou NÃO para recusar.' } }];` } };
const enviar = { name: 'Enviar Oferta WhatsApp', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [2160, 140], parameters: { method: 'POST', url: "={{ $json.uazapi_server + '/send/text' }}", sendHeaders: true, headerParameters: { parameters: [{ name: 'token', value: '={{ $json.uazapi_token }}' }] }, sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify({ number: $json.number, text: $json.text }) }}", options: {} } };
for (const n of [oferta, preparar, gate, painel, montarEnvio, enviar]) { const old = node(n.name); if (old) Object.assign(old, n); else wf.nodes.push(n); }
const conn = wf.connections;
conn['Buscar Dados da Clínica'].main[0].push({ node: 'Ofertar Próximo na Fila', type: 'main', index: 0 });
conn['Ofertar Próximo na Fila'] = { main: [[{ node: 'Preparar Oferta da Fila', type: 'main', index: 0 }]] };
conn['Preparar Oferta da Fila'] = { main: [[{ node: 'IF - Enviar Oferta WhatsApp?', type: 'main', index: 0 }]] };
conn['IF - Enviar Oferta WhatsApp?'] = { main: [[{ node: 'Montar Oferta WhatsApp', type: 'main', index: 0 }], [{ node: 'Oferta Disponível no Painel', type: 'main', index: 0 }]] };
conn['Montar Oferta WhatsApp'] = { main: [[{ node: 'Enviar Oferta WhatsApp', type: 'main', index: 0 }]] };

const payload = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: { executionOrder: wf.settings?.executionOrder || 'v1', ...(wf.settings?.errorWorkflow ? { errorWorkflow: wf.settings.errorWorkflow } : {}) } };
await api('PUT', `/api/v1/workflows/${id}`, payload); if (wf.active) await api('POST', `/api/v1/workflows/${id}/activate`);
const after = await api('GET', `/api/v1/workflows/${id}`);
console.log(JSON.stringify({ backup, versionId: after.versionId, activeVersionId: after.activeVersionId, active: after.active, nodes: after.nodes.map(n => n.name).filter(n => n.includes('Oferta') || n.includes('Fila')) }, null, 2));
if (after.versionId !== after.activeVersionId) throw new Error('versionId != activeVersionId');
