// Verifica que o JavaScript do painel da clinica e valido.
//
// Historico: o painel inteiro ja ficou morto no browser duas vezes (177b850,
// 29eaf81) porque o script vivia dentro de um template literal, onde um "\n"
// com barra simples vira newline real no HTML emitido e quebra o parse do
// bloco todo — sem erro no servidor, com a pagina abrindo normalmente.
//
// O script agora mora em clinica/painel.js, entao `node --check` ja pega
// erro de sintaxe. O que sobrou de arriscado e o <script> inline de dados e a
// tag que carrega o arquivo externo: e isso que este teste cobre.
//
// Rodar: node test-painel-script.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const VIEW = 'api/clinica/painel-view.js';
const CLIENTE = 'clinica/painel.js';

function carregarTemplate(arquivo) {
  const src = fs.readFileSync(arquivo, 'utf8')
    .replace(/^import\s[\s\S]*?;$/gm, '')
    .concat('\nexport { paginaPainel };\n');
  const tmp = path.join(os.tmpdir(), `painel-view-check-${process.pid}.mjs`);
  const prelude = 'const DIAS = ["segunda","terca","quarta","quinta","sexta","sabado","domingo"];\n';
  fs.writeFileSync(tmp, prelude + src);
  return tmp;
}

let falhas = 0;
function checar(condicao, mensagem) {
  if (condicao) { console.log('  ok    ' + mensagem); return; }
  falhas++;
  console.error('  FALHA ' + mensagem);
}

function parseia(codigo, rotulo) {
  try {
    new Function(codigo);
    checar(true, `${rotulo} parseia (${codigo.length} chars)`);
  } catch (erro) {
    const linha = Number((/<anonymous>:(\d+)/.exec(erro.stack) || [])[1]);
    const contexto = Number.isFinite(linha)
      ? ` perto da linha ${linha}: ${JSON.stringify(codigo.split('\n')[linha - 1] || '')}`
      : '';
    checar(false, `${rotulo}: ${erro.message}${contexto}`);
  }
}

// 1. O JS do cliente, agora um arquivo .js de verdade.
parseia(fs.readFileSync(CLIENTE, 'utf8'), 'clinica/painel.js');

// 2. O HTML renderizado: script de dados + tag externa.
const tmp = carregarTemplate(VIEW);
try {
  const { paginaPainel } = await import(`file://${tmp.split(path.sep).join('/')}`);
  const config = { precos: [], faq: [], regras_ia: '', horarios: {}, convenios: [], mensagem_boas_vindas: '' };
  const html = paginaPainel('Clinica Teste', config, 30, { plano: 'trial', status: 'ativo' });

  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  checar(inline.length === 1, `exatamente 1 <script> inline (achou ${inline.length})`);
  inline.forEach((codigo, i) => parseia(codigo, `<script> inline [${i}]`));

  checar(
    html.includes('<script src="/clinica/painel.js"></script>'),
    'HTML carrega /clinica/painel.js',
  );
  checar(
    inline[0] !== undefined && inline[0].includes('window.__PAINEL__'),
    'script inline define window.__PAINEL__',
  );
  // O cliente le os dados por window.__PAINEL__: se o painel-view parar de
  // publicar uma chave, a tela quebra em runtime sem erro de sintaxe.
  ['config', 'dias', 'nomeDia', 'assinatura'].forEach((chave) => {
    checar(inline[0] !== undefined && inline[0].includes(chave + ':'), `__PAINEL__ publica "${chave}"`);
  });
} finally {
  fs.rmSync(tmp, { force: true });
}

if (falhas) {
  console.error(`\n${falhas} falha(s). O painel da clinica nao roda no browser.`);
  process.exit(1);
}
console.log('\npainel da clinica: JavaScript valido.');
