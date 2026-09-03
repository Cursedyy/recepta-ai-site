// Checagem de normalizarTelefone: o cron de lembretes manda WhatsApp para
// paciente_telefone, entao um numero mal normalizado vira mensagem para um
// estranho. Roda com: node test-agendamento.mjs
import { normalizarTelefone } from "./api/clinica/painel-acoes.js";

const casos = [
  // [entrada, esperado]
  ["(11) 99999-9999", "5511999999999"], // celular digitado com mascara
  ["11999999999", "5511999999999"], // celular sem mascara
  ["5511999999999", "5511999999999"], // ja em E.164, nao duplica o 55
  ["+55 11 99999-9999", "5511999999999"], // com + e espacos
  ["1132221100", "551132221100"], // fixo 10 digitos
  ["551132221100", "551132221100"], // fixo ja com 55
  ["", null], // vazio
  [null, null], // ausente
  ["999999999", null], // sem DDD
  ["1234", null], // curto demais
  ["55119999999991234", null], // longo demais
  ["0119999999999", null], // 13 digitos mas nao comeca com 55
  ["5503999999999", null], // DDD 03 nao existe
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
