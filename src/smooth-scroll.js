/**
 * Smooth Scroll — Lenis wrapper (vanilla JS)
 * Adiciona smooth scrolling suave em todas as paginas.
 * Respeita prefers-reduced-motion do usuario.
 */
(function () {
  "use strict";

  /* Skip if user prefers reduced motion */
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  /* Wait for Lenis to be available */
  function init() {
    if (typeof Lenis === "undefined") {
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

    /* Handle anchor links (smooth scroll to #id) */
    document.addEventListener("click", function (e) {
      var link = e.target.closest('a[href^="#"]');
      if (!link) return;
      var id = link.getAttribute("href");
      if (!id || id === "#") return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -80 });
      history.pushState(null, "", id);
    });

    /* Expose lenis instance globally for other scripts */
    window.__lenis = lenis;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
