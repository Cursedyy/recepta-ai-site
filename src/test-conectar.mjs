/**
 * Check minimo de /api/clinica/conectar.
 *
 * Cobre so o que quebra em silencio: a validacao de `uazapi_server` (barreira
 * de SSRF, o valor vem do banco escrito pelo n8n) e a normalizacao do status
 * da UazAPI, que le dois campos que nem sempre concordam.
 *
 * Rodar: node src/test-conectar.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fonte = readFileSync(
  new URL("./api/clinica/conectar.js", import.meta.url),
  "utf8",
);

// As funcoes nao sao exportadas de proposito (superficie interna do handler).
// Reavaliamos o modulo sem os imports para testa-las sem abrir a API publica.
const semImports = fonte
  .replace(/^import[\s\S]*?;$/gm, "")
  .replace(/export default async function handler[\s\S]*$/, "");
const { origemUazapi, normalizarInstancia } = await import(
  "data:text/javascript," +
    encodeURIComponent(
      semImports + "\nexport { origemUazapi, normalizarInstancia };",
    )
);

// ── origemUazapi: so hostname publico em https passa ──────────────────────
assert.equal(
  origemUazapi("https://sitemagic1.uazapi.com"),
  "https://sitemagic1.uazapi.com",
  "servidor real da clinica deve passar",
);
assert.equal(
  origemUazapi("https://sitemagic1.uazapi.com/"),
  "https://sitemagic1.uazapi.com",
  "barra final nao pode virar // no caminho",
);
assert.equal(
  origemUazapi("http://sitemagic1.uazapi.com"),
  null,
  "http barrado",
);
assert.equal(origemUazapi("https://localhost"), null, "loopback barrado");
assert.equal(origemUazapi("https://127.0.0.1"), null, "IPv4 literal barrado");
assert.equal(origemUazapi("https://169.254.169.254"), null, "metadata barrado");
assert.equal(origemUazapi("https://[::1]"), null, "IPv6 literal barrado");
assert.equal(
  origemUazapi("https://interno"),
  null,
  "hostname sem dominio barrado",
);
assert.equal(origemUazapi(""), null, "vazio barrado");
assert.equal(origemUazapi(null), null, "null barrado");
assert.equal(origemUazapi("nao-e-url"), null, "lixo barrado");

// ── normalizarInstancia: conectado quando qualquer fonte afirma ───────────
assert.equal(
  normalizarInstancia({ instance: { status: "connected" } }).conectado,
  true,
  "instance.status connected basta",
);
assert.equal(
  normalizarInstancia({ status: { connected: true, loggedIn: true } })
    .conectado,
  true,
  "connected + loggedIn basta",
);
assert.equal(
  normalizarInstancia({ status: { connected: true, loggedIn: false } })
    .conectado,
  false,
  "socket aberto sem login nao e conexao",
);
assert.equal(
  normalizarInstancia({ instance: { status: "connecting" } }).conectado,
  false,
  "connecting nao e conectado",
);
assert.equal(
  normalizarInstancia(null).conectado,
  false,
  "resposta vazia nao trava",
);
assert.equal(
  normalizarInstancia({ instance: { paircode: "ABCD1234" } }).paircode,
  "ABCD1234",
  "paircode repassado",
);

// ── formatarTelefone (pagina): round-trip com o handler de envio ──────────
// A sugestao vem de clinicas.telefone_operador com ou sem o 55. A pagina
// exibe no formato nacional e o handler recoloca o 55 quando o numero tem 10
// ou 11 digitos. Se as duas metades discordarem, o cliente ve um numero certo
// e a UazAPI recebe um errado — falha silenciosa, por isso o check.
const pagina = readFileSync(
  new URL("./clinica/conectar/index.html", import.meta.url),
  "utf8",
);
const corpoFormatar = pagina.match(
  /function formatarTelefone\(digitos\) \{[\s\S]*?\n {8}\}/,
);
assert.ok(corpoFormatar, "formatarTelefone deve existir na pagina");
const { formatarTelefone } = await import(
  "data:text/javascript," +
    encodeURIComponent(corpoFormatar[0] + "\nexport { formatarTelefone };")
);

// Mesma normalizacao do botao "Gerar codigo" da pagina.
function comoOHandlerEnvia(exibido) {
  const bruto = String(exibido).replace(/\D/g, "");
  return bruto.length === 10 || bruto.length === 11 ? "55" + bruto : bruto;
}

for (const [guardado, esperadoExibido] of [
  ["5511912345678", "(11) 91234-5678"],
  ["11912345678", "(11) 91234-5678"],
  ["+55 (11) 91234-5678", "(11) 91234-5678"],
  ["5511 3456-7890", "(11) 3456-7890"],
]) {
  const exibido = formatarTelefone(guardado);
  assert.equal(exibido, esperadoExibido, "exibicao de " + guardado);
  assert.match(
    comoOHandlerEnvia(exibido),
    /^\d{10,15}$/,
    "numero enviado deve casar com o pattern da UazAPI: " + guardado,
  );
  assert.equal(
    comoOHandlerEnvia(exibido),
    "55" + String(guardado).replace(/\D/g, "").replace(/^55/, ""),
    "round-trip nao pode perder nem duplicar o 55: " + guardado,
  );
}

assert.equal(formatarTelefone(null), "", "sem sugestao nao quebra");
assert.equal(
  formatarTelefone("123"),
  "123",
  "lixo curto passa e o server recusa",
);

console.log("OK — conectar.js: 30 checks");
