(function () {
  var root = document.documentElement;

  /* ── Create loading overlay DOM (MorphingSquare) ── */
  var overlay = document.createElement("div");
  overlay.className = "loading-overlay";
  overlay.innerHTML =
    '<div class="loading-morph">' +
      '<div class="loading-morph-box">' +
        '<svg class="loading-morph-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">' +
          '<g transform="translate(0 50)">' +
            '<path d="M 34 -34 C -1.7 -15.9, -1.7 15.9, 34 34 C 69.7 15.9, 69.7 -15.9, 34 -34 Z" fill="oklch(0.72 0.09 280)"/>' +
            '<path d="M 66 -34 C 30.3 -15.9, 30.3 15.9, 66 34 C 101.7 15.9, 101.7 -15.9, 66 -34 Z" fill="oklch(0.95 0.015 280)"/>' +
          '</g>' +
        '</svg>' +
      '</div>' +
      '<div class="loading-morph-msg">recepta</div>' +
    '</div>';

  /* ── Append overlay when body is ready ── */
  function appendOverlay() {
    if (document.body && !document.body.contains(overlay)) {
      document.body.appendChild(overlay);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", appendOverlay, { once: true });
  } else {
    appendOverlay();
  }

  /* ── Page enter (on load) ── */
  function enterPage() {
    appendOverlay();
    /* Smoothly hide loading overlay */
    overlay.classList.remove("visible");
    overlay.classList.add("fade-out");

    /* Delay page content reveal slightly for smooth handoff */
    window.setTimeout(function () {
      root.classList.add("page-transition-in");
      root.classList.remove("page-transition-out");
    }, 100);

    /* Remove overlay from DOM after fade completes */
    window.setTimeout(function () {
      overlay.classList.remove("fade-out");
    }, 600);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enterPage, { once: true });
  } else {
    enterPage();
  }

  window.addEventListener("pageshow", enterPage);

  /* ── Page exit (on link click) ── */
  document.addEventListener("click", function (event) {
    var link = event.target.closest("a[href]");
    if (
      !link ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      link.target ||
      link.hasAttribute("download")
    ) {
      return;
    }

    var destination = new URL(link.href, window.location.href);
    if (
      destination.origin !== window.location.origin ||
      destination.pathname === window.location.pathname ||
      destination.protocol !== window.location.protocol
    ) {
      return;
    }

    event.preventDefault();

    appendOverlay();

    /* Fade out current page first */
    root.classList.remove("page-transition-in");
    root.classList.add("page-transition-out");

    /* Show loading overlay after page starts fading */
    window.setTimeout(function () {
      overlay.classList.add("visible");
    }, 150);

    /* Navigate after loading screen has been visible */
    window.setTimeout(function () {
      window.location.assign(destination.href);
    }, 1200);
  });
})();
