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
//
// Page setup, the determinism helpers and the scenario list all live in
// harness.mjs, shared with the computed-style harness. This file is only the
// screenshot-and-compare half.

import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { buildScenarios, preparePage } from './harness.mjs';

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
  const scenarios = buildScenarios(FILTER);
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
  const baseUrl = `http://127.0.0.1:${PORT}`;

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
      await preparePage(page, scenario, baseUrl);
      return await page.screenshot({
        fullPage: scenario.fullPage,
        ...(scenario.clip ? { clip: scenario.clip } : {}),
      });
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
