// Computed-style regression harness for the CSS refactor.
//
// This is a DEV-ONLY tool. The site itself has no build step and does not
// depend on anything in this directory.
//
//   npm run computed:save   record tests/computed/ from the current CSS
//   npm run computed        compare the current CSS against that recording
//
// WHY THIS EXISTS, given there is already a screenshot harness:
//
// Phase 3 deletes CSS. Screenshots are a good oracle for "does the page still
// look right", but a poor one for proving a deletion changed nothing, for three
// reasons:
//
//  1. Sensitivity. The pass threshold is a proportion of the image, so on a
//     ~14000px-tall full-page capture a real change to a small element can sit
//     under it. That limitation is documented in the README; this harness is
//     the answer to it.
//  2. Blind spots. A screenshot only sees what is painted. It cannot see a
//     rule that sets `cursor`, `pointer-events`, `overflow` or a `transition`,
//     nor anything on an element currently scrolled out of a clipped capture,
//     nor a colour on an element that something else happens to cover.
//  3. Diagnosis. A pixel diff says "these 4000 pixels moved". This says
//     "`.project-card` line-height went from 1.6 to normal", which is the
//     difference between an afternoon of bisecting and a one-line fix.
//
// So the two are complementary and both are worth running: this one proves a
// deletion was inert, and the screenshots stay the judge of whether an
// intentional change actually looks correct.
//
// The comparison is exact -- no thresholds. Every property below is a resolved
// computed value, so an untouched element returns a byte-identical string on
// every run. The sub-pixel wobble that forces a tolerance on the screenshots
// comes from rasterisation, which happens after computed styles are resolved,
// and so cannot reach these numbers. The one genuine exception is geometry that
// depends on the frozen animation phase, handled by NOISY_PROPS below.

import { chromium } from 'playwright';
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { startServer } from './serve.mjs';
import { buildScenarios, preparePage } from './harness.mjs';

const TESTS_DIR = fileURLToPath(new URL('.', import.meta.url));
const SNAPSHOT_DIR = join(TESTS_DIR, 'computed');

// Deliberately not the screenshot harness's port, so both can run at once.
const PORT = Number(process.env.PORT ?? 4174);
const SAVE = process.argv.includes('--save');
const FILTER = process.argv.find((a) => a.startsWith('--filter='))?.slice(9);
// Diffs are capped so a change that shifts the whole page does not print
// thousands of lines; the count is always reported in full.
const MAX_REPORTED = Number(process.argv.find((a) => a.startsWith('--max='))?.slice(6) ?? 40);

/**
 * The properties read on every element.
 *
 * Not the full ~340-property computed style: most of those are shorthands,
 * always-default, or restatements of each other, and including them would
 * quadruple the snapshot for no extra signal. This list is everything a
 * stylesheet in this project actually sets, plus the geometry those
 * declarations resolve into.
 *
 * Longhands are used throughout (border-top-color, not border) because
 * shorthand serialisation is inconsistent between values and can report a
 * change where none exists.
 */
const PROPS = [
  // Box and layout.
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'max-width',
  'max-height',
  'min-width',
  'min-height',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'box-sizing',
  'overflow-x',
  'overflow-y',
  'z-index',
  'float',
  'clear',
  'visibility',
  'opacity',
  'pointer-events',
  'cursor',
  'aspect-ratio',
  'object-fit',
  'object-position',
  'vertical-align',
  'inset-block-start',

  // Flex and grid.
  'flex-direction',
  'flex-wrap',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'justify-content',
  'align-items',
  'align-content',
  'align-self',
  'order',
  'row-gap',
  'column-gap',
  'grid-template-columns',
  'grid-template-rows',
  'grid-template-areas',
  'grid-auto-flow',
  'grid-column-start',
  'grid-column-end',
  'grid-row-start',
  'grid-row-end',
  'place-items',

  // Typography.
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-variant-numeric',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-align',
  'text-transform',
  'text-decoration-line',
  'text-decoration-color',
  'text-decoration-thickness',
  'text-underline-offset',
  'text-indent',
  'text-shadow',
  'white-space',
  'word-break',
  'overflow-wrap',
  'text-overflow',
  'writing-mode',
  'color',
  // Gradient-clipped headings depend on this; it is not implied by `color`.
  '-webkit-text-fill-color',
  '-webkit-text-stroke-color',
  '-webkit-text-stroke-width',
  '-webkit-line-clamp',

  // Paint.
  'background-color',
  'background-image',
  'background-size',
  'background-position',
  'background-repeat',
  'background-clip',
  'background-origin',
  'background-attachment',
  'background-blend-mode',
  'mix-blend-mode',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-style',
  'border-right-style',
  'border-bottom-style',
  'border-left-style',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'box-shadow',
  'outline-width',
  'outline-style',
  'outline-color',
  'outline-offset',
  'filter',
  'backdrop-filter',
  'clip-path',
  'mask-image',

  // Motion. `transition-*` is readable here because this harness does not
  // inject `transition: none` (see freezeCss in harness.mjs).
  'transform',
  'transform-origin',
  'transform-style',
  'perspective',
  'rotate',
  'scale',
  'translate',
  'animation-name',
  'animation-duration',
  'animation-iteration-count',
  'animation-fill-mode',
  'transition-property',
  'transition-duration',
  'transition-timing-function',
  'transition-delay',
  'will-change',
  'backface-visibility',
];

/** A smaller list for ::before / ::after, which are decorative here. */
const PSEUDO_PROPS = [
  'content',
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'margin-top',
  'margin-left',
  'padding-top',
  'padding-left',
  'opacity',
  'visibility',
  'transform',
  'transform-origin',
  'color',
  'font-size',
  'font-weight',
  'font-family',
  'line-height',
  'letter-spacing',
  'text-transform',
  'background-color',
  'background-image',
  'background-size',
  'background-position',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-color',
  'border-bottom-color',
  'border-top-left-radius',
  'border-bottom-right-radius',
  'box-shadow',
  'filter',
  'z-index',
  'animation-name',
];

/**
 * Geometry that is allowed to differ, and only where JavaScript owns it.
 *
 * Some elements are left mid-tween by design (see `freezeMotion`: scrub tweens
 * are a pure function of scrollTop and are deliberately not forced), and GSAP
 * resolves those to a matrix whose decimals move between runs. That is the same
 * wobble the screenshot harness tolerates with a threshold.
 *
 * Rather than apply a fuzzy comparison everywhere, these properties are dropped
 * on the affected elements only, so everything else stays exactly compared.
 * Which elements those are is decided in the browser by asking whether the
 * property is set as an inline style: GSAP animates by writing inline styles,
 * and an inline style beats every stylesheet, so a property in that state
 * cannot be affected by the CSS being refactored -- there is nothing for this
 * harness to protect. Detecting it that way rather than from a hand-written
 * selector list means it keeps working as the animations change.
 *
 * NOISY_SELECTORS covers the hero cluster, whose sub-pixel geometry wobbles
 * through layout rather than through an inline style of its own.
 *
 * These elements are still fully checked for colour, typography, borders,
 * shadows and everything else; only their geometry is exempt.
 */
const GEOMETRY_PROPS = ['transform', 'width', 'height', 'top', 'left', 'right', 'bottom'];

/**
 * Properties exempted when, and only when, JavaScript is holding them inline.
 *
 * `filter` is here on top of the geometry because the reveal tweens animate a
 * blur, and GSAP ends up in one of two equivalent resting states depending on
 * whether it cleared the inline style: `filter: blur(0px)` or `filter: none`.
 * Those render identically but do not compare equal as strings.
 */
const JS_OWNED_PROPS = [...GEOMETRY_PROPS, 'filter'];

const NOISY_SELECTORS = [
  '.home-photo',
  '.home-photo-stage',
  '.home-photo-wrap',
  '.home-rotate',
  '.scroll-progress',
  '.magnetic-cursor',
  '.cursor-dot',
];

/**
 * Classes that appear and disappear on their own, independently of any CSS
 * change, and so are stripped before anything is compared.
 *
 * `lenis-scrolling` is present only while a smooth scroll is in flight, so it
 * can land either way depending on exactly when the capture happens.
 *
 * Scroll-driven classes such as `nav-away` are deliberately NOT listed here.
 * They do affect styling, so hiding one would turn a real regression into a
 * silent pass; if one ever starts flapping the right fix is to pin it in
 * `settleAtTop`, not to stop looking at it.
 */
const VOLATILE_CLASSES = ['lenis-scrolling', 'lenis-stopped'];

async function capture(page, scenario, baseUrl) {
  await preparePage(page, scenario, baseUrl, { freezeTransitions: false });

  return page.evaluate(
    ({ props, pseudoProps, geometryProps, jsOwnedProps, noisySelectors, volatileClasses }) => {
      /**
       * A path that identifies the same element across two runs.
       *
       * Child indices rather than a CSS selector: several elements are injected
       * by motion.js with no id or class, and nth-child selectors would need
       * escaping and re-parsing. `desc` carries the readable identity, and
       * comparing it on both sides is what detects the DOM itself changing.
       */
      const pathOf = (el) => {
        const parts = [];
        let node = el;
        while (node && node !== document.body && node.parentElement) {
          parts.push([...node.parentElement.children].indexOf(node));
          node = node.parentElement;
        }
        return parts.reverse().join('>');
      };

      /**
       * Class list, sorted and with the self-toggling ones removed.
       *
       * Sorted because `classList` preserves insertion order, so a class that
       * JavaScript adds and removes leaves the remaining classes in a
       * different order on the next run -- which is not a change to anything.
       */
      const classesOf = (el) =>
        [...el.classList].filter((c) => !volatileClasses.includes(c)).sort();

      const descOf = (el) => {
        const id = el.id ? `#${el.id}` : '';
        const classes = classesOf(el);
        const cls = classes.length ? `.${classes.slice(0, 3).join('.')}` : '';
        return `${el.tagName.toLowerCase()}${id}${cls}`;
      };

      /**
       * Which properties to leave unread on this element. See NOISY_PROPS.
       */
      const skipFor = (el) => {
        const inHeroCluster = noisySelectors.some((sel) => el.closest(sel));
        if (inHeroCluster) return geometryProps;

        // Anything JavaScript is driving via an inline style. CSS cannot reach
        // it, so it is out of scope for a CSS refactor either way.
        const inline = jsOwnedProps.filter((prop) => el.style.getPropertyValue(prop) !== '');
        return inline.length ? inline : null;
      };

      const read = (el, pseudo, list, skip) => {
        const cs = getComputedStyle(el, pseudo);
        const out = {};
        for (const prop of list) {
          if (skip && skip.includes(prop)) continue;
          out[prop] = cs.getPropertyValue(prop);
        }
        return out;
      };

      const elements = [];
      // Every element in the body, in document order. <head> has no styles
      // worth reading, and <html>/<body> are added explicitly below.
      for (const el of document.querySelectorAll('body, body *')) {
        // Injected purely by the harness; not part of the page.
        if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT') continue;

        const skip = skipFor(el);
        const entry = {
          path: pathOf(el),
          desc: descOf(el),
          style: read(el, null, props, skip),
        };

        for (const pseudo of ['::before', '::after']) {
          const cs = getComputedStyle(el, pseudo);
          // `content: none` means no box is generated, so nothing else about
          // it can matter. Recording those would roughly triple the snapshot
          // with entries that can never differ meaningfully.
          if (cs.getPropertyValue('content') === 'none') continue;
          entry[pseudo] = read(el, pseudo, pseudoProps, skip);
        }

        elements.push(entry);
      }

      const doc = document.documentElement;
      return {
        meta: {
          // A horizontal scrollbar on a page that should not have one is a real
          // bug (see the drawer overflow in the README's known-bugs list), and
          // it is invisible to a full-page screenshot.
          docScrollWidth: doc.scrollWidth,
          docClientWidth: doc.clientWidth,
          docScrollHeight: doc.scrollHeight,
          bodyScrollWidth: document.body.scrollWidth,
          elementCount: elements.length,
          htmlClass: classesOf(doc).join(' '),
          bodyClass: classesOf(document.body).join(' '),
          // The palette itself, resolved. If a token stops resolving, every
          // consumer changes at once -- this pins the cause to one line.
          tokens: Object.fromEntries(
            [
              '--paper',
              '--ink',
              '--muted',
              '--line',
              '--accent',
              '--spin',
              '--card',
              '--shadow',
              '--sans',
              '--serif',
            ].map((t) => [t, getComputedStyle(doc).getPropertyValue(t).trim()])
          ),
        },
        elements,
      };
    },
    {
      props: PROPS,
      pseudoProps: PSEUDO_PROPS,
      geometryProps: GEOMETRY_PROPS,
      jsOwnedProps: JS_OWNED_PROPS,
      noisySelectors: NOISY_SELECTORS,
      volatileClasses: VOLATILE_CLASSES,
    }
  );
}

/** Compare two snapshots of the same scenario. */
function diff(before, after) {
  const changes = [];

  for (const [key, value] of Object.entries(before.meta)) {
    if (key === 'tokens') {
      for (const [token, oldValue] of Object.entries(value)) {
        const newValue = after.meta.tokens[token];
        if (oldValue !== newValue) {
          changes.push(`token ${token}: ${oldValue || '(unset)'} -> ${newValue || '(unset)'}`);
        }
      }
      continue;
    }
    if (value !== after.meta[key]) {
      changes.push(`meta ${key}: ${value} -> ${after.meta[key]}`);
    }
  }

  // A different element count means the DOM changed, not just its styling.
  // Comparing styles position-by-position past that point would report every
  // subsequent element as changed, so it is reported on its own terms.
  if (before.elements.length !== after.elements.length) {
    changes.push(
      `DOM changed: ${before.elements.length} elements -> ${after.elements.length}. ` +
        `Style comparison skipped -- resolve the structural change first.`
    );
    return changes;
  }

  for (let i = 0; i < before.elements.length; i += 1) {
    const a = before.elements[i];
    const b = after.elements[i];

    if (a.path !== b.path || a.desc !== b.desc) {
      changes.push(`DOM changed at index ${i}: ${a.desc} (${a.path}) -> ${b.desc} (${b.path})`);
      return changes;
    }

    for (const layer of ['style', '::before', '::after']) {
      const oldStyle = a[layer];
      const newStyle = b[layer];

      if (!oldStyle && !newStyle) continue;
      if (!oldStyle || !newStyle) {
        changes.push(`${a.desc}  ${layer}: ${oldStyle ? 'removed' : 'added'}`);
        continue;
      }

      for (const [prop, oldValue] of Object.entries(oldStyle)) {
        const newValue = newStyle[prop];

        // One side omitted the property, which only happens for NOISY_PROPS:
        // JavaScript had taken the property over on that run but not the other.
        // The decision is per-run by nature, so it has to be tolerated on
        // either side -- otherwise the exemption itself reports as a change.
        // Restricted to the exemptable properties so a genuinely missing
        // property elsewhere still surfaces rather than being swallowed.
        if ((oldValue === undefined || newValue === undefined) && JS_OWNED_PROPS.includes(prop)) {
          continue;
        }

        if (oldValue !== newValue) {
          const where = layer === 'style' ? '' : layer;
          changes.push(`${a.desc}${where}  ${prop}: ${oldValue} -> ${newValue}`);
        }
      }
    }
  }

  return changes;
}

const snapshotPath = (name) => join(SNAPSHOT_DIR, `${name}.json.gz`);
const writeSnapshot = (name, data) =>
  writeFile(snapshotPath(name), gzipSync(Buffer.from(JSON.stringify(data))));
const readSnapshot = async (name) => JSON.parse(gunzipSync(await readFile(snapshotPath(name))));

async function main() {
  const scenarios = buildScenarios(FILTER);
  if (!scenarios.length) {
    console.error('No scenarios matched the filter.');
    process.exit(1);
  }

  if (SAVE) {
    await rm(SNAPSHOT_DIR, { recursive: true, force: true });
  } else {
    const existing = existsSync(SNAPSHOT_DIR) ? await readdir(SNAPSHOT_DIR) : [];
    if (!existing.some((f) => f.endsWith('.json.gz'))) {
      console.error('No snapshots found. Run `npm run computed:save` first.');
      process.exit(1);
    }
  }
  await mkdir(SNAPSHOT_DIR, { recursive: true });

  const server = await startServer(PORT);
  const browser = await chromium.launch();
  const baseUrl = `http://127.0.0.1:${PORT}`;

  const failures = [];
  let totalChanges = 0;

  try {
    for (const scenario of scenarios) {
      const context = await browser.newContext({
        viewport: { width: scenario.width, height: scenario.height },
        deviceScaleFactor: 1,
        locale: 'en-US',
        timezoneId: 'UTC',
        colorScheme: scenario.colorScheme ?? 'light',
      });

      try {
        const page = await context.newPage();
        const snapshot = await capture(page, scenario, baseUrl);

        if (SAVE) {
          await writeSnapshot(scenario.name, snapshot);
          console.log(
            `  saved     ${scenario.name.padEnd(30)} ${snapshot.elements.length} elements`
          );
          continue;
        }

        if (!existsSync(snapshotPath(scenario.name))) {
          failures.push(`${scenario.name}: no snapshot (run npm run computed:save)`);
          console.log(`  MISSING   ${scenario.name}`);
          continue;
        }

        const changes = diff(await readSnapshot(scenario.name), snapshot);

        if (!changes.length) {
          console.log(`  ok        ${scenario.name}`);
        } else {
          totalChanges += changes.length;
          failures.push(`${scenario.name}: ${changes.length} change(s)`);
          console.log(`  CHANGED   ${scenario.name}  ${changes.length} change(s)`);
          changes.slice(0, MAX_REPORTED).forEach((c) => console.log(`              ${c}`));
          if (changes.length > MAX_REPORTED) {
            console.log(`              ... ${changes.length - MAX_REPORTED} more`);
          }
        }
      } catch (err) {
        failures.push(`${scenario.name}: threw ${err.message}`);
        console.log(`  ERROR     ${scenario.name}  ${err.message}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log('');
  if (SAVE) {
    console.log(`Saved ${scenarios.length} snapshot(s) into tests/computed/.`);
    console.log('These are a working reference for the current edit, not a committed');
    console.log('artefact -- re-save them whenever an intentional change is accepted.');
    return;
  }

  if (failures.length) {
    console.log(`${failures.length} of ${scenarios.length} scenario(s) changed, ${totalChanges} property change(s) total:\n`);
    failures.forEach((f) => console.log(`  - ${f}`));
    console.log('\nIf every change above is intended, re-run `npm run computed:save`.');
    process.exit(1);
  }

  console.log(`All ${scenarios.length} scenario(s) computed-style identical.`);
}

await main();
