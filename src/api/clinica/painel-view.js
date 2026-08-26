import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../_lib/supabase-server.js";
import { configEditavelPadrao, DIAS } from "../_lib/config-editavel.js";

const NOME_DIA = {
  segunda: "Segunda",
  terca: "Terça",
  quarta: "Quarta",
  quinta: "Quinta",
  sexta: "Sexta",
  sabado: "Sábado",
  domingo: "Domingo",
};

function escapeHtml(valor) {
  return String(valor).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

function jsonParaScript(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\//g, "\\u002f");
}

function paginaPainel(nomeClinica, config, tempoPausaAtual, assinatura) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Painel da clínica · Recepta AI</title>
<meta name="robots" content="noindex,nofollow">
<link rel="icon" type="image/png" sizes="32x32" href="/img/favicon-32.png">
<link rel="icon" type="image/png" sizes="512x512" href="/img/favicon-512.png">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#FAFAFD;--surface:#ffffff;--ink:#100D22;--muted:#302E47;--line:#E7E5F2;
  --accent:#26205C;--accent-ink:#ffffff;--accent-soft:#F3F2F5;--accent-2:#afa8eb;
  --header-bg:#151749;--ghost:#eceafa;--radius:14px;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font-family:"Poppins",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;padding-bottom:60px;-webkit-font-smoothing:antialiased}
button,input,textarea,select{font:inherit}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:linear-gradient(90deg,var(--header-bg) 0%,#241f63 58%,#332a80 100%);color:#fff;position:sticky;top:0;z-index:5}
.topbar b{font-size:15px}
.topbar button{background:transparent;border:1px solid rgba(255,255,255,.25);color:#fff;padding:7px 14px;border-radius:9px;cursor:pointer;font:inherit}
.topbar button:hover{background:rgba(255,255,255,.1)}
main{max-width:640px;margin:0 auto;padding:28px 20px}
h1{font-size:21px;margin-bottom:4px}
main > p.sub{color:var(--muted);font-size:14px;margin-bottom:28px}
section.bloco{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:22px 20px;margin-bottom:18px}
section.bloco h2{font-size:15.5px;margin-bottom:4px}
section.bloco p.desc{color:var(--muted);font-size:13px;margin-bottom:16px}
section.bloco-dica{background:var(--accent-soft);border:1px solid var(--line);border-radius:var(--radius);padding:16px 20px;margin-bottom:18px}
section.bloco-dica h2{font-size:13.5px;margin-bottom:8px;color:var(--accent)}
section.bloco-dica p{color:var(--muted);font-size:13px;line-height:1.5}
section.bloco-dica p+p{margin-top:6px}
.linha{display:flex;gap:8px;align-items:center;margin-bottom:8px}
.linha input[type=text],.linha input[type=number]{flex:1;min-width:0;padding:9px 11px;border:1px solid var(--line);border-radius:9px}
.linha input[type=number]{flex:0 0 110px}
.linha input[type=time]{padding:9px 11px;border:1px solid var(--line);border-radius:9px}
.btn-remover{flex:0 0 auto;background:transparent;border:1px solid var(--line);color:#B3261E;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:15px;line-height:1}
.btn-remover:hover{background:#FBEAEA}
.btn-add{margin-top:6px;background:var(--accent-soft);border:1px solid var(--line);color:var(--accent);padding:8px 14px;border-radius:9px;cursor:pointer;font-size:13.5px;font-weight:600}
.btn-add:hover{filter:brightness(0.97)}
.dia-bloco{border-bottom:1px solid var(--line);padding:12px 0}
.dia-bloco:last-child{border-bottom:none;padding-bottom:0}
.dia-bloco:first-child{padding-top:0}
.dia-cabeca{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.dia-cabeca b{font-size:13.5px}
.dia-cabeca .fechado{color:var(--muted);font-size:12.5px}
textarea{width:100%;padding:11px 13px;border:1px solid var(--line);border-radius:10px;resize:vertical;min-height:80px}
.contador{color:var(--muted);font-size:12px;margin-top:4px;text-align:right}
input:focus,textarea:focus,select:focus{outline:2px solid var(--accent);outline-offset:1px}
.rodape-salvar{position:sticky;bottom:0;background:var(--bg);padding:16px 0 4px;display:flex;align-items:center;gap:12px}
.btn-salvar{background:var(--accent);color:#fff;border:none;padding:12px 24px;border-radius:10px;font-weight:600;cursor:pointer}
.btn-salvar:hover{filter:brightness(1.08)}
.btn-salvar:disabled{opacity:.6;cursor:default}
.status{font-size:13.5px}
.status.ok{color:#1E7A3D}
.status.erro{color:#B3261E}
.vazio{color:var(--muted);font-size:13px;padding:4px 0}
.faq-item{border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:10px;background:var(--bg)}
.faq-cabeca{display:flex;gap:8px;align-items:center;margin-bottom:8px}
.faq-cabeca input{flex:1;min-width:0}
.faq-item textarea{width:100%;min-height:56px}
.ag-lista{display:flex;flex-direction:column;gap:8px}
.ag-item{display:flex;align-items:center;gap:12px;border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.ag-item.ag-passado{opacity:.55}
.ag-item.ag-cancelado .ag-data b,.ag-item.ag-cancelado .ag-tel{text-decoration:line-through;color:var(--muted)}
.ag-data{flex:0 0 auto;min-width:58px}
.ag-data b{display:block;font-size:14px}
.ag-data span{display:block;font-size:12px;color:var(--muted)}
.ag-tel{flex:1;min-width:0;font-size:13.5px;overflow-wrap:anywhere}
.ag-badge{flex:0 0 auto;font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:999px;white-space:nowrap}
.ag-badge-agendado{background:#E8F3EC;color:#1E7A3D}
.ag-badge-cancelado{background:var(--accent-soft);color:var(--muted)}
.ag-anteriores summary{cursor:pointer;font-size:13.5px;color:var(--muted);padding:4px 0;list-style:none}
.ag-anteriores summary::-webkit-details-marker{display:none}
.ag-anteriores summary::before{content:'▸ '}
.ag-anteriores[open] summary::before{content:'▾ '}
.ag-anteriores .ag-lista{margin-top:10px}
@media(max-width:420px){
  .linha{flex-wrap:wrap}
  .linha input[type=number]{flex:1 1 100%}
  .ag-item{flex-wrap:wrap}
  .ag-badge{margin-left:auto}
}
</style>
</head>
<body>
<div class="topbar">
  <b>Recepta AI</b>
  <button id="btn-sair" type="button">Sair</button>
</div>
<main>
  <h1>Olá, ${escapeHtml(nomeClinica)}</h1>
  <p class="sub">Edite as informações que a secretária virtual usa pra atender.</p>

  <section class="bloco-dica">
    <h2>Como funciona o dia a dia</h2>
    <p>Quer testar antes de avisar os pacientes? Manda uma mensagem pro número da clínica e vê a Recepta AI respondendo.</p>
    <p>Se quiser assumir uma conversa a qualquer momento, é só responder direto pelo WhatsApp — a IA para de responder sozinha por um tempo.</p>
  </section>

  <section class="bloco">
    <h2>Agenda</h2>
    <p class="desc">Consultas marcadas pela secretária virtual. Só visualização.</p>
    <div id="agenda-status" class="vazio">Carregando agendamentos…</div>
    <div id="agenda-proximos" class="ag-lista" style="display:none"></div>
    <details class="ag-anteriores" id="agenda-anteriores-wrap" style="display:none">
      <summary>Agendamentos anteriores</summary>
      <div id="agenda-anteriores" class="ag-lista"></div>
    </details>
  </section>

  <section class="bloco">
    <h2>Preços dos serviços/exames</h2>
    <p class="desc">Nome do serviço e valor em reais.</p>
    <div id="lista-precos"></div>
    <button type="button" class="btn-add" id="add-preco">+ Adicionar preço</button>
  </section>

  <section class="bloco">
    <h2>Horários de atendimento</h2>
    <p class="desc">Deixe sem faixas os dias em que a clínica não atende.</p>
    <div id="lista-horarios"></div>
  </section>

  <section class="bloco">
    <h2>Convênios aceitos</h2>
    <p class="desc">Um por linha.</p>
    <div id="lista-convenios"></div>
    <button type="button" class="btn-add" id="add-convenio">+ Adicionar convênio</button>
  </section>

  <section class="bloco">
    <h2>Mensagem de identidade</h2>
    <p class="desc">Frase curta de boas-vindas. Não é o roteiro da IA, só a apresentação.</p>
    <textarea id="mensagem-identidade" maxlength="300"></textarea>
    <div class="contador"><span id="contador-mensagem">0</span>/300</div>
  </section>

  <section class="bloco">
    <h2>Regras da IA</h2>
    <p class="desc">Instruções personalizadas para o comportamento da secretária virtual. Exemplo: "Ao mencionar urgência, encaminhe imediatamente para o humano." ou "Nunca informe valores de exames não cadastrados."</p>
    <textarea id="regras-ia" maxlength="2000" rows="6" placeholder="Ex: Ao paciente pedir cancelamento, sempre ofereça remarcação antes de confirmar."></textarea>
    <div class="contador"><span id="contador-regras">0</span>/2000</div>
  </section>

  <section class="bloco">
    <h2>Perguntas Frequentes (FAQ)</h2>
    <p class="desc">Adicione perguntas e respostas que a IA usa como base. Útil para dúvidas recorrentes sobre a clínica.</p>
    <div id="lista-faq"></div>
    <button type="button" class="btn-add" id="add-faq">+ Adicionar pergunta</button>
  </section>

  <div class="rodape-salvar">
    <button type="button" class="btn-salvar" id="btn-salvar">Salvar alterações</button>
    <span class="status" id="status-salvar"></span>
  </div>

  <section class="bloco">
    <h2>Tempo de pausa da IA</h2>
    <p class="desc">Quantos minutos a Recepta fica em silêncio depois que alguém da clínica responde manualmente no WhatsApp.</p>
    <div class="linha">
      <input type="number" id="tempo-pausa" min="1" max="120" step="1" value="${tempoPausaAtual}" style="max-width:110px" />
      <span>minutos</span>
    </div>
    <div class="rodape-salvar" style="position:static;padding:14px 0 0">
      <button type="button" class="btn-salvar" id="btn-salvar-pausa">Salvar</button>
      <span class="status" id="status-pausa"></span>
    </div>
  </section>

  <section class="bloco">
    <h2>Assinatura</h2>
    <p class="desc" id="assinatura-status">Carregando…</p>
    <div id="assinatura-acao"></div>
  </section>

  <section class="bloco">
    <h2>Métricas</h2>
    <div id="metricas-corpo" class="vazio">Carregando…</div>
  </section>
</main>
<script>
var CONFIG = ${jsonParaScript(config)};
var DIAS = ${jsonParaScript(DIAS)};
var NOME_DIA = ${jsonParaScript(NOME_DIA)};
if (!CONFIG.regras_ia) CONFIG.regras_ia = '';
if (!Array.isArray(CONFIG.faq)) CONFIG.faq = [];

function el(tag, attrs, filhos) {
  var e = document.createElement(tag);
  attrs = attrs || {};
  Object.keys(attrs).forEach(function(k){
    if (k === 'text') e.textContent = attrs[k];
    else e.setAttribute(k, attrs[k]);
  });
  (filhos || []).forEach(function(f){ e.appendChild(f); });
  return e;
}

// --- agenda (somente leitura) ---
function formatarTelefone(tel) {
  var digitos = String(tel || '').replace(/\D/g, '');
  return digitos ? '+' + digitos : '(sem telefone)';
}
function agendaItem(item, passado) {
  var dt = new Date(item.data_hora);
  var dataStr = dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
  var horaStr = dt.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  var cancelado = item.status === 'cancelado';
  var classes = 'ag-item' + (passado ? ' ag-passado' : '') + (cancelado ? ' ag-cancelado' : '');
  return el('div', { class: classes }, [
    el('div', { class: 'ag-data' }, [
      el('b', { text: dataStr }),
      el('span', { text: horaStr })
    ]),
    el('div', { class: 'ag-tel', text: formatarTelefone(item.paciente_telefone) }),
    el('span', {
      class: 'ag-badge ' + (cancelado ? 'ag-badge-cancelado' : 'ag-badge-agendado'),
      text: cancelado ? 'Cancelado' : 'Agendado'
    })
  ]);
}
function renderAgenda(agendamentos) {
  var elStatus = document.getElementById('agenda-status');
  var elProximos = document.getElementById('agenda-proximos');
  var elAnterioresWrap = document.getElementById('agenda-anteriores-wrap');
  var elAnteriores = document.getElementById('agenda-anteriores');

  if (!agendamentos.length) {
    elStatus.textContent = 'Nenhum agendamento por aqui ainda.';
    return;
  }

  var agora = new Date();
  var proximos = [];
  var anteriores = [];
  agendamentos.forEach(function (item) {
    if (new Date(item.data_hora) >= agora) proximos.push(item);
    else anteriores.push(item);
  });
  anteriores.reverse();

  elStatus.style.display = 'none';

  if (proximos.length) {
    elProximos.style.display = '';
    proximos.forEach(function (item) { elProximos.appendChild(agendaItem(item, false)); });
  } else {
    elStatus.style.display = '';
    elStatus.textContent = 'Nenhum agendamento futuro no momento.';
  }

  if (anteriores.length) {
    elAnterioresWrap.style.display = '';
    anteriores.forEach(function (item) { elAnteriores.appendChild(agendaItem(item, true)); });
  }
}
fetch('/api/clinica/agenda-listar')
  .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, corpo: j }; }); })
  .then(function (res) {
    if (!res.ok || !res.corpo || !res.corpo.ok) {
      document.getElementById('agenda-status').textContent = 'Não foi possível carregar a agenda.';
      return;
    }
    renderAgenda(res.corpo.agendamentos || []);
  })
  .catch(function () {
    document.getElementById('agenda-status').textContent = 'Falha de conexão ao carregar a agenda.';
  });

// --- precos ---
var elListaPrecos = document.getElementById('lista-precos');
function renderPrecos(){
  elListaPrecos.innerHTML = '';
  if (!CONFIG.precos.length) {
    elListaPrecos.appendChild(el('p', { class: 'vazio', text: 'Nenhum preço cadastrado.' }));
  }
  CONFIG.precos.forEach(function(item, i){
    var inputNome = el('input', { type: 'text', placeholder: 'Nome do serviço', value: item.nome });
    inputNome.addEventListener('input', function(){ CONFIG.precos[i].nome = inputNome.value; });
    var inputValor = el('input', { type: 'number', step: '0.01', min: '0', placeholder: 'R$', value: item.valor });
    inputValor.addEventListener('input', function(){ CONFIG.precos[i].valor = parseFloat(inputValor.value || '0'); });
    var btnDel = el('button', { type: 'button', class: 'btn-remover', text: '×' });
    btnDel.addEventListener('click', function(){ CONFIG.precos.splice(i, 1); renderPrecos(); });
    elListaPrecos.appendChild(el('div', { class: 'linha' }, [inputNome, inputValor, btnDel]));
  });
}
document.getElementById('add-preco').addEventListener('click', function(){
  CONFIG.precos.push({ nome: '', valor: 0 });
  renderPrecos();
});

// --- convenios ---
var elListaConvenios = document.getElementById('lista-convenios');
function renderConvenios(){
  elListaConvenios.innerHTML = '';
  if (!CONFIG.convenios.length) {
    elListaConvenios.appendChild(el('p', { class: 'vazio', text: 'Nenhum convênio cadastrado.' }));
  }
  CONFIG.convenios.forEach(function(nome, i){
    var input = el('input', { type: 'text', placeholder: 'Nome do convênio', value: nome });
    input.addEventListener('input', function(){ CONFIG.convenios[i] = input.value; });
    var btnDel = el('button', { type: 'button', class: 'btn-remover', text: '×' });
    btnDel.addEventListener('click', function(){ CONFIG.convenios.splice(i, 1); renderConvenios(); });
    elListaConvenios.appendChild(el('div', { class: 'linha' }, [input, btnDel]));
  });
}
document.getElementById('add-convenio').addEventListener('click', function(){
  CONFIG.convenios.push('');
  renderConvenios();
});

// --- horarios ---
var elListaHorarios = document.getElementById('lista-horarios');
function renderHorarios(){
  elListaHorarios.innerHTML = '';
  DIAS.forEach(function(dia){
    var faixas = CONFIG.horarios[dia] || (CONFIG.horarios[dia] = []);
    var wrap = el('div', { class: 'dia-bloco' });
    var cabeca = el('div', { class: 'dia-cabeca' }, [
      el('b', { text: NOME_DIA[dia] }),
      faixas.length ? document.createTextNode('') : el('span', { class: 'fechado', text: 'Fechado' })
    ]);
    wrap.appendChild(cabeca);

    faixas.forEach(function(faixa, i){
      var inicio = el('input', { type: 'time', value: faixa.inicio || '' });
      inicio.addEventListener('input', function(){ faixa.inicio = inicio.value; });
      var fim = el('input', { type: 'time', value: faixa.fim || '' });
      fim.addEventListener('input', function(){ faixa.fim = fim.value; });
      var btnDel = el('button', { type: 'button', class: 'btn-remover', text: '×' });
      btnDel.addEventListener('click', function(){ faixas.splice(i, 1); renderHorarios(); });
      wrap.appendChild(el('div', { class: 'linha' }, [inicio, document.createTextNode('até'), fim, btnDel]));
    });

    var btnAdd = el('button', { type: 'button', class: 'btn-add', text: faixas.length ? '+ Adicionar faixa' : '+ Abrir nesse dia' });
    btnAdd.addEventListener('click', function(){
      faixas.push({ inicio: '08:00', fim: '18:00' });
      renderHorarios();
    });
    wrap.appendChild(btnAdd);

    elListaHorarios.appendChild(wrap);
  });
}

// --- mensagem ---
var elMensagem = document.getElementById('mensagem-identidade');
var elContador = document.getElementById('contador-mensagem');
elMensagem.value = CONFIG.mensagem_identidade || '';
elContador.textContent = elMensagem.value.length;
elMensagem.addEventListener('input', function(){
  elContador.textContent = elMensagem.value.length;
});

renderPrecos();
renderConvenios();
renderHorarios();

// --- regras ia ---
var elRegras = document.getElementById('regras-ia');
var elContadorRegras = document.getElementById('contador-regras');
elRegras.value = CONFIG.regras_ia || '';
elContadorRegras.textContent = elRegras.value.length;
elRegras.addEventListener('input', function(){
  elContadorRegras.textContent = elRegras.value.length;
});

// --- faq ---
var elListaFaq = document.getElementById('lista-faq');
function renderFaq(){
  elListaFaq.innerHTML = '';
  if (!CONFIG.faq.length) {
    elListaFaq.appendChild(el('p', { class: 'vazio', text: 'Nenhuma pergunta cadastrada.' }));
  }
  CONFIG.faq.forEach(function(item, i){
    var wrap = el('div', { class: 'faq-item' });
    var inputPergunta = el('input', { type: 'text', placeholder: 'Pergunta (ex: Vocês atendem Unimed?)', value: item.pergunta });
    inputPergunta.addEventListener('input', function(){ CONFIG.faq[i].pergunta = inputPergunta.value; });
    var textareaResposta = el('textarea', { placeholder: 'Resposta da IA (ex: Sim, atendemos Unimed e Amil.)', rows: '2' });
    textareaResposta.value = item.resposta;
    textareaResposta.addEventListener('input', function(){ CONFIG.faq[i].resposta = textareaResposta.value; });
    var btnDel = el('button', { type: 'button', class: 'btn-remover', text: '×' });
    btnDel.addEventListener('click', function(){ CONFIG.faq.splice(i, 1); renderFaq(); });
    var cabeca = el('div', { class: 'faq-cabeca' }, [inputPergunta, btnDel]);
    wrap.appendChild(cabeca);
    wrap.appendChild(textareaResposta);
    elListaFaq.appendChild(wrap);
  });
}
document.getElementById('add-faq').addEventListener('click', function(){
  if (CONFIG.faq.length >= 20) return;
  CONFIG.faq.push({ pergunta: '', resposta: '' });
  renderFaq();
});
renderFaq();

// --- salvar ---
var elStatus = document.getElementById('status-salvar');
var elBtnSalvar = document.getElementById('btn-salvar');
elBtnSalvar.addEventListener('click', function(){
  elStatus.textContent = '';
  elStatus.className = 'status';
  elBtnSalvar.disabled = true;
  elBtnSalvar.textContent = 'Salvando…';

  var payload = {
    precos: CONFIG.precos,
    horarios: CONFIG.horarios,
    convenios: CONFIG.convenios,
    mensagem_identidade: elMensagem.value,
    regras_ia: elRegras.value,
    faq: CONFIG.faq
  };

  fetch('/api/clinica/config-salvar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, corpo: j }; }); })
    .then(function(res){
      elBtnSalvar.disabled = false;
      elBtnSalvar.textContent = 'Salvar alterações';
      if (!res.ok) {
        elStatus.textContent = 'Não foi possível salvar. Confere os campos.';
        elStatus.className = 'status erro';
        return;
      }
      CONFIG = res.corpo.config;
      renderPrecos();
      renderConvenios();
      renderHorarios();
      renderFaq();
      elRegras.value = CONFIG.regras_ia || '';
      elContadorRegras.textContent = elRegras.value.length;
      elStatus.textContent = 'Salvo!';
      elStatus.className = 'status ok';
    })
    .catch(function(){
      elBtnSalvar.disabled = false;
      elBtnSalvar.textContent = 'Salvar alterações';
      elStatus.textContent = 'Falha de conexão. Tenta de novo.';
      elStatus.className = 'status erro';
    });
});

document.getElementById('btn-sair').addEventListener('click', function(){
  fetch('/api/clinica/logout', { method: 'POST' }).then(function(){
    window.location.href = '/clinica/login';
  });
});

// --- tempo de pausa ---
document.getElementById('btn-salvar-pausa').addEventListener('click', function(){
  var elStatus = document.getElementById('status-pausa');
  var input = document.getElementById('tempo-pausa');
  var valor = parseInt(input.value, 10);
  elStatus.textContent = '';
  elStatus.className = 'status';
  if (!Number.isInteger(valor) || valor < 1 || valor > 120) {
    elStatus.textContent = 'Informe um número entre 1 e 120.';
    elStatus.className = 'status erro';
    return;
  }
  fetch('/api/clinica/painel-acoes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'tempo_pausa', tempo_pausa_minutos: valor })
  })
    .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, corpo: j }; }); })
    .then(function(res){
      if (!res.ok) {
        elStatus.textContent = 'Não foi possível salvar.';
        elStatus.className = 'status erro';
        return;
      }
      elStatus.textContent = 'Salvo!';
      elStatus.className = 'status ok';
    })
    .catch(function(){
      elStatus.textContent = 'Falha de conexão.';
      elStatus.className = 'status erro';
    });
});

// --- assinatura ---
var ASSINATURA = ${jsonParaScript(assinatura)};
(function(){
  var elStatus = document.getElementById('assinatura-status');
  var elAcao = document.getElementById('assinatura-acao');
  var statusLabel = ASSINATURA.status === 'ativo'
    ? 'Assinatura ativa'
    : (ASSINATURA.status === 'trial' ? 'Em período de teste' : (ASSINATURA.status || 'Status desconhecido'));
  var partes = [statusLabel];
  if (ASSINATURA.plano) partes.push('Plano: ' + (ASSINATURA.plano === 'anual' ? 'Anual' : 'Mensal'));
  if (ASSINATURA.trial_fim) {
    var dt = new Date(ASSINATURA.trial_fim);
    partes.push('Trial até ' + dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }));
  }
  elStatus.textContent = partes.join(' · ');

  if (ASSINATURA.tem_stripe) {
    var btn = el('button', { type: 'button', class: 'btn-add', text: 'Gerenciar assinatura' });
    btn.addEventListener('click', function(){
      btn.disabled = true;
      btn.textContent = 'Abrindo…';
      fetch('/api/clinica/painel-acoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'portal_sessao' })
      })
        .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, corpo: j }; }); })
        .then(function(res){
          if (!res.ok || !res.corpo.url) {
            btn.disabled = false;
            btn.textContent = 'Gerenciar assinatura';
            elStatus.textContent = elStatus.textContent + ' — falha ao abrir o portal.';
            return;
          }
          window.location.href = res.corpo.url;
        })
        .catch(function(){
          btn.disabled = false;
          btn.textContent = 'Gerenciar assinatura';
        });
    });
    elAcao.appendChild(btn);
  }
})();

// --- metricas ---
fetch('/api/clinica/painel-acoes?acao=metricas')
  .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, corpo: j }; }); })
  .then(function (res) {
    var elCorpo = document.getElementById('metricas-corpo');
    if (!res.ok || !res.corpo || !res.corpo.ok) {
      elCorpo.textContent = 'Não foi possível carregar as métricas.';
      return;
    }
    elCorpo.className = '';
    elCorpo.innerHTML = '';
    elCorpo.appendChild(el('div', { class: 'linha' }, [
      el('b', { text: 'Conversas: ' }),
      document.createTextNode(String(res.corpo.total_conversas))
    ]));
    elCorpo.appendChild(el('div', { class: 'linha' }, [
      el('b', { text: 'Escalonamentos: ' }),
      document.createTextNode(String(res.corpo.total_escalonamentos))
    ]));
  })
  .catch(function () {
    document.getElementById('metricas-corpo').textContent = 'Falha de conexão ao carregar métricas.';
  });
</script>
</body>
</html>`;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");

  let supabase;
  try {
    supabase = createSupabaseServerClient(req, res);
  } catch {
    return res.status(500).json({ erro: "supabase_nao_configurado" });
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return res.redirect(302, "/clinica/login");

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey)
    return res.status(500).json({ erro: "supabase_nao_configurado" });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: perfil } = await admin
    .from("perfis")
    .select("papel,clinica_id,nome,ativo")
    .eq("id", user.id)
    .maybeSingle();

  if (
    !perfil ||
    perfil.papel !== "clinica" ||
    !perfil.ativo ||
    !perfil.clinica_id
  ) {
    await supabase.auth.signOut();
    return res.redirect(302, "/clinica/login");
  }

  const { data: clinicaRow } = await admin
    .from("clinicas")
    .select(
      "clinica,config_editavel,tempo_pausa_minutos,status,trial_fim,plano,stripe_customer_id",
    )
    .eq("id", perfil.clinica_id)
    .maybeSingle();

  const nomeClinica = clinicaRow?.clinica || perfil.nome || "sua clínica";
  const padrao = configEditavelPadrao();
  const configSalvo = clinicaRow?.config_editavel || {};
  const config = {
    precos: Array.isArray(configSalvo.precos)
      ? configSalvo.precos
      : padrao.precos,
    horarios: { ...padrao.horarios, ...(configSalvo.horarios || {}) },
    convenios: Array.isArray(configSalvo.convenios)
      ? configSalvo.convenios
      : padrao.convenios,
    mensagem_identidade:
      typeof configSalvo.mensagem_identidade === "string"
        ? configSalvo.mensagem_identidade
        : padrao.mensagem_identidade,
    regras_ia:
      typeof configSalvo.regras_ia === "string"
        ? configSalvo.regras_ia
        : padrao.regras_ia,
    faq: Array.isArray(configSalvo.faq)
      ? configSalvo.faq
      : padrao.faq,
  };

  const tempoPausaAtual =
    typeof clinicaRow?.tempo_pausa_minutos === "number"
      ? clinicaRow.tempo_pausa_minutos
      : 10;

  const assinatura = {
    status: clinicaRow?.status || null,
    trial_fim: clinicaRow?.trial_fim || null,
    plano: clinicaRow?.plano || null,
    tem_stripe: !!clinicaRow?.stripe_customer_id,
  };

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res
    .status(200)
    .send(paginaPainel(nomeClinica, config, tempoPausaAtual, assinatura));
}
