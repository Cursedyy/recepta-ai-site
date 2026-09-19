// EXTRAIDO DE src/clinica/painel.js (linhas 1192-1262 no commit 4001ac4).
// Bloco de UI do trial no painel: badge 'Periodo de teste' e a linha
// 'Teste ate <data> (N dias restantes)'.
//
// Regra que vale a pena nao reaprender: clinicas.status NUNCA teve o valor
// 'trial'. Clinica em teste = status 'ativo' + trial_fim no futuro.

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
