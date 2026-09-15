const rows = name => $(name).all().map(x => x.json).filter(x => x.id || x.event_id);
const eventos = rows('Buscar Eventos Stripe Órfãos');
const pagos = rows('Buscar Pedidos Pagos Travados');
const provisionando = rows('Buscar Pedidos Provisionando Travados');
const ativadas = rows('Buscar Garantias Ativadas Vencendo');
const naoAtivadas = rows('Buscar Garantias Não Ativadas Vencendo');
const quantidade = eventos.length + pagos.length + provisionando.length + ativadas.length + naoAtivadas.length;
return [{ json: { quantidade, event_ids: eventos.map(x => x.event_id), mais_antigo: eventos[0]?.recebido_em || null,
  pedidos_pagos: pagos.map(x => x.id), pedidos_provisionando: provisionando.map(x => x.id),
  garantias_ativadas: ativadas.map(x => x.id), garantias_nao_ativadas: naoAtivadas.map(x => x.id),
  alerta: 'Reconciliação Stripe: eventos pendentes >15min=' + eventos.length + '; pedidos pagos >2h=' + pagos.length + '; provisionando >30min=' + provisionando.length + '; garantias vencendo em 48h=' + (ativadas.length + naoAtivadas.length) + '. IDs: ' + [...eventos.map(x => x.event_id), ...pagos.map(x => x.id), ...provisionando.map(x => x.id), ...ativadas.map(x => x.id), ...naoAtivadas.map(x => x.id)].join(', ') } }];
