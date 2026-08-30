// Visual regression harness for the CSS refactor.
//
// This is a DEV-ONLY tool. The site itself has no build step and does not
// depend on anything in this directory.
//
//   npm run baseline      capture/refresh tests/baseline/
//   npm run test:visual   compare the current site against the baselines
//
// Why this exists: the stylesheet layer is being collapsed from five files to
// three. Because later files deliberately override earlier ones, static
// reasoning cannot prove a change is visually neutral. These screenshots are
// the regression oracle for every CSS phase.

import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const TESTS_DIR = fileURLToPath(new URL('.', import.meta.url));
const BASELINE_DIR = join(TESTS_DIR, 'baseline');
const CURRENT_DIR = join(TESTS_DIR, 'current');
const DIFF_DIR = join(TESTS_DIR, 'diff');

const PORT = Number(process.env.PORT ?? 4173);
const UPDATE = process.argv.includes('--update');
const FILTER = process.argv.find((a) => a.startsWith('--filter='))?.slice(9);

// A change is only reported when it exceeds this share of the image. Small but
// non-zero, to absorb font rasterisation jitter without hiding real shifts.
const FAIL_RATIO = 0.002;

const VIEWPORTS = [
  { label: 'mobile', width: 375, height: 812 },
  { label: 'tablet', width: 800, height: 1024 },
  { label: 'desktop', width: 1440, height: 900 },
];

const PAGES = [
  { label: 'index', path: '/index.html' },
  { label: 'story', path: '/my-story.html' },
];

const THEMES = ['light', 'dark'];

/**
 * Elements that legitimately differ between two identical runs and would
 * otherwise produce permanent false positives.
 *
 * - .home-rotate      cycles through words forever; whichever word is showing
 *                     at capture time is arbitrary.
 * - .scroll-progress  injected by motion.js and driven by scroll offset.
 * - .lock-notification transient toast on a timer.
 */
const VOLATILE = ['.home-rotate', '.scroll-progress', '.lock-notification'];

/**
 * Freeze CSS-driven motion. This handles @keyframes and transitions only --
 * GSAP writes inline styles from JavaScript every frame and is completely
 * unaffected by it, which is what `freezeMotion` below is for.
 *
 * Note this deliberately does NOT use prefers-reduced-motion. All five
 * stylesheets restyle the page under that media query, so emulating it would
 * capture a different design than real visitors see.
 */
const FREEZE_CSS = `
  *, *::before, *::after {
    /* Pausing alone is not enough: it freezes each animation at whatever
       arbitrary phase it happened to reach, which drifts by fractions of a
       pixel between runs. Seeking to a fixed, far-future time first makes the
       frozen frame identical every time -- finite animations land on their end
       state, and looping ones land on a phase determined purely by this
       constant. */
    animation-delay: -10000s !important;
    animation-play-state: paused !important;
    transition: none !important;
    caret-color: transparent !important;
  }
  html { scroll-behavior: auto !important; }
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Drive every ScrollTrigger reveal to its final state.
 *
 * The reveals are one-way (opacity 0 -> 1, once: true), so stepping down the
 * full height and back up leaves the whole document revealed. Lenis smooth
 * scroll is bypassed by writing scrollTop directly rather than dispatching
 * wheel events.
 */
async function revealEverything(page) {
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
async function awaitImages(page) {
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
async function freezeMotion(page) {
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
async function settleAtTop(page) {
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

async function preparePage(page, scenario) {
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

  await page.goto(`http://127.0.0.1:${PORT}${scenario.path}`, { waitUntil: 'load' });
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
  await page.addStyleTag({ content: FREEZE_CSS });

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

  if (scenario.action) await scenario.action(page);
  await sleep(250);
}

function buildScenarios() {
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

  return FILTER ? scenarios.filter((s) => s.name.includes(FILTER)) : scenarios;
}

function compare(baselineBuf, currentBuf) {
  const a = PNG.sync.read(baselineBuf);
  const b = PNG.sync.read(currentBuf);

  if (a.width !== b.width || a.height !== b.height) {
    return {
      ok: false,
      reason: `size changed: ${a.width}x${a.height} -> ${b.width}x${b.height}`,
    };
  }

  const diff = new PNG({ width: a.width, height: a.height });
  const changed = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold: 0.15,
    includeAA: true,
  });

  const ratio = changed / (a.width * a.height);
  return {
    ok: ratio <= FAIL_RATIO,
    ratio,
    changed,
    reason: `${changed} px changed (${(ratio * 100).toFixed(3)}%)`,
    diff: ratio <= FAIL_RATIO ? null : PNG.sync.write(diff),
  };
}

async function main() {
  const scenarios = buildScenarios();
  if (!scenarios.length) {
    console.error('No scenarios matched the filter.');
    process.exit(1);
  }

  await mkdir(BASELINE_DIR, { recursive: true });

  if (!UPDATE) {
    const existing = existsSync(BASELINE_DIR) ? await readdir(BASELINE_DIR) : [];
    if (!existing.some((f) => f.endsWith('.png'))) {
      console.error('No baselines found. Run `npm run baseline` first.');
      process.exit(1);
    }
    await rm(CURRENT_DIR, { recursive: true, force: true });
    await rm(DIFF_DIR, { recursive: true, force: true });
    await mkdir(CURRENT_DIR, { recursive: true });
    await mkdir(DIFF_DIR, { recursive: true });
  }

  const server = await startServer(PORT);
  const browser = await chromium.launch();

  const failures = [];
  let captured = 0;

  /** One screenshot in a throwaway browser context. */
  async function capture(scenario) {
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      deviceScaleFactor: 1,
      // Pinned so date/locale rendering cannot drift between runs.
      locale: 'en-US',
      timezoneId: 'UTC',
      colorScheme: scenario.colorScheme ?? 'light',
    });
    try {
      const page = await context.newPage();
      await preparePage(page, scenario);
      return await page.screenshot({ fullPage: scenario.fullPage });
    } finally {
      await context.close();
    }
  }

  try {
    for (const scenario of scenarios) {
      const baselinePath = join(BASELINE_DIR, `${scenario.name}.png`);

      try {
        if (UPDATE) {
          await writeFile(baselinePath, await capture(scenario));
          captured += 1;
          console.log(`  captured  ${scenario.name}`);
          continue;
        }

        if (!existsSync(baselinePath)) {
          failures.push(`${scenario.name}: no baseline (run npm run baseline)`);
          console.log(`  MISSING   ${scenario.name}`);
          continue;
        }

        const baseline = await readFile(baselinePath);
        let shot = await capture(scenario);
        let result = compare(baseline, shot);

        // A real regression reproduces; residual rendering jitter usually does
        // not. Confirming before failing keeps the threshold tight enough to
        // catch small genuine changes without crying wolf.
        if (!result.ok) {
          const retryShot = await capture(scenario);
          const retryResult = compare(baseline, retryShot);

          if (retryResult.ok) {
            console.log(`  ok        ${scenario.name}  (flaked once, passed on retry)`);
            await writeFile(join(CURRENT_DIR, `${scenario.name}.png`), retryShot);
            continue;
          }

          shot = retryShot;
          result = retryResult;
        }

        await writeFile(join(CURRENT_DIR, `${scenario.name}.png`), shot);

        if (result.ok) {
          console.log(`  ok        ${scenario.name}`);
        } else {
          if (result.diff) {
            await writeFile(join(DIFF_DIR, `${scenario.name}.png`), result.diff);
          }
          failures.push(`${scenario.name}: ${result.reason}`);
          console.log(`  CHANGED   ${scenario.name}  ${result.reason}`);
        }
      } catch (err) {
        failures.push(`${scenario.name}: threw ${err.message}`);
        console.log(`  ERROR     ${scenario.name}  ${err.message}`);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log('');
  if (UPDATE) {
    console.log(`Captured ${captured} baseline(s) into tests/baseline/.`);
    console.log('Review them, then commit. They are the reference for every CSS phase.');
    return;
  }

  if (failures.length) {
    console.log(`${failures.length} of ${scenarios.length} scenario(s) changed:\n`);
    failures.forEach((f) => console.log(`  - ${f}`));
    console.log('\nSide-by-side images: tests/baseline/, tests/current/, tests/diff/');
    console.log('If a change is intended, re-run `npm run baseline` to accept it.');
    process.exit(1);
  }

  console.log(`All ${scenarios.length} scenario(s) match the baselines.`);
}

await main();
