import { autenticarClinica } from "../_lib/auth-clinica.js";
import { configEditavelPadrao, DIAS } from "../_lib/config-editavel.js";
import { getCategoriaConfig, getCategoriaMeta } from "../../_lib/categorias.js";

const NOME_DIA = {
  segunda: "Segunda",
  terca: "Terça",
  quarta: "Quarta",
  quinta: "Quinta",
  sexta: "Sexta",
  sabado: "Sábado",
  domingo: "Domingo",
};

// Payment Links do Stripe — os MESMOS que o n8n usa (workflow "Verificação de
// Trial", node "Config Fixa": stripe_link_mensal / stripe_link_anual). Se o
// preço mudar, trocar lá E aqui. O sufixo ?client_reference_id=<clinica_id>
// é o que faz o checkout.session.completed vincular a clínica sozinho.
const LINK_MENSAL = "https://buy.stripe.com/28E4gz8iv3HU97Tcv7gbm01";
const LINK_ANUAL = "https://buy.stripe.com/dRm28r42fa6i97T9iVgbm02";

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

function paginaPainel(
  nomeClinica,
  config,
  tempoPausaAtual,
  assinatura,
  categoriaDados,
  telefoneAlerta = "",
) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Painel da clínica · Recepta AI</title>
<meta name="robots" content="noindex,nofollow">
<script>
/* Tema: roda ANTES de qualquer CSS pintar, senão o painel pisca branco a
   cada carregamento pra quem usa escuro. Sem preferência salva, segue o
   sistema operacional. try/catch porque localStorage joga exceção em
   navegador com dados de site bloqueados. */
(function () {
  try {
    var salvo = localStorage.getItem("recepta-tema");
    var escuro = salvo
      ? salvo === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (escuro) document.documentElement.setAttribute("data-theme", "dark");
  } catch (e) {
    /* segue no tema claro */
  }
})();
</script>
<link rel="icon" type="image/png" sizes="32x32" href="/img/favicon-32.png">
<link rel="icon" type="image/png" sizes="512x512" href="/img/favicon-512.png">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/flatpickr.min.css">
<style>
:root {
  --bg: #f8fafc; --surface: #ffffff; --ink: #0f172a; --muted: #64748b;
  --border: #e2e8f0;  --accent: #151749; --accent-soft: #f1f5f9;
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
body { font-family: "Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--ink); font-size: 14px; line-height: 1.6; -webkit-font-smoothing: antialiased; }
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
.nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-radius: var(--radius); cursor: pointer; font-size: 13px; font-weight: 500; color: var(--muted); transition: all 0.15s ease; border: none; background: none; width: 100%; text-align: left; text-decoration: none; }
.nav-item:hover { background: var(--accent-soft); color: var(--ink); }
.nav-item.active { background: var(--primary); color: #fff; box-shadow: 0 2px 8px rgba(79,70,229,0.3); }
.nav-item .icon { width: 20px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 15px; }
.nav-item .icon svg { width: 18px; height: 18px; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; fill: none; }
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
/* O bloco central do item cresce; nome e observacao truncam em vez de
   empurrar a badge e os botoes para fora da linha. */
.ag-info { flex: 1; min-width: 0; }
.ag-nome { font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ag-phone { font-size: 12px; color: var(--muted); font-weight: 500; }
.ag-obs { font-size: 12px; color: var(--muted); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ag-actions { display: flex; gap: 6px; }
.vazio { color: var(--muted); font-size: 13px; font-style: italic; padding: 12px 0; }

/* ── Empty states ── */
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 48px 24px; }
.empty-state-icon { width: 40px; height: 40px; color: var(--border); margin-bottom: 16px; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; fill: none; }
.empty-state-title { font-size: 15px; font-weight: 600; color: var(--ink); margin-bottom: 6px; }
.empty-state-desc { font-size: 13px; color: var(--muted); max-width: 320px; line-height: 1.5; margin-bottom: 16px; }
.empty-state .btn { font-size: 13px; }

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
.modal-field input, .modal-field textarea { width: 100%; padding: 9px 12px; border: 1.5px solid var(--border); border-radius: var(--radius); font-size: 13px; background: var(--surface); color: var(--ink); transition: all 0.2s; }
.modal-field input:focus, .modal-field textarea:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--ring); }
.modal-field textarea { resize: vertical; min-height: 68px; line-height: 1.6; }
.modal-error { color: var(--red); font-size: 12px; min-height: 18px; margin-bottom: 10px; }
.modal-actions { display: flex; gap: 10px; justify-content: flex-end; }

/* -- Lista de detalhes (aba Status) --
   Rotulo a esquerda com largura fixa e valor a direita; em telas estreitas
   vira duas linhas em vez de espremer o valor. */
.det-lista { display: flex; flex-direction: column; gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.det-linha { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 10px 14px; background: var(--surface); font-size: 13px; }
.det-rotulo { color: var(--muted); flex: 0 0 auto; }
.det-valor { color: var(--ink); font-weight: 600; text-align: right; min-width: 0; overflow-wrap: anywhere; }
.det-valor.alerta { color: var(--red); }
.det-nota { font-size: 12px; color: var(--muted); margin-top: 10px; line-height: 1.5; }
@media (max-width: 520px) {
  .det-linha { flex-direction: column; gap: 2px; }
  .det-valor { text-align: left; }
}

/* -- Conversa (thread) --
   Fundo do thread: canvas slate-100 com dot-grid discreto (padrao dos chats do
   21st.dev). Existe para os baloes brancos terem borda visivel contra o fundo:
   sobre o branco do modal o balao do paciente sumia. Contraste do texto:
   --ink (#0f172a) sobre #fff = 17.8:1 e sobre --primary-soft (#eef2ff) = 16.4:1,
   os dois passam WCAG AAA. */
.modal-chat { max-width: 640px; padding: 0; display: flex; flex-direction: column; max-height: 86vh; overflow: hidden; }
.chat-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 22px; border-bottom: 1px solid var(--border); background: var(--surface); }
.chat-head .modal-sub { margin: 2px 0 0; }
.chat-close { width: 30px; height: 30px; flex: 0 0 auto; border-radius: 8px; border: 1.5px solid var(--border); background: var(--surface); color: var(--muted); cursor: pointer; font-size: 15px; line-height: 1; transition: all 0.2s ease; }
.chat-close:hover { background: var(--accent-soft); color: var(--ink); }
.chat-close:focus-visible { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--ring); }
.chat-thread { flex: 1; overflow-y: auto; padding: 20px 22px; display: flex; flex-direction: column; gap: 10px; background-color: #f1f5f9; background-image: radial-gradient(circle at 1px 1px, rgba(15,23,42,0.07) 1px, transparent 0); background-size: 18px 18px; }
.chat-thread::-webkit-scrollbar { width: 8px; }
.chat-thread::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
.chat-day { align-self: center; margin: 6px 0; font-size: 11px; font-weight: 600; color: var(--muted); background: rgba(255,255,255,0.92); border: 1px solid var(--border); padding: 3px 12px; border-radius: 999px; }
.chat-row { display: flex; flex-direction: column; max-width: 78%; }
.chat-row.ia { align-self: flex-end; align-items: flex-end; }
.chat-row.paciente { align-self: flex-start; align-items: flex-start; }
.chat-autor { font-size: 10.5px; font-weight: 600; color: var(--muted); margin-bottom: 3px; padding: 0 4px; text-transform: uppercase; letter-spacing: 0.4px; }
.chat-bubble { padding: 9px 13px; border-radius: 14px; font-size: 13.5px; line-height: 1.55; color: var(--ink); white-space: pre-wrap; overflow-wrap: anywhere; box-shadow: var(--shadow-sm); }
.chat-row.paciente .chat-bubble { background: #ffffff; border: 1px solid var(--border); border-bottom-left-radius: 4px; }
.chat-row.ia .chat-bubble { background: var(--primary-soft); border: 1px solid #c7d2fe; border-bottom-right-radius: 4px; }
.chat-hora { font-size: 10.5px; color: var(--muted); margin-top: 3px; padding: 0 4px; }
.conv-card { border: 1.5px solid var(--border); border-radius: var(--radius); padding: 12px 16px; margin-bottom: 8px; cursor: pointer; background: var(--surface); transition: box-shadow 0.2s ease, border-color 0.2s ease; }
.conv-card:hover { box-shadow: var(--shadow); border-color: #c7d2fe; }
.conv-card:focus-visible { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--ring); }
.conv-pausada { border-color: #fbbf24; background: #fffbeb; }
.conv-pausada:hover { border-color: #f59e0b; }
@media (max-width: 768px) {
  .modal-chat { max-height: 92vh; }
  .chat-row { max-width: 88%; }
}

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
/* ── Gate de assinatura expirada ── */
.gate-overlay { position: fixed; inset: 0; z-index: 200; background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; padding: 20px; }
.gate-overlay.hidden { display: none; }
.gate-card { background: var(--surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); max-width: 460px; width: 100%; padding: 28px; text-align: center; animation: fadeUp 0.25s ease; }
.gate-card h2 { font-size: 18px; font-weight: 700; letter-spacing: -0.3px; margin: 12px 0 6px; }
.gate-card .gate-lead { font-size: 13px; color: var(--muted); margin-bottom: 18px; }
.gate-card .gate-lead strong { color: var(--ink); }
.gate-plano { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
.gate-btn { display: block; width: 100%; padding: 11px 16px; border-radius: var(--radius); border: none; cursor: pointer; font-size: 13px; font-weight: 600; text-decoration: none; transition: all 0.15s ease; }
.gate-btn strong { font-size: 13.5px; }
.gate-btn small { display: block; font-size: 11.5px; font-weight: 400; opacity: 0.85; }
.gate-btn-mensal { background: var(--primary); color: #fff; }
.gate-btn-mensal:hover { background: var(--primary-hover); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(79,70,229,0.3); }
.gate-btn-anual { background: var(--primary-soft); color: var(--primary); border: 1.5px solid #c7d2fe; }
.gate-btn-anual:hover { background: #e0e7ff; }
.gate-nota { font-size: 11.5px; color: var(--muted); line-height: 1.5; }

/* ── Banner de conexão pendente ── */
.whatsapp-banner { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-bottom: 1.5px solid #f59e0b; padding: 14px 24px; display: flex; align-items: center; gap: 14px; flex-shrink: 0; animation: fadeDown 0.3s ease; }
@keyframes fadeDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
.whatsapp-banner .banner-icon { font-size: 22px; flex-shrink: 0; }
.whatsapp-banner .banner-text { flex: 1; font-size: 13.5px; color: #92400e; line-height: 1.5; }
.whatsapp-banner .banner-text strong { font-weight: 700; }
.whatsapp-banner .banner-btn { padding: 8px 18px; border-radius: var(--radius); background: #ea580c; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; border: none; white-space: nowrap; transition: all 0.15s ease; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
.whatsapp-banner .banner-btn:hover { background: #c2410c; transform: translateY(-1px); box-shadow: 0 2px 8px rgba(234,88,12,0.3); }
.whatsapp-banner.hidden { display: none; }
</style>
<link rel="stylesheet" href="/clinica/painel.css?v=20260910-theme-icon">
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
  <div class="topbar-right">
    <button id="btn-tema" class="theme-toggle" type="button" title="Alternar tema claro e escuro" aria-label="Alternar tema claro e escuro">
      <svg class="icon-lua" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      <svg class="icon-sol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v2M12 20.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1.5 12h2M20.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>
    </button>
    <button id="btn-sair" type="button">Sair</button>
  </div>
</div>

<div id="gate-overlay" class="gate-overlay${assinatura.gate?.ativo ? "" : " hidden"}">
  <div class="gate-card">
    <div style="font-size:30px">🔒</div>
    <h2>Assinatura expirada</h2>
    <p class="gate-lead">Sua assinatura da Recepta não está ativa. A Recepta <strong>parou de atender no WhatsApp</strong> e o painel está bloqueado enquanto durar a pendência.</p>
    <div class="gate-plano">
      <a id="gate-link-mensal" class="gate-btn gate-btn-mensal" target="_blank" rel="noopener" href="#">
        <strong>Assinar plano mensal</strong>
        <small>R$ 497/mês, sem fidelidade</small>
      </a>
      <a id="gate-link-anual" class="gate-btn gate-btn-anual" target="_blank" rel="noopener" href="#">
        <strong>Assinar plano anual</strong>
        <small>R$ 347/mês, cobrado à vista no ano (R$ 4.164)</small>
      </a>
      <button type="button" class="btn btn-ghost btn-sm" id="gate-btn-verificar" style="width:100%">Já paguei — verificar agora</button>
    </div>
    <p class="gate-nota">O painel volta sozinho após a confirmação do pagamento — se demorar mais que 1 minuto, clique em "verificar agora".</p>
  </div>
</div>

<div id="whatsapp-banner" class="whatsapp-banner hidden">
  <span class="banner-icon">⚠️</span>
  <span class="banner-text"><strong>Sua Recepta ainda não está conectada ao WhatsApp.</strong> Os pacientes não estão sendo atendidos.</span>
  <a href="/clinica/conectar" class="banner-btn">Conectar agora</a>
</div>

<div class="layout">
  <nav class="sidebar">
    <div class="sidebar-section">Clínica</div>
    <button class="nav-item active" data-tab="agenda"><span class="icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span><span>Agenda</span></button>
    <button class="nav-item" data-tab="horarios"><span class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span><span>Horários</span></button>
    <button class="nav-item" data-tab="precos"><span class="icon"><svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></span><span>Preços</span></button>
    <button class="nav-item" data-tab="procedimentos" id="nav-procedimentos" style="display:none"><span class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span><span id="nav-procedimentos-label">Procedimentos</span></button>
    <button class="nav-item" data-tab="convenios"><span class="icon"><svg viewBox="0 0 24 24"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01"/><path d="M9 12v.01"/><path d="M9 15v.01"/><path d="M9 18v.01"/></svg></span><span>Convênios</span></button>
    <div class="sidebar-section">Recepta</div>
    <a class="nav-item" href="/clinica/conectar"><span class="icon"><svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></span><span>Conectar WhatsApp</span></a>
    <button class="nav-item" data-tab="mensagem"><span class="icon"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span><span>Mensagem</span></button>
    <button class="nav-item" data-tab="regras"><span class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span><span>Regras</span></button>
    <button class="nav-item" data-tab="faq"><span class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span><span>FAQ</span></button>
    <button class="nav-item" data-tab="conversas"><span class="icon"><svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg></span><span>Conversas</span></button>
    <div class="sidebar-section">Conta</div>
    <button class="nav-item" data-tab="pausa"><span class="icon"><svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></span><span>Pausa</span></button>
    <button class="nav-item" data-tab="perfil"><span class="icon"><svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span><span>Perfil</span></button>
    <button class="nav-item" data-tab="feriados"><span class="icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="10" y1="14" x2="14" y2="14"/></svg></span><span>Feriados</span></button>
    <button class="nav-item" data-tab="status"><span class="icon"><svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span><span>Status</span></button>
  </nav>

  <div class="content">
    <!-- ── AGENDA ── -->
    <div class="tab-panel active" id="tab-agenda">
      <div class="content-header"><h1>Agenda</h1><p>Consultas marcadas pela secretária virtual e pela clínica.</p></div>
      <div class="content-body">
        <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
          <button type="button" class="btn btn-primary btn-sm" id="btn-novo-agendamento">+ Novo agendamento</button>
        </div>
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

    <!-- ── PROCEDIMENTOS (dinâmico por categoria) ── -->
    <div class="tab-panel" id="tab-procedimentos">
      <div class="content-header"><h1>Dados da clínica</h1><p>Informações específicas do segmento da sua clínica.</p></div>
      <div class="content-body">
        <div id="campos-categoria"></div>
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
      <div class="content-header"><h1>Pausa e alertas</h1><p>Quanto tempo a Recepta fica em silêncio e para onde ela chama um humano.</p></div>
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
        <div class="section-card">
          <div class="field">
            <label class="field-label">WhatsApp que recebe os alertas</label>
            <div class="field-desc">Quando a Recepta precisa de um humano, ela avisa neste número. Comece pelo DDD.</div>
            <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
              <input type="tel" id="telefone-alerta" class="field-input" maxlength="20" placeholder="53 99999-9999" value="${escapeHtml(telefoneAlerta)}" style="width:200px" />
              <button type="button" class="btn btn-primary btn-sm" id="btn-salvar-alerta">Salvar</button>
              <span id="status-alerta"></span>
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
          <div id="assinatura-status" class="vazio" style="margin-bottom:12px">Carregando…</div>
          <div id="assinatura-detalhes" style="margin-bottom:12px"></div>
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
  gate: ${jsonParaScript(assinatura.gate || { ativo: false })},
  config: ${jsonParaScript(config)},
  dias: ${jsonParaScript(DIAS)},
  nomeDia: ${jsonParaScript(NOME_DIA)},
  assinatura: ${jsonParaScript(assinatura)},
  categoria: ${jsonParaScript(categoriaDados.categoria)},
  categoriaMeta: ${jsonParaScript(categoriaDados.categoriaMeta)},
  tabsVisiveis: ${jsonParaScript(categoriaDados.tabsVisiveis)},
  camposExtras: ${jsonParaScript(categoriaDados.camposExtras)},
  regrasCategoria: ${jsonParaScript(categoriaDados.regrasCategoria)},
  faqCategoria: ${jsonParaScript(categoriaDados.faqCategoria)}
};

// ── Gate de assinatura: wiring do overlay ──
// Roda ANTES do painel.js: o overlay já vem visível pelo servidor quando
// gate.ativo, aqui só conecto os links reais e o botão de verificar.
(function () {
  var g = window.__PAINEL__.gate;
  if (!g || !g.ativo) return;
  var m = document.getElementById("gate-link-mensal");
  var a = document.getElementById("gate-link-anual");
  if (m) m.href = g.link_mensal;
  if (a) a.href = g.link_anual;
  var v = document.getElementById("gate-btn-verificar");
  if (v)
    v.addEventListener("click", function () {
      v.disabled = true;
      v.textContent = "Verificando…";
      window.location.reload();
    });
})();
</script>
<script src="https://cdn.jsdelivr.net/npm/lucide@1.43.0/dist/umd/lucide.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/flatpickr.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/l10n/pt.js"></script>
<script src="/clinica/painel.js?v=20260910-tabler"></script>
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
      "clinica,config_editavel,tempo_pausa_minutos,telefone_alerta,status,trial_fim,plano,stripe_customer_id,criado_em,categoria",
    )
    .eq("id", perfil.clinica_id)
    .maybeSingle();

  const categoriaId = clinicaRow?.categoria || "geral";
  const catConfig = getCategoriaConfig(categoriaId);
  const catMeta = getCategoriaMeta(categoriaId);

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
    faq: Array.isArray(configSalvo.faq) ? configSalvo.faq : padrao.faq,
    campos_extras:
      configSalvo.campos_extras && typeof configSalvo.campos_extras === "object"
        ? configSalvo.campos_extras
        : {},
    regras_categoria:
      typeof configSalvo.regras_categoria === "string"
        ? configSalvo.regras_categoria
        : "",
  };

  const tempoPausaAtual =
    typeof clinicaRow?.tempo_pausa_minutos === "number"
      ? clinicaRow.tempo_pausa_minutos
      : 10;

  const assinatura = {
    status: clinicaRow?.status || null,
    trial_fim: clinicaRow?.trial_fim || null,
    plano: clinicaRow?.plano || null,
    criado_em: clinicaRow?.criado_em || null,
    tem_stripe: !!clinicaRow?.stripe_customer_id,
  };

  // ── Gate de assinatura expirada ──
  // Status vem do n8n (único dono do vocabulário 'ativo'/'expirado'). Com a
  // clínica expirada o painel renderiza o overlay de bloqueio e as rotas de
  // escrita devolvem 402 (painel-acoes/config-salvar). Os links carregam
  // client_reference_id para o checkout religar a clínica automaticamente.
  // gate vai SEMPRE no __PAINEL__ (links incluídos mesmo com ativo:false):
  // o painel.js usa os hrefs quando um 402 chega no meio da sessão.
  assinatura.gate = {
    ativo: assinatura.status === "expirado",
    link_mensal: LINK_MENSAL + "?client_reference_id=" + perfil.clinica_id,
    link_anual: LINK_ANUAL + "?client_reference_id=" + perfil.clinica_id,
  };

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(
    paginaPainel(
      nomeClinica,
      config,
      tempoPausaAtual,
      assinatura,
      {
        categoria: categoriaId,
        categoriaMeta: catMeta,
        tabsVisiveis: catConfig.tabs,
        camposExtras: catConfig.camposExtras,
        regrasCategoria: catConfig.regrasPadrao || "",
        faqCategoria: catConfig.faqPadrao || [],
      },
      clinicaRow?.telefone_alerta || "",
    ),
  );
}

export { paginaPainel };
