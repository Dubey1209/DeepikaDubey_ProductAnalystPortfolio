(function () {
  var items = document.querySelectorAll(
    '.my-story-chapter, .my-story-act-divider, .my-story-dream-close'
  );
  if (!items.length) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    items.forEach(function (el) {
      el.classList.add('reveal-in');
    });
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
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
  );

  items.forEach(function (el) {
    io.observe(el);
  });
})();
