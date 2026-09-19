const rows = $input.all().map((x, index) => ({ row: x.json, index })).filter(x => x.row.id);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
return rows.filter(({ row: x }) => x.status === 'ativo' && x.stripe_customer_id && !x.garantia_inicio && !x.reembolsado_em && !x.disputa_em).map(({ row, index }) => {
  if (!uuid.test(row.id) || !row.uazapi_token) throw new Error('Garantia: clínica inválida');
  const server = String(row.uazapi_server || '').trim();
  if (!/^https:\/\/sitemagic1\.uazapi\.com\/?$/.test(server)) throw new Error('Garantia: servidor não autorizado');
  return { json: { clinica_id: row.id, customer_id: row.stripe_customer_id, uazapi_token: row.uazapi_token, uazapi_server: server.replace(/\/$/, '') }, pairedItem: { item: index } };
});
