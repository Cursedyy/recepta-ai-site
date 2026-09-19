/* F2: anonymous aggregate events. Only fixed event/tier/cycle enums leave the page. */
(function () {
  var events = ["visit", "cta_planos", "checkout_start", "ciclo_alterado", "checkout_iniciado", "checkout_abandonado", "briefing_iniciado", "briefing_enviado", "whatsapp_conectado", "reembolso_solicitado"];
  window.receptaAnalytics = function (evento, dimensions) {
    if (events.indexOf(evento) < 0) return;
    var body = { evento: evento };
    dimensions = dimensions || {};
    if (["essencial", "completo"].indexOf(dimensions.tier) >= 0) body.tier = dimensions.tier;
    if (["mensal", "anual"].indexOf(dimensions.ciclo) >= 0) body.ciclo = dimensions.ciclo;
    try {
      window.fetch("/api/an", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "omit", keepalive: true, body: JSON.stringify(body)
      }).catch(function () {});
    } catch (_) {}
  };
})();
