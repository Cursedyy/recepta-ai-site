const source = $('Avaliar Observação Garantia').item.json;
const row = $json;
if (row.id !== source.clinica_id || !row.garantia_inicio || !row.garantia_fim) throw new Error('Garantia: materialização não confirmada');
const start = new Date(row.garantia_inicio), brt = new Date(start.getTime() - 3 * 3600000);
const expected = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate() + 7, 23, 59, 59) + 3 * 3600000);
if (new Date(row.garantia_fim).getTime() !== expected.getTime()) throw new Error('Garantia: prazo BRT inconsistente');
return { json: { id: row.id, garantia_inicio: row.garantia_inicio, garantia_fim: row.garantia_fim } };
