(function () {
  var sections = document.querySelectorAll('main .section:not(#home)');
  if (!sections.length) return;

  function revealAll() {
    sections.forEach(function (el) {
      el.classList.add('reveal-in');
    });
  }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    revealAll();
    return;
  }

  if (!('IntersectionObserver' in window)) {
    revealAll();
    return;
  }

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('reveal-in');
        io.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.04 }
  );

  sections.forEach(function (el) {
    io.observe(el);
  });

  document.addEventListener('portfolio-unlocked', function () {
    requestAnimationFrame(function () {
      io.takeRecords();
    });
  }, { once: true });
})();
