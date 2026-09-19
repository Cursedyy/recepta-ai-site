const source = $('Preparar Observação Garantia').item.json;
const connected = $json.instance?.status === 'connected' || ($json.status?.connected === true && $json.status?.loggedIn === true);
if (!connected) return { json: { clinica_id: source.clinica_id, connected: false } };
const now = new Date();
const brt = new Date(now.getTime() - 3 * 3600000);
const fim = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate() + 7, 23, 59, 59) + 3 * 3600000);
return { json: { clinica_id: source.clinica_id, customer_id: source.customer_id, connected: true, garantia_inicio: now.toISOString(), garantia_fim: fim.toISOString() } };
