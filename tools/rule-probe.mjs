// Dev-only. Finds CSS rules that provably have no effect, one rule at a time.
//
//   node tools/rule-probe.mjs --sheet=base.css
//   node tools/rule-probe.mjs --sheet=base.css --match=dark-theme
//   node tools/rule-probe.mjs --sheet=base.css --json=prunable.json
//
// HOW IT WORKS
//
// For each rule: note the properties it declares, find the elements it targets,
// record those properties on them, then blank the rule through the CSSOM and
// read the same properties again. If nothing moved, the rule was contributing
// nothing and can go. The rule is restored either way, so one page load probes
// every rule in the sheet.
//
// Blanking a rule is exactly equivalent to deleting it -- the declarations stop
// applying while every other rule's specificity and order stay as they were.
//
// WHY NOT JUST DELETE AND RUN npm run computed
//
// That is the honest end-to-end check and it stays the final word. But it takes
// six minutes, so it can only answer "did this batch of changes break
// anything", not "which of these 35 rules is the problem". Bisecting a batch
// with it is hours. This answers per rule in milliseconds, and the batch it
// produces is then confirmed once with the real thing.
//
// The first attempt at pruning is what prompted this: 35 dark rules were deleted
// together on the strength of an earlier reading of the CSS, and the result was
// 4,000 changed properties per dark scenario. The cause was a single rule --
// `body.dark-theme { color: #f7fafd }` -- whose value every element that
// atelier.css does not explicitly recolour was inheriting. Reading the cascade
// by eye had not shown that, and it is precisely what this measures.
//
// WHAT COUNTS AS INERT
//
// A declaration can only affect the property it declares. So it is inert when,
// for every element it targets, the computed value of that property is
// unchanged with the rule blanked -- checked on the targeted elements and on
// their descendants, since inherited properties reach further down. If a
// declaration changes an element's own box, that shows up on the element
// itself, and knock-on effects on ancestors and siblings cannot happen without
// it.
//
// LIMITS, both important:
//
//  - State rules (:hover, :focus, :active) are reported as UNVERIFIABLE, never
//    as inert. Nothing here hovers anything, so their declarations are dormant
//    and would look inert whatever they contain.
//  - A rule is only inert in the states actually probed. That is why several
//    scenarios are used and a rule has to be inert in all of them.

import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startServer } from '../tests/serve.mjs';
import { preparePage, buildScenarios } from '../tests/harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PROBE_PORT ?? 4293);
const SHEET = process.argv.find((a) => a.startsWith('--sheet='))?.slice(8) ?? 'base.css';
const MATCH = process.argv.find((a) => a.startsWith('--match='))?.slice(8) ?? '';
const JSON_OUT = process.argv.find((a) => a.startsWith('--json='))?.slice(7);

/**
 * Which states to probe, taken from the shared scenario list so this cannot
 * disagree with the harnesses about what the page looks like.
 *
 * The interactive ones are not optional. A first run without them reported
 * every `.nav-links.open` and `#work-modal.is-open` rule as matching nothing --
 * true of a page sitting still, and badly wrong as a basis for deleting them.
 * Whether the drawer is open is the whole point of those rules.
 */
/**
 * Both themes for every interactive state, not just dark.
 *
 * Probing the drawer, lock screen and modal in dark only meant any rule a dark
 * rule happens to override was measured as inert while being the only thing
 * styling that element in light mode. That mistake pruned the light drawer's
 * position and its close button.
 */
const PROBE_STATES = [
  'index-desktop-light',
  'index-desktop-dark',
  'index-tablet-light',
  'index-mobile-light',
  'index-mobile-dark',
  'story-desktop-light',
  'story-desktop-dark',
  'story-mobile-light',
  'nav-dropdown-desktop-light',
  'nav-dropdown-desktop-dark',
  'nav-drawer-mobile-light',
  'nav-drawer-mobile-dark',
  'nav-drawer-dropdown-mobile-light',
  'nav-drawer-dropdown-mobile-dark',
  'work-modal-desktop-light',
  'work-modal-desktop-dark',
  'lock-mobile-light',
  'lock-desktop-dark',
];

/**
 * A width either side of every breakpoint the stylesheets declare.
 *
 * The three viewports the harness uses leave whole bands unvisited: base.css
 * has a 575/767/991/1199 ladder and atelier.css adds 800, so a rule inside
 * `(min-width: 992px) and (max-width: 1199px)` is dormant at both 375 and 1440
 * and would be measured inert at every probed width while being perfectly live
 * at 1024. Combined with the media gating below, this is what makes a verdict
 * on a rule inside a media query trustworthy.
 */
const SWEEP_WIDTHS = [575, 576, 767, 768, 800, 801, 991, 992, 1199, 1200];

const SCENARIOS = [
  ...buildScenarios().filter((s) => PROBE_STATES.includes(s.name)),
  ...SWEEP_WIDTHS.flatMap((width) =>
    ['light', 'dark'].map((theme) => ({
      name: `sweep-${width}-${theme}`,
      path: '/index.html',
      theme,
      width,
      height: 900,
    }))
  ),
];

const STATE_PSEUDO =
  /:(hover|focus|focus-visible|focus-within|active|visited|target|checked|placeholder-shown)\b/;

const TRANSITION_PROPS = [
  'transition-property',
  'transition-duration',
  'transition-timing-function',
  'transition-delay',
  'transition-behavior',
];

/**
 * The probe runs twice over every state, because transitions make a single pass
 * impossible to get right.
 *
 * Blanking a rule does not change the computed style straight away when the
 * property is transitioned -- it starts animating towards the new value, so an
 * immediate read returns the old one and the rule looks inert. That is exactly
 * what happened to `.theme-toggle-icon-wrapper { transform: translateX(0) }`:
 * the only rule providing that transform, reported inert in all 22 states,
 * because the toggle transitions `transform` and the read came back unchanged.
 *
 * So ordinary properties are measured with transitions suppressed, where a
 * blanked rule takes effect at once. But suppressing transitions rewrites every
 * `transition-*` to `none`, which hides changes to those properties -- and
 * dropping a rule that carries a transition is a real regression. Those are
 * measured in a second pass with transitions alive, which is sound because
 * `transition-*` properties are not themselves animated, so they do flip
 * immediately.
 *
 * The two passes cover disjoint sets of properties, so their verdicts merge
 * without any special handling: a rule is inert only if both passes say so.
 */
const PHASES = [
  { mode: 'static', freezeTransitions: true },
  { mode: 'transition', freezeTransitions: false },
];

async function probe(page, sheetName, match, mode, transitionProps) {
  return page.evaluate(
    ({ sheetName, match, statePseudoSource, mode, transitionProps }) => {
      const statePseudo = new RegExp(statePseudoSource);
      const results = [];

      const sheet = [...document.styleSheets].find((s) => s.href?.includes(sheetName));
      if (!sheet) return { error: `stylesheet ${sheetName} not found` };

      /** Flatten to style rules, remembering the media condition around each. */
      const flatten = (rules, condition = null) => {
        const out = [];
        for (const rule of rules) {
          if (rule.cssRules && !rule.selectorText) {
            out.push(...flatten(rule.cssRules, rule.conditionText ?? condition));
            continue;
          }
          if (rule.selectorText) out.push({ rule, condition });
        }
        return out;
      };

      const styleRules = flatten(sheet.cssRules);
      // Occurrence index per selector, so a repeated selector can still be
      // matched back to the right block in the source file.
      const seen = new Map();

      for (const { rule, condition } of styleRules) {
        const selector = rule.selectorText;
        const ordinal = seen.get(selector) ?? 0;
        seen.set(selector, ordinal + 1);

        if (match && !selector.includes(match)) continue;

        const declared = [...rule.style].filter(Boolean);
        // Each pass judges only the properties it can read honestly.
        const props =
          mode === 'transition'
            ? declared.filter((p) => transitionProps.includes(p))
            : declared.filter((p) => !transitionProps.includes(p));
        if (!props.length) continue;

        const record = {
          selector,
          ordinal,
          condition,
          props,
          verdict: 'inert',
          detail: null,
        };

        if (statePseudo.test(selector)) {
          record.verdict = 'unverifiable';
          record.detail = 'state rule; nothing here enters that state';
          results.push(record);
          continue;
        }

        // A rule inside a media query that does not currently apply is dormant,
        // so blanking it provably changes nothing -- and that says nothing at
        // all about whether it matters at a width where the query does apply.
        // Reported separately so the aggregation can refuse to call such a rule
        // inert until it has been seen while active.
        if (condition && !window.matchMedia(condition).matches) {
          record.verdict = 'inactive-media';
          record.detail = `@media ${condition} does not apply at this viewport`;
          results.push(record);
          continue;
        }

        // A selector list can mix pseudo-element and plain parts, so each part
        // is resolved separately into an element and the pseudo to read on it.
        //
        // querySelectorAll cannot match a pseudo-element, so passing
        // `.foo::before` straight to it returns nothing -- which first showed
        // up here as two decorative rules being declared dead while they were
        // painting on screen. The pseudo is stripped for matching and handed to
        // getComputedStyle instead.
        let targets;
        try {
          targets = [];
          for (const part of selector.split(',')) {
            const trimmed = part.trim();
            if (!trimmed) continue;

            const pseudoMatch = trimmed.match(/::(before|after|first-line|first-letter|marker)$/);
            const pseudo = pseudoMatch ? `::${pseudoMatch[1]}` : null;
            const base = pseudo ? trimmed.slice(0, -pseudo.length) : trimmed;

            for (const el of document.querySelectorAll(base)) {
              targets.push({ el, pseudo });
            }
          }
        } catch {
          record.verdict = 'unverifiable';
          record.detail = 'selector not queryable';
          results.push(record);
          continue;
        }

        if (!targets.length) {
          record.verdict = 'unmatched';
          record.detail = 'matches no element in this state';
          results.push(record);
          continue;
        }

        // The targets themselves, plus their descendants, because an inherited
        // property reaches further down than the elements the rule names. A
        // pseudo-element has no descendants to consider.
        const nodes = [];
        const seenNodes = new Set();
        for (const { el, pseudo } of targets) {
          if (pseudo) {
            nodes.push({ el, pseudo });
            continue;
          }
          if (!seenNodes.has(el)) {
            seenNodes.add(el);
            nodes.push({ el, pseudo: null });
          }
          for (const child of el.querySelectorAll('*')) {
            if (seenNodes.has(child)) continue;
            seenNodes.add(child);
            nodes.push({ el: child, pseudo: null });
          }
        }

        const snapshot = () =>
          nodes.map(({ el, pseudo }) => {
            const cs = getComputedStyle(el, pseudo);
            return props.map((p) => cs.getPropertyValue(p)).join('\u0001');
          });

        const before = snapshot();

        const original = rule.style.cssText;
        rule.style.cssText = '';
        // Force a synchronous style/layout pass before reading back.
        void document.documentElement.offsetHeight;
        const after = snapshot();

        for (let i = 0; i < before.length; i += 1) {
          if (before[i] !== after[i]) {
            const cs = props
              .map((p, j) => {
                const b = before[i].split('\u0001')[j];
                const a = after[i].split('\u0001')[j];
                return b === a ? null : `${p}: ${b} -> ${a}`;
              })
              .filter(Boolean);

            const { el, pseudo } = nodes[i];
            const desc =
              el.tagName.toLowerCase() +
              (el.id ? `#${el.id}` : '') +
              (el.classList.length ? `.${[...el.classList].slice(0, 2).join('.')}` : '') +
              (pseudo ?? '');

            record.verdict = 'live';
            record.detail = `${desc}  ${cs.join('; ')}`;
            break;
          }
        }

        // Always put the rule back: each rule is judged against the untouched
        // stylesheet.
        //
        // Leaving inert rules blanked, so that later rules were judged against
        // the page as it would end up, looked like the way to handle two rules
        // that cover for each other. It is not, because the verdicts are then
        // combined across states while the blanking only happens within one.
        // `.nav-links.open .drawer-close-btn-li` was judged inert with
        // `.drawer-close-btn-li { display: none }` blanked ahead of it, but
        // that rule is live with the drawer shut and survived the prune, so the
        // close button ended up hidden in the open drawer.
        //
        // Mutual redundancy is handled by validate() below, which tests the
        // whole set of deletions at once instead of reasoning about it.
        rule.style.cssText = original;
        void document.documentElement.offsetHeight;

        results.push(record);
      }

      return { results };
    },
    {
      sheetName,
      match,
      statePseudoSource: STATE_PSEUDO.source,
      mode,
      transitionProps,
    }
  );
}

/**
 * Properties compared across the whole document during validation.
 *
 * The per-rule probe only looks at what a rule declares, on the elements it
 * targets. Validation has no such focus -- it is checking a whole batch of
 * deletions -- so it watches a fixed set of properties everywhere instead.
 */
const SNAPSHOT_PROPS = [
  'display', 'visibility', 'opacity', 'position', 'z-index',
  'top', 'right', 'bottom', 'left',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-color', 'border-bottom-color', 'border-left-color', 'border-right-color',
  'border-top-style', 'border-bottom-style', 'border-radius',
  'color', 'background-color', 'background-image', 'background-size', 'background-position',
  'font-family', 'font-size', 'font-weight', 'font-style',
  'line-height', 'letter-spacing', 'text-align', 'text-transform', 'text-decoration-line',
  'box-shadow', 'text-shadow', 'transform', 'filter', 'backdrop-filter',
  'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'gap', 'order',
  'grid-template-columns', 'grid-template-rows',
  'overflow-x', 'overflow-y', 'white-space', 'cursor', 'pointer-events',
  'animation-name', 'animation-duration',
];

/**
 * Blank every rule in `deleteSet` at once and confirm nothing on the page
 * moves; where something does, put back the fewest rules that settle it.
 *
 * This is the check that actually matches what pruning does. A verdict on a
 * rule in isolation cannot see that two rules cover for each other -- base.css
 * hides `.drawer-close-btn-li` on desktop in two separate rules, so each is
 * inert on its own and removing both leaves the button visible. Blanking the
 * batch surfaces that immediately.
 *
 * Rules are reinstated from the end of the file backwards, because the last
 * rule of a redundant group is the one the cascade actually uses; that keeps
 * the survivor and drops the ones it was shadowing.
 */
async function validate(page, sheetName, deleteSet, mode, transitionProps, snapshotProps) {
  return page.evaluate(
    ({ sheetName, deleteSet, mode, transitionProps, snapshotProps }) => {
      const sheet = [...document.styleSheets].find((s) => s.href?.includes(sheetName));
      if (!sheet) return { error: `stylesheet ${sheetName} not found` };

      const flatten = (rules, condition = null) => {
        const out = [];
        for (const rule of rules) {
          if (rule.cssRules && !rule.selectorText) {
            out.push(...flatten(rule.cssRules, rule.conditionText ?? condition));
            continue;
          }
          if (rule.selectorText) out.push({ rule, condition });
        }
        return out;
      };

      const seen = new Map();
      const indexed = flatten(sheet.cssRules).map(({ rule, condition }) => {
        const selector = rule.selectorText;
        const ordinal = seen.get(selector) ?? 0;
        seen.set(selector, ordinal + 1);
        return { rule, condition, selector, ordinal };
      });

      const keyOf = (r) => `${r.condition ?? ''}||${r.selector}||${r.ordinal}`;
      const wanted = new Set(deleteSet);

      const targets = indexed.filter((r) => {
        if (!wanted.has(keyOf(r))) return false;
        // A dormant media query cannot be responsible for anything here.
        if (r.condition && !window.matchMedia(r.condition).matches) return false;
        const declared = [...r.rule.style].filter(Boolean);
        const relevant =
          mode === 'transition'
            ? declared.some((p) => transitionProps.includes(p))
            : declared.some((p) => !transitionProps.includes(p));
        return relevant;
      });

      if (!targets.length) return { needed: [], remaining: 0, blanked: 0 };

      const nodes = [document.documentElement, ...document.querySelectorAll('*')];
      const snapshot = () =>
        nodes.map((el) => {
          const cs = getComputedStyle(el);
          return snapshotProps.map((p) => cs.getPropertyValue(p)).join('\u0001');
        });

      const baseline = snapshot();
      const differences = (shot) => {
        let n = 0;
        for (let i = 0; i < baseline.length; i += 1) if (shot[i] !== baseline[i]) n += 1;
        return n;
      };

      const saved = targets.map((t) => t.rule.style.cssText);
      for (const t of targets) t.rule.style.cssText = '';
      void document.documentElement.offsetHeight;

      let outstanding = differences(snapshot());
      const needed = [];

      for (let i = targets.length - 1; i >= 0 && outstanding > 0; i -= 1) {
        targets[i].rule.style.cssText = saved[i];
        void document.documentElement.offsetHeight;
        const after = differences(snapshot());

        if (after < outstanding) {
          needed.push(keyOf(targets[i]));
          outstanding = after;
        } else {
          targets[i].rule.style.cssText = '';
        }
      }

      return { needed, remaining: outstanding, blanked: targets.length };
    },
    { sheetName, deleteSet, mode, transitionProps, snapshotProps }
  );
}

async function main() {
  const server = await startServer(PORT);
  const browser = await chromium.launch();
  const baseUrl = `http://127.0.0.1:${PORT}`;

  // Keyed by selector + ordinal + media condition. A rule must be inert in
  // every scenario to be reported as prunable.
  const combined = new Map();
  let all = [];

  try {
    for (const scenario of SCENARIOS) {
     for (const phase of PHASES) {
      const context = await browser.newContext({
        viewport: { width: scenario.width, height: scenario.height },
        deviceScaleFactor: 1,
        locale: 'en-US',
        timezoneId: 'UTC',
        colorScheme: scenario.colorScheme ?? 'light',
      });
      const page = await context.newPage();
      await preparePage(page, scenario, baseUrl, {
        freezeTransitions: phase.freezeTransitions,
      });

      const { results, error } = await probe(page, SHEET, MATCH, phase.mode, TRANSITION_PROPS);
      if (error) throw new Error(error);

      const label = `${scenario.name}/${phase.mode}`;

      for (const record of results) {
        const key = `${record.condition ?? ''}||${record.selector}||${record.ordinal}`;
        const existing = combined.get(key);

        if (!existing) {
          combined.set(key, {
            ...record,
            liveAnywhere: record.verdict === 'live',
            matchedAnywhere: record.verdict === 'inert' || record.verdict === 'live',
            unverifiable: record.verdict === 'unverifiable',
            everActive: record.verdict !== 'inactive-media',
            scenarios: { [label]: record.verdict },
          });
          continue;
        }

        existing.scenarios[label] = record.verdict;

        // Combined from what was observed rather than by ranking the verdicts.
        // Ranking them conflated two quite different findings, because the
        // light-theme states are probed first and every `body.dark-theme` rule
        // is legitimately unmatched there: a rule measured inert in dark mode
        // was being reported as matching nothing at all.
        if (record.verdict === 'live') {
          existing.liveAnywhere = true;
          existing.detail = record.detail;
        }
        if (record.verdict === 'inert' || record.verdict === 'live') {
          existing.matchedAnywhere = true;
        }
        if (record.verdict === 'unverifiable') existing.unverifiable = true;
        if (record.verdict !== 'inactive-media') existing.everActive = true;
      }

      await context.close();
      console.log(`  probed ${scenario.name} (${phase.mode})`);
     }
    }

    all = [...combined.values()];

    for (const r of all) {
      if (r.unverifiable) r.verdict = 'unverifiable';
      else if (r.liveAnywhere) r.verdict = 'live';
      else if (!r.everActive) {
        // Its media query never applied at any width probed, so it was never
        // given the chance to do anything. Not evidence of being dead.
        r.verdict = 'unverifiable';
        r.detail = 'media query never active in any probed state';
      } else if (r.matchedAnywhere) r.verdict = 'inert';
      else r.verdict = 'unmatched';
    }

    // Second sweep: check the deletions as one batch, not one at a time.
    const keyOf = (r) => `${r.condition ?? ''}||${r.selector}||${r.ordinal}`;
    const candidates = all.filter((r) => r.verdict === 'inert');
    const deleteSet = candidates.map(keyOf);
    const needed = new Set();

    console.log('');
    console.log(`Validating ${deleteSet.length} candidate deletions as a batch:`);

    for (const scenario of SCENARIOS) {
      for (const phase of PHASES) {
        const context = await browser.newContext({
          viewport: { width: scenario.width, height: scenario.height },
          deviceScaleFactor: 1,
          locale: 'en-US',
          timezoneId: 'UTC',
          colorScheme: scenario.colorScheme ?? 'light',
        });
        const page = await context.newPage();
        await preparePage(page, scenario, baseUrl, {
          freezeTransitions: phase.freezeTransitions,
        });

        const props = phase.mode === 'transition' ? TRANSITION_PROPS : SNAPSHOT_PROPS;
        const result = await validate(page, SHEET, deleteSet, phase.mode, TRANSITION_PROPS, props);
        if (result.error) throw new Error(result.error);

        for (const key of result.needed) needed.add(key);

        if (result.needed.length || result.remaining) {
          console.log(
            `  ${scenario.name} (${phase.mode}): reinstated ${result.needed.length}` +
              `${result.remaining ? `, ${result.remaining} element(s) still differ` : ''}`
          );
        }

        await context.close();
      }
    }

    for (const r of all) {
      if (needed.has(keyOf(r)) && r.verdict === 'inert') {
        r.verdict = 'live';
        r.detail = 'inert alone, but needed once the other deletions are applied';
      }
    }

    console.log(`  ${needed.size} rule(s) reinstated by validation`);
  } finally {
    await browser.close();
    server.close();
  }

  const byVerdict = (v) => all.filter((r) => r.verdict === v);

  const prunable = [...byVerdict('inert'), ...byVerdict('unmatched')];

  console.log('');
  console.log(`${SHEET}${MATCH ? ` (selectors containing "${MATCH}")` : ''}`);
  console.log(`  ${all.length} rules probed`);
  console.log(`  ${byVerdict('live').length} live`);
  console.log(`  ${byVerdict('unverifiable').length} unverifiable (state rules)`);
  console.log(`  ${byVerdict('unmatched').length} match nothing`);
  console.log(`  ${byVerdict('inert').length} inert -- every declaration overridden`);
  console.log('');

  console.log('PRUNABLE:');
  for (const r of prunable) {
    console.log(`  ${r.condition ? `@media ${r.condition} ` : ''}${r.selector}`);
    console.log(`      ${r.verdict}; declares ${r.props.join(', ')}`);
  }

  console.log('');
  console.log('LIVE (kept):');
  for (const r of byVerdict('live')) {
    console.log(`  ${r.condition ? `@media ${r.condition} ` : ''}${r.selector}`);
    console.log(`      ${r.detail}`);
  }

  if (JSON_OUT) {
    await writeFile(
      JSON_OUT,
      JSON.stringify({ sheet: SHEET, match: MATCH, rules: all }, null, 2),
      'utf8'
    );
    console.log('');
    console.log(`Wrote ${JSON_OUT}`);
  }
}

await main();
