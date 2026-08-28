import { autenticarClinica } from "../_lib/auth-clinica.js";
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
    /[&<>\"']/g,
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
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #f8fafc; --surface: #ffffff; --ink: #0f172a; --muted: #64748b;
  --border: #e2e8f0; --accent: #0f172a; --accent-soft: #f1f5f9;
  --primary: #4f46e5; --primary-hover: #4338ca; --primary-soft: #eef2ff;
  --green: #059669; --green-bg: #ecfdf5; --red: #dc2626; --red-bg: #fef2f2;
  --orange: #ea580c; --orange-bg: #fff7ed;
  --ring: rgba(79,70,229,0.15); --radius: 10px; --radius-lg: 14px;
  --shadow-xs: 0 1px 2px rgba(0,0,0,0.03);
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03);
  --shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.03);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.06), 0 4px 6px -4px rgba(0,0,0,0.04);
  --sidebar-w: 240px; --topbar-h: 56px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; }
body { font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--ink); font-size: 14px; line-height: 1.6; -webkit-font-smoothing: antialiased; }
button, input, textarea, select { font: inherit; }

/* ── Topbar ── */
.topbar { display: flex; align-items: center; justify-content: space-between; height: var(--topbar-h); padding: 0 24px; background: var(--accent); color: #fff; }
.topbar-left { display: flex; align-items: center; gap: 12px; }
.topbar-logo { font-weight: 700; font-size: 16px; letter-spacing: -0.4px; display: flex; align-items: center; gap: 8px; }
.topbar-logo svg { width: 22px; height: 22px; }
.topbar-sep { opacity: 0.2; font-weight: 300; font-size: 18px; }
.topbar-clinic { font-size: 13px; opacity: 0.6; font-weight: 400; }
.topbar button { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: #fff; padding: 7px 16px; border-radius: var(--radius); cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s; backdrop-filter: blur(8px); }
.topbar button:hover { background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.2); }

/* ── Layout ── */
.layout { display: flex; height: calc(100vh - var(--topbar-h)); }

/* ── Sidebar ── */
.sidebar { width: var(--sidebar-w); flex: 0 0 auto; background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 16px 10px; gap: 2px; }
.sidebar-section { font-size: 10px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.8px; padding: 16px 14px 8px; }
.nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-radius: var(--radius); cursor: pointer; font-size: 13px; font-weight: 500; color: var(--muted); transition: all 0.15s ease; border: none; background: none; width: 100%; text-align: left; }
.nav-item:hover { background: var(--accent-soft); color: var(--ink); }
.nav-item.active { background: var(--primary); color: #fff; box-shadow: 0 2px 8px rgba(79,70,229,0.3); }
.nav-item .icon { width: 20px; text-align: center; font-size: 15px; flex-shrink: 0; }
.sidebar-footer { margin-top: auto; padding: 12px; border-top: 1px solid var(--border); }

/* ── Content ── */
.content { flex: 1 1 auto; overflow: hidden; display: flex; flex-direction: column; }
.content-header { padding: 20px 28px 16px; background: var(--surface); border-bottom: 1px solid var(--border); }
.content-header h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.4px; color: var(--ink); }
.content-header p { font-size: 13px; color: var(--muted); margin-top: 4px; }
.content-body { flex: 1 1 auto; overflow-y: auto; padding: 24px 28px 100px; }
.content-body::-webkit-scrollbar { width: 5px; }
.content-body::-webkit-scrollbar-track { background: transparent; }
.content-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }
.content-body::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }

/* ── Tab panels ── */
.tab-panel { display: none; flex: 1 1 auto; min-height: 0; overflow: hidden; }
.tab-panel.active { display: flex; flex-direction: column; animation: fadeUp 0.25s ease; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

/* ── Form elements ── */
.field { margin-bottom: 20px; }
.field-label { display: block; font-size: 13px; font-weight: 600; color: var(--ink); margin-bottom: 6px; }
.field-desc { font-size: 12px; color: var(--muted); margin-bottom: 8px; line-height: 1.5; }
.field-input { width: 100%; padding: 9px 14px; border: 1.5px solid var(--border); border-radius: var(--radius); font-size: 13px; background: var(--surface); transition: all 0.2s ease; color: var(--ink); }
.field-input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--ring); }
.field-input::placeholder { color: #94a3b8; }
textarea.field-input { resize: vertical; min-height: 72px; line-height: 1.6; }
.field-counter { font-size: 11px; color: var(--muted); text-align: right; margin-top: 4px; }

/* ── Cards / Sections ── */
.section-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px 24px; margin-bottom: 16px; box-shadow: var(--shadow-xs); }
.section-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.section-card-title { font-size: 15px; font-weight: 600; }
.section-card-desc { font-size: 12px; color: var(--muted); }

/* ── Inline rows (prices, convenios, etc) ── */
.item-row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
.item-row input[type="text"] { flex: 1; min-width: 0; padding: 8px 12px; border: 1.5px solid var(--border); border-radius: var(--radius); font-size: 13px; background: var(--surface); transition: all 0.2s ease; }
.item-row input[type="text"]:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--ring); }
.item-row input[type="number"] { width: 110px; padding: 8px 12px; border: 1.5px solid var(--border); border-radius: var(--radius); font-size: 13px; background: var(--surface); transition: all 0.2s ease; }
.item-row input[type="number"]:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--ring); }
.item-row input[type="time"] { padding: 8px 12px; border: 1.5px solid var(--border); border-radius: var(--radius); font-size: 13px; background: var(--surface); transition: all 0.2s ease; }
.item-row input[type="time"]:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--ring); }

/* ── Buttons ── */
.btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 18px; border-radius: var(--radius); font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: all 0.2s ease; }
.btn-primary { background: var(--primary); color: #fff; box-shadow: 0 1px 3px rgba(79,70,229,0.25); }
.btn-primary:hover { background: var(--primary-hover); box-shadow: 0 4px 12px rgba(79,70,229,0.3); transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.5; cursor: default; transform: none; box-shadow: none; }
.btn-ghost { background: var(--surface); border: 1.5px solid var(--border); color: var(--ink); }
.btn-ghost:hover { background: var(--accent-soft); border-color: #cbd5e1; }
.btn-danger { background: transparent; border: 1.5px solid var(--border); color: var(--red); }
.btn-danger:hover { background: var(--red-bg); border-color: var(--red); }
.btn-sm { padding: 6px 12px; font-size: 12px; }
.btn-icon { width: 32px; height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; border: 1.5px solid var(--border); background: var(--surface); color: var(--muted); cursor: pointer; transition: all 0.2s ease; font-size: 14px; }
.btn-icon:hover { background: var(--red-bg); color: var(--red); border-color: var(--red); }

/* ── Status badge ── */
.badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.badge-green { background: var(--green-bg); color: var(--green); }
.badge-red { background: var(--red-bg); color: var(--red); }
.badge-muted { background: var(--accent-soft); color: var(--muted); }

/* ── Agenda ── */
.ag-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border: 1.5px solid var(--border); border-radius: var(--radius); margin-bottom: 8px; font-size: 13px; transition: all 0.2s ease; background: var(--surface); }
.ag-item:hover { box-shadow: var(--shadow); border-color: #cbd5e1; }
.ag-date { font-weight: 700; min-width: 60px; font-size: 13px; color: var(--ink); }
.ag-time { font-size: 12px; color: var(--muted); font-weight: 500; }
.ag-phone { flex: 1; min-width: 0; font-weight: 500; }
.ag-actions { display: flex; gap: 6px; }
.vazio { color: var(--muted); font-size: 13px; font-style: italic; padding: 12px 0; }

/* ── FAQ items ── */
.faq-item { border: 1.5px solid var(--border); border-radius: var(--radius); padding: 14px; margin-bottom: 10px; background: var(--surface); transition: border-color 0.2s; }
.faq-item:hover { border-color: #cbd5e1; }
.faq-header { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
.faq-header input { flex: 1; min-width: 0; padding: 8px 12px; border: 1.5px solid var(--border); border-radius: var(--radius); font-size: 13px; transition: all 0.2s; }
.faq-header input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--ring); }
.faq-item textarea { width: 100%; min-height: 52px; padding: 8px 12px; border: 1.5px solid var(--border); border-radius: var(--radius); font-size: 13px; resize: vertical; transition: all 0.2s; line-height: 1.6; }
.faq-item textarea:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--ring); }

/* ── Day blocks ── */
.day-block { padding: 10px 0; border-bottom: 1px solid var(--border); }
.day-block:last-child { border-bottom: none; }
.day-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.day-header b { font-size: 13px; font-weight: 600; }
.day-header .closed { color: var(--muted); font-size: 12px; background: var(--accent-soft); padding: 2px 10px; border-radius: 999px; }

/* ── Modal ── */
.modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.5); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; animation: fadeIn 0.15s ease; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.modal-content { background: var(--surface); border-radius: var(--radius-lg); padding: 28px; max-width: 380px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); animation: slideUp 0.2s ease; }
@keyframes slideUp { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
.modal-content h3 { font-size: 16px; font-weight: 700; margin-bottom: 4px; letter-spacing: -0.3px; }
.modal-sub { color: var(--muted); font-size: 13px; margin-bottom: 18px; }
.modal-field { margin-bottom: 14px; }
.modal-field label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.3px; }
.modal-field input { width: 100%; padding: 9px 12px; border: 1.5px solid var(--border); border-radius: var(--radius); font-size: 13px; transition: all 0.2s; }
.modal-field input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--ring); }
.modal-error { color: var(--red); font-size: 12px; min-height: 18px; margin-bottom: 10px; }
.modal-actions { display: flex; gap: 10px; justify-content: flex-end; }

/* ── Floating save ── */
.save-bar { position: fixed; bottom: 20px; right: 24px; z-index: 50; display: flex; align-items: center; gap: 12px; background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--radius-lg); padding: 10px 18px; box-shadow: var(--shadow-lg); }

/* ── Responsive ── */
@media (max-width: 768px) {
  .sidebar { width: 60px; padding: 10px 6px; }
  .sidebar-section { display: none; }
  .nav-item { justify-content: center; padding: 10px; }
  .nav-item span:not(.icon) { display: none; }
  .sidebar-footer { display: none; }
  .content-header { padding: 14px 18px 12px; }
  .content-header h1 { font-size: 17px; }
  .content-body { padding: 16px 18px 100px; }
  .section-card { padding: 16px; }
}
</style>
</head>
<body>
<div class="topbar">
  <div class="topbar-left">
    <span class="topbar-logo">
      <svg viewBox="0 0 100 100" fill="currentColor"><g transform="translate(0 50)"><path d="M 34 -34 C -1.7 -15.9, -1.7 15.9, 34 34 C 69.7 15.9, 69.7 -15.9, 34 -34 Z" fill-opacity="0.6"/><path d="M 66 -34 C 30.3 -15.9, 30.3 15.9, 66 34 C 101.7 15.9, 101.7 -15.9, 66 -34 Z"/></g></svg>
      Recepta
    </span>
    <span class="topbar-sep">|</span>
    <span class="topbar-clinic">${escapeHtml(nomeClinica)}</span>
  </div>
  <button id="btn-sair" type="button">Sair</button>
</div>

<div class="layout">
  <nav class="sidebar">
    <div class="sidebar-section">Clínica</div>
    <button class="nav-item active" data-tab="agenda"><span class="icon">📋</span><span>Agenda</span></button>
    <button class="nav-item" data-tab="horarios"><span class="icon">🕐</span><span>Horários</span></button>
    <button class="nav-item" data-tab="precos"><span class="icon">💰</span><span>Preços</span></button>
    <button class="nav-item" data-tab="convenios"><span class="icon">🏥</span><span>Convênios</span></button>
    <div class="sidebar-section">Recepta</div>
    <button class="nav-item" data-tab="mensagem"><span class="icon">💬</span><span>Mensagem</span></button>
    <button class="nav-item" data-tab="regras"><span class="icon">⚙️</span><span>Regras</span></button>
    <button class="nav-item" data-tab="faq"><span class="icon">❓</span><span>FAQ</span></button>
    <button class="nav-item" data-tab="conversas"><span class="icon">🗨️</span><span>Conversas</span></button>
    <div class="sidebar-section">Conta</div>
    <button class="nav-item" data-tab="pausa"><span class="icon">⏸️</span><span>Pausa</span></button>
    <button class="nav-item" data-tab="perfil"><span class="icon">👤</span><span>Perfil</span></button>
    <button class="nav-item" data-tab="feriados"><span class="icon">📅</span><span>Feriados</span></button>
    <button class="nav-item" data-tab="status"><span class="icon">📊</span><span>Status</span></button>
  </nav>

  <div class="content">
    <!-- ── AGENDA ── -->
    <div class="tab-panel active" id="tab-agenda">
      <div class="content-header"><h1>Agenda</h1><p>Consultas marcadas pela secretária virtual.</p></div>
      <div class="content-body">
        <div class="section-card">
          <div id="agenda-status" class="vazio">Carregando agendamentos…</div>
          <div id="agenda-proximos"></div>
          <details id="agenda-anteriores-wrap" style="display:none">
            <summary style="cursor:pointer;font-size:12px;color:var(--muted);padding:6px 0">Agendamentos anteriores</summary>
            <div id="agenda-anteriores" style="margin-top:6px"></div>
          </details>
        </div>
      </div>
    </div>

    <!-- ── HORÁRIOS ── -->
    <div class="tab-panel" id="tab-horarios">
      <div class="content-header"><h1>Horários de atendimento</h1><p>Configure os dias e faixas horárias da clínica.</p></div>
      <div class="content-body">
        <div class="section-card">
          <div id="lista-horarios"></div>
        </div>
      </div>
    </div>

    <!-- ── PREÇOS ── -->
    <div class="tab-panel" id="tab-precos">
      <div class="content-header"><h1>Preços dos serviços</h1><p>Nome do serviço e valor em reais.</p></div>
      <div class="content-body">
        <div class="section-card">
          <div id="lista-precos"></div>
          <button type="button" class="btn btn-ghost btn-sm" id="add-preco" style="margin-top:4px">+ Adicionar preço</button>
        </div>
      </div>
    </div>

    <!-- ── CONVÊNIOS ── -->
    <div class="tab-panel" id="tab-convenios">
      <div class="content-header"><h1>Convênios aceitos</h1><p>Lista de convênios que a clínica atende.</p></div>
      <div class="content-body">
        <div class="section-card">
          <div id="lista-convenios"></div>
          <button type="button" class="btn btn-ghost btn-sm" id="add-convenio" style="margin-top:4px">+ Adicionar convênio</button>
        </div>
      </div>
    </div>

    <!-- ── MENSAGEM ── -->
    <div class="tab-panel" id="tab-mensagem">
      <div class="content-header"><h1>Mensagem de identidade</h1><p>Frase curta de boas-vindas que a Recepta usa ao iniciar conversa.</p></div>
      <div class="content-body">
        <div class="section-card">
          <div class="field">
            <textarea id="mensagem-identidade" class="field-input" maxlength="300" rows="3" placeholder="Ex: Olá! Aqui é a secretária da Clínica Saúde+. Como posso ajudar?"></textarea>
            <div class="field-counter"><span id="contador-mensagem">0</span>/300</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── REGRAS ── -->
    <div class="tab-panel" id="tab-regras">
      <div class="content-header"><h1>Regras da Recepta</h1><p>Instruções personalizadas para o comportamento da secretária virtual.</p></div>
      <div class="content-body">
        <div class="section-card">
          <div class="field">
            <div class="field-desc">Ex: "Ao paciente pedir cancelamento, sempre ofereça remarcação." Separe cada regra em uma linha.</div>
            <textarea id="regras-ia" class="field-input" maxlength="2000" rows="6" placeholder="Digite as regras aqui..."></textarea>
            <div class="field-counter"><span id="contador-regras">0</span>/2000</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── FAQ ── -->
    <div class="tab-panel" id="tab-faq">
      <div class="content-header"><h1>Perguntas frequentes</h1><p>FAQ que a Recepta usa como base para responder pacientes.</p></div>
      <div class="content-body">
        <div id="lista-faq"></div>
        <button type="button" class="btn btn-ghost btn-sm" id="add-faq" style="margin-top:4px">+ Adicionar pergunta</button>
      </div>
    </div>

    <!-- ── CONVERSAS ── -->
    <div class="tab-panel" id="tab-conversas">
      <div class="content-header"><h1>Monitoramento</h1><p>Acompanhe as conversas dos pacientes com a Recepta.</p></div>
      <div class="content-body">
        <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">
          <input type="text" id="conv-busca" class="field-input" placeholder="Buscar por telefone ou mensagem…" style="flex:1" />
          <button type="button" class="btn btn-ghost btn-sm" id="btn-exportar-conv">📥 Exportar CSV</button>
        </div>
        <div class="section-card">
          <div id="conv-status" class="vazio">Carregando conversas…</div>
          <div id="conv-lista"></div>
        </div>
      </div>
    </div>

    <!-- ── PAUSA ── -->
    <div class="tab-panel" id="tab-pausa">
      <div class="content-header"><h1>Pausa da Recepta</h1><p>Tempo que a Recepta fica em silêncio após uma resposta manual sua.</p></div>
      <div class="content-body">
        <div class="section-card">
          <div class="field">
            <label class="field-label">Minutos de pausa</label>
            <div class="field-desc">Depois que você responder manualmente no WhatsApp, a Recepta fica pausada por esse tempo.</div>
            <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
              <input type="number" id="tempo-pausa" class="field-input" min="1" max="120" step="1" value="${tempoPausaAtual}" style="width:100px" />
              <span style="font-size:13px;color:var(--muted)">minutos</span>
              <button type="button" class="btn btn-primary btn-sm" id="btn-salvar-pausa">Salvar</button>
              <span id="status-pausa"></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── PERFIL ── -->
    <div class="tab-panel" id="tab-perfil">
      <div class="content-header"><h1>Meu perfil</h1><p>Altere seu nome e senha de acesso.</p></div>
      <div class="content-body">
        <div class="section-card">
          <div class="field"><label class="field-label">Nome</label><input type="text" id="perfil-nome" class="field-input" maxlength="100" placeholder="Seu nome" /></div>
          <div class="field"><label class="field-label">Senha atual</label><input type="password" id="perfil-senha-atual" class="field-input" autocomplete="current-password" /></div>
          <div class="field"><label class="field-label">Nova senha</label><input type="password" id="perfil-nova-senha" class="field-input" minlength="8" autocomplete="new-password" /><p style="font-size:11px;color:var(--muted);margin-top:4px">Mínimo 8 caracteres. Deixe em branco para não alterar.</p></div>
          <div id="perfil-erro" style="color:var(--red);font-size:13px;min-height:16px;margin-bottom:8px"></div>
          <button type="button" class="btn btn-primary" id="btn-salvar-perfil">Salvar perfil</button>
          <span id="perfil-status"></span>
        </div>
      </div>
    </div>

    <!-- ── FERIADOS ── -->
    <div class="tab-panel" id="tab-feriados">
      <div class="content-header"><h1>Feriados e datas especiais</h1><p>Dias em que a clínica não atende.</p></div>
      <div class="content-body">
        <div class="section-card">
          <div id="feriados-lista"></div>
          <div style="display:flex;gap:8px;margin-top:12px;align-items:center">
            <input type="date" id="feriado-data" class="field-input" style="width:160px" />
            <input type="text" id="feriado-nome" class="field-input" style="flex:1" placeholder="Nome (ex: Natal)" />
            <button type="button" class="btn btn-primary btn-sm" id="btn-add-feriado">Adicionar</button>
          </div>
          <div id="feriado-erro" style="color:var(--red);font-size:13px;min-height:16px;margin-top:6px"></div>
        </div>
      </div>
    </div>

    <!-- ── STATUS ── -->
    <div class="tab-panel" id="tab-status">
      <div class="content-header"><h1>Status da conta</h1><p>Informações sobre assinatura e métricas de uso.</p></div>
      <div class="content-body">
        <div class="section-card">
          <div class="section-card-header">
            <div class="section-card-title">Assinatura</div>
          </div>
          <div id="assinatura-status" class="vazio" style="margin-bottom:8px">Carregando…</div>
          <div id="assinatura-acao"></div>
        </div>
        <div class="section-card">
          <div class="section-card-header">
            <div class="section-card-title">Métricas</div>
          </div>
          <div id="metricas-corpo" class="vazio">Carregando métricas…</div>
        </div>
      </div>
    </div>
  </div>
</div>

<div class="save-bar">
  <button type="button" class="btn btn-primary" id="btn-salvar">Salvar alterações</button>
  <span id="status-salvar"></span>
</div>

<script>
window.__PAINEL__ = {
  config: ${jsonParaScript(config)},
  dias: ${jsonParaScript(DIAS)},
  nomeDia: ${jsonParaScript(NOME_DIA)},
  assinatura: ${jsonParaScript(assinatura)}
};
</script>
<script src="/clinica/painel.js"></script>
<link rel="stylesheet" href="/page-transition.css" />
<link rel="stylesheet" href="/loading-screen.css" />
<script src="/page-transition.js"></script>
</body>
</html>`;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");

  const auth = await autenticarClinica(req, res);
  if (auth.erro) {
    // Esta rota serve HTML: sessao invalida vira redirect para o login,
    // nao JSON. Erro de configuracao continua sendo 500.
    if (auth.erro.status === 500) return res.status(500).json(auth.erro.corpo);
    if (auth.supabase) await auth.supabase.auth.signOut();
    return res.redirect(302, "/clinica/login");
  }
  const { admin, perfil } = auth;

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
