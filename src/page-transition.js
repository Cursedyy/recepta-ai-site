(function () {
  var root = document.documentElement;
  root.classList.add("page-transition-ready");

  function enterPage() {
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
    root.classList.remove("page-transition-in");
    root.classList.add("page-transition-out");
    window.setTimeout(function () {
      window.location.assign(destination.href);
    }, 180);
  });
})();
