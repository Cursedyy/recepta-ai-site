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
const REGRAS_MAX = 2000;
const FAQ_ITEM_MAX = 500;
const FAQ_MAX_ITEMS = 20;

export function configEditavelPadrao() {
  return {
    precos: [],
    horarios: Object.fromEntries(DIAS.map((dia) => [dia, []])),
    convenios: [],
    mensagem_identidade: "",
    regras_ia: "",
    faq: [],
    campos_extras: {},
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

  // regras_ia: string opcional, max 2000 chars
  const regras = typeof input.regras_ia === "string" ? input.regras_ia : "";
  if (regras.length > REGRAS_MAX) {
    return { erro: "regras_ia_muito_longo" };
  }

  // faq: array opcional de {pergunta, resposta}
  const faq = Array.isArray(input.faq) ? input.faq : [];
  if (faq.length > FAQ_MAX_ITEMS) {
    return { erro: "faq_muitos_itens" };
  }
  for (const item of faq) {
    if (
      !item ||
      typeof item.pergunta !== "string" ||
      !item.pergunta.trim() ||
      typeof item.resposta !== "string" ||
      !item.resposta.trim()
    ) {
      return { erro: "faq_invalido" };
    }
    if (
      item.pergunta.length > FAQ_ITEM_MAX ||
      item.resposta.length > FAQ_ITEM_MAX
    ) {
      return { erro: "faq_item_muito_longo" };
    }
  }

  // campos_extras: objeto opcional (chave-valor) para dados da categoria
  const camposExtrasInput = input.campos_extras;
  var camposExtrasLimpo = {};
  if (camposExtrasInput && typeof camposExtrasInput === "object" && !Array.isArray(camposExtrasInput)) {
    for (const [chave, valor] of Object.entries(camposExtrasInput)) {
      if (typeof chave !== "string" || !chave.trim()) continue;
      // Normalizar: arrays viram arrays de strings, booleanos ficam, números ficam, strings ficam
      if (Array.isArray(valor)) {
        camposExtrasLimpo[chave] = valor.filter(function (v) { return typeof v === "string" && v.trim(); }).map(function (v) { return v.trim(); });
      } else if (typeof valor === "boolean") {
        camposExtrasLimpo[chave] = valor;
      } else if (typeof valor === "number" && Number.isFinite(valor)) {
        camposExtrasLimpo[chave] = valor;
      } else if (typeof valor === "string") {
        camposExtrasLimpo[chave] = valor.trim();
      }
    }
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
    regras_ia: regras.trim(),
    faq: faq.map((item) => ({
      pergunta: item.pergunta.trim(),
      resposta: item.resposta.trim(),
    })),
    campos_extras: camposExtrasLimpo,
    categoria: typeof input.categoria === "string" ? input.categoria.trim() : "geral",
    regras_categoria: typeof input.regras_categoria === "string" ? input.regras_categoria.trim() : "",
  };

  return { ok: true, limpo };
}

export { DIAS, MENSAGEM_MAX };
