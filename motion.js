(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var progress = document.createElement('div');
  progress.className = 'scroll-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.appendChild(progress);

  function onScroll() {
    var el = document.documentElement;
    var max = el.scrollHeight - el.clientHeight;
    var p = max > 0 ? el.scrollTop / max : 0;
    el.style.setProperty('--scroll-p', String(p));
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
