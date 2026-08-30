(function () {
  var mount = document.getElementById('story-book-mount');
  if (!mount) return;

  var sourceChapters = document.querySelectorAll('.story-chapter');
  if (!sourceChapters.length) return;

  document.documentElement.classList.add('has-story-book');

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var AUTO_MS = 10000;
  var LAST_MS = 8000;
  var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'];

  function fitSize() {
    var vh = window.innerHeight || 800;
    var vw = window.innerWidth || 1200;
    var avail = Math.min(vw, (mount && mount.clientWidth) || vw);
    var chrome = vw < 700 ? 168 : 172;
    var h = Math.round(Math.max(320, Math.min(480, vh - chrome)));
    var spread = vw >= 900 && avail >= 700;
    if (spread) {
      var maxBook = Math.min(avail - 24, 1080);
      var pageW = Math.floor(maxBook / 2);
      pageW = Math.max(300, Math.min(pageW, Math.round(h * 0.84)));
      return { width: pageW, height: h, spread: true, stageW: pageW * 2 };
    }
    var pad = vw < 700 ? 28 : 40;
    var w = Math.round(h * 0.72);
    if (w > avail - pad) {
      w = Math.max(240, avail - pad);
      h = Math.round(w / 0.72);
    }
    return { width: w, height: h, spread: false, stageW: w };
  }

  var size = fitSize();
  var CPL = size.width < 320 ? 38 : size.width < 400 ? 46 : 54;
  var PAGE_LINES = Math.max(5, Math.floor((size.height - 128) / 26));
  var TOC_PER_PAGE = Math.max(6, PAGE_LINES - 2);

  var flip = null;
  var autoTimer = null;
  var hovered = false;
  var turning = false;
  var pageMeta = [];
  var chapterStart = [];

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function textOf(el) {
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function lineCount(text) {
    var t = String(text || '').trim();
    if (!t) return 0;
    return Math.max(1, Math.ceil(t.length / CPL));
  }

  function sentences(text) {
    var parts = String(text || '').match(/[^.!?]+[.!?]+|[^.!?]+$/g);
    return parts ? parts.map(function (p) { return p.trim(); }).filter(Boolean) : [text];
  }

  function sheet(html, attrs) {
    attrs = attrs || {};
    var el = document.createElement('article');
    el.className = 'wb-sheet' + (attrs.cover ? ' sb-cover' : '');
    el.innerHTML = html;
    return el;
  }

  function packBlocks(blocks, startHtml, startLines) {
    var pages = [];
    var buf = startHtml || '';
    var used = startLines || 0;

    function flush() {
      if (buf) pages.push(buf);
      buf = '';
      used = 0;
    }

    function push(html, lines) {
      if (used && used + lines > PAGE_LINES) flush();
      buf += html;
      used += lines;
    }

    blocks.forEach(function (block) {
      if (block.lines <= PAGE_LINES - used || !used) {
        if (block.lines > PAGE_LINES && used) flush();
        if (block.lines > PAGE_LINES) {
          var bits = sentences(block.text);
          var chunk = '';
          var chunkLines = 0;
          bits.forEach(function (bit) {
            var add = lineCount(bit);
            if (chunkLines && chunkLines + add > PAGE_LINES) {
              push('<p class="wb-line">' + esc(chunk.trim()) + '</p>', chunkLines);
              flush();
              chunk = bit + ' ';
              chunkLines = add;
            } else {
              chunk += bit + ' ';
              chunkLines += add;
            }
          });
          if (chunk.trim()) push('<p class="wb-line">' + esc(chunk.trim()) + '</p>', Math.max(1, chunkLines));
          return;
        }
        push(block.html, block.lines);
        return;
      }
      flush();
      push(block.html, block.lines);
    });

    if (buf) pages.push(buf);
    return pages.length ? pages : [startHtml || ''];
  }

  function blocksFrom(copy) {
    var blocks = [];
    Array.prototype.forEach.call(copy.children, function (node) {
      if (node.matches('h2')) return;
      if (node.matches('.story-clock')) {
        blocks.push({
          html: '<p class="wb-kicker">' + esc(textOf(node)) + '</p>',
          lines: 1,
          text: textOf(node)
        });
        return;
      }
      if (node.matches('.story-clock-label')) {
        var label = textOf(node);
        blocks.push({ html: '<p class="wb-pull">' + esc(label) + '</p>', lines: lineCount(label), text: label });
        return;
      }
      if (node.matches('blockquote')) {
        var quote = textOf(node);
        blocks.push({ html: '<p class="wb-pull">' + esc(quote) + '</p>', lines: lineCount(quote) + 1, text: quote });
        return;
      }
      if (node.matches('ul')) {
        Array.prototype.forEach.call(node.querySelectorAll('li'), function (li) {
          var t = textOf(li);
          blocks.push({ html: '<p class="wb-line"><span class="wb-run">Beat.</span> ' + esc(t) + '</p>', lines: lineCount(t), text: t });
        });
        return;
      }
      if (node.matches('aside')) {
        Array.prototype.forEach.call(node.querySelectorAll('p'), function (p) {
          var t = textOf(p);
          blocks.push({ html: '<p class="wb-line">' + esc(t) + '</p>', lines: lineCount(t), text: t });
        });
        return;
      }
      if (node.matches('p')) {
        var t = textOf(node);
        if (!t) return;
        blocks.push({ html: '<p class="wb-line">' + esc(t) + '</p>', lines: lineCount(t), text: t });
      }
    });
    return blocks;
  }

  var chapters = [];
  Array.prototype.forEach.call(sourceChapters, function (ch, i) {
    var copy = ch.querySelector('.story-chapter-copy') || ch;
    chapters.push({
      num: textOf(ch.querySelector('.story-num')) || String(i + 1).padStart(2, '0'),
      title: textOf(copy.querySelector('h2')),
      roman: ROMAN[i] || String(i + 1),
      blocks: blocksFrom(copy)
    });
  });

  var act = document.querySelector('.story-act');
  var actPage = null;
  if (act) {
    actPage = {
      kicker: textOf(act.querySelector('.atelier-label')),
      title: textOf(act.querySelector('h2')),
      lines: Array.prototype.map.call(act.querySelectorAll('p:not(.atelier-label)'), function (p) {
        return textOf(p);
      }).filter(Boolean)
    };
  }

  var actPacked = [];
  if (actPage) {
    actPacked = packBlocks(actPage.lines.map(function (line) {
      return { html: '<p class="wb-line">' + esc(line) + '</p>', lines: lineCount(line), text: line };
    }), '', 0);
  }

  var packed = chapters.map(function (ch) {
    return packBlocks(ch.blocks, '', 0);
  });
  var tocCount = Math.ceil(chapters.length / TOC_PER_PAGE);
  var folio = 1 + tocCount;
  var startPages = [];
  chapters.forEach(function (ch, i) {
    if (actPage && i === 9) folio += 1 + Math.max(1, actPacked.length);
    startPages[i] = folio;
    folio += 1 + Math.max(1, packed[i].length);
  });

  var sheets = [];
  var printed = 1;

  sheets.push(sheet(
    '<div class="wb-write">' +
      '<div class="sb-cover-inner">' +
        '<i class="sb-cover-corners" aria-hidden="true"></i>' +
        '<p class="sb-cover-kicker">The long version</p>' +
        '<h3 class="sb-cover-title"><span>Wanna know me</span><span>beyond resume?</span></h3>' +
        '<i class="sb-cover-mark" aria-hidden="true"></i>' +
        '<figure class="sb-cover-photo"><img src="ProfilePhoto.webp" alt="Deepika" width="96" height="120" decoding="async"></figure>' +
      '</div>' +
    '</div>',
    { cover: true }
  ));
  pageMeta.push({ kind: 'cover' });

  var tocButtons = chapters.map(function (ch, i) {
    return '<button type="button" class="wb-toc-row" data-chapter="' + i + '">' +
      '<span class="wb-toc-num">' + ch.num + '</span>' +
      '<span class="wb-toc-copy"><span class="wb-toc-title">' + esc(ch.title) + '</span></span>' +
      '<span class="wb-toc-dots" aria-hidden="true"></span>' +
      '<span class="wb-toc-page">' + startPages[i] + '</span>' +
    '</button>';
  });

  for (var t = 0; t < tocButtons.length; t += TOC_PER_PAGE) {
    var slice = tocButtons.slice(t, t + TOC_PER_PAGE).join('');
    var part = tocCount > 1 ? 'Contents ' + (Math.floor(t / TOC_PER_PAGE) + 1) : 'Contents';
    sheets.push(sheet(
      '<div class="wb-write">' +
        '<header class="wb-running"><span>The long version</span><span>' + part + '</span></header>' +
        '<p class="wb-kicker">Front matter</p>' +
        '<h3 class="wb-title">Contents</h3>' +
        '<div class="wb-toc">' + slice + '</div>' +
      '</div>' +
      '<footer class="wb-folio">' + printed++ + '</footer>'
    ));
    pageMeta.push({ kind: 'index' });
  }

  chapters.forEach(function (ch, chIndex) {
    if (actPage && chIndex === 9) {
      sheets.push(sheet(
        '<div class="wb-write sb-open">' +
          '<p class="sb-open-kicker">Act II</p>' +
          '<p class="sb-open-roman">II</p>' +
          '<h3 class="sb-open-title">' + esc(actPage.title) + '</h3>' +
          '<i class="sb-open-mark" aria-hidden="true"></i>' +
        '</div>' +
        '<footer class="wb-folio">' + printed++ + '</footer>'
      ));
      pageMeta.push({ kind: 'act' });
      actPacked.forEach(function (body) {
        sheets.push(sheet(
          '<div class="wb-write">' +
            '<header class="wb-running"><span>The long version</span><span>Act II</span></header>' +
            body +
          '</div>' +
          '<footer class="wb-folio">' + printed++ + '</footer>'
        ));
        pageMeta.push({ kind: 'act' });
      });
    }

    chapterStart[chIndex] = sheets.length;
    sheets.push(sheet(
      '<div class="wb-write sb-open">' +
        '<p class="sb-open-kicker">Chapter ' + ch.num + '</p>' +
        '<p class="sb-open-roman">' + ch.roman + '</p>' +
        '<h3 class="sb-open-title">' + esc(ch.title) + '</h3>' +
        '<i class="sb-open-mark" aria-hidden="true"></i>' +
      '</div>' +
      '<footer class="wb-folio">' + printed++ + '</footer>'
    ));
    pageMeta.push({ kind: 'opener', ch: chIndex });

    packed[chIndex].forEach(function (body) {
      sheets.push(sheet(
        '<div class="wb-write">' +
          '<header class="wb-running"><span>Chapter ' + ch.roman + '</span><span>' + esc(ch.title) + '</span></header>' +
          body +
        '</div>' +
        '<footer class="wb-folio">' + printed++ + '</footer>'
      ));
      pageMeta.push({ kind: 'chapter', ch: chIndex });
    });
  });

  sheets.push(sheet(
    '<div class="wb-write sb-open">' +
      '<p class="sb-open-kicker">The end</p>' +
      '<p class="sb-open-roman">Fin</p>' +
      '<h3 class="sb-open-title">Watch me. I\'m just getting started.</h3>' +
      '<i class="sb-open-mark" aria-hidden="true"></i>' +
      '<button type="button" class="wb-cta" data-chapter="cover">Back to the cover</button>' +
    '</div>' +
    '<footer class="wb-folio">fin</footer>'
  ));
  pageMeta.push({ kind: 'end' });

  if (sheets.length % 2) {
    sheets.push(sheet(
      '<div class="wb-write sb-open">' +
        '<p class="sb-open-kicker">Fin</p>' +
      '</div>'
    ));
    pageMeta.push({ kind: 'end' });
  }

  mount.innerHTML =
    '<div class="work-book story-book" id="story-book">' +
      '<div class="work-book-stage" id="story-book-stage"></div>' +
      '<div class="work-book-bar">' +
        '<button type="button" class="work-book-nav" data-book="prev" aria-label="Previous page">Prev</button>' +
        '<p class="work-book-status" aria-live="polite">Cover</p>' +
        '<button type="button" class="work-book-nav" data-book="next" aria-label="Next page">Next</button>' +
      '</div>' +
    '</div>';

  var book = mount.querySelector('.work-book');
  var stage = mount.querySelector('.work-book-stage');
  var status = mount.querySelector('.work-book-status');

  function applyShell() {
    book.classList.toggle('is-spread', size.spread);
    book.style.setProperty('--sb-w', size.stageW + 'px');
    book.style.setProperty('--sb-h', size.height + 'px');
    stage.style.width = size.stageW + 'px';
    stage.style.height = size.height + 'px';
  }

  applyShell();
  sheets.forEach(function (el) { stage.appendChild(el); });

  function paintStatus() {
    if (!flip) return;
    var meta = pageMeta[flip.getCurrentPageIndex()] || {};
    if (meta.kind === 'cover') status.textContent = 'Cover';
    else if (meta.kind === 'index') status.textContent = 'Contents';
    else if (meta.kind === 'act') status.textContent = 'Act II';
    else if (meta.kind === 'end') status.textContent = 'The end';
    else if (meta.kind === 'opener') status.textContent = 'Chapter ' + chapters[meta.ch].num;
    else {
      var ch = chapters[meta.ch];
      status.textContent = 'Chapter ' + ch.num + ' · ' + ch.title;
    }
  }

  function stopAuto() {
    if (autoTimer) {
      window.clearTimeout(autoTimer);
      autoTimer = null;
    }
  }

  function isLastPage() {
    if (!flip) return false;
    var i = flip.getCurrentPageIndex();
    var n = flip.getPageCount();
    if (size.spread) return i >= n - 2;
    return i >= n - 1;
  }

  function bookInView() {
    var r = book.getBoundingClientRect();
    return r.bottom >= 90 && r.top <= window.innerHeight - 90;
  }

  function goToCover() {
    if (!flip || flip.getCurrentPageIndex() === 0) {
      armAuto();
      return;
    }
    stopAuto();
    if (reduce) {
      flip.turnToPage(0);
      paintStatus();
      armAuto();
      return;
    }
    flip.flip(0, 'bottom');
    window.setTimeout(function () {
      if (!flip) return;
      if (flip.getCurrentPageIndex() !== 0) {
        flip.turnToPage(0);
        paintStatus();
      }
      armAuto();
    }, 1600);
  }

  function armAuto() {
    stopAuto();
    var last = isLastPage();
    autoTimer = window.setTimeout(function () {
      if (!flip || turning || document.hidden || !bookInView()) {
        if (!document.hidden) armAuto();
        return;
      }
      if (isLastPage()) {
        goToCover();
        return;
      }
      if (hovered) {
        armAuto();
        return;
      }
      if (reduce) {
        flip.turnToNextPage();
        paintStatus();
        armAuto();
        return;
      }
      flip.flipNext('top');
    }, last ? LAST_MS : AUTO_MS);
  }

  function step(dir) {
    if (!flip || turning) return;
    var i = flip.getCurrentPageIndex();
    var n = flip.getPageCount();
    if (dir === 'next' && i >= n - 1) return;
    if (dir === 'prev' && i <= 0) return;
    stopAuto();
    if (reduce) {
      if (dir === 'next') flip.turnToNextPage();
      else flip.turnToPrevPage();
      paintStatus();
      armAuto();
      return;
    }
    if (dir === 'next') flip.flipNext('top');
    else flip.flipPrev('top');
    window.setTimeout(function () {
      if (!flip || turning) return;
      if (flip.getCurrentPageIndex() !== i) return;
      if (dir === 'next') flip.turnToNextPage();
      else flip.turnToPrevPage();
      paintStatus();
    }, 1700);
  }

  function goToPage(index) {
    if (!flip) return;
    var max = flip.getPageCount() - 1;
    var target = Math.max(0, Math.min(index, max));
    if (target === flip.getCurrentPageIndex()) return;
    stopAuto();
    if (reduce) flip.turnToPage(target);
    else flip.flip(target, 'bottom');
    armAuto();
  }

  function goToChapter(index) {
    if (index === 'cover' || index === 'index') {
      goToPage(index === 'cover' ? 0 : 1);
      return;
    }
    var start = chapterStart[Number(index)];
    if (typeof start === 'number') goToPage(start);
  }

  function bindFlip() {
    if (!flip) return;
    flip.on('flip', function () {
      turning = false;
      paintStatus();
      armAuto();
    });
    flip.on('changeState', function (e) {
      var state = e && e.data;
      turning = state === 'flipping' || state === 'user_fold';
      if (turning) stopAuto();
      if (state === 'read') armAuto();
    });
    flip.on('init', function () {
      paintStatus();
      armAuto();
    });
  }

  function createFlip(startPage) {
    var Ctor = window.St && window.St.PageFlip;
    if (!Ctor) return false;
    if (flip) {
      try { startPage = flip.getCurrentPageIndex(); } catch (err) {}
      try { flip.destroy(); } catch (err2) {}
      flip = null;
    }
    turning = false;
    sheets.forEach(function (el) {
      if (el.parentNode !== stage) stage.appendChild(el);
    });
    flip = new Ctor(stage, {
      width: size.width,
      height: size.height,
      size: 'fixed',
      minWidth: size.width,
      maxWidth: size.width,
      minHeight: size.height,
      maxHeight: size.height,
      drawShadow: true,
      flippingTime: reduce ? 1 : 1400,
      usePortrait: true,
      startZIndex: 2,
      autoSize: false,
      maxShadowOpacity: size.spread ? 0.6 : 0.35,
      showCover: false,
      mobileScrollSupport: true,
      swipeDistance: 24,
      clickEventForward: true,
      useMouseEvents: true,
      showPageCorners: !!size.spread,
      disableFlipByClick: false,
      startPage: startPage || 0
    });
    flip.loadFromHTML(stage.querySelectorAll('.wb-sheet'));
    bindFlip();
    if (startPage) {
      try { flip.turnToPage(startPage); } catch (err3) {}
    }
    return true;
  }

  function boot(tries) {
    if (!(window.St && window.St.PageFlip)) {
      if ((tries || 0) < 40) window.setTimeout(function () { boot((tries || 0) + 1); }, 50);
      return;
    }
    createFlip(0);
  }

  book.querySelectorAll('[data-book]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      step(btn.getAttribute('data-book') === 'next' ? 'next' : 'prev');
    });
  });

  book.addEventListener('click', function (e) {
    var nav = e.target.closest('[data-book]');
    if (nav && flip) {
      e.preventDefault();
      e.stopPropagation();
      step(nav.getAttribute('data-book') === 'next' ? 'next' : 'prev');
      return;
    }
    var toc = e.target.closest('[data-chapter]');
    if (toc) goToChapter(toc.getAttribute('data-chapter'));
  });

  document.addEventListener('keydown', function (e) {
    if (!flip || !book.offsetParent) return;
    var r = book.getBoundingClientRect();
    if (r.bottom < 80 || r.top > window.innerHeight - 80) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      step('next');
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      step('prev');
    }
  });

  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    book.addEventListener('mouseenter', function () {
      hovered = true;
      if (!isLastPage()) stopAuto();
    });
    book.addEventListener('mouseleave', function () {
      hovered = false;
      armAuto();
    });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopAuto();
    else armAuto();
  });

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries[0] && entries[0].isIntersecting) armAuto();
      else stopAuto();
    }, { threshold: 0.28 });
    io.observe(book);
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      var next = fitSize();
      var modeChanged = next.spread !== size.spread;
      var sizeChanged = Math.abs(next.width - size.width) > 12 || Math.abs(next.height - size.height) > 12;
      if (!modeChanged && !sizeChanged) return;
      var page = flip ? flip.getCurrentPageIndex() : 0;
      size = next;
      applyShell();
      createFlip(page);
      paintStatus();
      armAuto();
    }, 220);
  });

  boot(0);
})();
