// Shared machinery for the two regression harnesses.
//
// This is a DEV-ONLY module. The site itself has no build step and does not
// depend on anything in this directory.
//
// Everything here was extracted verbatim from visual.mjs when the second
// harness (computed.mjs) was added. Both need the page brought to the exact
// same deterministic resting state, and a copy in each file would inevitably
// drift -- at which point the two harnesses would silently be measuring
// different pages and disagreeing for reasons that have nothing to do with the
// site.
//
// The scenario list lives here for the same reason: it means the computed-style
// coverage and the screenshot coverage can never fall out of step.

export const VIEWPORTS = [
  { label: 'mobile', width: 375, height: 812 },
  { label: 'tablet', width: 800, height: 1024 },
  { label: 'desktop', width: 1440, height: 900 },
];

export const PAGES = [
  { label: 'index', path: '/index.html' },
  { label: 'story', path: '/my-story.html' },
];

export const THEMES = ['light', 'dark'];

/**
 * Elements that legitimately differ between two identical runs and would
 * otherwise produce permanent false positives.
 *
 * - .home-rotate      cycles through words forever; whichever word is showing
 *                     at capture time is arbitrary.
 * - .scroll-progress  injected by motion.js and driven by scroll offset.
 * - .lock-notification transient toast on a timer.
 */
export const VOLATILE = ['.home-rotate', '.scroll-progress', '.lock-notification'];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Freeze CSS-driven motion. This handles @keyframes and transitions only --
 * GSAP writes inline styles from JavaScript every frame and is completely
 * unaffected by it, which is what `freezeMotion` below is for.
 *
 * Note this deliberately does NOT use prefers-reduced-motion. All five
 * stylesheets restyle the page under that media query, so emulating it would
 * capture a different design than real visitors see.
 *
 * `freezeTransitions` is off for the computed-style harness. Killing
 * transitions rewrites `transition-*` to `none` on every element, which would
 * make those properties unreadable there -- and they are worth reading, since
 * dropping a rule that carries a transition is exactly the kind of regression
 * a screenshot of a page at rest cannot show. Nothing is mid-transition at
 * capture time anyway: transitions need a property change to start, and the
 * page has been sitting still since `freezeMotion` returned.
 */
export function freezeCss({ freezeTransitions = true } = {}) {
  return `
  *, *::before, *::after {
    /* Pausing alone is not enough: it freezes each animation at whatever
       arbitrary phase it happened to reach, which drifts by fractions of a
       pixel between runs. Seeking to a fixed, far-future time first makes the
       frozen frame identical every time -- finite animations land on their end
       state, and looping ones land on a phase determined purely by this
       constant. */
    animation-delay: -10000s !important;
    animation-play-state: paused !important;
    ${freezeTransitions ? 'transition: none !important;' : ''}
    caret-color: transparent !important;
  }
  html { scroll-behavior: auto !important; }
`;
}

/**
 * Drive every ScrollTrigger reveal to its final state.
 *
 * The reveals are one-way (opacity 0 -> 1, once: true), so stepping down the
 * full height and back up leaves the whole document revealed. Lenis smooth
 * scroll is bypassed by writing scrollTop directly rather than dispatching
 * wheel events.
 */
export async function revealEverything(page) {
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.6);
    const el = document.scrollingElement || document.documentElement;
    const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    for (let y = 0; y < el.scrollHeight; y += step) {
      el.scrollTop = y;
      window.dispatchEvent(new Event('scroll'));
      await settle();
    }

    el.scrollTop = el.scrollHeight;
    window.ScrollTrigger?.refresh();
    await settle();

    el.scrollTop = 0;
    window.dispatchEvent(new Event('scroll'));
    await settle();
  });
}

/**
 * Force every image to load and decode before anything is measured.
 *
 * Several images are `loading="lazy"`, so whether they have decoded by capture
 * time is a race -- the About photo in particular would appear in one run and
 * not the next. It also affects geometry: the four certificate images carry no
 * width/height attributes, so they reflow the page when they arrive late.
 */
export async function awaitImages(page) {
  await page.evaluate(async () => {
    const images = Array.from(document.images);
    images.forEach((img) => {
      img.loading = 'eager';
    });

    await Promise.all(
      images.map(
        (img) =>
          img.complete ||
          new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          })
      )
    );

    // `complete` only promises bytes have arrived, not that they are painted.
    await Promise.all(images.map((img) => img.decode?.().catch(() => {})));
  });
}

/**
 * Bring the JavaScript animation layer to a deterministic standstill.
 *
 * GSAP mutates inline styles on every ticker frame, so CSS-level pausing does
 * nothing to it -- without this, a screenshot catches whatever frame happened
 * to be current and the same page differs run to run.
 *
 * Each tween is handled according to what it is:
 *  - scrub tweens are left alone. Their state is a pure function of scrollTop,
 *    so they are already deterministic and forcing them would capture a state
 *    no real visitor at this scroll position ever sees.
 *  - infinite tweens are pinned to their first frame; they have no end state.
 *  - everything else is fast-forwarded to completion, which is the resting
 *    state a visitor sees a moment later anyway.
 *
 * Finally the ticker is put to sleep, which also halts Lenis (motion.js drives
 * Lenis from the GSAP ticker) so nothing can move after this returns.
 */
export async function freezeMotion(page) {
  await page.evaluate(() => {
    const g = window.gsap;
    if (!g) return;

    for (const tween of g.globalTimeline.getChildren(true, true, false)) {
      const st = tween.scrollTrigger;
      if (st && st.scrub) continue;

      if (typeof tween.repeat === 'function' && tween.repeat() === -1) {
        tween.progress(0).pause();
        continue;
      }

      tween.progress(1);
    }

    window.ScrollTrigger?.refresh();
    g.globalTimeline.pause();
    g.ticker.sleep();
  });
}

/**
 * Pin the page to a known resting state: scrolled to the very top, with
 * nothing focused.
 *
 * Both matter more than they sound. A fullPage screenshot draws fixed-position
 * elements (the navbar, the back-to-top button) wherever the viewport happens
 * to be, so a scroll offset of even a few pixels moves them relative to the
 * document and reports as a diff. And a focused element triggers `:focus`
 * styling -- the skip link in particular becomes visible and takes up layout
 * space, shifting the entire document down.
 *
 * Must run after `freezeMotion`, because Lenis will otherwise keep animating
 * the scroll position back out from under us.
 */
export async function settleAtTop(page) {
  await page.evaluate(async () => {
    document.activeElement?.blur?.();

    const el = document.scrollingElement || document.documentElement;
    const frame = () => new Promise((r) => requestAnimationFrame(r));

    for (let i = 0; i < 20 && el.scrollTop !== 0; i += 1) {
      el.scrollTop = 0;
      window.scrollTo(0, 0);
      await frame();
    }

    // Set by motion.js while scrolling down; would otherwise leave the navbar
    // hidden in some captures and visible in others.
    document.body.classList.remove('nav-away');
    window.dispatchEvent(new Event('scroll'));
    await frame();
  });
}

/**
 * Open the mobile drawer by setting the classes directly rather than clicking.
 *
 * Clicking is avoided for two reasons. It leaves focus artefacts in the
 * screenshot (a focus ring, and the skip link becoming visible), and tapping
 * "Work" also scrolls the page to Case Studies -- `toggleDropdown` calls
 * `preventDefault`, but `script.js` binds a separate smooth-scroll handler to
 * every `a[href^="#"]`, and one listener's preventDefault does not stop
 * another on the same element. See the known-bugs list in the README.
 *
 * These scenarios exist to protect the drawer's CSS, so driving the classes is
 * both more deterministic and closer to what is being tested.
 */
export async function openDrawer(page, withDropdown) {
  await page.evaluate((dropdown) => {
    document.querySelector('.nav-links')?.classList.add('open');
    document.querySelector('.drawer-overlay')?.classList.add('visible');
    if (dropdown) document.querySelector('.dropdown-content')?.classList.add('show');
    document.activeElement?.blur?.();
  }, withDropdown);
  await sleep(350);
}

/**
 * Load a scenario and bring it to its deterministic resting state.
 *
 * `baseUrl` is passed in rather than derived from a module-level port so the
 * two harnesses can run on different ports without colliding.
 */
export async function preparePage(page, scenario, baseUrl, options = {}) {
  // Seeded before any document script runs, so the theme applies without a
  // flash and the lock is already satisfied where required.
  await page.addInitScript(
    ({ theme, unlocked }) => {
      try {
        localStorage.setItem('theme', theme);
        if (unlocked) sessionStorage.setItem('portfolio_unlocked', 'true');
        else sessionStorage.removeItem('portfolio_unlocked');
      } catch {}
    },
    { theme: scenario.theme, unlocked: scenario.unlocked !== false }
  );

  await page.goto(`${baseUrl}${scenario.path}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts?.ready);
  // Before any reveal work, so ScrollTrigger measures final geometry.
  await awaitImages(page);

  if (scenario.unlocked === false || scenario.quick) {
    // Nothing to reveal: the lock screen only has its intro animation, and the
    // 404 page is a single static screen.
    await sleep(1200);
  } else {
    await revealEverything(page);
    // motion.js installs a 4500ms fallback that force-finalises the hero.
    // Capturing before it fires makes the hero a coin flip between two states.
    await sleep(5200);
    await revealEverything(page);
    await awaitImages(page);
  }

  await freezeMotion(page);
  await settleAtTop(page);
  await page.addStyleTag({ content: freezeCss(options) });

  if (options.freezeTransitions === false) {
    // `settleAtTop` removes `nav-away`, which starts a transition on the
    // navbar; the lock screen's inputs transition their border colour on a
    // similar cue. The screenshot harness never sees these because it kills
    // transitions outright, but this path keeps them alive in order to read
    // `transition-*`, so it has to outwait them instead. Long enough for any
    // duration the stylesheets declare, and once they finish the values are
    // exact rather than merely close.
    await sleep(1500);
  }

  for (const selector of VOLATILE) {
    await page
      .locator(selector)
      .evaluateAll((nodes) =>
        nodes.forEach((n) => {
          // Priority is required: the site has ~838 `!important` declarations,
          // several of which would otherwise win against a plain inline style.
          n.style.setProperty('visibility', 'hidden', 'important');
        })
      )
      .catch(() => {});
  }

  if (scenario.action) {
    await scenario.action(page);

    // Re-freeze. An action can restart the animation layer that was just put
    // to sleep: opening the work modal is done by clicking a card, and that
    // click scrolls the page, which fires the ScrollTrigger reveals for
    // whatever came into view. Those tweens then sit part-finished, leaving
    // elements at an arbitrary blur and offset that differs run to run.
    //
    // Freezing again settles them on the same final state every time. Harmless
    // for actions that do not scroll, since nothing is running by then.
    await freezeMotion(page);
  }
  await sleep(250);
}

/**
 * Every state both harnesses check.
 *
 * `fullPage` and `clip` are only meaningful to the screenshot harness; the
 * computed-style harness ignores them, since it reads the whole document
 * regardless of what is on screen.
 */
export function buildScenarios(filter) {
  const scenarios = [];

  for (const pageDef of PAGES) {
    for (const vp of VIEWPORTS) {
      for (const theme of THEMES) {
        scenarios.push({
          name: `${pageDef.label}-${vp.label}-${theme}`,
          path: pageDef.path,
          theme,
          ...vp,
          fullPage: true,
        });
      }
    }
  }

  // The gate itself, which no other scenario can see.
  for (const theme of THEMES) {
    scenarios.push({
      name: `lock-desktop-${theme}`,
      path: '/index.html',
      theme,
      unlocked: false,
      width: 1440,
      height: 900,
      fullPage: false,
    });
  }
  scenarios.push({
    name: 'lock-mobile-light',
    path: '/index.html',
    theme: 'light',
    unlocked: false,
    width: 375,
    height: 812,
    fullPage: false,
  });

  // 404.html is standalone and themes itself from prefers-color-scheme rather
  // than the site's .dark-theme class, so the scheme is emulated instead.
  for (const scheme of ['light', 'dark']) {
    scenarios.push({
      name: `404-desktop-${scheme}`,
      path: '/404.html',
      theme: 'light',
      colorScheme: scheme,
      quick: true,
      width: 1440,
      height: 900,
      fullPage: false,
    });
  }
  scenarios.push({
    name: '404-mobile-light',
    path: '/404.html',
    theme: 'light',
    colorScheme: 'light',
    quick: true,
    width: 375,
    height: 812,
    fullPage: false,
  });

  // Navigation states. These are closed in every other scenario, which left
  // the dropdown and the mobile drawer entirely uncovered -- and that is
  // exactly where the known dark-mode bugs live, so they cannot be fixed
  // safely without these.
  for (const theme of THEMES) {
    scenarios.push({
      name: `nav-dropdown-desktop-${theme}`,
      path: '/index.html',
      theme,
      width: 1440,
      height: 900,
      fullPage: false,
      // Clipped to the nav strip. The hero photo below it has a sub-pixel
      // wobble between runs, and including it would drown out the thing this
      // scenario actually exists to protect.
      clip: { x: 0, y: 0, width: 1440, height: 240 },
      action: async (page) => {
        // Opened by CSS :hover on desktop, not by script.js. Hovering the
        // centre keeps the magnetic-cursor offset at zero, so it stays
        // deterministic.
        await page.locator('.nav-links .dropbtn').first().hover();
        await sleep(400);
      },
    });

    scenarios.push({
      name: `nav-drawer-mobile-${theme}`,
      path: '/index.html',
      theme,
      width: 375,
      height: 812,
      fullPage: false,
      action: (page) => openDrawer(page, false),
    });
  }

  // The drawer's own dropdown, which is a separate set of rules again.
  scenarios.push({
    name: 'nav-drawer-dropdown-mobile-dark',
    path: '/index.html',
    theme: 'dark',
    width: 375,
    height: 812,
    fullPage: false,
    action: (page) => openDrawer(page, true),
  });

  // The work modal is fixed-position, so it is captured at viewport size.
  for (const theme of THEMES) {
    scenarios.push({
      name: `work-modal-desktop-${theme}`,
      path: '/index.html',
      theme,
      width: 1440,
      height: 900,
      fullPage: false,
      action: async (page) => {
        const card = page.locator('.case-studies-section .project-card').first();
        await card.click({ position: { x: 20, y: 20 } });
        await page.waitForSelector('#work-modal.is-open', { timeout: 5000 });
        await sleep(600);
      },
    });
  }

  return filter ? scenarios.filter((s) => s.name.includes(filter)) : scenarios;
}
