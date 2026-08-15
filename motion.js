(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var progress = document.createElement('div');
  progress.className = 'scroll-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.appendChild(progress);

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var el = document.documentElement;
      var max = el.scrollHeight - el.clientHeight;
      el.style.setProperty('--scroll-p', max > 0 ? String(el.scrollTop / max) : '0');
      ticking = false;
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
