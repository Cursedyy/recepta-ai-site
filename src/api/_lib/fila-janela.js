// Instantes já incluem Z ou offset. Horários BRT devem chegar com -03:00;
// toISOString converte uma vez, sem aritmética manual de fuso.
export function instanteUtc(valor) {
  if (typeof valor !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(valor)) return null;
  const data = new Date(valor);
  return Number.isFinite(data.getTime()) ? data.toISOString() : null;
}

export function validarJanela(inicio, fim) {
  const inicioUtc = instanteUtc(inicio);
  const fimUtc = instanteUtc(fim);
  if (!inicioUtc || !fimUtc || fimUtc < inicioUtc) return null;
  return { inicio: inicioUtc, fim: fimUtc };
}

export function ofertaTemJanelaValida(entrada) {
  const preferencia = validarJanela(entrada.janela_inicio, entrada.janela_fim);
  const oferta = validarJanela(entrada.oferta_inicio, entrada.oferta_fim);
  return Boolean(preferencia && oferta && oferta.inicio >= preferencia.inicio && oferta.fim <= preferencia.fim);
}
