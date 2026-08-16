const DIAS = [
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
  "domingo",
];
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MENSAGEM_MAX = 300;

export function configEditavelPadrao() {
  return {
    precos: [],
    horarios: Object.fromEntries(DIAS.map((dia) => [dia, []])),
    convenios: [],
    mensagem_identidade: "",
  };
}

/**
 * Valida e normaliza o payload de config_editavel vindo do form da clinica.
 * Nunca confia em nada do client sem checar tipo/formato aqui.
 */
export function validarConfigEditavel(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { erro: "payload_invalido" };
  }

  const precos = input.precos;
  if (!Array.isArray(precos)) return { erro: "precos_invalido" };
  for (const item of precos) {
    if (!item || typeof item.nome !== "string" || !item.nome.trim())
      return { erro: "precos_invalido" };
    if (
      typeof item.valor !== "number" ||
      !Number.isFinite(item.valor) ||
      item.valor < 0
    ) {
      return { erro: "precos_invalido" };
    }
  }

  const horarios = input.horarios;
  if (!horarios || typeof horarios !== "object" || Array.isArray(horarios)) {
    return { erro: "horarios_invalido" };
  }
  for (const dia of Object.keys(horarios)) {
    if (!DIAS.includes(dia)) return { erro: "horarios_invalido" };
    const faixas = horarios[dia];
    if (!Array.isArray(faixas)) return { erro: "horarios_invalido" };
    for (const faixa of faixas) {
      if (!faixa || !HORA_RE.test(faixa.inicio) || !HORA_RE.test(faixa.fim))
        return { erro: "horarios_invalido" };
      if (faixa.inicio >= faixa.fim) return { erro: "horarios_invalido" };
    }
  }

  const convenios = input.convenios;
  if (!Array.isArray(convenios)) return { erro: "convenios_invalido" };
  for (const c of convenios) {
    if (typeof c !== "string" || !c.trim())
      return { erro: "convenios_invalido" };
  }

  const mensagem = input.mensagem_identidade;
  if (typeof mensagem !== "string" || mensagem.length > MENSAGEM_MAX) {
    return { erro: "mensagem_invalida" };
  }

  const limpo = {
    precos: precos.map((p) => ({
      nome: p.nome.trim(),
      valor: Math.round(p.valor * 100) / 100,
    })),
    horarios: Object.fromEntries(
      DIAS.map((dia) => [
        dia,
        (horarios[dia] || []).map((f) => ({ inicio: f.inicio, fim: f.fim })),
      ]),
    ),
    convenios: convenios.map((c) => c.trim()),
    mensagem_identidade: mensagem.trim(),
  };

  return { ok: true, limpo };
}

export { DIAS, MENSAGEM_MAX };
