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

  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!finePointer) return;

  function bindSpotlight(el) {
    el.addEventListener(
      'pointermove',
      function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
        el.style.setProperty('--my', ((e.clientY - r.top) / r.height) * 100 + '%');
      },
      { passive: true }
    );
  }

  document
    .querySelectorAll('.interactive-card, .fun-fact-card')
    .forEach(bindSpotlight);

  function bindTilt(photo, wrap) {
    wrap.addEventListener(
      'pointermove',
      function (e) {
        var r = wrap.getBoundingClientRect();
        var dx = (e.clientX - r.left) / r.width - 0.5;
        var dy = (e.clientY - r.top) / r.height - 0.5;
        photo.style.transform =
          'rotateX(' + (-dy * 10).toFixed(2) + 'deg) rotateY(' + (dx * 12).toFixed(2) + 'deg) scale(1.03)';
      },
      { passive: true }
    );
    wrap.addEventListener('pointerleave', function () {
      photo.style.transform = '';
    });
  }

  var homePhoto = document.querySelector('.home-photo');
  if (homePhoto) {
    bindTilt(homePhoto, homePhoto.closest('.home-right') || homePhoto);
  }

  document.querySelectorAll('.home-btns .btn').forEach(function (btn) {
    btn.addEventListener(
      'pointermove',
      function (e) {
        var r = btn.getBoundingClientRect();
        var x = e.clientX - r.left - r.width / 2;
        var y = e.clientY - r.top - r.height / 2;
        btn.style.transform = 'translate3d(' + x * 0.28 + 'px,' + y * 0.28 + 'px,0)';
      },
      { passive: true }
    );
    btn.addEventListener('pointerleave', function () {
      btn.style.transform = '';
    });
  });
})();
