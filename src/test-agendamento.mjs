// Checagem de normalizarTelefone: o cron de lembretes manda WhatsApp para
// paciente_telefone, entao um numero mal normalizado vira mensagem para um
// estranho. Roda com: node test-agendamento.mjs
import { normalizarTelefone } from "./api/clinica/painel-acoes.js";

const casos = [
  // [entrada, esperado]
  ["(53) 99163-5302", "5553991635302"], // celular digitado com mascara
  ["53991635302", "5553991635302"], // celular sem mascara
  ["5553991635302", "5553991635302"], // ja em E.164, nao duplica o 55
  ["+55 53 99163-5302", "5553991635302"], // com + e espacos
  ["5332221100", "555332221100"], // fixo 10 digitos
  ["553332221100", "553332221100"], // fixo ja com 55
  ["", null], // vazio
  [null, null], // ausente
  ["991635302", null], // sem DDD
  ["1234", null], // curto demais
  ["55539916353021234", null], // longo demais
  ["0153991635302", null], // 13 digitos mas nao comeca com 55
  ["5503991635302", null], // DDD 03 nao existe
  ["abc", null], // sem digito nenhum
];

let falhas = 0;
for (const [entrada, esperado] of casos) {
  const obtido = normalizarTelefone(entrada);
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(
    `  ${ok ? "ok  " : "FALHA"}  ${JSON.stringify(entrada)} -> ${JSON.stringify(obtido)}` +
      (ok ? "" : ` (esperado ${JSON.stringify(esperado)})`),
  );
}

console.log(
  falhas
    ? `\n${falhas} caso(s) falharam.`
    : `\nnormalizarTelefone: ${casos.length} casos ok.`,
);
process.exit(falhas ? 1 : 0);
