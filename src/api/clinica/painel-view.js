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
var CONFIG = ${jsonParaScript(config)};
var DIAS = ${jsonParaScript(DIAS)};
var NOME_DIA = ${jsonParaScript(NOME_DIA)};
if (!CONFIG.regras_ia) CONFIG.regras_ia = '';
if (!Array.isArray(CONFIG.faq)) CONFIG.faq = [];

// ── Tab navigation ──
var navItems = document.querySelectorAll('.nav-item[data-tab]');
navItems.forEach(function(btn) {
  btn.addEventListener('click', function() {
    navItems.forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ── Helpers ──
function el(tag, attrs, filhos) {
  var e = document.createElement(tag);
  attrs = attrs || {};
  Object.keys(attrs).forEach(function(k) {
    if (k === 'text') e.textContent = attrs[k];
    else e.setAttribute(k, attrs[k]);
  });
  (filhos || []).forEach(function(f) { e.appendChild(f); });
  return e;
}

// ── Agenda ──
function formatarTelefone(tel) {
  var d = String(tel || '').replace(/\\D/g, '');
  return d ? '+' + d : '(sem telefone)';
}
function agendaItem(item, passado) {
  var dt = new Date(item.data_hora);
  var dataStr = dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
  var horaStr = dt.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  var cancelado = item.status === 'cancelado';
  var badge = cancelado
    ? el('span', { class: 'badge badge-muted', text: 'Cancelado' })
    : el('span', { class: 'badge badge-green', text: 'Agendado' });
  var filhos = [
    el('div', {}, [el('div', { class: 'ag-date', text: dataStr }), el('div', { class: 'ag-time', text: horaStr })]),
    el('div', { class: 'ag-phone', text: formatarTelefone(item.paciente_telefone) }),
    badge
  ];
  if (!passado && !cancelado) {
    var actions = el('div', { class: 'ag-actions' });
    var btnR = el('button', { type: 'button', class: 'btn-icon', text: '✎', title: 'Remarcar' });
    btnR.addEventListener('click', function() { abrirModalRemarcar(item); });
    var btnC = el('button', { type: 'button', class: 'btn-icon', text: '✕', title: 'Cancelar' });
    btnC.addEventListener('click', function() {
      if (!confirm('Cancelar este agendamento?')) return;
      btnC.disabled = true;
      fetch('/api/clinica/painel-acoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'cancelar_agendamento', agendamento_id: item.id }) })
        .then(function(r) { return r.json(); })
        .then(function(res) {
          if (res.erro) { alert('Erro: ' + res.erro); btnC.disabled = false; return; }
          badge.className = 'badge badge-muted'; badge.textContent = 'Cancelado';
          btnC.style.display = 'none'; btnR.style.display = 'none';
        }).catch(function() { btnC.disabled = false; alert('Falha de conexão.'); });
    });
    actions.appendChild(btnR); actions.appendChild(btnC);
    filhos.push(actions);
  }
  return el('div', { class: 'ag-item' + (passado ? ' opacity:0.5' : '') }, filhos);
}

function abrirModalRemarcar(item) {
  var existente = document.getElementById('modal-remarcar');
  if (existente) existente.remove();
  var dt = new Date(item.data_hora);
  var modal = el('div', { id: 'modal-remarcar', class: 'modal-overlay' });
  var conteudo = el('div', { class: 'modal-content' });
  conteudo.appendChild(el('h3', { text: 'Remarcar agendamento' }));
  conteudo.appendChild(el('p', { class: 'modal-sub', text: formatarTelefone(item.paciente_telefone) }));
  var lData = el('div', { class: 'modal-field' }, [el('label', { text: 'Nova data' })]);
  var iData = el('input', { type: 'date', value: dt.toISOString().slice(0, 10) });
  lData.appendChild(iData);
  var lHora = el('div', { class: 'modal-field' }, [el('label', { text: 'Novo horário' })]);
  var iHora = el('input', { type: 'time', value: dt.toTimeString().slice(0, 5) });
  lHora.appendChild(iHora);
  var erroMsg = el('p', { class: 'modal-error' });
  var actions = el('div', { class: 'modal-actions' });
  var btnC = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancelar' });
  btnC.addEventListener('click', function() { modal.remove(); });
  var btnOK = el('button', { type: 'button', class: 'btn btn-primary', text: 'Remarcar' });
  btnOK.addEventListener('click', function() {
    if (!iData.value || !iHora.value) { erroMsg.textContent = 'Preencha data e horário.'; return; }
    btnOK.disabled = true; btnOK.textContent = 'Remarcando…';
    fetch('/api/clinica/painel-acoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'remarcar_agendamento', agendamento_id: item.id, nova_data_hora: iData.value + 'T' + iHora.value + ':00' }) })
      .then(function(r) { return r.json(); })
      .then(function(res) {
        if (res.erro) { erroMsg.textContent = res.erro === 'data_invalida' ? 'Data/hora inválida.' : 'Erro: ' + res.erro; btnOK.disabled = false; btnOK.textContent = 'Remarcar'; return; }
        modal.remove(); carregarAgenda();
      }).catch(function() { erroMsg.textContent = 'Falha de conexão.'; btnOK.disabled = false; btnOK.textContent = 'Remarcar'; });
  });
  actions.appendChild(btnC); actions.appendChild(btnOK);
  conteudo.appendChild(lData); conteudo.appendChild(lHora); conteudo.appendChild(erroMsg); conteudo.appendChild(actions);
  modal.appendChild(conteudo);
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
  iData.focus();
}

function renderAgenda(agendamentos) {
  var elStatus = document.getElementById('agenda-status');
  var elProx = document.getElementById('agenda-proximos');
  var elAntW = document.getElementById('agenda-anteriores-wrap');
  var elAnt = document.getElementById('agenda-anteriores');
  elProx.innerHTML = ''; elAnt.innerHTML = '';
  if (!agendamentos.length) { elStatus.textContent = 'Nenhum agendamento por aqui ainda.'; elStatus.style.display = ''; return; }
  var agora = new Date(), proximos = [], anteriores = [];
  agendamentos.forEach(function(item) { (new Date(item.data_hora) >= agora ? proximos : anteriores).push(item); });
  anteriores.reverse();
  elStatus.style.display = 'none';
  if (proximos.length) { proximos.forEach(function(item) { elProx.appendChild(agendaItem(item, false)); }); }
  else { elStatus.style.display = ''; elStatus.textContent = 'Nenhum agendamento futuro.'; }
  if (anteriores.length) { elAntW.style.display = ''; anteriores.forEach(function(item) { elAnt.appendChild(agendaItem(item, true)); }); }
  else { elAntW.style.display = 'none'; }
}
function carregarAgenda() {
  fetch('/api/clinica/agenda-listar').then(function(r) { return r.json(); })
    .then(function(j) { if (j.ok) renderAgenda(j.agendamentos || []); else document.getElementById('agenda-status').textContent = 'Erro ao carregar.'; })
    .catch(function() { document.getElementById('agenda-status').textContent = 'Falha de conexão.'; });
}
carregarAgenda();

// ── Preços ──
var elPrecos = document.getElementById('lista-precos');
function renderPrecos() {
  elPrecos.innerHTML = '';
  if (!CONFIG.precos.length) { elPrecos.appendChild(el('p', { class: 'vazio', text: 'Nenhum preço cadastrado.' })); return; }
  CONFIG.precos.forEach(function(item, i) {
    var iN = el('input', { type: 'text', placeholder: 'Nome do serviço', value: item.nome });
    iN.addEventListener('input', function() { CONFIG.precos[i].nome = iN.value; });
    var iV = el('input', { type: 'number', step: '0.01', min: '0', placeholder: 'R$', value: item.valor });
    iV.addEventListener('input', function() { CONFIG.precos[i].valor = parseFloat(iV.value || '0'); });
    var btn = el('button', { type: 'button', class: 'btn-icon', text: '×', title: 'Remover' });
    btn.addEventListener('click', function() { CONFIG.precos.splice(i, 1); renderPrecos(); });
    elPrecos.appendChild(el('div', { class: 'item-row' }, [iN, iV, btn]));
  });
}
document.getElementById('add-preco').addEventListener('click', function() { CONFIG.precos.push({ nome: '', valor: 0 }); renderPrecos(); });

// ── Convênios ──
var elConv = document.getElementById('lista-convenios');
function renderConvenios() {
  elConv.innerHTML = '';
  if (!CONFIG.convenios.length) { elConv.appendChild(el('p', { class: 'vazio', text: 'Nenhum convênio cadastrado.' })); return; }
  CONFIG.convenios.forEach(function(nome, i) {
    var iN = el('input', { type: 'text', placeholder: 'Nome do convênio', value: nome });
    iN.addEventListener('input', function() { CONFIG.convenios[i] = iN.value; });
    var btn = el('button', { type: 'button', class: 'btn-icon', text: '×', title: 'Remover' });
    btn.addEventListener('click', function() { CONFIG.convenios.splice(i, 1); renderConvenios(); });
    elConv.appendChild(el('div', { class: 'item-row' }, [iN, btn]));
  });
}
document.getElementById('add-convenio').addEventListener('click', function() { CONFIG.convenios.push(''); renderConvenios(); });

// ── Horários ──
var elHorarios = document.getElementById('lista-horarios');
function renderHorarios() {
  elHorarios.innerHTML = '';
  DIAS.forEach(function(dia) {
    var faixas = CONFIG.horarios[dia] || (CONFIG.horarios[dia] = []);
    var wrap = el('div', { class: 'day-block' });
    var cab = el('div', { class: 'day-header' }, [el('b', { text: NOME_DIA[dia] })]);
    if (!faixas.length) cab.appendChild(el('span', { class: 'closed', text: 'Fechado' }));
    wrap.appendChild(cab);
    faixas.forEach(function(f, i) {
      var iI = el('input', { type: 'time', value: f.inicio || '' });
      iI.addEventListener('input', function() { f.inicio = iI.value; });
      var iF = el('input', { type: 'time', value: f.fim || '' });
      iF.addEventListener('input', function() { f.fim = iF.value; });
      var btn = el('button', { type: 'button', class: 'btn-icon', text: '×', title: 'Remover' });
      btn.addEventListener('click', function() { faixas.splice(i, 1); renderHorarios(); });
      wrap.appendChild(el('div', { class: 'item-row' }, [iI, document.createTextNode('até'), iF, btn]));
    });
    var btnAdd = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: faixas.length ? '+ Adicionar faixa' : '+ Abrir nesse dia' });
    btnAdd.addEventListener('click', function() { faixas.push({ inicio: '08:00', fim: '18:00' }); renderHorarios(); });
    wrap.appendChild(btnAdd);
    elHorarios.appendChild(wrap);
  });
}

// ── Mensagem ──
var elMsg = document.getElementById('mensagem-identidade');
var elContMsg = document.getElementById('contador-mensagem');
elMsg.value = CONFIG.mensagem_identidade || '';
elContMsg.textContent = elMsg.value.length;
elMsg.addEventListener('input', function() { elContMsg.textContent = elMsg.value.length; });

// ── Regras ──
var elRegras = document.getElementById('regras-ia');
var elContRegras = document.getElementById('contador-regras');
elRegras.value = CONFIG.regras_ia || '';
elContRegras.textContent = elRegras.value.length;
elRegras.addEventListener('input', function() { elContRegras.textContent = elRegras.value.length; });

// ── FAQ ──
var elFaq = document.getElementById('lista-faq');
function renderFaq() {
  elFaq.innerHTML = '';
  if (!CONFIG.faq.length) { elFaq.appendChild(el('p', { class: 'vazio', text: 'Nenhuma pergunta cadastrada.' })); return; }
  CONFIG.faq.forEach(function(item, i) {
    var wrap = el('div', { class: 'faq-item' });
    var cab = el('div', { class: 'faq-header' });
    var iP = el('input', { type: 'text', placeholder: 'Pergunta do paciente', value: item.pergunta });
    iP.addEventListener('input', function() { CONFIG.faq[i].pergunta = iP.value; });
    var btn = el('button', { type: 'button', class: 'btn-icon', text: '×', title: 'Remover' });
    btn.addEventListener('click', function() { CONFIG.faq.splice(i, 1); renderFaq(); });
    cab.appendChild(iP); cab.appendChild(btn); wrap.appendChild(cab);
    var tA = el('textarea', { placeholder: 'Resposta da Recepta', rows: '2' });
    tA.value = item.resposta;
    tA.addEventListener('input', function() { CONFIG.faq[i].resposta = tA.value; });
    wrap.appendChild(tA);
    elFaq.appendChild(wrap);
  });
}
document.getElementById('add-faq').addEventListener('click', function() { if (CONFIG.faq.length >= 20) return; CONFIG.faq.push({ pergunta: '', resposta: '' }); renderFaq(); });

// ── Render all ──
renderPrecos(); renderConvenios(); renderHorarios(); renderFaq();

// ── Save ──
var elStatusSalvar = document.getElementById('status-salvar');
var elBtnSalvar = document.getElementById('btn-salvar');
elBtnSalvar.addEventListener('click', function() {
  elStatusSalvar.textContent = '';
  elBtnSalvar.disabled = true; elBtnSalvar.textContent = 'Salvando…';
  fetch('/api/clinica/config-salvar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ precos: CONFIG.precos, horarios: CONFIG.horarios, convenios: CONFIG.convenios, mensagem_identidade: elMsg.value, regras_ia: elRegras.value, faq: CONFIG.faq })
  }).then(function(r) { return r.json().then(function(j) { return { ok: r.ok, corpo: j }; }); })
    .then(function(res) {
      elBtnSalvar.disabled = false; elBtnSalvar.textContent = 'Salvar alterações';
      if (!res.ok) { elStatusSalvar.innerHTML = '<span class="badge badge-red">Erro ao salvar</span>'; return; }
      CONFIG = res.corpo.config;
      renderPrecos(); renderConvenios(); renderHorarios(); renderFaq();
      elRegras.value = CONFIG.regras_ia || ''; elContRegras.textContent = elRegras.value.length;
      elStatusSalvar.innerHTML = '<span class="badge badge-green">Salvo!</span>';
      setTimeout(function() { elStatusSalvar.innerHTML = ''; }, 3000);
    }).catch(function() {
      elBtnSalvar.disabled = false; elBtnSalvar.textContent = 'Salvar alterações';
      elStatusSalvar.innerHTML = '<span class="badge badge-red">Falha de conexão</span>';
    });
});

// ── Logout ──
document.getElementById('btn-sair').addEventListener('click', function() {
  fetch('/api/clinica/logout', { method: 'POST' }).then(function() { window.location.href = '/clinica/login'; });
});

// ── Pausa ──
document.getElementById('btn-salvar-pausa').addEventListener('click', function() {
  var elSP = document.getElementById('status-pausa');
  var v = parseInt(document.getElementById('tempo-pausa').value, 10);
  elSP.innerHTML = '';
  if (!Number.isInteger(v) || v < 1 || v > 120) { elSP.innerHTML = '<span class="badge badge-red">Informe 1–120</span>'; return; }
  fetch('/api/clinica/painel-acoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'tempo_pausa', tempo_pausa_minutos: v }) })
    .then(function(r) { return r.json(); })
    .then(function(res) { elSP.innerHTML = res.ok ? '<span class="badge badge-green">Salvo!</span>' : '<span class="badge badge-red">Erro</span>'; })
    .catch(function() { elSP.innerHTML = '<span class="badge badge-red">Falha</span>'; });
});

// ── Assinatura ──
var ASSINATURA = ${jsonParaScript(assinatura)};
(function() {
  var elS = document.getElementById('assinatura-status');
  var elA = document.getElementById('assinatura-acao');
  var lbl = ASSINATURA.status === 'ativo' ? 'Assinatura ativa' : (ASSINATURA.status === 'trial' ? 'Período de teste' : (ASSINATURA.status || 'Desconhecido'));
  var partes = [lbl];
  if (ASSINATURA.plano) partes.push('Plano: ' + (ASSINATURA.plano === 'anual' ? 'Anual' : 'Mensal'));
  if (ASSINATURA.trial_fim) partes.push('Trial até ' + new Date(ASSINATURA.trial_fim).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }));
  elS.textContent = partes.join(' · ');
  elS.className = ASSINATURA.status === 'ativo' ? 'badge badge-green' : (ASSINATURA.status === 'trial' ? 'badge badge-muted' : 'badge badge-muted');
  if (ASSINATURA.tem_stripe) {
    var btn = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Gerenciar assinatura' });
    btn.addEventListener('click', function() {
      btn.disabled = true; btn.textContent = 'Abrindo…';
      fetch('/api/clinica/painel-acoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'portal_sessao' }) })
        .then(function(r) { return r.json(); })
        .then(function(res) { if (res.ok && res.url) window.location.href = res.url; else { btn.disabled = false; btn.textContent = 'Gerenciar assinatura'; } })
        .catch(function() { btn.disabled = false; btn.textContent = 'Gerenciar assinatura'; });
    });
    elA.appendChild(btn);
  }
})();

// ── Conversas (monitoramento) ──
function carregarConversas() {
  fetch('/api/clinica/painel-acoes?acao=metricas').then(function(r){return r.json();}).then(function(res){
    if (!res.ok) { document.getElementById('conv-status').textContent='Erro ao carregar.'; return; }
    // Carregar conversas via Supabase (RLS filtra pela clínica)
    fetch('/api/painel/config',{cache:'no-store'}).then(function(r){return r.json();}).then(function(cfg){
      var sb = window.__supabase || null;
      if (!sb && window.createClient) { sb = window.createClient(cfg.url, cfg.anonKey); window.__supabase = sb; }
      if (!sb) { document.getElementById('conv-status').textContent='Erro de configuração.'; return; }
      sb.from('conversas').select('id,telefone,clinica,role,mensagem,criado_em').order('criado_em',{ascending:false}).limit(200).then(function(r2){
        if(r2.error){document.getElementById('conv-status').textContent='Erro ao carregar.';return;}
        renderConversas(r2.data||[]);
      });
    });
  });
}
function renderConversas(msgs) {
  var elSt = document.getElementById('conv-status');
  var elLi = document.getElementById('conv-lista');
  elLi.innerHTML = '';
  if (!msgs.length) { elSt.textContent='Nenhuma conversa ainda.'; elSt.style.display=''; return; }
  elSt.style.display='none';
  var porTel = {};
  msgs.forEach(function(m){
    if(!porTel[m.telefone]) porTel[m.telefone]={telefone:m.telefone, msgs:[]};
    porTel[m.telefone].msgs.push(m);
  });
  Object.values(porTel).forEach(function(conv){
    var div = document.createElement('div');
    div.style.cssText='border:1.5px solid var(--border);border-radius:var(--radius);padding:12px 16px;margin-bottom:8px;cursor:pointer;transition:all 0.2s';
    div.onmouseover=function(){div.style.boxShadow='var(--shadow)';};
    div.onmouseout=function(){div.style.boxShadow='none';};
    var tel = conv.telefone;
    var d = String(tel||'').replace(/\\D/g,'');
    if((d.length===12||d.length===13)&&d.indexOf('55')===0)d=d.slice(2);
    var telFmt = d.length>=10 ? '('+d.slice(0,2)+') '+d.slice(2) : tel;
    var ult = conv.msgs[0];
    var role = ult.role==='ia'?'Recepta: ':'Paciente: ';
    var corpo = ult.mensagem||'';
    try { var o=JSON.parse(corpo); if(o&&o.mimetype) corpo=(o.mimetype.indexOf('audio')>=0?'🎤 Áudio':o.mimetype.indexOf('image')>=0?'🖼 Imagem':'📎 Doc'); } catch(e){}
    if(corpo.length>80) corpo=corpo.slice(0,80)+'…';
    var dt = new Date(ult.criado_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    div.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><b style="font-size:14px">'+telFmt+'</b><span style="font-size:11px;color:var(--muted)">'+dt+'</span></div><div style="font-size:12.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+role+escapeHtml(corpo).replace(/\n/g,' ')+'</div><div style="font-size:11px;color:var(--muted);margin-top:2px">'+conv.msgs.length+' mensagens</div>';
    elLi.appendChild(div);
  });
}
carregarConversas();

// ── Perfil ──
(function(){
  var elNome = document.getElementById('perfil-nome');
  var elSn = document.getElementById('perfil-senha-atual');
  var elNs = document.getElementById('perfil-nova-senha');
  var elErr = document.getElementById('perfil-erro');
  var elSt = document.getElementById('perfil-status');
  // Carregar nome atual
  fetch('/api/clinica/painel-acoes?acao=metricas').then(function(){});
  document.getElementById('btn-salvar-perfil').addEventListener('click', function(){
    elErr.textContent=''; elSt.innerHTML='';
    var body = {};
    if(elNome.value.trim()) body.nome=elNome.value.trim();
    if(elSn.value&&elNs.value){ body.senha_atual=elSn.value; body.nova_senha=elNs.value; }
    if(!body.nome&&!body.nova_senha){ elErr.textContent='Preencha pelo menos um campo.'; return; }
    if(body.nova_senha&&body.nova_senha.length<8){ elErr.textContent='Nova senha precisa ter pelo menos 8 caracteres.'; return; }
    fetch('/api/clinica/perfil',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json();}).then(function(res){
      if(res.erro){elErr.textContent=res.detalhes?res.detalhes.join(' '):'Erro: '+res.erro;return;}
      elSn.value=''; elNs.value='';
      elSt.innerHTML='<span class="badge badge-green">Salvo!</span>';
      setTimeout(function(){elSt.innerHTML='';},3000);
    }).catch(function(){elErr.textContent='Falha de conexão.';});
  });
})();

// ── Feriados ──
var feriadosDados = [];
function carregarFeriados(){
  fetch('/api/clinica/feriados').then(function(r){return r.json();}).then(function(d){
    feriadosDados=d.feriados||[];
    renderFeriados();
  });
}
function renderFeriados(){
  var elLi=document.getElementById('feriados-lista');
  elLi.innerHTML='';
  if(!feriadosDados.length){elLi.innerHTML='<p class="vazio">Nenhum feriado cadastrado.</p>';return;}
  feriadosDados.forEach(function(f){
    var div=document.createElement('div');
    div.style.cssText='display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)';
    var d=new Date(f.data+'T12:00:00');
    var dataFmt=d.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'});
    div.innerHTML='<div style="min-width:100px;font-weight:600;font-size:13px">'+dataFmt+'</div><div style="flex:1;color:var(--muted);font-size:13px">'+escapeHtml(f.nome||'—')+'</div>';
    var btn=document.createElement('button');btn.className='btn-icon';btn.textContent='×';btn.title='Remover';
    btn.addEventListener('click',function(){
      fetch('/api/clinica/feriados',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({acao:'remover',id:f.id})}).then(function(){carregarFeriados();});
    });
    div.appendChild(btn);
    elLi.appendChild(div);
  });
}
document.getElementById('btn-add-feriado').addEventListener('click',function(){
  var data=document.getElementById('feriado-data').value;
  var nome=document.getElementById('feriado-nome').value.trim();
  var elErr=document.getElementById('feriado-erro');
  elErr.textContent='';
  if(!data){elErr.textContent='Selecione uma data.';return;}
  fetch('/api/clinica/feriados',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({acao:'adicionar',data:data,nome:nome||null})}).then(function(r){return r.json();}).then(function(res){
    if(res.erro){elErr.textContent=res.erro==='data_ja_cadastrada'?'Data já cadastrada.':'Erro: '+res.erro;return;}
    document.getElementById('feriado-data').value='';
    document.getElementById('feriado-nome').value='';
    carregarFeriados();
  });
});
carregarFeriados();

// ── Métricas ──
fetch('/api/clinica/painel-acoes?acao=metricas')
  .then(function(r) { return r.json(); })
  .then(function(res) {
    var elC = document.getElementById('metricas-corpo');
    if (!res.ok) { elC.textContent = 'Erro ao carregar métricas.'; return; }
    elC.className = ''; elC.innerHTML = '';
    var grid = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' });
    var item1 = el('div', { style: 'text-align:center;padding:12px;background:var(--accent-soft);border-radius:var(--radius)' }, [
      el('div', { style: 'font-size:24px;font-weight:700;color:var(--primary)', text: String(res.total_conversas || 0) }),
      el('div', { style: 'font-size:12px;color:var(--muted)', text: 'Conversas' })
    ]);
    var item2 = el('div', { style: 'text-align:center;padding:12px;background:var(--accent-soft);border-radius:var(--radius)' }, [
      el('div', { style: 'font-size:24px;font-weight:700;color:var(--primary)', text: String(res.total_escalonamentos || 0) }),
      el('div', { style: 'font-size:12px;color:var(--muted)', text: 'Escalonamentos' })
    ]);
    grid.appendChild(item1); grid.appendChild(item2); elC.appendChild(grid);
  }).catch(function() { document.getElementById('metricas-corpo').textContent = 'Falha de conexão.'; });
</script>
<link rel="stylesheet" href="/page-transition.css" />
<link rel="stylesheet" href="/loading-screen.css" />
<script src="/page-transition.js"></script>
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
