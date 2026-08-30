// Scratch diagnostic: who sets a property on an element, in a given state.
//
//   node tools/probe-one.mjs <scenario> "<selector>" <property>

import { chromium } from 'playwright';
import { startServer } from '../tests/serve.mjs';
import { preparePage, buildScenarios } from '../tests/harness.mjs';

const [scenarioName, selectorArg, propArg] = process.argv.slice(2);
const PORT = 4330;

const server = await startServer(PORT);
const browser = await chromium.launch();
const scenario = buildScenarios().find((s) => s.name === scenarioName);
if (!scenario) throw new Error(`no scenario ${scenarioName}`);

for (const freezeTransitions of [true, false]) {
  const context = await browser.newContext({
    viewport: { width: scenario.width, height: scenario.height },
    deviceScaleFactor: 1,
    colorScheme: scenario.colorScheme ?? 'light',
  });
  const page = await context.newPage();
  await preparePage(page, scenario, `http://127.0.0.1:${PORT}`, { freezeTransitions });

  const out = await page.evaluate(
    ({ selector, prop }) => {
      const el = document.querySelector(selector);
      if (!el) return { error: `no element ${selector}` };

      const lines = [];
      for (const sheet of document.styleSheets) {
        const name = sheet.href?.split('/').pop() ?? 'inline';

        const walk = (rules, condition = null) => {
          for (const rule of rules) {
            if (rule.cssRules && !rule.selectorText) {
              walk(rule.cssRules, rule.conditionText ?? condition);
              continue;
            }
            if (!rule.selectorText) continue;
            const value = rule.style.getPropertyValue(prop);
            if (!value) continue;

            let matches = false;
            try {
              matches = rule.selectorText
                .split(',')
                .some((s) => el.matches(s.trim().replace(/::?[a-z-]+(\([^)]*\))?$/, '') || '*'));
            } catch {}

            const mediaOn = condition ? window.matchMedia(condition).matches : true;
            lines.push(
              `${matches && mediaOn ? 'APPLIES ' : '        '}${name}  ${
                condition ? `@media ${condition} ` : ''
              }${rule.selectorText}  { ${prop}: ${value} }${mediaOn ? '' : '  [media off]'}${
                matches ? '' : '  [selector no]'
              }`
            );
          }
        };

        try {
          walk(sheet.cssRules);
        } catch {}
      }

      return {
        computed: getComputedStyle(el).getPropertyValue(prop),
        inline: el.getAttribute('style'),
        rules: lines,
      };
    },
    { selector: selectorArg, prop: propArg }
  );

  console.log(`\n===== freezeTransitions=${freezeTransitions} =====`);
  console.log(`computed ${propArg}: ${out.computed}`);
  console.log(`inline: ${out.inline}`);
  for (const l of out.rules ?? []) console.log(l);
  if (out.error) console.log(out.error);

  await context.close();
}

await browser.close();
server.close();
