(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hoverOk = window.matchMedia('(hover: hover)').matches && window.innerWidth >= 900;
  var html = document.documentElement;
  html.classList.add('has-fx-motion');

  var progress = document.createElement('div');
  progress.className = 'scroll-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.appendChild(progress);

  var ticking = false;
  var lastY = 0;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var el = document.documentElement;
      var max = el.scrollHeight - el.clientHeight;
      var y = el.scrollTop;
      el.style.setProperty('--scroll-p', max > 0 ? String(y / max) : '0');
      if (y > 90 && y > lastY + 6) document.body.classList.add('nav-away');
      else if (y < lastY - 6 || y < 48) document.body.classList.remove('nav-away');
      lastY = y;
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  function splitChars(el, lined) {
    if (!el || el.dataset.fxSplit) return;
    el.dataset.fxSplit = '1';
    var htmlBits = el.innerHTML.split(/<br\s*\/?>/i);
    el.innerHTML = htmlBits.map(function (line, i) {
      var wrap = document.createElement('div');
      wrap.innerHTML = line;
      var text = wrap.textContent || '';
      var inner = text.split('').map(function (ch) {
        if (ch === ' ') return ' ';
        return '<span class="fx-ch"><span>' + ch + '</span></span>';
      }).join('');
      if (!lined) return inner;
      return '<span class="hero-line hero-line-' + (i + 1) + '">' + inner + '</span>';
    }).join(lined ? '' : '<br>');
  }

  splitChars(document.querySelector('.home-title'), true);
  splitChars(document.querySelector('.story-hero-title'), false);
  splitChars(document.querySelector('.lock-title'), false);

  if (reduce) {
    var reducedHome = document.querySelector('.home-section');
    if (reducedHome) reducedHome.classList.add('hero-live', 'hero-css');
    return;
  }

  var gsap = window.gsap;

  var magFn = null;

  if (hoverOk) {
    html.classList.add('has-fx-cursor');

    var dot = document.createElement('div');
    dot.className = 'fx-cursor fx-cursor-dot';
    dot.setAttribute('aria-hidden', 'true');
    var ball = document.createElement('div');
    ball.className = 'fx-cursor fx-cursor-ball';
    ball.setAttribute('aria-hidden', 'true');
    var view = document.createElement('span');
    view.className = 'fx-cursor-label';
    view.textContent = 'View';
    ball.appendChild(view);
    document.body.appendChild(dot);
    document.body.appendChild(ball);

    var mx = window.innerWidth / 2;
    var my = window.innerHeight / 2;
    var moveDot;
    var moveBallX;
    var moveBallY;
    if (gsap && gsap.quickTo) {
      moveDot = gsap.quickTo(dot, 'x', { duration: 0.16, ease: 'power3.out' });
      gsap.quickTo(dot, 'y', { duration: 0.16, ease: 'power3.out' });
      moveBallX = gsap.quickTo(ball, 'x', { duration: 0.55, ease: 'power3.out' });
      moveBallY = gsap.quickTo(ball, 'y', { duration: 0.55, ease: 'power3.out' });
    }

    document.addEventListener('mousemove', function (e) {
      mx = e.clientX;
      my = e.clientY;
      html.classList.add('fx-on');
      if (moveBallX) {
        gsap.set(dot, { x: mx, y: my });
        moveBallX(mx);
        moveBallY(my);
      } else {
        dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
      }
      var t = e.target;
      html.classList.toggle('fx-text', !!(t && t.closest && t.closest('input, textarea, select')));
      html.classList.toggle('fx-pointer', !!(t && t.closest && t.closest('a, button, label, .unlock-btn')));
      html.classList.toggle('fx-view', !!(t && t.closest && t.closest('.project-card, .atelier-essay')));
    }, { passive: true });

    if (!moveBallX) {
      var bx = mx;
      var by = my;
      (function lerp() {
        bx += (mx - bx) * 0.12;
        by += (my - by) * 0.12;
        ball.style.transform = 'translate3d(' + bx + 'px,' + by + 'px,0)';
        requestAnimationFrame(lerp);
      })();
    }

    function magnetic(el, strength, fill) {
      if (!el || el.dataset.fxMag) return;
      el.dataset.fxMag = '1';
      el.classList.add('fx-mag');
      if (fill) {
        el.classList.add('fx-fill');
        if (!el.querySelector('.fx-fill-label, .btn-text, svg')) {
          var wrap = document.createElement('span');
          wrap.className = 'fx-fill-label';
          while (el.firstChild) wrap.appendChild(el.firstChild);
          el.appendChild(wrap);
        }
      }
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--mag-x', ((e.clientX - (r.left + r.width / 2)) * strength) + 'px');
        el.style.setProperty('--mag-y', ((e.clientY - (r.top + r.height / 2)) * strength) + 'px');
        el.style.setProperty('--spot-x', (e.clientX - r.left) + 'px');
        el.style.setProperty('--spot-y', (e.clientY - r.top) + 'px');
      });
      el.addEventListener('mouseleave', function () {
        el.style.setProperty('--mag-x', '0px');
        el.style.setProperty('--mag-y', '0px');
      });
    }

    document.querySelectorAll(
      '.atelier-about-more, .project-btn, .atelier-cert-cta, .form-btn, .unlock-btn, .atelier-essay-cta'
    ).forEach(function (el) { magnetic(el, 0.48, true); });

    document.querySelectorAll('.scroll-top-btn').forEach(function (el) {
      magnetic(el, 0.28, false);
    });

    function drift(el, amount) {
      if (!el) return;
      var parent = el.parentElement || el;
      parent.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--fx-x', (((e.clientX - (r.left + r.width / 2)) / r.width) * amount) + 'px');
        el.style.setProperty('--fx-y', (((e.clientY - (r.top + r.height / 2)) / r.height) * amount) + 'px');
        el.style.setProperty('--fx-s', '1.07');
      });
      parent.addEventListener('mouseleave', function () {
        el.style.setProperty('--fx-x', '0px');
        el.style.setProperty('--fx-y', '0px');
        el.style.setProperty('--fx-s', '1');
      });
    }
    drift(document.querySelector('.home-photo'), 18);
    drift(document.querySelector('.atelier-about-photo'), 16);
    magFn = magnetic;
  }

  function bindHeroMag() {
    if (!magFn) return;
    document.querySelectorAll('.home-btns .btn').forEach(function (el) { magFn(el, 0.48, true); });
    document.querySelectorAll('.home-who, .logo, .nav-links > li > a, .nav-links .dropbtn').forEach(function (el) {
      magFn(el, 0.28, false);
    });
  }

  function inject(el, cls) {
    if (!el || el.querySelector('.' + cls)) return;
    var node = document.createElement('span');
    node.className = cls;
    node.setAttribute('aria-hidden', 'true');
    el.appendChild(node);
  }

  function bindCardMotion() {
    document.querySelectorAll('.atelier-skill-card, .project-card').forEach(function (el) {
      inject(el, 'fx-shine');
      inject(el, 'fx-spot');
    });
    document.querySelectorAll('.case-studies-section .project-card').forEach(function (el) {
      inject(el, 'fx-inkbar');
    });
    document.querySelectorAll('#technical-projects .project-card').forEach(function (el) {
      inject(el, 'fx-scan');
    });

    var cinemaOn = bindScrollCinema();
    if (!cinemaOn) bindFadeFallback();

    var cgpa = document.querySelector('.atelier-edu-stat strong');
    if (cgpa && cgpa.textContent.trim() === '8.3' && !cgpa.dataset.fxCount) {
      cgpa.dataset.fxCount = '1';
      var stat = cgpa.closest('.atelier-edu-stat');
      if (stat) {
        var started = false;
        function runCount() {
          if (started) return;
          started = true;
          var el = cgpa;
          var t0 = performance.now();
          function tick(now) {
            var p = Math.min(1, (now - t0) / 1600);
            var eased = 1 - Math.pow(1 - p, 3);
            el.textContent = (8.3 * eased).toFixed(1);
            if (p < 1) requestAnimationFrame(tick);
          }
          el.textContent = '0.0';
          requestAnimationFrame(tick);
        }
        if (window.ScrollTrigger) {
          window.ScrollTrigger.create({ trigger: stat, start: 'top 80%', once: true, onEnter: runCount });
        } else {
          var cgpaIo = new IntersectionObserver(function (entries) {
            if (!entries[0] || !entries[0].isIntersecting) return;
            runCount();
            cgpaIo.disconnect();
          }, { threshold: 0.4 });
          cgpaIo.observe(stat);
        }
      }
    }
  }

  function bindFadeFallback() {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('fx-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    function watch(els, delayStep) {
      els.forEach(function (el, i) {
        if (el.dataset.fxWatch) return;
        el.dataset.fxWatch = '1';
        el.style.setProperty('--fx-d', (i * delayStep) + 's');
        io.observe(el);
      });
    }
    watch(document.querySelectorAll('.case-studies-section .project-card'), 0.16);
    watch(document.querySelectorAll('#design-projects .project-card'), 0.16);
    watch(document.querySelectorAll('#technical-projects .project-card'), 0.16);
    watch(document.querySelectorAll('.atelier-skill-card'), 0.14);
    watch(document.querySelectorAll('.atelier-about-notes li'), 0.18);
    watch(document.querySelectorAll('.atelier-edu-stat, .atelier-edu-courses li'), 0.06);
    watch(document.querySelectorAll('.atelier-exp-row'), 0.14);
    watch(document.querySelectorAll('.atelier-essay'), 0.12);
    watch(document.querySelectorAll('.fun-facts-section .atelier-note'), 0.14);
    watch(document.querySelectorAll('.atelier-contact-form, .atelier-contact-copy, .fx-footer-mark'), 0.16);
  }

  function bindScrollCinema() {
    var g = window.gsap;
    var ST = window.ScrollTrigger;
    if (!g || !ST) return false;

    if (!html.dataset.fxST) {
      html.dataset.fxST = '1';
      g.registerPlugin(ST);
      html.classList.add('has-scroll-cinema');
    }

    function clearT(el) {
      g.set(el, { clearProps: 'transform,filter,rotation,rotationX,rotationY,x,y,z,scale,skewX' });
    }

    function fly(els, fromFn, opts) {
      opts = opts || {};
      Array.prototype.slice.call(els).forEach(function (el, i) {
        if (!el || el.dataset.fxCinema) return;
        el.dataset.fxCinema = '1';
        ST.create({
          trigger: el,
          start: opts.start || 'top 88%',
          once: true,
          onEnter: function () {
            g.set(el, { transformPerspective: 1800, transformOrigin: opts.origin || '50% 50%' });
            g.fromTo(el, fromFn(el, i), {
              x: 0,
              y: 0,
              z: 0,
              rotation: 0,
              rotationX: 0,
              rotationY: 0,
              scale: 1,
              skewX: 0,
              filter: 'blur(0px)',
              duration: opts.duration || 1.35,
              delay: Math.min(i * (opts.stagger || 0.12), 0.5),
              ease: opts.ease || 'expo.out',
              overwrite: 'auto',
              onComplete: function () { clearT(el); }
            });
            setTimeout(function () { clearT(el); }, 3200);
          }
        });
      });
    }

    function maskTitle(el) {
      if (!el || el.dataset.fxTitle) return el;
      el.dataset.fxTitle = '1';
      var words = (el.textContent || '').trim().split(/\s+/);
      el.innerHTML = words.map(function (w) {
        return '<span class="fx-title-word"><span>' + w + '</span></span>';
      }).join(' ');
      return el;
    }

    function revealTitle(el) {
      if (!el || el.dataset.fxCinema) return;
      maskTitle(el);
      el.dataset.fxCinema = '1';
      var bits = el.querySelectorAll('.fx-title-word > span');
      g.set(el, { perspective: 800 });
      g.set(bits, { yPercent: 125 });
      ST.create({
        trigger: el,
        start: 'top 90%',
        once: true,
        onEnter: function () {
          g.fromTo(bits, { yPercent: 130, rotationX: 55 }, {
            yPercent: 0,
            rotationX: 0,
            duration: 1.2,
            stagger: 0.055,
            ease: 'expo.out'
          });
        }
      });
      setTimeout(function () { g.set(bits, { clearProps: 'transform' }); }, 4500);
    }

    [
      '.about-title', '.projects-title', '.skills-title', '.certifications-title',
      '.education-title', '.experience-title', '.writing-title', '.fun-facts-title', '.contact-title'
    ].forEach(function (sel) {
      document.querySelectorAll(sel).forEach(revealTitle);
    });

    fly(document.querySelectorAll('.atelier-label'), function () {
      return { y: 28 };
    }, { duration: 1.05, stagger: 0.02 });

    var aboutNotes = document.querySelector('.atelier-about-notes');
    if (aboutNotes) g.set(aboutNotes, { perspective: 1000 });

    fly(document.querySelectorAll('.atelier-about-index li'), function () {
      return { x: -36, y: 18 };
    }, { stagger: 0.14, duration: 1.15 });

    fly(document.querySelectorAll('.atelier-about-lede'), function () {
      return { y: 36, filter: 'blur(10px)' };
    }, { duration: 1.3 });

    fly(document.querySelectorAll('.atelier-about-pull'), function () {
      return { x: -28, y: 20, filter: 'blur(8px)' };
    }, { duration: 1.35 });

    fly(document.querySelectorAll('.atelier-about-notes li'), function (el, i) {
      return { y: 70, rotationX: 50, filter: 'blur(8px)' };
    }, { stagger: 0.16, duration: 1.35 });

    fly(document.querySelectorAll('.atelier-about-more-wrap'), function () {
      return { y: 24, scale: 0.94 };
    }, { duration: 1.1, ease: 'back.out(1.6)' });

    fly(document.querySelectorAll('.case-studies-section .project-card'), function () {
      return { rotationY: 78, x: -28 };
    }, { origin: 'left center', duration: 1.28, stagger: 0.1 });

    fly(document.querySelectorAll('#design-projects .project-card'), function (el, i) {
      return { y: 52, rotation: i % 2 ? 5 : -5, scale: 0.95 };
    }, { duration: 1.22, stagger: 0.1, ease: 'expo.out' });

    fly(document.querySelectorAll('#technical-projects .project-card'), function () {
      return { x: -44, y: 16, filter: 'blur(8px)' };
    }, { duration: 1.2, stagger: 0.1 });

    Array.prototype.slice.call(document.querySelectorAll('.atelier-skill-card')).forEach(function (card, i) {
      if (card.dataset.fxCinema) return;
      card.dataset.fxCinema = '1';
      ST.create({
        trigger: card,
        start: 'top 88%',
        once: true,
        onEnter: function () {
          g.fromTo(card, { y: 28 }, {
            y: 0,
            duration: 1.05, delay: Math.min(i * 0.1, 0.36), ease: 'expo.out',
            onComplete: function () { clearT(card); }
          });
          var tags = card.querySelectorAll('.atelier-skill-tags li');
          if (tags.length) {
            g.fromTo(tags, { y: 22 }, {
              y: 0, duration: 0.7, stagger: 0.06, delay: 0.28, ease: 'power3.out',
              onComplete: function () { g.set(tags, { clearProps: 'transform' }); }
            });
          }
          setTimeout(function () { clearT(card); }, 3200);
        }
      });
    });

    fly(document.querySelectorAll('.atelier-cert-gallery'), function () {
      return { y: 70, scale: 0.92, rotation: -4 };
    }, { duration: 1.45, ease: 'expo.out' });

    fly(document.querySelectorAll('.atelier-edu-main'), function () {
      return { x: -48, y: 24, filter: 'blur(8px)' };
    }, { duration: 1.3 });

    fly(document.querySelectorAll('.atelier-edu-stat'), function (el, i) {
      return { scale: 0.7, y: 36 };
    }, { stagger: 0.14, duration: 1.2, ease: 'back.out(1.7)' });

    fly(document.querySelectorAll('.atelier-edu-courses li'), function (el, i) {
      return { y: 22, scale: 0.92 };
    }, { stagger: 0.05, duration: 0.8, start: 'top 95%' });

    Array.prototype.slice.call(document.querySelectorAll('.atelier-exp-row')).forEach(function (row, i) {
      if (row.dataset.fxCinema) return;
      row.dataset.fxCinema = '1';
      ST.create({
        trigger: row,
        start: 'top 90%',
        once: true,
        onEnter: function () {
          g.fromTo(row, { x: -70, y: 18, filter: 'blur(6px)' }, {
            x: 0, y: 0, filter: 'blur(0px)',
            duration: 1.25, delay: Math.min(i * 0.1, 0.4), ease: 'expo.out',
            onComplete: function () { clearT(row); }
          });
          var line = row.querySelector('.atelier-exp-leader');
          if (line) {
            g.fromTo(line, { scaleX: 0 }, { scaleX: 1, duration: 1.05, delay: 0.2, ease: 'power3.inOut' });
          }
          setTimeout(function () { clearT(row); }, 3200);
        }
      });
    });

    fly(document.querySelectorAll('.atelier-writing-lede'), function () {
      return { y: 28 };
    }, { duration: 1.2 });

    fly(document.querySelectorAll('.atelier-essay'), function () {
      return { y: 28 };
    }, { duration: 1.15 });

    fly(document.querySelectorAll('.fun-facts-section .atelier-note'), function (el, i) {
      return { y: 28, rotation: i % 2 ? 2 : -2 };
    }, { stagger: 0.1, duration: 1.1, ease: 'expo.out' });

    fly(document.querySelectorAll('.atelier-contact-copy'), function () {
      return { x: -50, y: 20, filter: 'blur(8px)' };
    }, { duration: 1.3 });

    fly(document.querySelectorAll('.atelier-contact-form'), function () {
      return { y: 70, scale: 0.96, filter: 'blur(8px)' };
    }, { duration: 1.35 });

    fly(document.querySelectorAll('.atelier-contact-links li'), function () {
      return { x: -24, y: 10 };
    }, { stagger: 0.08, duration: 0.9 });

    var frame = document.querySelector('.atelier-about-frame');
    if (frame && !frame.dataset.fxParallax && window.innerWidth >= 900) {
      frame.dataset.fxParallax = '1';
      g.to(frame, {
        y: -56,
        ease: 'none',
        scrollTrigger: {
          trigger: '.about-section',
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1.2
        }
      });
    }

    var homeRight = document.querySelector('.home-right');
    if (homeRight && !homeRight.dataset.fxParallax && window.innerWidth >= 900) {
      homeRight.dataset.fxParallax = '1';
      g.to(homeRight, {
        y: -36,
        ease: 'none',
        scrollTrigger: {
          trigger: '.home-section',
          start: 'top top',
          end: 'bottom top',
          scrub: 1.4
        }
      });
    }

    var mark = document.querySelector('.fx-footer-mark span');
    if (mark && !mark.dataset.fxCinema) {
      mark.dataset.fxCinema = '1';
      g.fromTo(mark, { yPercent: 105 }, {
        yPercent: 0,
        duration: 1.05,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.fx-footer-mark',
          start: 'top 96%',
          once: true
        }
      });
    }

    var sub = document.querySelectorAll('.projects-subtitle, .atelier-skills-blurb');
    fly(sub, function () { return { y: 24, filter: 'blur(8px)' }; }, { duration: 1.15 });

    return true;
  }

  function playLock() {
    var chars = document.querySelectorAll('.lock-title .fx-ch > span');
    if (!chars.length || !window.gsap) return;
    window.gsap.fromTo(chars, {
      yPercent: 130,
      rotationX: 70
    }, {
      yPercent: 0,
      rotationX: 0,
      duration: 1.05,
      stagger: 0.038,
      ease: 'expo.out'
    });
  }

  function playLanding() {
    var home = document.querySelector('.home-section');
    if (!home || home.dataset.heroPlayed) return;
    home.dataset.heroPlayed = '1';

    var kicker = home.querySelector('.home-kicker');
    var photo = home.querySelector('.home-photo');
    var line1 = home.querySelectorAll('.hero-line-1 .fx-ch > span');
    var line2 = home.querySelectorAll('.hero-line-2 .fx-ch > span');
    var subtitle = home.querySelector('.home-subtitle');
    var desc = home.querySelector('.home-desc');
    var who = home.querySelector('.home-who');
    var btns = home.querySelector('.home-btns');
    var g = window.gsap;
    var finished = false;

    if (photo && photo.parentElement && !photo.parentElement.classList.contains('home-photo-stage')) {
      var wrap = document.createElement('div');
      wrap.className = 'home-photo-stage';
      photo.parentNode.insertBefore(wrap, photo);
      wrap.appendChild(photo);
    }
    var photoStage = home.querySelector('.home-photo-stage');

    if (kicker && !home.querySelector('.hero-rule')) {
      var rule = document.createElement('span');
      rule.className = 'hero-rule';
      rule.setAttribute('aria-hidden', 'true');
      kicker.insertAdjacentElement('afterend', rule);
    }
    var ruleEl = home.querySelector('.hero-rule');

    function showCopy() {
      [kicker, subtitle, desc, who, btns].forEach(function (el) {
        if (!el) return;
        el.style.opacity = '1';
        el.style.visibility = 'visible';
        el.style.transform = 'none';
        el.style.filter = 'none';
      });
      home.querySelectorAll('.home-kicker .fx-ch > span, .home-rotate').forEach(function (el) {
        el.style.opacity = '1';
        el.style.visibility = 'visible';
        el.style.transform = 'none';
      });
    }

    function finish() {
      if (finished) return;
      finished = true;
      home.classList.remove('hero-playing');
      home.classList.add('hero-live');
      showCopy();
      bindHeroMag();
      if (!g) return;
      if (photo) g.set(photo, { clearProps: 'transform,filter,rotation,rotationY,x,y,scale' });
      if (photoStage) g.set(photoStage, { clearProps: 'transform,rotation,y,scale' });
      g.set(line1, { clearProps: 'transform,opacity,rotation,rotationX,yPercent' });
      g.set(line2, { clearProps: 'transform,opacity,rotation,rotationX,yPercent' });
      if (kicker) g.set(kicker, { clearProps: 'transform,opacity,visibility,letterSpacing' });
      if (subtitle) g.set(subtitle, { clearProps: 'transform,opacity,visibility,filter' });
      if (desc) g.set(desc, { clearProps: 'transform,opacity,visibility,filter' });
      if (who) g.set(who, { clearProps: 'transform,opacity,visibility' });
      if (btns) g.set(btns, { clearProps: 'transform,opacity,visibility,scale' });
      showCopy();
    }

    if (!g || !line1.length) {
      home.classList.add('hero-css');
      finish();
      return;
    }

    home.classList.add('hero-playing');
    var ink = getComputedStyle(document.documentElement).getPropertyValue('--spin').trim() || '#c45c26';
    var period = line1[line1.length - 1];

    g.set(home.querySelectorAll('.hero-line'), { perspective: 900 });
    g.set(line1, { transformOrigin: '50% 100%' });
    g.set(line2, { transformOrigin: '50% 100%' });

    var tl = g.timeline({
      defaults: { ease: 'expo.out', force3D: true },
      onComplete: finish
    });

    if (kicker) {
      tl.fromTo(kicker, { y: 16, autoAlpha: 0 }, {
        y: 0, autoAlpha: 1, duration: 0.8, ease: 'power3.out'
      }, 0.05);
    }

    if (ruleEl) {
      tl.fromTo(ruleEl, { scaleX: 0 }, {
        scaleX: 1, duration: 0.9, ease: 'power3.inOut'
      }, 0.18);
    }

    tl.fromTo(line1, { yPercent: 120 }, {
      yPercent: 0, duration: 1.2, stagger: 0.06
    }, 0.12);

    tl.fromTo(line2, { yPercent: 120 }, {
      yPercent: 0, duration: 1.25, stagger: 0.03
    }, 0.32);

    if (period) {
      tl.to(period, { color: ink, duration: 0.35 }, 0.85);
    }

    if (photoStage) {
      tl.fromTo(photoStage, { y: 36, scale: 0.94, rotation: -8 }, {
        y: 0, scale: 1, rotation: 0, duration: 1.7, ease: 'expo.out'
      }, 0.1);
    } else if (photo) {
      tl.fromTo(photo, { y: 36, scale: 0.94, rotation: -8 }, {
        y: 0, scale: 1, rotation: -3.5, duration: 1.7, ease: 'expo.out'
      }, 0.1);
    }

    if (subtitle) {
      tl.fromTo(subtitle, { y: 22, autoAlpha: 0 }, {
        y: 0, autoAlpha: 1, duration: 0.95, ease: 'power3.out'
      }, 0.72);
    }

    if (desc) {
      tl.fromTo(desc, { y: 20, autoAlpha: 0 }, {
        y: 0, autoAlpha: 1, duration: 0.9, ease: 'power3.out'
      }, 0.88);
    }

    if (who) {
      tl.fromTo(who, { y: 14, autoAlpha: 0 }, {
        y: 0, autoAlpha: 1, duration: 0.75, ease: 'power3.out'
      }, 1.02);
    }

    if (btns) {
      tl.fromTo(btns, { y: 16, autoAlpha: 0 }, {
        y: 0, autoAlpha: 1, duration: 0.8, ease: 'power3.out'
      }, 1.12);
    }

    setTimeout(finish, 2800);
  }

  function playStory() {
    var story = document.querySelector('.story-hero');
    if (!story || story.dataset.heroPlayed || !window.gsap) return;
    var chars = story.querySelectorAll('.story-hero-title .fx-ch > span');
    if (!chars.length) return;
    story.dataset.heroPlayed = '1';
    window.gsap.fromTo(chars, { yPercent: 130, rotationX: 70 }, {
      yPercent: 0, rotationX: 0, duration: 1.2, stagger: 0.03, ease: 'expo.out'
    });
  }

  function bootLenis() {
    var LenisCtor = window.Lenis || (window.lenis && window.lenis.Lenis);
    if (typeof LenisCtor !== 'function' || html.dataset.fxLenis) return;
    html.dataset.fxLenis = '1';
    var lenis = new LenisCtor({ duration: 1.25, smoothWheel: true, wheelMultiplier: 0.95 });
    var ST = window.ScrollTrigger;
    var g = window.gsap;

    function tick(time) {
      lenis.raf(time);
      if (ST) ST.update();
      onScroll();
    }

    if (g && g.ticker) {
      g.ticker.add(function (time) { tick(time * 1000); });
      g.ticker.lagSmoothing(0);
    } else {
      (function raf(time) {
        tick(time);
        requestAnimationFrame(raf);
      })(0);
    }
  }

  function startPageMotion() {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        playLanding();
        playStory();
        if (!document.querySelector('.home-section')) bindHeroMag();
      });
    });
    bindCardMotion();
    bootLenis();
    setTimeout(bindCardMotion, 300);
    setTimeout(bindCardMotion, 1200);
    setTimeout(function () {
      var home = document.querySelector('.home-section');
      if (home && !home.classList.contains('hero-live')) {
        home.classList.add('hero-live', 'hero-css');
        bindHeroMag();
      }
    }, 4500);
  }

  if (document.body.classList.contains('portfolio-is-locked')) {
    playLock();
    document.addEventListener('portfolio-unlocked', function () {
      setTimeout(startPageMotion, 40);
    }, { once: true });
  } else {
    startPageMotion();
  }
})();
