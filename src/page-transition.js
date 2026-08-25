(function () {
  var root = document.documentElement;

  /* ── Create loading overlay DOM ── */
  var overlay = document.createElement("div");
  overlay.className = "loading-overlay";
  overlay.innerHTML =
    '<div class="loading-card">' +
      '<div class="loading-logo">' +
        '<img src="/img/logo-mark-white.png" alt="Recepta AI">' +
      "</div>" +
      '<div class="loading-name">recepta</div>' +
      '<div class="loading-dots">' +
        '<span class="loading-dot"></span>' +
        '<span class="loading-dot"></span>' +
        '<span class="loading-dot"></span>' +
      "</div>" +
    "</div>";

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
