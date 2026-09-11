// JavaScript do painel da clinica.
//
// Vive aqui, e nao dentro do template literal de api/clinica/painel-view.js,
// porque la todo escape passava por duas camadas: um "\n" com barra simples
// virava newline real no script emitido e derrubava o parse do bloco inteiro,
// sem erro nenhum no servidor. Aconteceu duas vezes (177b850, 29eaf81).
//
// Os dados do servidor chegam por window.__PAINEL__, montado pelo painel-view.

var DADOS = window.__PAINEL__ || {};
var CONFIG = DADOS.config || {};
var DIAS = DADOS.dias || [];
var NOME_DIA = DADOS.nomeDia || {};
if (!CONFIG.regras_ia) CONFIG.regras_ia = "";
if (!Array.isArray(CONFIG.faq)) CONFIG.faq = [];

// ── Categorias ──
var CATEGORIA = DADOS.categoria || "geral";
var CATEGORIA_META = DADOS.categoriaMeta || {};
var TABS_VISIVEIS = DADOS.tabsVisiveis || [];
var CAMPOS_EXTRAS = DADOS.camposExtras || [];
var CAMPOS_SALVOS = CONFIG.campos_extras || {};
var REGRAS_CATEGORIA = DADOS.regrasCategoria || "";
var FAQ_CATEGORIA = DADOS.faqCategoria || [];
var TIER_RECURSOS = (DADOS.assinatura || {}).tier || "essencial";

// ── Tabs dinâmicas: esconde/mostra nav items conforme a categoria ──
(function () {
  // Tabs que a sidebar SEMPRE mostra (não são data-tab, são links)
  var SEMPRE_VISIVEIS = ["conectar"];
  // Tabs que a sidebar mostra (data-tab)
  var TABS_SIDEBAR = [
    "agenda",
    "fila",
    "horarios",
    "precos",
    "procedimentos",
    "convenios",
    "mensagem",
    "regras",
    "faq",
    "conversas",
    "pausa",
    "perfil",
    "feriados",
    "status",
  ];
  // Mapeamento de label por tab
  var LABELS = {
    agenda: "Agenda",
    horarios: "Horários",
    precos: "Preços",
    procedimentos: "Dados da clínica",
    convenios: "Convênios",
    mensagem: "Mensagem",
    regras: "Regras",
    faq: "FAQ",
    conversas: "Conversas",
    pausa: "Pausa",
    perfil: "Perfil",
    feriados: "Feriados",
    status: "Status",
    fila: "Fila de espera",
  };
  var ICONS = {
    agenda: "calendar-days",
    horarios: "clock-3",
    precos: "badge-dollar-sign",
    procedimentos: "sliders-horizontal",
    convenios: "building-2",
    mensagem: "message-square-text",
    regras: "list-checks",
    faq: "circle-help",
    conversas: "messages-square",
    pausa: "pause-circle",
    perfil: "user-round",
    feriados: "calendar-off",
    status: "chart-no-axes-column-increasing",
    fila: "list-ordered",
  };

  TABS_SIDEBAR.forEach(function (tab) {
    var navBtn = document.querySelector('.nav-item[data-tab="' + tab + '"]');
    if (!navBtn) return;
    var visivel = TABS_VISIVEIS.indexOf(tab) !== -1;
    if (tab === "fila") visivel = TIER_RECURSOS === "completo";
    navBtn.style.display = visivel ? "" : "none";
    var icon = navBtn.querySelector(".icon");
    if (icon && ICONS[tab] && window.lucide) {
      icon.innerHTML = '<i data-lucide="' + ICONS[tab] + '"></i>';
    }
  });

  var conectarIcon = document.querySelector(
    '.nav-item[href="/clinica/conectar"] .icon',
  );
  if (conectarIcon && window.lucide) {
    conectarIcon.innerHTML = '<i data-lucide="message-circle-more"></i>';
  }
  if (window.lucide) window.lucide.createIcons();

  // Atualiza label da aba procedimentos
  var navProc = document.getElementById("nav-procedimentos");
  var labelProc = document.getElementById("nav-procedimentos-label");
  if (navProc && CAMPOS_EXTRAS.length > 0) {
    var temProcedimentos = TABS_VISIVEIS.indexOf("procedimentos") !== -1;
    navProc.style.display = temProcedimentos ? "" : "none";
    if (labelProc && CATEGORIA_META.nome) {
      labelProc.textContent = "Dados da clínica";
    }
  }
  // ── Fila de espera (tier Completo, API server-side) ──
  function carregarFilaPainel() {
    var status = document.getElementById("fila-status"), lista = document.getElementById("fila-lista");
    if (!status || !lista) return;
    fetch("/api/clinica/fila").then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); }).then(function (x) {
      if (x.r.status === 403) { status.textContent = "A fila de espera está disponível somente no plano Completo."; lista.innerHTML = ""; return; }
      if (!x.j.ok) { status.textContent = "Não foi possível carregar a fila."; return; }
      var itens = x.j.entradas || []; lista.innerHTML = "";
      if (!itens.length) { status.style.display = ""; status.textContent = "Fila vazia."; return; }
      status.style.display = "none";
      itens.forEach(function (item) {
        var row = document.createElement("div"); row.className = "item-row";
        var horario = item.status === "ofertado" ? item.oferta_inicio : item.janela_inicio;
        var janela = horario ? new Date(horario).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Horário incompleto";
        row.innerHTML = "<div><strong>" + escapeHtml(item.paciente_nome || item.paciente_telefone) + "</strong><br><small>" + escapeHtml(item.servico || "") + " · " + janela + " · " + escapeHtml(item.status) + (item.oferta_expira_em ? " · expira " + new Date(item.oferta_expira_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "") + "</small></div>";
        if (["aguardando", "ofertado"].indexOf(item.status) >= 0) { var b = document.createElement("button"); b.className = "btn btn-danger btn-sm"; b.textContent = "Cancelar"; b.onclick = function () { responderFila("cancelar", item.id, b); }; row.appendChild(b); }
        if (item.status === "ofertado") { [ ["Aceitar", "aceitar"], ["Recusar", "recusar"] ].forEach(function (pair) { var x = document.createElement("button"); x.className = "btn btn-sm"; x.textContent = pair[0]; x.onclick = function () { responderFila(pair[1], item.id, x); }; row.appendChild(x); }); }
        lista.appendChild(row);
      });
    }).catch(function () { status.textContent = "Falha de conexão."; });
  }
  function responderFila(acao, id, botao) {
    var status = document.getElementById("fila-status");
    if (["cancelar", "recusar"].indexOf(acao) >= 0 && !window.confirm(acao === "cancelar" ? "Cancelar esta entrada da fila?" : "Recusar esta oferta?")) return;
    if (botao) { botao.disabled = true; botao.setAttribute("aria-busy", "true"); }
    status.style.display = "";
    status.textContent = "Atualizando fila...";
    fetch("/api/clinica/fila", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: acao, id: id }) })
      .then(function (r) { return r.json().then(function (j) {
        if (!r.ok || !j.ok) {
          status.style.display = "";
          status.textContent = j.mensagem || (j.erro === "horario_ocupado" ? "Esse horário já está ocupado. Escolha outra oferta." : "Não foi possível atualizar a oferta.");
          return;
        }
        carregarFilaPainel();
      }); })
      .catch(function () { status.style.display = ""; status.textContent = "Falha de conexão. Tente novamente."; })
      .finally(function () { if (botao) { botao.disabled = false; botao.removeAttribute("aria-busy"); } });
  }
  if (TIER_RECURSOS === "completo") {
    document.querySelectorAll('[data-tab="fila"]').forEach(function (b) { b.addEventListener("click", carregarFilaPainel); });
  }
})();

// ── Tab navigation ──
// Guarda a aba ativa no localStorage pra sobreviver a um F5: sem isso o
// reload sempre volta pra Agenda (default do HTML servido pelo servidor).
var CHAVE_TAB_ATIVA = "painel_tab_ativa";
var navItems = document.querySelectorAll(".nav-item[data-tab]");
function ativarTab(tab, opts) {
  var btn = document.querySelector('.nav-item[data-tab="' + tab + '"]');
  var painel = document.getElementById("tab-" + tab);
  if (!btn || !painel || btn.style.display === "none") return false;
  navItems.forEach(function (b) {
    b.classList.remove("active");
  });
  document.querySelectorAll(".tab-panel").forEach(function (p) {
    p.classList.remove("active");
  });
  btn.classList.add("active");
  painel.classList.add("active");
  if (!opts || opts.salvar !== false) {
    try {
      localStorage.setItem(CHAVE_TAB_ATIVA, tab);
    } catch (e) {
      // localStorage indisponível (aba privada etc) — sem persistência, sem quebrar o painel
    }
  }
  return true;
}
navItems.forEach(function (btn) {
  btn.addEventListener("click", function () {
    ativarTab(btn.dataset.tab);
  });
});
(function restaurarTabAtiva() {
  var salva = null;
  try {
    salva = localStorage.getItem(CHAVE_TAB_ATIVA);
  } catch (e) {
    // sem localStorage, mantém o default (agenda) já ativo no HTML
  }
  if (salva) ativarTab(salva, { salvar: false });
})();

// ── Helpers ──
// escapeHtml era chamado em renderConversas e renderFeriados mas so existia no
// SERVIDOR (painel-view.js). No navegador era ReferenceError: as duas listas
// quebravam e, pior, o escape em que elas confiavam nunca rodou. Definido aqui.
function escapeHtml(valor) {
  return String(valor == null ? "" : valor).replace(/[&<>"']/g, function (c) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c];
  });
}

function el(tag, attrs, filhos) {
  var e = document.createElement(tag);
  attrs = attrs || {};
  Object.keys(attrs).forEach(function (k) {
    if (k === "text") e.textContent = attrs[k];
    else e.setAttribute(k, attrs[k]);
  });
  (filhos || []).forEach(function (f) {
    e.appendChild(f);
  });
  return e;
}

// ── Empty state helper ──
var EMPTY_SVG = {
  calendar:
    '<svg viewBox="0 0 24 24" class="empty-state-icon"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  dollar:
    '<svg viewBox="0 0 24 24" class="empty-state-icon"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  building:
    '<svg viewBox="0 0 24 24" class="empty-state-icon"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01"/><path d="M9 12v.01"/><path d="M9 15v.01"/><path d="M9 18v.01"/></svg>',
  help: '<svg viewBox="0 0 24 24" class="empty-state-icon"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  chat: '<svg viewBox="0 0 24 24" class="empty-state-icon"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  info: '<svg viewBox="0 0 24 24" class="empty-state-icon"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
};
function emptyStateHtml(icon, title, desc, ctaHtml) {
  return (
    '<div class="empty-state">' +
    EMPTY_SVG[icon] +
    '<div class="empty-state-title">' +
    title +
    "</div>" +
    '<div class="empty-state-desc">' +
    desc +
    "</div>" +
    (ctaHtml || "") +
    "</div>"
  );
}

// ── Agenda ──
function formatarTelefone(tel) {
  var d = String(tel || "").replace(/\D/g, "");
  return d ? "+" + d : "(sem telefone)";
}
// Bloco central do item da agenda. Sem nome (todo agendamento feito pela
// Recepta, e os manuais em que a clinica nao preencheu) o telefone continua
// sendo a linha principal, entao a agenda antiga fica identica ao que era.
// Com nome, o telefone vira a linha secundaria.
function infoAgenda(item) {
  var info = el("div", { class: "ag-info" });
  var nome = (item.paciente_nome || "").trim();
  var telefone = formatarTelefone(item.paciente_telefone);

  if (nome) {
    info.appendChild(el("div", { class: "ag-nome", title: nome, text: nome }));
    info.appendChild(el("div", { class: "ag-phone", text: telefone }));
  } else {
    info.appendChild(el("div", { class: "ag-nome", text: telefone }));
  }

  var obs = (item.observacao || "").trim();
  // title guarda o texto inteiro: a linha trunca com ellipsis no CSS.
  if (obs)
    info.appendChild(el("div", { class: "ag-obs", title: obs, text: obs }));

  return info;
}

function agendaItem(item, passado) {
  var dt = new Date(item.data_hora);
  var dataStr = dt.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  });
  var horaStr = dt.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
  var cancelado = item.status === "cancelado";
  var badge = cancelado
    ? el("span", { class: "badge badge-muted", text: "Cancelado" })
    : el("span", { class: "badge badge-green", text: "Agendado" });
  var filhos = [
    el("div", {}, [
      el("div", { class: "ag-date", text: dataStr }),
      el("div", { class: "ag-time", text: horaStr }),
    ]),
    infoAgenda(item),
    badge,
  ];
  if (!passado && !cancelado) {
    var actions = el("div", { class: "ag-actions" });
    var btnR = el("button", {
      type: "button",
      class: "btn-icon",
      text: "✎",
      title: "Remarcar",
    });
    btnR.addEventListener("click", function () {
      abrirModalAgendamento(item);
    });
    var btnC = el("button", {
      type: "button",
      class: "btn-icon",
      text: "✕",
      title: "Cancelar",
    });
    btnC.addEventListener("click", function () {
      if (!confirm("Cancelar este agendamento?")) return;
      btnC.disabled = true;
      fetch("/api/clinica/painel-acoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "cancelar_agendamento",
          agendamento_id: item.id,
        }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (res) {
          if (res.erro) {
            alert("Erro: " + res.erro);
            btnC.disabled = false;
            return;
          }
          badge.className = "badge badge-muted";
          badge.textContent = "Cancelado";
          btnC.style.display = "none";
          btnR.style.display = "none";
        })
        .catch(function () {
          btnC.disabled = false;
          alert("Falha de conexão.");
        });
    });
    actions.appendChild(btnR);
    actions.appendChild(btnC);
    filhos.push(actions);
  }
  return el(
    "div",
    { class: "ag-item" + (passado ? " opacity:0.5" : "") },
    filhos,
  );
}

// Mensagens dos erros que o servidor devolve nos dois fluxos de agenda.
// Sem esse mapa a UI mostrava o codigo cru ("Erro: horario_ocupado").
// O painel inteiro exibe horario em America/Sao_Paulo, mas os <input date/time>
// devolvem "2026-09-02" + "15:00" sem fuso nenhum. O servidor roda em UTC, entao
// `new Date("2026-09-02T15:00:00")` virava 15:00Z = 12:00 em Brasilia: a clinica
// digitava 15h e a agenda mostrava 12h. Anexar o offset explicito resolve os dois
// fluxos de uma vez. O Brasil nao tem mais horario de verao desde 2019
// (Decreto 9.772/2019), entao Sao Paulo e' UTC-3 o ano todo.
var TZ_PAINEL = "America/Sao_Paulo";
var OFFSET_PAINEL = "-03:00";

// "YYYY-MM-DD" no fuso do painel. toISOString() daria a data em UTC, que depois
// das 21h em Brasilia ja e' o dia seguinte. en-CA formata como ISO.
function dataInputBR(dt) {
  return dt.toLocaleDateString("en-CA", { timeZone: TZ_PAINEL });
}

// "HH:MM" no fuso do painel. toTimeString() usaria o fuso do navegador, que nao
// e' necessariamente o da clinica.
function horaInputBR(dt) {
  return dt.toLocaleTimeString("pt-BR", {
    timeZone: TZ_PAINEL,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

var ERROS_AGENDA = {
  data_invalida: "Data e horario precisam estar no futuro.",
  telefone_invalido:
    "Telefone invalido. Use DDD + numero, ex: (11) 99999-9999.",
  nome_muito_longo: "Nome longo demais (maximo 120 caracteres).",
  observacao_muito_longa: "Descricao longa demais (maximo 500 caracteres).",
  horario_ocupado: "Ja existe um agendamento nesse horario.",
  agendamento_cancelado: "Esse agendamento ja foi cancelado.",
  agendamento_nao_encontrado: "Agendamento nao encontrado.",
  sem_permissao: "Sem permissao para essa agenda.",
};

// Modal de agendamento, um so para os dois fluxos: criar manual (item null) e
// remarcar (item preenchido). Eram duas telas quase identicas; a diferenca real
// e' o campo de telefone, que so o manual edita, e a acao enviada no POST.
function abrirModalAgendamento(item) {
  var existente = document.getElementById("modal-agendamento");
  if (existente) existente.remove();

  var novo = !item;
  var dt = novo ? null : new Date(item.data_hora);
  var modal = el("div", { id: "modal-agendamento", class: "modal-overlay" });
  var conteudo = el("div", { class: "modal-content" });

  conteudo.appendChild(
    el("h3", { text: novo ? "Novo agendamento" : "Remarcar agendamento" }),
  );
  conteudo.appendChild(
    el("p", {
      class: "modal-sub",
      text: novo
        ? "Consulta marcada pela clinica, fora da Recepta."
        : formatarTelefone(item.paciente_telefone),
    }),
  );

  // So o fluxo manual pede telefone: remarcar mantem o paciente que ja existe.
  var iTel = null;
  var iNome = null;
  var iObs = null;
  if (novo) {
    var lTel = el("div", { class: "modal-field" }, [
      el("label", { text: "Telefone do paciente" }),
    ]);
    iTel = el("input", {
      type: "tel",
      placeholder: "(11) 99999-9999",
      autocomplete: "off",
    });
    lTel.appendChild(iTel);
    conteudo.appendChild(lTel);

    var lNome = el("div", { class: "modal-field" }, [
      el("label", { text: "Nome do paciente (opcional)" }),
    ]);
    iNome = el("input", {
      type: "text",
      maxlength: "120",
      placeholder: "Maria Souza",
      autocomplete: "off",
    });
    lNome.appendChild(iNome);
    conteudo.appendChild(lNome);
  }

  var lData = el("div", { class: "modal-field" }, [
    el("label", { text: novo ? "Data" : "Nova data" }),
  ]);
  var iData = el("input", {
    type: "date",
    min: dataInputBR(new Date()),
    value: dt ? dataInputBR(dt) : "",
  });
  lData.appendChild(iData);

  var lHora = el("div", { class: "modal-field" }, [
    el("label", { text: novo ? "Horario" : "Novo horario" }),
  ]);
  var iHora = el("input", {
    type: "time",
    value: dt ? horaInputBR(dt) : "",
  });
  lHora.appendChild(iHora);

  var lObs = null;
  if (novo) {
    lObs = el("div", { class: "modal-field" }, [
      el("label", { text: "Descricao (opcional)" }),
    ]);
    iObs = el("textarea", {
      rows: "3",
      maxlength: "500",
      placeholder: "Motivo da consulta, retorno, convenio…",
    });
    lObs.appendChild(iObs);
  }

  var erroMsg = el("p", { class: "modal-error" });
  var rotulo = novo ? "Agendar" : "Remarcar";

  var btnC = el("button", {
    type: "button",
    class: "btn btn-ghost",
    text: "Cancelar",
  });
  btnC.addEventListener("click", function () {
    modal.remove();
  });

  var btnOK = el("button", {
    type: "button",
    class: "btn btn-primary",
    text: rotulo,
  });
  btnOK.addEventListener("click", function () {
    if (novo && !iTel.value.trim()) {
      erroMsg.textContent = "Informe o telefone do paciente.";
      return;
    }
    if (!iData.value || !iHora.value) {
      erroMsg.textContent = "Preencha data e horario.";
      return;
    }
    var dataHora = iData.value + "T" + iHora.value + ":00" + OFFSET_PAINEL;
    var corpo = novo
      ? {
          acao: "criar_agendamento",
          paciente_telefone: iTel.value,
          paciente_nome: iNome.value,
          observacao: iObs.value,
          data_hora: dataHora,
        }
      : {
          acao: "remarcar_agendamento",
          agendamento_id: item.id,
          nova_data_hora: dataHora,
        };
    btnOK.disabled = true;
    btnOK.textContent = novo ? "Agendando…" : "Remarcando…";
    fetch("/api/clinica/painel-acoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        if (res.erro) {
          erroMsg.textContent = ERROS_AGENDA[res.erro] || "Erro: " + res.erro;
          btnOK.disabled = false;
          btnOK.textContent = rotulo;
          return;
        }
        modal.remove();
        carregarAgenda();
      })
      .catch(function () {
        erroMsg.textContent = "Falha de conexao.";
        btnOK.disabled = false;
        btnOK.textContent = rotulo;
      });
  });

  var actions = el("div", { class: "modal-actions" }, [btnC, btnOK]);
  conteudo.appendChild(lData);
  conteudo.appendChild(lHora);
  if (lObs) conteudo.appendChild(lObs);
  conteudo.appendChild(erroMsg);
  conteudo.appendChild(actions);
  modal.appendChild(conteudo);
  modal.addEventListener("click", function (e) {
    if (e.target === modal) modal.remove();
  });
  document.body.appendChild(modal);
  if (window.flatpickr) {
    var localePt = window.flatpickr.l10ns && window.flatpickr.l10ns.pt;
    window.flatpickr(iData, {
      locale: localePt || "default",
      minDate: "today",
      dateFormat: "Y-m-d",
      altInput: true,
      altFormat: "d/m/Y",
      disableMobile: true,
    });
    window.flatpickr(iHora, {
      locale: localePt || "default",
      enableTime: true,
      noCalendar: true,
      dateFormat: "H:i",
      time_24hr: true,
      minuteIncrement: 5,
      disableMobile: true,
    });
  }
  var focoInicial = novo
    ? iTel
    : iData._flatpickr && iData._flatpickr.altInput
      ? iData._flatpickr.altInput
      : iData;
  focoInicial.focus();
}

function renderAgenda(agendamentos) {
  var elStatus = document.getElementById("agenda-status");
  var elProx = document.getElementById("agenda-proximos");
  var elAntW = document.getElementById("agenda-anteriores-wrap");
  var elAnt = document.getElementById("agenda-anteriores");
  elProx.innerHTML = "";
  elAnt.innerHTML = "";
  if (!agendamentos.length) {
    elStatus.innerHTML = emptyStateHtml(
      "calendar",
      "Agenda vazia",
      "Agendamentos feitos pela Recepta ou pela clínica aparecem aqui.",
    );
    elStatus.style.display = "";
    return;
  }
  var agora = new Date(),
    proximos = [],
    anteriores = [];
  agendamentos.forEach(function (item) {
    (new Date(item.data_hora) >= agora ? proximos : anteriores).push(item);
  });
  anteriores.reverse();
  elStatus.style.display = "none";
  if (proximos.length) {
    proximos.forEach(function (item) {
      elProx.appendChild(agendaItem(item, false));
    });
  } else {
    elStatus.style.display = "";
    elStatus.innerHTML = emptyStateHtml(
      "calendar",
      "Sem agendamentos futuros",
      "Agendamentos feitos pela Recepta ou pela clínica aparecem aqui.",
    );
  }
  if (anteriores.length) {
    elAntW.style.display = "";
    anteriores.forEach(function (item) {
      elAnt.appendChild(agendaItem(item, true));
    });
  } else {
    elAntW.style.display = "none";
  }
}
function carregarAgenda() {
  fetch("/api/clinica/agenda-listar")
    .then(function (r) {
      return r.json();
    })
    .then(function (j) {
      if (j.ok) renderAgenda(j.agendamentos || []);
      else
        document.getElementById("agenda-status").textContent =
          "Erro ao carregar.";
    })
    .catch(function () {
      document.getElementById("agenda-status").textContent =
        "Falha de conexão.";
    });
}
// item null = fluxo manual: a clinica marca uma consulta que nao passou pela
// Recepta (paciente que ligou, encaixe, balcao).
document
  .getElementById("btn-novo-agendamento")
  .addEventListener("click", function () {
    abrirModalAgendamento(null);
  });
carregarAgenda();

// ── Preços ──
var elPrecos = document.getElementById("lista-precos");
function renderPrecos() {
  elPrecos.innerHTML = "";
  if (!CONFIG.precos.length) {
    elPrecos.innerHTML = emptyStateHtml(
      "dollar",
      "Nenhum preço cadastrado",
      "Adicione os serviços e valores que a Recepta usa para informar pacientes.",
      '<button type="button" class="btn btn-primary" onclick="document.getElementById(\'add-preco\').click()">+ Adicionar preço</button>',
    );
    return;
  }
  CONFIG.precos.forEach(function (item, i) {
    var iN = el("input", {
      type: "text",
      placeholder: "Nome do serviço",
      value: item.nome,
    });
    iN.addEventListener("input", function () {
      CONFIG.precos[i].nome = iN.value;
    });
    var iV = el("input", {
      type: "number",
      step: "0.01",
      min: "0",
      placeholder: "R$",
      value: item.valor,
    });
    iV.addEventListener("input", function () {
      CONFIG.precos[i].valor = parseFloat(iV.value || "0");
    });
    var btn = el("button", {
      type: "button",
      class: "btn-icon",
      text: "×",
      title: "Remover",
    });
    btn.addEventListener("click", function () {
      CONFIG.precos.splice(i, 1);
      renderPrecos();
    });
    elPrecos.appendChild(el("div", { class: "item-row" }, [iN, iV, btn]));
  });
}
document.getElementById("add-preco").addEventListener("click", function () {
  CONFIG.precos.push({ nome: "", valor: 0 });
  renderPrecos();
});

// ── Convênios ──
var elConv = document.getElementById("lista-convenios");
function renderConvenios() {
  elConv.innerHTML = "";
  if (!CONFIG.convenios.length) {
    elConv.innerHTML = emptyStateHtml(
      "building",
      "Nenhum convênio cadastrado",
      "Adicione os convênios que a clínica aceita para informar os pacientes.",
      '<button type="button" class="btn btn-primary" onclick="document.getElementById(\'add-convenio\').click()">+ Adicionar convênio</button>',
    );
    return;
  }
  CONFIG.convenios.forEach(function (nome, i) {
    var iN = el("input", {
      type: "text",
      placeholder: "Nome do convênio",
      value: nome,
    });
    iN.addEventListener("input", function () {
      CONFIG.convenios[i] = iN.value;
    });
    var btn = el("button", {
      type: "button",
      class: "btn-icon",
      text: "×",
      title: "Remover",
    });
    btn.addEventListener("click", function () {
      CONFIG.convenios.splice(i, 1);
      renderConvenios();
    });
    elConv.appendChild(el("div", { class: "item-row" }, [iN, btn]));
  });
}
document.getElementById("add-convenio").addEventListener("click", function () {
  CONFIG.convenios.push("");
  renderConvenios();
});

// ── Horários ──
var elHorarios = document.getElementById("lista-horarios");
function renderHorarios() {
  elHorarios.innerHTML = "";
  DIAS.forEach(function (dia) {
    var faixas = CONFIG.horarios[dia] || (CONFIG.horarios[dia] = []);
    var wrap = el("div", { class: "day-block" });
    var cab = el("div", { class: "day-header" }, [
      el("b", { text: NOME_DIA[dia] }),
    ]);
    if (!faixas.length)
      cab.appendChild(el("span", { class: "closed", text: "Fechado" }));
    wrap.appendChild(cab);
    faixas.forEach(function (f, i) {
      var iI = el("input", { type: "time", value: f.inicio || "" });
      iI.addEventListener("input", function () {
        f.inicio = iI.value;
      });
      var iF = el("input", { type: "time", value: f.fim || "" });
      iF.addEventListener("input", function () {
        f.fim = iF.value;
      });
      var btn = el("button", {
        type: "button",
        class: "btn-icon",
        text: "×",
        title: "Remover",
      });
      btn.addEventListener("click", function () {
        faixas.splice(i, 1);
        renderHorarios();
      });
      wrap.appendChild(
        el("div", { class: "item-row" }, [
          iI,
          document.createTextNode("até"),
          iF,
          btn,
        ]),
      );
    });
    var btnAdd = el("button", {
      type: "button",
      class: "btn btn-ghost btn-sm",
      text: faixas.length ? "+ Adicionar faixa" : "+ Abrir nesse dia",
    });
    btnAdd.addEventListener("click", function () {
      faixas.push({ inicio: "08:00", fim: "18:00" });
      renderHorarios();
    });
    wrap.appendChild(btnAdd);
    elHorarios.appendChild(wrap);
  });
}

// ── Mensagem ──
var elMsg = document.getElementById("mensagem-identidade");
var elContMsg = document.getElementById("contador-mensagem");
elMsg.value = CONFIG.mensagem_identidade || "";
elContMsg.textContent = elMsg.value.length;
elMsg.addEventListener("input", function () {
  elContMsg.textContent = elMsg.value.length;
});

// ── Regras ──
var elRegras = document.getElementById("regras-ia");
var elContRegras = document.getElementById("contador-regras");
elRegras.value = CONFIG.regras_ia || "";
elContRegras.textContent = elRegras.value.length;
elRegras.addEventListener("input", function () {
  elContRegras.textContent = elRegras.value.length;
});

// ── FAQ ──
var elFaq = document.getElementById("lista-faq");
function renderFaq() {
  elFaq.innerHTML = "";
  if (!CONFIG.faq.length) {
    elFaq.innerHTML = emptyStateHtml(
      "help",
      "Nenhuma pergunta cadastrada",
      "Adicione perguntas frequentes que a Recepta usa para responder pacientes.",
    );
    return;
  }
  CONFIG.faq.forEach(function (item, i) {
    var wrap = el("div", { class: "faq-item" });
    var cab = el("div", { class: "faq-header" });
    var iP = el("input", {
      type: "text",
      placeholder: "Pergunta do paciente",
      value: item.pergunta,
    });
    iP.addEventListener("input", function () {
      CONFIG.faq[i].pergunta = iP.value;
    });
    var btn = el("button", {
      type: "button",
      class: "btn-icon",
      text: "×",
      title: "Remover",
    });
    btn.addEventListener("click", function () {
      CONFIG.faq.splice(i, 1);
      renderFaq();
    });
    cab.appendChild(iP);
    cab.appendChild(btn);
    wrap.appendChild(cab);
    var tA = el("textarea", { placeholder: "Resposta da Recepta", rows: "2" });
    tA.value = item.resposta;
    tA.addEventListener("input", function () {
      CONFIG.faq[i].resposta = tA.value;
    });
    wrap.appendChild(tA);
    elFaq.appendChild(wrap);
  });
}
document.getElementById("add-faq").addEventListener("click", function () {
  if (CONFIG.faq.length >= 20) return;
  CONFIG.faq.push({ pergunta: "", resposta: "" });
  renderFaq();
});

// ── Procedimentos (campos extras da categoria) ──
var elCamposCat = document.getElementById("campos-categoria");
function renderCamposCategoria() {
  if (!elCamposCat || !CAMPOS_EXTRAS.length) {
    if (elCamposCat)
      elCamposCat.innerHTML = emptyStateHtml(
        "info",
        "Nenhum dado específico",
        "Esta categoria não possui campos adicionais no momento.",
      );
    return;
  }
  elCamposCat.innerHTML = "";
  CAMPOS_EXTRAS.forEach(function (campo) {
    var section = document.createElement("div");
    section.className = "section-card";

    var lbl = document.createElement("label");
    lbl.className = "field-label";
    lbl.textContent = campo.label;
    section.appendChild(lbl);

    if (campo.desc) {
      var desc = document.createElement("div");
      desc.className = "field-desc";
      desc.textContent = campo.desc;
      section.appendChild(desc);
    }

    var valor = CAMPOS_SALVOS[campo.id];

    if (campo.tipo === "tags") {
      // Tags: input + lista de tags
      var tagWrap = document.createElement("div");
      tagWrap.className = "tags-wrap";
      tagWrap.style.cssText =
        "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px";
      var tagArr = Array.isArray(valor) ? valor : [];
      function renderTags() {
        tagWrap.innerHTML = "";
        tagArr.forEach(function (t, i) {
          var tag = document.createElement("span");
          tag.className = "badge";
          tag.style.cssText =
            "background:var(--primary-soft);color:var(--primary);padding:4px 10px;border-radius:999px;font-size:12px;display:inline-flex;align-items:center;gap:4px";
          tag.textContent = t;
          var rm = document.createElement("button");
          rm.type = "button";
          rm.textContent = "×";
          rm.style.cssText =
            "background:none;border:none;color:var(--primary);cursor:pointer;font-size:14px;padding:0 2px";
          rm.addEventListener("click", function () {
            tagArr.splice(i, 1);
            CAMPOS_SALVOS[campo.id] = tagArr;
            renderTags();
          });
          tag.appendChild(rm);
          tagWrap.appendChild(tag);
        });
      }
      renderTags();
      section.appendChild(tagWrap);
      var tagInput = document.createElement("input");
      tagInput.type = "text";
      tagInput.className = "field-input";
      tagInput.placeholder = campo.placeholder || "Digite e pressione Enter";
      tagInput.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          var v = tagInput.value.trim();
          if (v && tagArr.indexOf(v) === -1) {
            tagArr.push(v);
            CAMPOS_SALVOS[campo.id] = tagArr;
            renderTags();
          }
          tagInput.value = "";
        }
      });
      section.appendChild(tagInput);
    } else if (campo.tipo === "select") {
      var sel = document.createElement("select");
      sel.className = "field-input";
      sel.innerHTML = '<option value="">Selecione…</option>';
      (campo.opcoes || []).forEach(function (op) {
        var opt = document.createElement("option");
        opt.value = op;
        opt.textContent = op;
        if (valor === op) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener("change", function () {
        CAMPOS_SALVOS[campo.id] = sel.value;
      });
      section.appendChild(sel);
    } else if (campo.tipo === "check") {
      var checkWrap = document.createElement("label");
      checkWrap.style.cssText =
        "display:flex;align-items:center;gap:8px;cursor:pointer";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!valor;
      cb.addEventListener("change", function () {
        CAMPOS_SALVOS[campo.id] = cb.checked;
      });
      checkWrap.appendChild(cb);
      var cbLabel = document.createElement("span");
      cbLabel.style.cssText = "font-size:13px";
      cbLabel.textContent = campo.label;
      checkWrap.appendChild(cbLabel);
      section.innerHTML = "";
      if (campo.desc) {
        var desc2 = document.createElement("div");
        desc2.className = "field-desc";
        desc2.textContent = campo.desc;
        section.appendChild(desc2);
      }
      section.appendChild(checkWrap);
    } else if (campo.tipo === "textarea") {
      var ta = document.createElement("textarea");
      ta.className = "field-input";
      ta.rows = "3";
      ta.maxLength = "1000";
      ta.placeholder = campo.placeholder || "";
      ta.value = valor || "";
      ta.addEventListener("input", function () {
        CAMPOS_SALVOS[campo.id] = ta.value;
      });
      section.appendChild(ta);
    } else {
      // text (padrão)
      var inp = document.createElement("input");
      inp.type = "text";
      inp.className = "field-input";
      inp.placeholder = campo.placeholder || "";
      inp.value = valor || "";
      inp.addEventListener("input", function () {
        CAMPOS_SALVOS[campo.id] = inp.value;
      });
      section.appendChild(inp);
    }

    elCamposCat.appendChild(section);
  });
}

// ── Render all ──
renderPrecos();
renderConvenios();
renderHorarios();
renderFaq();
renderCamposCategoria();

// ── Save ──
var elStatusSalvar = document.getElementById("status-salvar");
var elBtnSalvar = document.getElementById("btn-salvar");
elBtnSalvar.addEventListener("click", function () {
  elStatusSalvar.textContent = "";
  elBtnSalvar.disabled = true;
  elBtnSalvar.textContent = "Salvando…";
  fetch("/api/clinica/config-salvar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      precos: CONFIG.precos,
      horarios: CONFIG.horarios,
      convenios: CONFIG.convenios,
      mensagem_identidade: elMsg.value,
      regras_ia: elRegras.value,
      faq: CONFIG.faq,
      campos_extras: CAMPOS_SALVOS,
      categoria: CATEGORIA,
      regras_categoria: REGRAS_CATEGORIA,
    }),
  })
    .then(function (r) {
      return r.json().then(function (j) {
        return { ok: r.ok, corpo: j };
      });
    })
    .then(function (res) {
      elBtnSalvar.disabled = false;
      elBtnSalvar.textContent = "Salvar alterações";
      if (!res.ok) {
        elStatusSalvar.innerHTML =
          '<span class="badge badge-red">Erro ao salvar</span>';
        return;
      }
      CONFIG = res.corpo.config;
      CAMPOS_SALVOS = CONFIG.campos_extras || {};
      renderPrecos();
      renderConvenios();
      renderHorarios();
      renderFaq();
      renderCamposCategoria();
      elRegras.value = CONFIG.regras_ia || "";
      elContRegras.textContent = elRegras.value.length;
      elStatusSalvar.innerHTML =
        '<span class="badge badge-green">Salvo!</span>';
      setTimeout(function () {
        elStatusSalvar.innerHTML = "";
      }, 3000);
    })
    .catch(function () {
      elBtnSalvar.disabled = false;
      elBtnSalvar.textContent = "Salvar alterações";
      elStatusSalvar.innerHTML =
        '<span class="badge badge-red">Falha de conexão</span>';
    });
});

// ── Tema claro/escuro ──
// O tema inicial já foi aplicado por um script inline no <head> (evita o
// flash branco). Aqui só fica a troca por clique e a persistência.
document.getElementById("btn-tema").addEventListener("click", function () {
  var escuroAgora =
    document.documentElement.getAttribute("data-theme") === "dark";
  if (escuroAgora) {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
  }
  try {
    localStorage.setItem("recepta-tema", escuroAgora ? "light" : "dark");
  } catch (e) {
    // Navegador com armazenamento bloqueado: o tema vale só nesta aba.
  }
  atualizarTemaGrafico();
});

// ── Logout ──
document.getElementById("btn-sair").addEventListener("click", function () {
  fetch("/api/clinica/painel-acoes?acao=logout", { method: "GET" }).then(
    function () {
      window.location.href = "/clinica/login";
    },
  );
});

// ── Pausa ──
document
  .getElementById("btn-salvar-pausa")
  .addEventListener("click", function () {
    var elSP = document.getElementById("status-pausa");
    var v = parseInt(document.getElementById("tempo-pausa").value, 10);
    elSP.innerHTML = "";
    if (!Number.isInteger(v) || v < 1 || v > 120) {
      elSP.innerHTML = '<span class="badge badge-red">Informe 1–120</span>';
      return;
    }
    fetch("/api/clinica/painel-acoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "tempo_pausa", tempo_pausa_minutos: v }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        elSP.innerHTML = res.ok
          ? '<span class="badge badge-green">Salvo!</span>'
          : '<span class="badge badge-red">Erro</span>';
      })
      .catch(function () {
        elSP.innerHTML = '<span class="badge badge-red">Falha</span>';
      });
  });

// ── Telefone que recebe os alertas de escalonamento ──
var elTelAlerta = document.getElementById("telefone-alerta");
if (elTelAlerta && elTelAlerta.value) {
  // O banco guarda E.164 sem "+", a tela mostra "(53) 991635302".
  elTelAlerta.value = telefoneBonito(elTelAlerta.value);
}

document
  .getElementById("btn-salvar-alerta")
  .addEventListener("click", function () {
    var elSA = document.getElementById("status-alerta");
    var v = document.getElementById("telefone-alerta").value;
    elSA.innerHTML = "";
    if (String(v).replace(/\D/g, "").length < 10) {
      elSA.innerHTML = '<span class="badge badge-red">Número inválido</span>';
      return;
    }
    fetch("/api/clinica/painel-acoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "telefone_alerta", telefone_alerta: v }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        if (res.ok) {
          document.getElementById("telefone-alerta").value = telefoneBonito(
            res.telefone_alerta,
          );
          elSA.innerHTML = '<span class="badge badge-green">Salvo!</span>';
        } else {
          elSA.innerHTML = '<span class="badge badge-red">Erro</span>';
        }
      })
      .catch(function () {
        elSA.innerHTML = '<span class="badge badge-red">Falha</span>';
      });
  });

// ── Assinatura ──
var ASSINATURA = DADOS.assinatura || {};

// dd/mm/aaaa no fuso do painel, a partir de uma string ISO.
function dataBR(iso) {
  if (!iso) return null;
  var d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { timeZone: TZ_PAINEL });
}

// O Stripe manda o valor em centavos e a moeda em minusculo ("brl").
function moedaBR(centavos, moeda) {
  if (typeof centavos !== "number") return null;
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: (moeda || "brl").toUpperCase(),
    }).format(centavos / 100);
  } catch (e) {
    return (centavos / 100).toFixed(2);
  }
}

// Dias inteiros que faltam para uma data. Compara so a parte de data, senao
// "termina hoje as 23h" apareceria como 0 dia igual a uma data ja vencida.
function diasAte(iso) {
  var alvo = new Date(iso);
  if (isNaN(alvo.getTime())) return null;
  var hoje = new Date();
  var msDia = 24 * 60 * 60 * 1000;
  return Math.ceil(
    (alvo.setHours(0, 0, 0, 0) - hoje.setHours(0, 0, 0, 0)) / msDia,
  );
}

var INTERVALO_LABEL = { month: "mes", year: "ano", week: "semana", day: "dia" };

// Rotulos dos status que o Stripe devolve. O que nao estiver aqui aparece cru,
// que e' melhor do que esconder um estado de cobranca que a clinica precisa ver.
var STATUS_STRIPE = {
  active: "Ativa",
  trialing: "Em periodo de teste",
  past_due: "Pagamento atrasado",
  unpaid: "Pagamento pendente",
  canceled: "Cancelada",
  incomplete: "Pagamento incompleto",
  incomplete_expired: "Pagamento expirado",
  paused: "Pausada",
};

function linhaDetalhe(rotulo, valor, alerta) {
  return el("div", { class: "det-linha" }, [
    el("span", { class: "det-rotulo", text: rotulo }),
    el("span", {
      class: "det-valor" + (alerta ? " alerta" : ""),
      text: valor,
    }),
  ]);
}

(function () {
  var elS = document.getElementById("assinatura-status");
  var elD = document.getElementById("assinatura-detalhes");
  var elA = document.getElementById("assinatura-acao");

  // ── Badge: sai do banco, aparece de imediato, sem esperar o Stripe ──
  // clinicas.status so conhece 'ativo' e 'expirado' (vocabulario do n8n) —
  // nao existe status 'trial'. Clinica em teste = status ativo + trial_fim no
  // futuro (o checkout zera trial_fim, entao pagante nunca cai aqui).
  var ehAtivo = ASSINATURA.status === "ativo";
  var ehTrial =
    ehAtivo &&
    !!ASSINATURA.trial_fim &&
    new Date(ASSINATURA.trial_fim).getTime() > Date.now();
  elS.textContent = ehTrial
    ? "Periodo de teste"
    : ehAtivo
      ? "Assinatura ativa"
      : ASSINATURA.status || "Desconhecido";
  elS.className =
    ehTrial || !ehAtivo ? "badge badge-muted" : "badge badge-green";

  // ── Detalhes do banco ──
  var lista = el("div", { class: "det-lista" });
  var temLinha = false;
  function addLinha(rotulo, valor, alerta) {
    if (!valor) return;
    lista.appendChild(linhaDetalhe(rotulo, valor, alerta));
    temLinha = true;
  }

  addLinha(
    "Recursos",
    ASSINATURA.tier === "completo" ? "Completo" : "Essencial",
  );

  addLinha(
    "Plano",
    ASSINATURA.plano
      ? ASSINATURA.plano === "anual"
        ? "Anual"
        : "Mensal"
      : null,
  );

  if (ASSINATURA.trial_fim) {
    var dias = diasAte(ASSINATURA.trial_fim);
    var restante =
      dias === null
        ? ""
        : dias > 1
          ? " (" + dias + " dias restantes)"
          : dias === 1
            ? " (ultimo dia)"
            : dias === 0
              ? " (termina hoje)"
              : " (expirado)";
    addLinha(
      "Teste ate",
      dataBR(ASSINATURA.trial_fim) + restante,
      dias !== null && dias <= 3,
    );
  }

  addLinha("Cliente desde", dataBR(ASSINATURA.criado_em));

  if (temLinha) elD.appendChild(lista);

  // ── Cobranca: so o Stripe sabe valor, proxima fatura e cartao ──
  // Falha aqui nao apaga o que ja esta na tela: o endpoint devolve
  // { assinatura: null } em vez de erro justamente para isso.
  if (ASSINATURA.tem_stripe) {
    fetch("/api/clinica/painel-acoes?acao=assinatura")
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        var a = res && res.assinatura;
        if (!a) return;

        if (a.status && a.status !== "active")
          addLinha(
            "Situacao da cobranca",
            STATUS_STRIPE[a.status] || a.status,
            true,
          );

        var valor = moedaBR(a.valor_centavos, a.moeda);
        if (valor)
          addLinha(
            "Valor",
            valor +
              (a.intervalo
                ? " / " + (INTERVALO_LABEL[a.intervalo] || a.intervalo)
                : ""),
          );

        // Com cancelamento agendado a mesma data deixa de ser "proxima
        // cobranca" e passa a ser o fim do acesso: rotulo errado aqui faria a
        // clinica achar que ainda vai ser cobrada.
        if (a.periodo_fim)
          addLinha(
            a.cancela_no_fim ? "Acesso ate" : "Proxima cobranca",
            dataBR(a.periodo_fim),
            a.cancela_no_fim,
          );

        if (a.cartao_final)
          addLinha(
            "Pagamento",
            (a.cartao_bandeira
              ? a.cartao_bandeira.charAt(0).toUpperCase() +
                a.cartao_bandeira.slice(1)
              : "Cartao") +
              " •••• " +
              a.cartao_final,
          );

        if (temLinha && !lista.parentNode) elD.appendChild(lista);

        if (a.cancela_no_fim)
          elD.appendChild(
            el("p", {
              class: "det-nota",
              text: "A assinatura foi cancelada e nao sera renovada. Voce mantem o acesso ate a data acima.",
            }),
          );
      })
      .catch(function () {});
  }

  // ── Portal do Stripe ──
  if (ASSINATURA.tem_stripe) {
    var btn = el("button", {
      type: "button",
      class: "btn btn-ghost btn-sm",
      text: "Gerenciar assinatura",
    });
    btn.addEventListener("click", function () {
      btn.disabled = true;
      btn.textContent = "Abrindo…";
      fetch("/api/clinica/painel-acoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "portal_sessao" }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (res) {
          if (res.ok && res.url) window.location.href = res.url;
          else {
            btn.disabled = false;
            btn.textContent = "Gerenciar assinatura";
          }
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = "Gerenciar assinatura";
        });
    });
    elA.appendChild(btn);
  }
})();

// ── Metricas: 1 request so, compartilhado por conversas / perfil / cards ──
// .catch aqui evita que uma falha de rede vire 3 rejeicoes nao tratadas:
// cada consumidor trata o { ok:false } por conta propria.
var metricasPromise = fetch("/api/clinica/painel-acoes?acao=metricas")
  .then(function (r) {
    return r.json();
  })
  .catch(function () {
    return { ok: false };
  });

// ── Conversas (monitoramento) ──
// As conversas vem do servidor, ja filtradas pela clinica do usuario logado.
// Antes esta funcao consultava a tabela `conversas` DIRETO do navegador com a
// anon key e SEM nenhum filtro de clinica (.limit(500) e mais nada): o escopo
// dependia inteiramente da RLS, e o cliente criado aqui nao carrega sessao
// nenhuma (os cookies do Supabase sao httpOnly), entao a query saia como
// anonima. Telefone e mensagens de pacientes de TODAS as clinicas ficavam a um
// fetch de distancia. Filtro por tenant e' responsabilidade do servidor.
var convCache = [];
var pausadasCache = [];
function carregarConversas() {
  fetch("/api/clinica/painel-acoes?acao=conversas")
    .then(function (r) {
      return r.json();
    })
    .then(function (res) {
      if (!res.ok) {
        document.getElementById("conv-status").textContent =
          "Erro ao carregar.";
        return;
      }
      convCache = res.conversas || [];
      pausadasCache = res.pausadas || [];
      renderConversas(convCache);
    })
    .catch(function () {
      document.getElementById("conv-status").textContent = "Falha de conexão.";
    });
}
function renderConversas(msgs) {
  var elSt = document.getElementById("conv-status");
  var elLi = document.getElementById("conv-lista");
  elLi.innerHTML = "";
  if (!msgs.length) {
    elSt.innerHTML = emptyStateHtml(
      "chat",
      "Nenhuma conversa ainda",
      "Conversas com pacientes aparecem aqui depois que a Recepta começar a atender.",
    );
    elSt.style.display = "";
    return;
  }
  elSt.style.display = "none";
  var porTel = {};
  msgs.forEach(function (m) {
    if (!porTel[m.telefone])
      porTel[m.telefone] = { telefone: m.telefone, msgs: [] };
    porTel[m.telefone].msgs.push(m);
  });
  Object.values(porTel).forEach(function (conv) {
    var div = document.createElement("div");
    div.className = "conv-card";
    var isPausada = pausadasCache.indexOf(conv.telefone) !== -1;
    if (isPausada) div.className += " conv-pausada";
    div.setAttribute("role", "button");
    div.setAttribute("tabindex", "0");
    var telFmt = telefoneBonito(conv.telefone);
    var ult = conv.msgs[0];
    var role = ult.role === "ia" ? "Recepta: " : "Paciente: ";
    var corpoMidia = detectarMidia(ult.mensagem, ult.mensagem_media);
    var corpo = corpoMidia
      ? corpoMidia.icone + " " + corpoMidia.label
      : textoMensagem(ult.mensagem);
    if (corpo.length > 80) corpo = corpo.slice(0, 80) + "…";
    var dt = new Date(ult.criado_em).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    var badgePausa = isPausada
      ? '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:999px;font-size:10px;margin-left:6px">Pausada</span>'
      : "";
    div.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><b style="font-size:14px">' +
      escapeHtml(telFmt) +
      badgePausa +
      '</b><span style="font-size:11px;color:var(--muted)">' +
      escapeHtml(dt) +
      '</span></div><div style="font-size:12.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
      role +
      escapeHtml(corpo).replace(/\n/g, " ") +
      '</div><div style="font-size:11px;color:var(--muted);margin-top:2px;display:flex;justify-content:space-between;align-items:center"><span>' +
      conv.msgs.length +
      " mensagens</span></div>";
    // Botão pausar/retomar
    var btnWrap = div.querySelector("div:last-child");
    var btnPausa = document.createElement("button");
    btnPausa.type = "button";
    btnPausa.className = "btn btn-ghost btn-sm";
    btnPausa.style.cssText = "font-size:11px;padding:2px 8px;min-height:auto";
    btnPausa.textContent = isPausada ? "▶ Retomar" : "⏸ Pausar";
    btnPausa.setAttribute(
      "aria-label",
      isPausada ? "Retomar conversa" : "Pausar conversa",
    );
    btnPausa.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var acao = isPausada ? "retomar_conversa" : "pausar_conversa";
      var msg = isPausada
        ? "Retomar automação para este paciente?"
        : "Pausar automação? Você precisará responder manualmente no WhatsApp.";
      if (!confirm(msg)) return;
      btnPausa.disabled = true;
      btnPausa.textContent = "…";
      fetch("/api/clinica/painel-acoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: acao,
          telefone: conv.telefone,
          clinica: DADOS.nomeClinica || "",
        }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (res) {
          if (res.erro) {
            alert("Erro: " + res.erro);
            btnPausa.disabled = false;
            btnPausa.textContent = isPausada ? "▶ Retomar" : "⏸ Pausar";
            return;
          }
          // Atualizar cache local
          if (isPausada) {
            pausadasCache = pausadasCache.filter(function (t) {
              return t !== conv.telefone;
            });
          } else {
            pausadasCache.push(conv.telefone);
          }
          renderConversas(convCache);
        })
        .catch(function () {
          alert("Falha de conexão.");
          btnPausa.disabled = false;
          btnPausa.textContent = isPausada ? "▶ Retomar" : "⏸ Pausar";
        });
    });
    btnWrap.appendChild(btnPausa);
    div.setAttribute("aria-label", "Abrir conversa com " + telFmt);
    div.addEventListener("click", function () {
      abrirConversa(conv);
    });
    div.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        abrirConversa(conv);
      }
    });
    elLi.appendChild(div);
  });
}
// Telefone no formato que a clinica reconhece: o banco guarda E.164
// ("5511999999999"), o painel mostra "(11) 999999999". Estava inline dentro do
// card; o modal precisa do mesmo rotulo, entao virou funcao.
function telefoneBonito(tel) {
  var d = String(tel || "").replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.indexOf("55") === 0)
    d = d.slice(2);
  return d.length >= 10 ? "(" + d.slice(0, 2) + ") " + d.slice(2) : tel;
}

// Midia chega como JSON com mimetype, nao como texto. Sem isso o balao mostra
// o JSON cru (com o base64 junto, quando a midia vem inline).
function detectarMidia(t, mediaJson) {
  if (mediaJson && typeof mediaJson === "object") {
    var m = mediaJson.mimetype || mediaJson.mimeType;
    var u = mediaJson.URL || mediaJson.url;
    if (m || u) {
      var r = {};
      if (m) {
        if (m.indexOf("audio") === 0) {
          r.tipo = "audio";
          r.icone = "🎤";
          r.label =
            "Áudio" +
            (mediaJson.seconds
              ? " · " + Math.round(mediaJson.seconds) + "s"
              : "");
        } else if (mediaJson.isSticker === true || m === "image/webp") {
          r.tipo = "sticker";
          r.icone = "🏷";
          r.label = "Sticker";
        } else if (m.indexOf("image") === 0) {
          r.tipo = "imagem";
          r.icone = "🖼";
          r.label = "Imagem";
        } else if (m.indexOf("video") === 0) {
          r.tipo = "video";
          r.icone = "🎬";
          r.label = "Vídeo";
        } else {
          r.tipo = "documento";
          r.icone = "📎";
          r.label = "Documento";
        }
      } else {
        r.tipo = "documento";
        r.icone = "📎";
        r.label = "Mídia";
      }
      if (u) r.url = u;
      return r;
    }
  }
  try {
    var o = JSON.parse(t);
    if (!o || typeof o !== "object") return null;
    var m = o.mimetype || o.mimeType;
    var u = o.URL || o.url;
    if (!m && !u) return null;
    var r = {};
    if (m) {
      if (m.indexOf("audio") === 0) {
        r.tipo = "audio";
        r.icone = "🎤";
        r.label =
          "Áudio" + (o.seconds ? " · " + Math.round(o.seconds) + "s" : "");
      } else if (o.isSticker === true || m === "image/webp") {
        r.tipo = "sticker";
        r.icone = "🏷";
        r.label = "Sticker";
      } else if (m.indexOf("image") === 0) {
        r.tipo = "imagem";
        r.icone = "🖼";
        r.label = "Imagem";
      } else if (m.indexOf("video") === 0) {
        r.tipo = "video";
        r.icone = "🎬";
        r.label = "Vídeo";
      } else {
        r.tipo = "documento";
        r.icone = "📎";
        r.label = "Documento";
      }
    } else {
      r.tipo = "documento";
      r.icone = "📎";
      r.label = "Mídia";
    }
    if (u) r.url = u;
    return r;
  } catch (e) {
    return null;
  }
}

function criarMidiaElement(midia) {
  if (midia.tipo === "imagem" && midia.url) {
    var wrap = el("div", { style: "margin-bottom:4px" });
    var img = el("img", {
      src: midia.url,
      alt: "Imagem",
      style: "max-width:260px;max-height:300px;border-radius:8px;display:block",
    });
    var chip = el("span", {
      class: "chip-midia",
      text: midia.icone + " " + midia.label,
    });
    img.onerror = function () {
      this.style.display = "none";
      chip.textContent = "⏰ Mídia expirada";
    };
    wrap.appendChild(img);
    wrap.appendChild(chip);
    return wrap;
  }
  if (midia.tipo === "video" && midia.url) {
    var vw = el("div", { style: "margin-bottom:4px" });
    var vid = el("video", {
      src: midia.url,
      muted: true,
      preload: "metadata",
      style: "max-width:260px;max-height:300px;border-radius:8px;display:block",
    });
    var vchip = el("span", {
      class: "chip-midia",
      text: midia.icone + " " + midia.label,
    });
    vid.onerror = function () {
      this.style.display = "none";
      vchip.textContent = "⏰ Mídia expirada";
    };
    vw.appendChild(vid);
    vw.appendChild(vchip);
    return vw;
  }
  if (midia.tipo === "audio" && midia.url) {
    var aw = el("div", { style: "margin-bottom:4px" });
    var aud = el("audio", {
      src: midia.url,
      controls: true,
      preload: "metadata",
      style: "width:100%;max-width:260px;display:block",
    });
    var achip = el("span", {
      class: "chip-midia",
      text: midia.icone + " " + midia.label,
    });
    aud.onerror = function () {
      this.style.display = "none";
      achip.textContent = "⏰ Mídia expirada";
    };
    aw.appendChild(aud);
    aw.appendChild(achip);
    return aw;
  }
  return el("span", {
    class: "chip-midia",
    text: midia.icone + " " + midia.label,
  });
}

function textoMensagem(bruto) {
  var corpo = bruto || "";
  try {
    var o = JSON.parse(corpo);
    if (o && o.mimetype)
      corpo =
        o.mimetype.indexOf("audio") >= 0
          ? "🎤 Áudio"
          : o.mimetype.indexOf("image") >= 0
            ? "🖼 Imagem"
            : o.mimetype.indexOf("video") >= 0
              ? "🎬 Vídeo"
              : "📎 Documento";
  } catch (e) {}
  return corpo;
}

// Abre a conversa inteira num modal. NAO chama o servidor: convCache ja tem
// todas as mensagens (?acao=conversas devolve ate 500 linhas, ja filtradas pela
// clinica no servidor), entao a thread e' so o agrupamento que renderConversas
// ja montou. Um fetch novo aqui criaria mais uma rota multi-tenant para revisar.
function abrirConversa(conv) {
  var antigo = document.getElementById("modal-conversa");
  if (antigo) antigo.remove();

  var rotulo = telefoneBonito(conv.telefone);
  var modal = el("div", { id: "modal-conversa", class: "modal-overlay" });
  var caixa = el("div", {
    class: "modal-content modal-chat",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": "Conversa com " + rotulo,
  });

  var btnX = el("button", {
    type: "button",
    class: "chat-close",
    "aria-label": "Fechar conversa",
    text: "✕",
  });
  caixa.appendChild(
    el("div", { class: "chat-head" }, [
      el("div", {}, [
        el("h3", { text: rotulo }),
        el("p", { class: "modal-sub", text: conv.msgs.length + " mensagens" }),
      ]),
      btnX,
    ]),
  );

  // convCache vem do mais recente para o mais antigo; a thread le ao contrario.
  var thread = el("div", { class: "chat-thread" });
  var diaAtual = "";
  conv.msgs
    .slice()
    .reverse()
    .forEach(function (m) {
      var d = new Date(m.criado_em);
      var dia = d.toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      if (dia !== diaAtual) {
        diaAtual = dia;
        thread.appendChild(el("div", { class: "chat-day", text: dia }));
      }
      var ehIa = m.role === "ia";
      thread.appendChild(
        el("div", { class: "chat-row " + (ehIa ? "ia" : "paciente") }, [
          el("span", {
            class: "chat-autor",
            text: ehIa ? "Recepta" : "Paciente",
          }),
          (function () {
            var midia = detectarMidia(m.mensagem || "", m.mensagem_media);
            if (midia)
              return el("div", { class: "chat-bubble" }, [
                criarMidiaElement(midia),
              ]);
            return el("div", {
              class: "chat-bubble",
              text: textoMensagem(m.mensagem),
            });
          })(),
          el("span", {
            class: "chat-hora",
            text: d.toLocaleTimeString("pt-BR", {
              timeZone: "America/Sao_Paulo",
              hour: "2-digit",
              minute: "2-digit",
            }),
          }),
        ]),
      );
    });
  caixa.appendChild(thread);
  modal.appendChild(caixa);

  function fechar() {
    document.removeEventListener("keydown", aoTeclar);
    modal.remove();
  }
  function aoTeclar(ev) {
    if (ev.key === "Escape") fechar();
  }
  btnX.addEventListener("click", fechar);
  modal.addEventListener("click", function (ev) {
    if (ev.target === modal) fechar();
  });
  document.addEventListener("keydown", aoTeclar);

  document.body.appendChild(modal);
  thread.scrollTop = thread.scrollHeight;
  btnX.focus();
}

// Busca: seleciona os telefones com match e mantem a conversa inteira.
// Filtrar mensagem a mensagem faria o card exibir contagem e previa erradas.
document.getElementById("conv-busca").addEventListener("input", function () {
  var q = this.value.trim().toLowerCase();
  if (!q) {
    renderConversas(convCache);
    return;
  }
  var tels = {};
  convCache.forEach(function (m) {
    var tel = formatarTelefone(m.telefone).toLowerCase();
    if (
      tel.indexOf(q) !== -1 ||
      (m.mensagem || "").toLowerCase().indexOf(q) !== -1
    )
      tels[m.telefone] = 1;
  });
  renderConversas(
    convCache.filter(function (m) {
      return tels[m.telefone];
    }),
  );
});
// Exportar CSV pelo endpoint /api/clinica/painel-acoes?acao=exportar:
// o servidor ja filtra pela clinica, escapa os campos e vai ate 10k linhas.
document
  .getElementById("btn-exportar-conv")
  .addEventListener("click", function () {
    var btn = this;
    btn.disabled = true;
    fetch("/api/clinica/painel-acoes?acao=exportar")
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        btn.disabled = false;
        if (!res.ok || !res.csv) {
          alert("Nada para exportar.");
          return;
        }
        var bom = String.fromCharCode(0xfeff);
        var blob = new Blob([bom + res.csv], {
          type: "text/csv;charset=utf-8",
        });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download =
          "conversas-" + new Date().toISOString().slice(0, 10) + ".csv";
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(function () {
        btn.disabled = false;
        alert("Falha ao exportar.");
      });
  });
carregarConversas();

// ── Perfil ──
(function () {
  var elNome = document.getElementById("perfil-nome");
  var elSn = document.getElementById("perfil-senha-atual");
  var elNs = document.getElementById("perfil-nova-senha");
  var elErr = document.getElementById("perfil-erro");
  var elSt = document.getElementById("perfil-status");
  // Carregar nome atual via métricas (retorna dados do perfil)
  metricasPromise.then(function (d) {
    if (d.ok && d.nome) elNome.placeholder = d.nome;
  });
  document
    .getElementById("btn-salvar-perfil")
    .addEventListener("click", function () {
      elErr.textContent = "";
      elSt.innerHTML = "";
      var body = {};
      if (elNome.value.trim()) body.nome = elNome.value.trim();
      if (elSn.value && elNs.value) {
        body.senha_atual = elSn.value;
        body.nova_senha = elNs.value;
      }
      if (!body.nome && !body.nova_senha) {
        elErr.textContent = "Preencha pelo menos um campo.";
        return;
      }
      if (body.nova_senha && body.nova_senha.length < 8) {
        elErr.textContent = "Nova senha precisa ter pelo menos 8 caracteres.";
        return;
      }
      fetch("/api/clinica/painel-acoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "atualizar_perfil", ...body }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (res) {
          if (res.erro) {
            elErr.textContent = res.detalhes
              ? res.detalhes.join(" ")
              : "Erro: " + res.erro;
            return;
          }
          elSn.value = "";
          elNs.value = "";
          elSt.innerHTML = '<span class="badge badge-green">Salvo!</span>';
          setTimeout(function () {
            elSt.innerHTML = "";
          }, 3000);
        })
        .catch(function () {
          elErr.textContent = "Falha de conexão.";
        });
    });
})();

// ── Feriados ──
var feriadosDados = [];
function carregarFeriados() {
  fetch("/api/clinica/painel-acoes?acao=feriados")
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      feriadosDados = d.feriados || [];
      renderFeriados();
    });
}
function renderFeriados() {
  var elLi = document.getElementById("feriados-lista");
  elLi.innerHTML = "";
  if (!feriadosDados.length) {
    elLi.innerHTML = emptyStateHtml(
      "calendar",
      "Nenhum feriado cadastrado",
      "Adicione feriados para a Recepta não agendar nesses dias.",
    );
    return;
  }
  feriadosDados.forEach(function (f) {
    var div = document.createElement("div");
    div.style.cssText =
      "display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)";
    var d = new Date(f.data + "T12:00:00");
    var dataFmt = d.toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    div.innerHTML =
      '<div style="min-width:100px;font-weight:600;font-size:13px">' +
      dataFmt +
      '</div><div style="flex:1;color:var(--muted);font-size:13px">' +
      escapeHtml(f.nome || "—") +
      "</div>";
    var btn = document.createElement("button");
    btn.className = "btn-icon";
    btn.textContent = "×";
    btn.title = "Remover";
    btn.addEventListener("click", function () {
      fetch("/api/clinica/painel-acoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "remover_feriado", id: f.id }),
      }).then(function () {
        carregarFeriados();
      });
    });
    div.appendChild(btn);
    elLi.appendChild(div);
  });
}
document
  .getElementById("btn-add-feriado")
  .addEventListener("click", function () {
    var data = document.getElementById("feriado-data").value;
    var nome = document.getElementById("feriado-nome").value.trim();
    var elErr = document.getElementById("feriado-erro");
    elErr.textContent = "";
    if (!data) {
      elErr.textContent = "Selecione uma data.";
      return;
    }
    fetch("/api/clinica/painel-acoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        acao: "adicionar_feriado",
        data: data,
        nome: nome || null,
      }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        if (res.erro) {
          elErr.textContent =
            res.erro === "data_ja_cadastrada"
              ? "Data já cadastrada."
              : "Erro: " + res.erro;
          return;
        }
        document.getElementById("feriado-data").value = "";
        document.getElementById("feriado-nome").value = "";
        carregarFeriados();
      });
  });
carregarFeriados();

// ── Métricas ──
var metricasChart = null;
function coresDoGrafico() {
  var css = getComputedStyle(document.documentElement);
  return {
    texto: css.getPropertyValue("--muted").trim(),
    borda: css.getPropertyValue("--surface").trim(),
    grade: css.getPropertyValue("--border").trim(),
    cores: [
      css.getPropertyValue("--primary").trim(),
      css.getPropertyValue("--green").trim(),
      css.getPropertyValue("--orange").trim(),
    ],
  };
}

function atualizarTemaGrafico() {
  if (!metricasChart) return;
  var tema = coresDoGrafico();
  metricasChart.data.datasets[0].backgroundColor = tema.cores;
  metricasChart.data.datasets[0].borderColor = tema.borda;
  metricasChart.options.scales.x.ticks.color = tema.texto;
  metricasChart.options.scales.x.grid.color = tema.grade;
  metricasChart.options.scales.y.ticks.color = tema.texto;
  metricasChart.update("none");
}

metricasPromise
  .then(function (res) {
    var elC = document.getElementById("metricas-corpo");
    if (!res.ok) {
      elC.textContent = "Erro ao carregar métricas.";
      return;
    }
    elC.className = "";
    elC.innerHTML = "";
    var layout = el("div", { class: "metricas-layout" });
    var grid = el("div", { class: "metricas-grid" });
    var items = [
      {
        val: res.total_conversas || 0,
        lbl: "Conversas",
        color: "var(--primary)",
      },
      {
        val: res.agendamentos_ativos || 0,
        lbl: "Próximos agendamentos",
        color: "var(--green)",
      },
      {
        val: res.total_escalonamentos || 0,
        lbl: "Escalonamentos",
        color: "var(--orange)",
      },
    ];
    items.forEach(function (item) {
      var card = el("div", { class: "metrica-card" }, [
        el("div", {
          class: "metrica-valor",
          style: "color:" + item.color,
          text: String(item.val),
        }),
        el("div", {
          class: "metrica-label",
          text: item.lbl,
        }),
      ]);
      grid.appendChild(card);
    });
    layout.appendChild(grid);
    if (window.Chart) {
      var grafico = el("div", {
        class: "metricas-grafico",
        role: "img",
        "aria-label": "Comparação visual das métricas da clínica",
      });
      var canvas = el("canvas", { "aria-hidden": "true" });
      grafico.appendChild(canvas);
      layout.appendChild(grafico);
      var tema = coresDoGrafico();
      metricasChart = new window.Chart(canvas, {
        type: "bar",
        data: {
          labels: items.map(function (item) {
            return item.lbl;
          }),
          datasets: [
            {
              data: items.map(function (item) {
                return item.val;
              }),
              backgroundColor: tema.cores,
              borderColor: tema.borda,
              borderWidth: 0,
              borderRadius: 6,
              barThickness: 24,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: "y",
          animation: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? false
            : { duration: 180 },
          plugins: {
            legend: {
              display: false,
            },
          },
          scales: {
            x: {
              beginAtZero: true,
              ticks: { color: tema.texto, precision: 0 },
              grid: { color: tema.grade },
              border: { display: false },
            },
            y: {
              ticks: { color: tema.texto },
              grid: { display: false },
              border: { display: false },
            },
          },
        },
      });
    }
    elC.appendChild(layout);
  })
  .catch(function () {
    document.getElementById("metricas-corpo").textContent = "Falha de conexão.";
  });

// ── Banner de WhatsApp desconectado ──
// Mostra um aviso persistente no topo do painel enquanto a instancia UazAPI
// nao estiver conectada. O banner some automaticamente quando a conexao e
// restaurada, sem precisar recarregar a pagina.
(function () {
  var banner = document.getElementById("whatsapp-banner");
  if (!banner) return;

  var POLL_CONEXAO_MS = 15000;
  var pollTimer = null;

  function verificarConexao() {
    fetch("/api/clinica/conectar?acao=status")
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (dados) {
        if (!dados) return;
        if (dados.conectado) {
          banner.classList.add("hidden");
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
        } else {
          banner.classList.remove("hidden");
        }
      })
      .catch(function () {
        // Em caso de erro, mantem o estado atual do banner.
      });
  }

  // Verificacao inicial: so mostra o banner se nao estiver conectado.
  // Se estiver conectado, o banner fica hidden e o polling para.
  fetch("/api/clinica/conectar?acao=status")
    .then(function (r) {
      if (!r.ok) return null;
      return r.json();
    })
    .then(function (dados) {
      if (!dados) return;
      if (dados.conectado) {
        banner.classList.add("hidden");
      } else {
        banner.classList.remove("hidden");
        // Inicia polling so se nao estiver conectado.
        pollTimer = setInterval(verificarConexao, POLL_CONEXAO_MS);
      }
    })
    .catch(function () {
      // Se falhar na verificacao inicial, mostra o banner como prevencao.
      banner.classList.remove("hidden");
      pollTimer = setInterval(verificarConexao, POLL_CONEXAO_MS);
    });
})();

// ── Gate de assinatura expirada (tratamento do 402) ──
// O overlay server-rendered já cobre a tela quando status="expirado". Este
// bloco cobre o caso de corrida: clinica ativa quando a página carregou,
// n8n expira no meio da sessão. Toda resposta 402 "assinatura_expirada"
// vira o overlay com os links de pagamento (renderizados escondidos pelo
// servidor, aqui só preencho os href e mostro).
(function () {
  function montarGate402() {
    var overlay = document.getElementById("gate-overlay");
    if (!overlay) return;
    var ids = ["gate-link-mensal", "gate-link-anual"];
    var precisaLinks = ids.some(function (id) {
      var a = document.getElementById(id);
      return (
        !a ||
        !(a.getAttribute("href") || "").startsWith("https://buy.stripe.com")
      );
    });
    if (precisaLinks) {
      var g = (window.__PAINEL__ || {}).gate;
      if (g && g.link_mensal && g.link_anual) {
        var mm = document.getElementById("gate-link-mensal");
        var aa = document.getElementById("gate-link-anual");
        if (mm) mm.href = g.link_mensal;
        if (aa) aa.href = g.link_anual;
      }
    }
    overlay.classList.remove("hidden");
  }

  var postOriginal = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : input && input.url;
    var method = ((init && init.method) || "GET").toUpperCase();
    return postOriginal.apply(this, arguments).then(function (resposta) {
      if (
        resposta.status === 402 &&
        method !== "GET" &&
        url &&
        url.indexOf("/api/clinica/") === 0
      ) {
        resposta
          .clone()
          .json()
          .then(function (corpo) {
            if (corpo && corpo.erro === "assinatura_expirada") montarGate402();
          })
          .catch(function () {});
      }
      return resposta;
    });
  };
})();
