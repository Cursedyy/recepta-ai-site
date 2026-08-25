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
  document.body.appendChild(overlay);

  /* ── Page enter (on load) ── */
  function enterPage() {
    /* Hide loading overlay if visible */
    overlay.classList.remove("visible");

    window.requestAnimationFrame(function () {
      root.classList.add("page-transition-in");
      root.classList.remove("page-transition-out");
    });
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

    /* Show loading overlay */
    overlay.classList.add("visible");

    /* Fade out current page */
    root.classList.remove("page-transition-in");
    root.classList.add("page-transition-out");

    /* Navigate after short delay */
    window.setTimeout(function () {
      window.location.assign(destination.href);
    }, 300);
  });
})();
