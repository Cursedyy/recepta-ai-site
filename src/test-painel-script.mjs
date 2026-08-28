// Verifica que o <script> inline gerado por painel-view.js e JS valido.
//
// Por que existe: o HTML do painel e um template literal. Um "\n" escrito com
// uma barra so dentro dele vira newline REAL no script emitido, quebrando a
// string ou o regex que o continha — e com isso o <script> inteiro deixa de
// parsear, sem erro nenhum no servidor. Aconteceu duas vezes (177b850, 29eaf81).
//
// Rodar: node test-painel-script.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ALVO = 'api/clinica/painel-view.js';

function carregarTemplate(arquivo) {
  const src = fs.readFileSync(arquivo, 'utf8')
    .replace(/^import\s[\s\S]*?;$/gm, '')
    .concat('\nexport { paginaPainel };\n');
  const tmp = path.join(os.tmpdir(), `painel-view-check-${process.pid}.mjs`);
  const prelude = 'const DIAS = ["segunda","terca","quarta","quinta","sexta","sabado","domingo"];\n';
  fs.writeFileSync(tmp, prelude + src);
  return tmp;
}

const tmp = carregarTemplate(ALVO);
let falhas = 0;
try {
  const { paginaPainel } = await import(`file://${tmp.split(path.sep).join('/')}`);
  const config = { precos: [], faq: [], regras_ia: '', horarios: {}, convenios: [], mensagem_boas_vindas: '' };
  const html = paginaPainel('Clinica Teste', config, 30, { plano: 'trial', status: 'ativo' });

  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  console.assert(scripts.length > 0, 'nenhum <script> inline encontrado no painel');
  if (!scripts.length) falhas++;

  scripts.forEach((codigo, i) => {
    try {
      new Function(codigo);
      console.log(`  ok  script inline [${i}] (${codigo.length} chars) parseia`);
    } catch (erro) {
      falhas++;
      const linha = Number((/<anonymous>:(\d+)/.exec(erro.stack) || [])[1]);
      const contexto = Number.isFinite(linha) ? ` perto da linha ${linha}: ${JSON.stringify(codigo.split('\n')[linha - 1] || '')}` : '';
      console.error(`  FALHA  script inline [${i}]: ${erro.message}${contexto}`);
    }
  });
} finally {
  fs.rmSync(tmp, { force: true });
}

if (falhas) {
  console.error(`\n${falhas} falha(s). O painel da clinica nao roda no browser.`);
  process.exit(1);
}
console.log('\npainel-view.js: script inline valido.');
