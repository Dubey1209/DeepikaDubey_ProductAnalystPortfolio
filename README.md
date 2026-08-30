# Deepika Dubey — Product Portfolio

A hand-written static portfolio site. **No build step, no framework, no bundler.**
Deployment is literally "copy these files to a web server."

- **Live:** https://dubey1209.github.io/DeepikaDubey_ProductPortfolio/
- **Repo:** https://github.com/Dubey1209/DeepikaDubey_ProductPortfolio
- **Hosting:** GitHub Pages, served from the `main` branch.

## Running locally

Because the pages use relative asset paths and `fetch`, open them through a
local server rather than double-clicking the HTML file:

```bash
npm run serve          # http://localhost:4173
# or, with no dependencies at all:
python -m http.server 8000
```

## Pages

| File | Purpose |
| --- | --- |
| `index.html` | The whole single-page portfolio: hero, about, case studies, design projects, technical projects, skills, certifications, education, experience, writing, fun facts, contact. |
| `my-story.html` | A separate narrative page rendered as a flip-book. |
| `404.html` | Served by GitHub Pages for unknown paths. Deliberately self-contained — it shares no stylesheet with the site, so the CSS refactor cannot break it. |

Both pages load the **same** five stylesheets in the **same order**. The nav and
footer markup is currently duplicated between them — keep them in sync by hand.

## Stylesheet load order

Order matters enormously here: later files deliberately override earlier ones.
Do not reorder these `<link>` tags.

| # | File | Owns |
| --- | --- | --- |
| 1 | `styles.css` | Base reset, font stack, typography scale, form/link defaults — **plus** a superseded blue/white card design that `atelier.css` overrides. |
| 2 | `responsive.css` | Breakpoint overrides on a Bootstrap-style ladder (575 / 767 / 991 / 1199). |
| 3 | `polish.css` | Small patch layer: safe-area insets, `box-sizing`, overflow clipping, touch-target sizing. |
| 4 | `atelier.css` | The current visual identity. Defines all design tokens and re-skins nearly every component, scoped under `html.atelier` to outrank `styles.css`. |
| 5 | `motion.css` | Animation and scroll-interaction styling. |

## Script load order

All scripts are `defer`red. Third-party libraries come from the jsDelivr CDN.

| File | Role |
| --- | --- |
| `portfolio-lock.js` | Loaded in `<head>` on `index.html` only. Gates the site behind a name prompt; unlock state is kept in `sessionStorage`. Reveals `#site-shell` and dispatches a `portfolio-unlocked` event. |
| `script.js` | Mobile nav drawer, dropdowns, smooth anchor scrolling, the experience accordion (whose content is hardcoded in this file), the work-detail modal, and the certificate stack. |
| `theme-toggle.js` | Toggles `.dark-theme` on `<body>`, persisted to `localStorage`. An inline script at the top of `<body>` applies the saved theme early to avoid a flash. |
| `motion.js` | GSAP + ScrollTrigger + Lenis scroll animations. |
| `contact-form.js` | Contact form via EmailJS. The SDK is lazy-loaded on first focus of the form rather than on page load. |
| `story-book.js` | Flip-book behaviour on `my-story.html`, using page-flip. |

### External dependencies (CDN, runtime)

GSAP 3.12.7, ScrollTrigger 3.12.7, Lenis 1.1.20, page-flip 2.0.7, and
`@emailjs/browser` 4 (lazy-loaded).

## Cache busting

Every stylesheet and script is referenced with a **single shared** `?v=` token
(currently `20260830`). When you change any CSS or JS file, bump that token —
in both `index.html` and `my-story.html`.

It is one shared value on purpose. Per-asset tokens were used previously and
drifted out of sync (`motion.css` reached `fx45` while `motion.js` sat at
`fx33`), which can serve a returning visitor new CSS against old JavaScript.

## Images

Source images are the originals (`.jpeg` / `.png`); the site serves `.webp`
generated from them:

```bash
node tools/optimize-images.mjs --report   # inspect sources, write nothing
node tools/optimize-images.mjs            # regenerate the .webp files
```

Commit both the source and the generated `.webp`. Run the script after adding
or replacing any image.

Two deliberate choices here:

- **No `<picture>` fallback.** Wrapping the images would insert an element
  between `.home-photo` and its parent, and `motion.js` builds its
  `.home-photo-stage` wrapper via `photo.parentNode` — a `<picture>` tag would
  quietly break the hero animation. WebP support is universal enough to serve
  directly.
- **`og:image` and the favicon stay JPEG**, and absolute. Social scrapers do
  not resolve relative URLs, and several still do not decode WebP.

The certificate images intentionally have no `width`/`height` attributes: they
are `width: 100%; height: 100%; object-fit: cover` inside an absolutely
positioned sheet, so the attributes would have no effect on layout.

## Third-party service configuration

Client-side identifiers are, by design, public — but they are abusable, so they
are listed here for awareness rather than treated as secrets:

- **EmailJS** (`contact-form.js`) — public key, service ID, and template ID.
- **Formcarry** (`portfolio-lock.js`) — visitor-notification endpoint.

Neither is a credential leak, but both can be submitted to by anyone. Enable
rate limiting / CAPTCHA in the respective dashboards.

## Accessibility notes

Worth preserving as the site evolves: `prefers-reduced-motion: reduce` is
honoured in all five stylesheets and in `portfolio-lock.js`; there is a skip
link, ARIA attributes on the nav and modals, and focus is restored after the
work modal closes.

## Visual regression harness

The stylesheet layer is being collapsed, and because later files deliberately
override earlier ones, reading the CSS is not enough to prove a change is
visually neutral. `tests/` screenshots the site and compares against committed
baselines.

```bash
npm install
npx playwright install chromium   # one-off, ~115 MB

npm run test:visual               # compare against tests/baseline/
npm run baseline                  # accept current rendering as the new truth
npm run test:visual -- --filter=index-desktop   # just one scenario
```

25 scenarios: both pages × 375/800/1440 px × light/dark, plus the lock screen,
the work modal, the nav dropdown, the mobile drawer, and `404.html`. A full run
takes roughly four minutes.

Page setup, the determinism helpers and the scenario list live in
`tests/harness.mjs`, shared with the computed-style harness below so the two
can never drift apart or disagree about what they are looking at.

The 404 scenarios emulate `prefers-color-scheme`, because that page themes
itself from the media query rather than the site's `.dark-theme` class.

`tests/baseline/` **is committed** — it is the reference. `tests/current/` and
`tests/diff/` are generated per run and git-ignored.

The baselines are full-page screenshots and total around 11 MB, so every
re-acceptance adds that much to git history permanently. Re-accept when a phase
genuinely changes the design, not to silence a diff you have not looked at.

### Workflow during a CSS phase

1. Change one component.
2. `npm run test:visual`.
3. Every scenario should still pass. If one changed, open the three PNGs of the
   same name in `baseline/`, `current/`, and `diff/`.
4. Only run `npm run baseline` once you have looked at a diff and decided it is
   intended.

### Why the harness is more complicated than "take a screenshot"

Each of these was a real source of false positives, and they are worth knowing
about before editing `tests/visual.mjs`:

- **GSAP is immune to CSS pausing.** It writes inline styles every ticker
  frame, so tweens are explicitly fast-forwarded and the ticker is put to
  sleep. Scrub-linked tweens are left alone, since they are a pure function of
  scroll position. This also stops Lenis, which `motion.js` drives from the
  GSAP ticker.
- **Pausing a CSS animation is not deterministic.** It freezes at whatever
  phase it reached, so animations are first seeked to a fixed far-future time.
- **Reveal animations need triggering.** Content below the fold sits at
  `opacity: 0` until scrolled to, so the harness steps through the whole
  document and back to the top.
- **`motion.js` has a 4500 ms fallback** that force-finalises the hero. Capture
  happens after it fires, otherwise the hero is a coin flip between two states.
- **Lazy images race the screenshot.** All images are forced eager and awaited
  through `decode()`. The About photo was the visible offender: present in one
  run, missing from the next.
- **Scroll must be exactly zero** and nothing may be focused. `fullPage` draws
  fixed elements wherever the viewport is, and a focused skip link becomes
  visible and shifts the whole document down.
- **`.home-rotate` is masked** because it cycles words forever. Masking uses
  `!important`, or the site's own `!important` rules win.
- **Differences are confirmed by a retry** before being reported, so a residual
  sub-pixel wobble in the hero cannot fail the suite while a genuine regression
  still does.
- **An action can restart the animation layer.** Opening the work modal means
  clicking a card, and that click scrolls the page, firing the reveals for
  whatever came into view. Motion is therefore frozen a second time after any
  scenario action.

### Known limitation: sensitivity on tall pages

Failure is triggered by a *proportion* of changed pixels (0.2%), which on the
full-page index capture (roughly 1584 × 11021) is about 35,000 pixels of
allowance. A small change — a line of coloured text, a tag, an icon — can
therefore pass unnoticed. The `.project-category` colour change in Phase 2 did
exactly that.

The proportional threshold exists to absorb a sub-pixel wobble in the hero
photo that has resisted every attempt to pin it down. Clipping helps where it
can be applied: `nav-dropdown-*` captures only the top 240 px, which excludes
the hero entirely and makes those scenarios genuinely tight.

**The computed-style harness below is the real answer to this**, and it is why
that harness exists. Treat a passing screenshot run as strong evidence about
layout and colour at component scale, and rely on `npm run computed` for
anything smaller.

## Computed-style regression harness

Where the screenshots ask "does this still look right", this asks "did anything
change at all" — and answers exactly, with no threshold.

```bash
npm run computed:save    # record tests/computed/ from the CSS as it stands
# ...delete some CSS...
npm run computed         # report every property that moved
```

It walks all ~1,200 elements of every scenario, reads ~120 computed properties
on each (plus a smaller set on `::before` and `::after`), and compares string
for string. A clean run means roughly 28,000 elements are provably untouched.

This is the primary oracle for Phase 3, for three reasons:

1. **No sensitivity floor.** The pixel threshold above cannot see a small
   change on a tall page. This sees every change equally, wherever it is.
2. **No blind spots.** A screenshot only shows what is painted. This also
   covers `cursor`, `pointer-events`, `overflow`, `transition-*`, elements
   hidden behind others, and elements outside a clipped capture.
3. **It names the cause.** A pixel diff says "4,000 pixels moved somewhere in
   an 11,000 px page". This says `.project-card line-height: 1.6 -> normal`.

`tests/computed/` is **git-ignored**, unlike the screenshot baselines. It is a
before/after reference for the edit in progress, not a historical record, and
committing it would add megabytes of churn per phase. Save, edit, compare.

Two deliberate differences from the screenshot harness:

- **Transitions are left alive.** The screenshots kill them, which would rewrite
  every `transition-*` to `none` and hide the removal of a rule that carries
  one. The cost is having to outwait the transitions that `settleAtTop` starts,
  which is why this harness takes about eight minutes rather than four.
- **Properties JavaScript owns inline are exempt** — the geometry GSAP tweens,
  and `filter`. An inline style beats every stylesheet, so CSS cannot affect
  those values and there is nothing to protect; the exemption is detected by
  asking whether the property is set inline rather than from a selector list,
  so it keeps working as the animations change. Everything else about those
  elements, including all colour and typography, is still compared exactly.

`prefers-reduced-motion` is deliberately **not** used to calm the page down:
all five stylesheets restyle the site under that media query, so it would
capture a design real visitors never see.

## Known bugs (found during the Phase 2 audit, not yet fixed)

These are real, visible defects rather than tidiness issues. They are recorded
here rather than fixed immediately because each one lives in a file that a
later phase restructures, and because none of them is currently covered by a
visual regression scenario — coverage has to come first.

1. **`polish.css:241` defeats the token system.** `body.dark-theme
   .project-card.interactive-card .project-category { color: #7eb6ff
   !important }` has specificity 0-4-2, which beats every `atelier.css` rule
   for `.project-category`. `polish.css` loads *before* `atelier.css`, but
   specificity outranks order, so this hardcoded blue wins in dark mode. It is
   the only `!important` colour in the codebase that overrides the palette.
2. **Dark dropdown uses the old shadow.** `styles.css:219` sets `box-shadow: 0
   8px 16px rgba(0,0,0,0.3)` on `.dropdown-content`, and `atelier.css:1812`
   sets the intended `6px 8px 0 var(--ink)` at *lower* specificity without
   `!important` — so the superseded shadow is what actually renders.
3. **Dropdown hover leaks two properties.** `styles.css:230-231` and
   `styles.css:244` (`color: #ffffff !important`, `border-left-color: #2a7ae2
   !important`) survive because `atelier.css:1819` only sets `background`.
4. **The success toast has no dark variant.** `polish.css:266` gives
   `.lock-notification--success` a hardcoded `#1a1713` background, which stays
   near-black in dark mode. Worth checking its text contrast.

5. **Tapping "Work" in the mobile drawer also scrolls the page.**
   `toggleDropdown` in `script.js` calls `preventDefault`, but the same file
   separately binds a smooth-scroll handler to every `a[href^="#"]` — and one
   listener calling `preventDefault` does not stop another listener on the same
   element. Both run, so the submenu opens *and* the page jumps to Case
   Studies.
6. **Drawer items can become unreachable.** `atelier.css:1802` sets
   `flex-wrap: wrap` on `.nav-links` globally. On mobile the drawer is a
   fixed-height `flex-direction: column`, so when the items exceed the viewport
   height — which happens as soon as the submenu expands — they wrap into a
   second column beyond the drawer's width and are clipped off-screen. Story
   and Contact are the casualties.

Bugs 2 and 3 disappear on their own when `styles.css` is dismantled in Phase 3.
Bugs 5 and 6 are now covered by the `nav-drawer-*` scenarios, so they can be
fixed safely.

### A trap to remember when tokenising

`#1a1713` and `#f3eee4` are simultaneously light `--ink`/dark `--paper` and
light `--paper`/dark `--ink` — the two tokens are exact swaps of each other. A
hardcoded instance of either is therefore ambiguous, and substituting the wrong
token inverts the colour in dark mode. Two places depend on staying hardcoded
because they need *fixed* contrast against a `--spin` background:
`motion.css:1126` and `atelier.css:2439`.

## Refactor status

An architecture review identified the CSS layer as the main maintenance risk:
8,374 lines across five files with 838 `!important` declarations, three
competing breakpoint systems, and design tokens scoped to `html.atelier`
instead of `:root`. A phased refactor is underway.

- [x] **Phase 0** — safety net: branch, `.gitignore`, this document, visual-regression baselines
- [x] **Phase 1** — quick wins: cache-bust sync, `og:url` fix, WebP images, SEO files
- [x] **Phase 2** — design tokens moved to `:root`, redundant dark rules removed
- [ ] **Phase 3** — collapse five stylesheets into three
- [ ] **Phase 4** — unify breakpoints
- [ ] **Phase 5** — extract content into a data layer
- [ ] **Phase 6** — decide the future of the lock screen

The **no-build-step property is intentional** and should survive the refactor.
The `package.json` in this repo exists solely for the visual-regression test
harness (see `tests/`) and is never required to deploy or serve the site.
