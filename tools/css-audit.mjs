// Dev-only CSS audit. Reports which rules in each stylesheet can never apply.
//
//   node tools/css-audit.mjs            summary per file
//   node tools/css-audit.mjs --list     every unmatched selector
//   node tools/css-audit.mjs --file=styles.css   one stylesheet in detail
//
// Two kinds of finding, and the distinction matters a great deal:
//
//   UNMATCHED  the selector matches no element on any page, at any viewport.
//              Nothing the rule declares can ever apply, so deleting it is
//              safe no matter what it contains, what its specificity is, or
//              what state the element is in. This is a static fact about the
//              markup, not an observation of one rendered moment.
//
//   OVERRIDDEN is deliberately NOT reported here. Whether a declaration wins
//              depends on state (:hover, .open, .dark-theme) and on every
//              other sheet, so proving it by inspection is exactly the kind of
//              reasoning that keeps being wrong in this codebase. That is what
//              tests/computed.mjs is for: delete, then measure.
//
// State pseudo-classes are stripped before matching, so a rule for
// `.foo:hover` counts as matched whenever `.foo` exists -- the element is
// there and could be hovered. Only rules whose *base* element is absent are
// reported.

import { chromium } from 'playwright';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { startServer } from '../tests/serve.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT ?? 4175);
const LIST = process.argv.includes('--list');
const ONE_FILE = process.argv.find((a) => a.startsWith('--file='))?.slice(7);

const SHEETS = ['styles.css', 'responsive.css', 'polish.css', 'atelier.css', 'motion.css'];

// Every state the audit considers reachable. A selector is "matched" if it
// matches under any of these, so nothing is called dead merely because the
// drawer happened to be shut.
// Expressed as data rather than functions so it can be handed to the page
// without stringifying and re-evaluating code. Applied cumulatively: these
// combinations genuinely co-occur (dark mode with the drawer open) and each
// only ever adds classes, so applying them in sequence widens what can match
// and never narrows it.
const DOM_STATES = [
  { selector: 'body', add: ['dark-theme'] },
  // Classes JavaScript adds to existing elements. Without these, every reveal
  // and cursor rule looks dead: `.fx-in` is only present once motion.js has
  // scrolled an element into view, and a page sitting still has none at all.
  { selector: 'body *', add: ['fx-in'] },
  { selector: 'body', add: ['nav-away', 'page-loaded'] },
  { selector: 'html', add: ['lenis-smooth', 'fx-on', 'fx-pointer', 'fx-text', 'fx-view'] },
  // Mutually exclusive in reality; applied together because the audit only
  // needs to know the selector is reachable in some state.
  { selector: '.home-section', add: ['hero-css', 'hero-live', 'hero-playing'] },
  { selector: '#site-shell', add: ['is-revealing'] },
  { selector: '.work-book', add: ['is-spread'] },
  { selector: '.nav-links', add: ['open'] },
  { selector: '.drawer-overlay', add: ['visible'] },
  { selector: '.dropdown-content', add: ['show'] },
  { selector: '.hamburger', add: ['active'] },
  { selector: '#work-modal', add: ['is-open'] },
  { selector: 'body', add: ['work-modal-open'] },
  { selector: 'body', add: ['portfolio-locked'] },
  { selector: '#portfolio-lock', add: [], remove: ['hidden'] },
  { selector: '.project-card', add: ['is-flipped', 'active'] },
];

const PAGES = ['/index.html', '/my-story.html', '/404.html'];
const WIDTHS = [375, 800, 1440];

/** Collect the selectors that match at least one element on this page. */
async function matchedSelectors(page) {
  return page.evaluate(
    ({ states }) => {
      const matched = new Set();
      const all = new Set();

      /**
       * Reduce a selector to something `querySelector` can answer about the
       * markup as it stands.
       *
       * State pseudo-classes and pseudo-elements are removed rather than
       * treated as unmatchable: `.btn:hover` tells us nothing about whether
       * `.btn` exists, and it is the element's existence being audited.
       */
      const testable = (selector) =>
        selector
          .replace(
            /::?(before|after|first-line|first-letter|placeholder|selection|backdrop|marker|-webkit-[a-z-]+)/g,
            ''
          )
          // Longest names first. Alternation is ordered, so listing `focus`
          // before `focus-visible` would match the `focus` in `:focus-visible`
          // and leave `-visible` behind -- turning `.btn:focus-visible` into
          // the nonexistent `.btn-visible` and reporting a live rule as dead.
          .replace(
            /:(focus-visible|focus-within|placeholder-shown|user-invalid|indeterminate|read-only|autofill|disabled|required|optional|enabled|checked|visited|invalid|default|active|target|hover|focus|valid|link)\b/g,
            ''
          )
          .trim();

      const walk = (rules) => {
        for (const rule of rules) {
          // Nested rules (media, supports, layer) are recursed into; their
          // condition is ignored on purpose, because a viewport that does not
          // match right now may match in another pass.
          if (rule.cssRules && !rule.selectorText) {
            walk(rule.cssRules);
            continue;
          }
          if (!rule.selectorText) continue;

          for (const part of rule.selectorText.split(',')) {
            const selector = part.trim();
            if (!selector) continue;
            all.add(selector);

            const probe = testable(selector);
            // An empty probe means the selector was nothing but pseudo-state
            // (e.g. `:root:has(...)`); treat as matched, never as dead.
            if (!probe) {
              matched.add(selector);
              continue;
            }

            try {
              if (document.querySelector(probe)) matched.add(selector);
            } catch {
              // Unparseable once reduced -- assume matched rather than risk
              // reporting a live rule as dead.
              matched.add(selector);
            }
          }
        }
      };

      const sheetRules = () => {
        const out = [];
        for (const sheet of document.styleSheets) {
          try {
            out.push(...sheet.cssRules);
          } catch {
            // Cross-origin (the Google Fonts sheet); not ours to audit.
          }
        }
        return out;
      };

      // Once before any state is applied, then again after each one, so a rule
      // that only applies in a later state still counts as matched.
      walk(sheetRules());
      for (const state of states) {
        for (const el of document.querySelectorAll(state.selector)) {
          state.add?.forEach((c) => el.classList.add(c));
          state.remove?.forEach((c) => el.classList.remove(c));
        }
        walk(sheetRules());
      }

      const owner = {};
      for (const sheet of document.styleSheets) {
        const href = sheet.href ? sheet.href.split('/').pop().split('?')[0] : 'inline';
        const collect = (rules) => {
          for (const rule of rules) {
            if (rule.cssRules && !rule.selectorText) {
              collect(rule.cssRules);
              continue;
            }
            if (!rule.selectorText) continue;
            for (const part of rule.selectorText.split(',')) {
              const selector = part.trim();
              if (selector) (owner[href] ??= new Set()).add(selector);
            }
          }
        };
        try {
          collect([...sheet.cssRules]);
        } catch {}
      }

      return {
        matched: [...matched],
        all: [...all],
        owner: Object.fromEntries(Object.entries(owner).map(([k, v]) => [k, [...v]])),
      };
    },
    { states: DOM_STATES }
  );
}

/**
 * Every class and id name mentioned anywhere in the site's JavaScript.
 *
 * A selector matching nothing in a loaded page is not proof it is dead: the
 * scripts build elements at runtime that no static state can conjure up. The
 * lock screen's notification toast is created on submit, and the contact form
 * builds its own success and error messages -- all of which look dead and are
 * anything but.
 *
 * So a selector is only reported when the DOM does not have it *and* no script
 * so much as names any of its parts. Deliberately crude and over-inclusive: a
 * false "still in use" costs one rule left in place, while a false "dead"
 * silently breaks a feature that only appears after a user action.
 */
async function scriptedNames() {
  const names = new Set();
  const files = (await readdir(ROOT)).filter((f) => f.endsWith('.js'));

  for (const file of files) {
    const source = await readFile(join(ROOT, file), 'utf8');
    // Any identifier-ish run of characters; classes are referenced as bare
    // strings ('lock-notification--success'), in template literals, and inside
    // longer classList arguments.
    for (const match of source.matchAll(/[A-Za-z_][\w-]{2,}/g)) {
      names.add(match[0]);
    }
  }

  return names;
}

/** The class/id tokens a selector depends on. */
function selectorTokens(selector) {
  return [...selector.matchAll(/[.#]([A-Za-z_][\w-]*)/g)].map((m) => m[1]);
}

/**
 * Names to look for in the scripts on behalf of one token, including the
 * prefixes a class name could have been assembled from.
 *
 * Class names are not always written out in full. portfolio-lock.js builds its
 * toast with `lock-notification--${type}`, so searching for the literal
 * `lock-notification--success` finds nothing and the rule looks dead when it
 * is very much alive.
 *
 * Prefixes are cut at hyphen boundaries and kept only when they are long
 * enough to be distinctive -- eight characters and at least one hyphen. Without
 * that floor, `project-category` would reduce to `project`, which appears all
 * over the scripts, and every `project-*` rule would be presumed live.
 */
function tokenProbes(token) {
  const probes = [token];
  const parts = token.split('-');

  for (let i = parts.length - 1; i > 0; i -= 1) {
    const prefix = parts.slice(0, i).join('-');
    if (prefix.length >= 8 && prefix.includes('-')) probes.push(prefix);
  }

  return probes;
}

async function main() {
  const scripted = await scriptedNames();
  const server = await startServer(PORT);
  const browser = await chromium.launch();

  const matchedEverywhere = new Set();
  const selectorsBySheet = {};

  try {
    for (const path of PAGES) {
      for (const width of WIDTHS) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          deviceScaleFactor: 1,
        });
        const page = await context.newPage();
        await page.addInitScript(() => {
          try {
            sessionStorage.setItem('portfolio_unlocked', 'true');
          } catch {}
        });
        await page.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: 'load' });
        // Long enough for motion.js to inject the elements it adds; those are
        // part of the real DOM and several rules legitimately target them.
        await page.waitForTimeout(3000);

        const { matched, owner } = await matchedSelectors(page);
        matched.forEach((s) => matchedEverywhere.add(s));
        for (const [sheet, selectors] of Object.entries(owner)) {
          (selectorsBySheet[sheet] ??= new Set());
          selectors.forEach((s) => selectorsBySheet[sheet].add(s));
        }

        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log('');
  console.log('Selectors that match no element on any page, at any viewport, in any');
  console.log('simulated state, and whose classes no script mentions.');
  console.log('');

  let grandTotal = 0;
  let grandDead = 0;

  for (const sheet of SHEETS) {
    const selectors = [...(selectorsBySheet[sheet] ?? [])];
    if (!selectors.length) continue;

    const dead = selectors.filter(
      (s) =>
        !matchedEverywhere.has(s) &&
        !selectorTokens(s).some((token) => tokenProbes(token).some((p) => scripted.has(p)))
    );
    grandTotal += selectors.length;
    grandDead += dead.length;

    const source = await readFile(join(ROOT, sheet), 'utf8');
    const lines = source.split('\n').length;

    console.log(
      `${sheet.padEnd(16)} ${String(lines).padStart(5)} lines  ` +
        `${String(selectors.length).padStart(4)} selectors  ` +
        `${String(dead.length).padStart(4)} dead  ` +
        `(${((dead.length / selectors.length) * 100).toFixed(0)}%)`
    );

    if (LIST || ONE_FILE === sheet) {
      dead.sort().forEach((s) => console.log(`    ${s}`));
      console.log('');
    }
  }

  console.log('');
  console.log(
    `total ${grandDead} of ${grandTotal} selectors (${((grandDead / grandTotal) * 100).toFixed(0)}%) match nothing.`
  );
  console.log('');
  console.log('Note: a matched selector is NOT proof the rule has any effect --');
  console.log('it may still be overridden. Use `npm run computed` to prove that.');
}

await main();
