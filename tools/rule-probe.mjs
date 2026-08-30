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
const PROBE_STATES = [
  'index-desktop-light',
  'index-desktop-dark',
  'index-mobile-light',
  'index-mobile-dark',
  'story-desktop-dark',
  'story-mobile-light',
  'nav-dropdown-desktop-dark',
  'nav-drawer-mobile-dark',
  'nav-drawer-dropdown-mobile-dark',
  'work-modal-desktop-dark',
  'lock-desktop-dark',
];

const SCENARIOS = buildScenarios().filter((s) => PROBE_STATES.includes(s.name));

const STATE_PSEUDO =
  /:(hover|focus|focus-visible|focus-within|active|visited|target|checked|placeholder-shown)\b/;

async function probe(page, sheetName, match) {
  return page.evaluate(
    ({ sheetName, match, statePseudoSource }) => {
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

        const props = [...rule.style].filter(Boolean);
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
        rule.style.cssText = original;
        void document.documentElement.offsetHeight;

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

        results.push(record);
      }

      return { results };
    },
    { sheetName, match, statePseudoSource: STATE_PSEUDO.source }
  );
}

async function main() {
  const server = await startServer(PORT);
  const browser = await chromium.launch();
  const baseUrl = `http://127.0.0.1:${PORT}`;

  // Keyed by selector + ordinal + media condition. A rule must be inert in
  // every scenario to be reported as prunable.
  const combined = new Map();

  try {
    for (const scenario of SCENARIOS) {
      const context = await browser.newContext({
        viewport: { width: scenario.width, height: scenario.height },
        deviceScaleFactor: 1,
        locale: 'en-US',
        timezoneId: 'UTC',
        colorScheme: scenario.colorScheme ?? 'light',
      });
      const page = await context.newPage();
      await preparePage(page, scenario, baseUrl);

      const { results, error } = await probe(page, SHEET, MATCH);
      if (error) throw new Error(error);

      for (const record of results) {
        const key = `${record.condition ?? ''}||${record.selector}||${record.ordinal}`;
        const existing = combined.get(key);

        if (!existing) {
          combined.set(key, {
            ...record,
            liveAnywhere: record.verdict === 'live',
            matchedAnywhere: record.verdict === 'inert' || record.verdict === 'live',
            unverifiable: record.verdict === 'unverifiable',
            scenarios: { [scenario.name]: record.verdict },
          });
          continue;
        }

        existing.scenarios[scenario.name] = record.verdict;

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
      }

      await context.close();
      console.log(`  probed ${scenario.name}`);
    }
  } finally {
    await browser.close();
    server.close();
  }

  const all = [...combined.values()];

  for (const r of all) {
    if (r.unverifiable) r.verdict = 'unverifiable';
    else if (r.liveAnywhere) r.verdict = 'live';
    else if (r.matchedAnywhere) r.verdict = 'inert';
    else r.verdict = 'unmatched';
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
