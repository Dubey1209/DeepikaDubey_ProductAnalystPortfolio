// Dev-only. Deletes the rules that tools/rule-probe.mjs proved have no effect.
//
//   node tools/rule-probe.mjs --sheet=base.css --json=probe.json
//   node tools/prune-rules.mjs --probe=probe.json --dry
//   node tools/prune-rules.mjs --probe=probe.json
//
// Only verdicts of `inert` are acted on by default -- rules that were matched
// and measured, with every declaration they carry overridden by something else.
//
// `unmatched` is NOT included by default even though such a rule cannot be
// doing anything today, because "matches nothing in the states we probed" is a
// weaker claim than it sounds: the element may be built by JavaScript on an
// interaction nothing here performs. Pass --include-unmatched to accept them.
//
// Rules are located by walking the source with a brace counter, which keeps
// media-query nesting intact and gives each rule the same identity the probe
// used: its selector, the condition around it, and how many rules with that
// same selector came before it.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROBE = process.argv.find((a) => a.startsWith('--probe='))?.slice(8);
const DRY = process.argv.includes('--dry');
const INCLUDE_UNMATCHED = process.argv.includes('--include-unmatched');

if (!PROBE) {
  console.error('Need --probe=<file written by rule-probe.mjs --json=>');
  process.exit(1);
}

/** Whitespace and comma spacing vary between the CSSOM and the source text. */
const normalise = (selector) =>
  selector
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ',')
    .trim();

const normaliseCondition = (condition) =>
  condition ? condition.replace(/^@media\s*/, '').replace(/\s+/g, ' ').trim() : '';

/**
 * Every style rule in a stylesheet, with the lines it occupies.
 *
 * Walked character by character rather than with a regex because rules nest
 * inside media queries and a brace counter is the only honest way to know where
 * one ends.
 */
function parseRules(source) {
  const rules = [];
  const conditions = [];
  const ordinals = new Map();

  let i = 0;
  let prelude = '';
  let preludeStart = null;

  // Line numbers are derived from character offsets throughout. An earlier
  // version also kept a running counter and incremented it while scanning,
  // which drifted out of step with the offset-based lookup: the two disagreed
  // by one line around a media query, the opening `@media (...) {` was deleted
  // along with the rules inside it, and the orphaned closing brace swallowed
  // the next rule. One source of truth only.
  const newlines = [];
  for (let k = 0; k < source.length; k += 1) if (source[k] === '\n') newlines.push(k);

  const lineOf = (index) => {
    let lo = 0;
    let hi = newlines.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (newlines[mid] < index) lo = mid + 1;
      else hi = mid;
    }
    return lo + 1;
  };

  while (i < source.length) {
    // Comments are skipped entirely so they cannot end up inside a selector.
    if (source[i] === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }

    const ch = source[i];

    if (ch === '{') {
      const text = prelude.trim();

      if (text.startsWith('@')) {
        conditions.push(text);
      } else {
        const selector = normalise(text);
        const condition = normaliseCondition(conditions[conditions.length - 1] ?? '');
        // Counted per selector across the whole sheet, not per media block,
        // because that is how the probe numbers them -- it walks the same rules
        // in the same order. Keying this by condition as well silently shifted
        // the ordinals of every selector that appears both at the top level and
        // inside a media query, and four rules then failed to match.
        const ordinal = ordinals.get(selector) ?? 0;
        ordinals.set(selector, ordinal + 1);

        // Find the matching close brace.
        let depth = 1;
        let j = i + 1;
        while (j < source.length && depth > 0) {
          if (source[j] === '/' && source[j + 1] === '*') {
            const end = source.indexOf('*/', j + 2);
            j = end === -1 ? source.length : end + 2;
            continue;
          }
          if (source[j] === '{') depth += 1;
          if (source[j] === '}') depth -= 1;
          j += 1;
        }

        rules.push({
          selector,
          condition,
          ordinal,
          // Character offsets, because lines are not a safe unit here. base.css
          // contains `@media (max-width: 768px) {body.dark-theme .nav-links {`
          // -- a media query opening on the same line as the first rule inside
          // it. Deleting that rule by line took the `@media {` with it and left
          // the closing brace orphaned. Line numbers are kept for reporting.
          startOffset: preludeStart ?? i,
          endOffset: j,
          startLine: lineOf(preludeStart ?? i),
          endLine: lineOf(j - 1),
        });

        i = j;
        prelude = '';
        preludeStart = null;
        continue;
      }

      prelude = '';
      preludeStart = null;
      i += 1;
      continue;
    }

    if (ch === '}') {
      conditions.pop();
      prelude = '';
      preludeStart = null;
      i += 1;
      continue;
    }

    if (!/\s/.test(ch) && preludeStart === null) preludeStart = i;
    prelude += ch;
    i += 1;
  }

  return rules;
}

const probe = JSON.parse(await readFile(PROBE, 'utf8'));
const sheet = probe.sheet;
const source = await readFile(join(ROOT, sheet), 'utf8');
const eol = source.includes('\r\n') ? '\r\n' : '\n';
const lines = source.split(/\r?\n/);

const wanted = new Set(INCLUDE_UNMATCHED ? ['inert', 'unmatched'] : ['inert']);
const targets = probe.rules.filter((r) => wanted.has(r.verdict));

const parsed = parseRules(source);
const index = new Map();
for (const rule of parsed) {
  index.set(`${rule.condition}||${rule.selector}||${rule.ordinal}`, rule);
}

const doomed = [];
const missing = [];

for (const target of targets) {
  const key = `${normaliseCondition(target.condition)}||${normalise(target.selector)}||${target.ordinal}`;
  const found = index.get(key);
  if (!found) {
    missing.push(target);
    continue;
  }
  doomed.push({ ...found, props: target.props, verdict: target.verdict });
}

doomed.sort((a, b) => a.startOffset - b.startOffset);

for (const rule of doomed) {
  console.log(
    `${String(rule.startLine).padStart(5)}-${String(rule.endLine).padEnd(5)} ` +
      `${rule.verdict.padEnd(9)} ${rule.condition ? `@media ${rule.condition} ` : ''}${rule.selector.slice(0, 60)}`
  );
}

if (missing.length) {
  console.log('');
  console.log(`Could not locate ${missing.length} rule(s) in the source:`);
  missing.forEach((m) => console.log(`  ${m.condition ?? ''} ${m.selector} #${m.ordinal}`));
  console.log('Refusing to write a partial change.');
  process.exit(1);
}

const removedLines = doomed.reduce((sum, r) => sum + (r.endLine - r.startLine + 1), 0);
console.log('');
console.log(`${doomed.length} rule(s), ${removedLines} line(s) of ${lines.length} in ${sheet}.`);

if (DRY) {
  console.log('Dry run, nothing written.');
} else {
  for (let k = 1; k < doomed.length; k += 1) {
    if (doomed[k].startOffset < doomed[k - 1].endOffset) {
      console.error(
        `Ranges overlap: ${doomed[k - 1].selector} and ${doomed[k].selector}. Refusing to write.`
      );
      process.exit(1);
    }
  }

  /**
   * Widen a cut to swallow the whitespace that would otherwise be orphaned.
   *
   * A rule's offsets start at its selector and end at its closing brace, so
   * cutting exactly that leaves the indentation in front of it and the newline
   * behind it -- a blank line per removed rule. Extending to the start of the
   * line, and over the following newline, removes whole lines instead.
   *
   * Both extensions are conditional on the rule actually having the line to
   * itself. Where a media query opens on the same line as its first rule, the
   * text before the selector is real code and the cut stops at the selector.
   *
   * Done per cut rather than as a tidy-up pass over the finished file: a global
   * whitespace normalisation reformatted lines all over base.css and buried 44
   * deletions in 144 lines of unrelated churn.
   */
  const widen = (rule) => {
    let start = rule.startOffset;
    let end = rule.endOffset;

    let k = start - 1;
    while (k >= 0 && (source[k] === ' ' || source[k] === '\t')) k -= 1;
    const ownsLine = k < 0 || source[k] === '\n';
    if (ownsLine) {
      start = k + 1;

      while (end < source.length && (source[end] === ' ' || source[end] === '\t')) end += 1;
      if (source[end] === '\r') end += 1;
      if (source[end] === '\n') end += 1;
    }

    return { start, end };
  };

  let text = source;
  // Descending, so each cut leaves the earlier offsets alone.
  for (const rule of [...doomed].sort((a, b) => b.startOffset - a.startOffset)) {
    const { start, end } = widen(rule);
    text = text.slice(0, start) + text.slice(end);
  }

  const kept = text.split(/\r?\n/);

  // Every removed range should be a whole rule, so the braces must still
  // balance. When they did not, the cause was an off-by-one that deleted a
  // media query's opening line and left its closing brace behind, which merged
  // two unrelated rules and quietly changed an image reset three thousand lines
  // away. Cheap to check, and it localises that class of bug immediately.
  const count = (t, ch) => (t.match(ch) || []).length;
  const output = kept.join(eol);
  const opens = count(output, /\{/g);
  const closes = count(output, /\}/g);

  if (opens !== closes) {
    console.error(`Braces unbalanced after pruning (${opens} open, ${closes} close).`);
    console.error('Refusing to write. The line ranges are wrong, not the verdicts.');
    process.exit(1);
  }

  await writeFile(join(ROOT, sheet), output, 'utf8');
  console.log(`Wrote ${sheet}: ${lines.length} -> ${kept.length} lines.`);
}
