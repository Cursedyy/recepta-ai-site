/**
 * Smooth Scroll — Lenis wrapper (vanilla JS)
 *
 * Duas responsabilidades separadas de proposito:
 *
 * 1. Scroll suave da roda do mouse, via Lenis. Depende do CDN e e desligado
 *    por prefers-reduced-motion.
 * 2. Levar os links de ancora (#secao) para logo abaixo do header sticky.
 *    Isso vale SEMPRE — com ou sem Lenis, com ou sem reduced motion. Quando
 *    esse calculo morava dentro do init() do Lenis, qualquer falha do CDN
 *    derrubava junto o posicionamento das ancoras.
 */
(function () {
  "use strict";

  /* Folga entre a base do header e o topo da secao. */
  var FOLGA = 12;

  var semMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /**
   * Posicao da secao no documento, medida pelo LAYOUT.
   *
   * getBoundingClientRect() inclui transform, e as secoes com .reveal comecam
   * em translateY(10px). Medir por ali mirava 10px fora, e a animacao de
   * reveal ainda puxava a secao depois que o scroll assentava: secao com
   * .reveal parava num lugar, secao sem .reveal noutro. A cadeia de offsetTop
   * ignora transform, entao da um alvo estavel.
   */
  function topoNoDocumento(el) {
    var y = 0;
    while (el) {
      y += el.offsetTop;
      el = el.offsetParent;
    }
    return y;
  }

  /* Altura real do header sticky, lida na hora do clique: ela muda por
     breakpoint (71px no desktop, 77px em 390px), entao constante erra. */
  function alturaDoHeader() {
    var h = document.querySelector("header.top");
    return h ? h.getBoundingClientRect().height : 68;
  }

  function irPara(target) {
    /* Revela o alvo antes de rolar, pra ele nao se mexer depois que assentar. */
    target.classList.add("is-visible");

    var y = topoNoDocumento(target) - alturaDoHeader() - FOLGA;
    if (y < 0) y = 0;

    /* Alvo em pixels, nunca o elemento: recebendo o elemento, o Lenis soma o
       scroll-padding-top do <html> ao proprio offset e a secao parava 84px
       alem do previsto — 93px de vazio abaixo do header em vez de 12px.
       window.scrollTo com um numero tambem ignora o scroll-padding, entao os
       dois caminhos assentam no mesmo lugar. */
    if (window.__lenis) {
      window.__lenis.scrollTo(y);
    } else {
      window.scrollTo({ top: y, behavior: semMotion ? "auto" : "smooth" });
    }
  }

  document.addEventListener("click", function (e) {
    var link = e.target.closest('a[href^="#"]');
    if (!link) return;
    var id = link.getAttribute("href");
    if (!id || id === "#") return;
    var target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    irPara(target);
    history.pushState(null, "", id);
  });

  /* Chegada de outra pagina em /#secao. O salto nativo do browser conta o
     scroll-padding-top de 84px e ignora o translateY das secoes .reveal, entao
     a secao assenta fora de lugar. Reposiciona pelo mesmo caminho do clique,
     depois do load (imagens ja dimensionadas). Oito CTAs de nicho e blog
     entram na landing por /#planos. */
  function irParaHashInicial() {
    var id = window.location.hash;
    if (!id || id === "#") return;
    var target;
    try {
      target = document.querySelector(id);
    } catch (e) {
      return; /* hash que nao e seletor valido */
    }
    if (!target) return;
    irPara(target);
  }

  if (document.readyState === "complete") {
    irParaHashInicial();
  } else {
    window.addEventListener("load", irParaHashInicial);
  }

  /* ── Lenis (so o scroll suave da roda) ── */

  if (semMotion) return;

  /* Tentativas limitadas: sem teto, um CDN fora do ar deixava um setTimeout
     rodando pra sempre. ~5s e suficiente e o site funciona sem Lenis. */
  var tentativas = 0;

  function init() {
    if (typeof Lenis === "undefined") {
      if (++tentativas > 50) return;
      setTimeout(init, 100);
      return;
    }

    var lenis = new Lenis({
      lerp: 0.1,
      duration: 1.2,
      orientation: "vertical",
      smoothWheel: true,
      wheelMultiplier: 1,
      touch: false,
    });

    /* Bridge Lenis scroll to requestAnimationFrame */
    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    /* Expose lenis instance globally for other scripts */
    window.__lenis = lenis;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
