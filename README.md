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
| 1 | `base.css` | Base reset, font stack, typography scale, form/link defaults — **plus** a superseded blue/white card design that `atelier.css` overrides, and a Bootstrap-style breakpoint ladder (575 / 767 / 991 / 1199) that disagrees with the one used elsewhere. |
| 2 | `atelier.css` | The current visual identity. Defines all design tokens in `:root` and re-skins nearly every component, mostly scoped under `html.atelier` to outrank `base.css`. Opens with what was a small patch layer: safe-area insets, `box-sizing`, overflow clipping, touch-target sizing. |
| 3 | `motion.css` | Animation and scroll-interaction styling. |

Phase 3 merged these down from five files. `styles.css` + `responsive.css`
became `base.css`, and `polish.css` + `atelier.css` became `atelier.css`; the
files were concatenated in the exact order the browser already loaded them, so
no rule moved relative to any other and the cascade is unchanged. Section
banners inside each file mark where the old ones ended.

The merge changed no rules at all, deliberately — pruning at the same time
would have produced an unreviewable diff, and if the result had changed
something there would have been no way to tell which half did it.

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
(currently `20260830-2`). When you change any CSS or JS file, bump that token —
in both `index.html` and `my-story.html`.

The `-2` suffix is there because the Phase 3 merge shipped on the same day as
Phase 1: `atelier.css` changed content at a URL returning visitors already had
cached, so the token had to move even though the date had not.

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

## Known bugs (found during the Phase 2 audit)

These are real, visible defects rather than tidiness issues. Line numbers are
as of the Phase 3 merge.

1. ~~**The token system was defeated by a hardcoded blue.**~~ **Fixed in Phase
   2.** `body.dark-theme .project-card.interactive-card .project-category {
   color: #7eb6ff !important }` had specificity 0-4-2, which beat every
   `atelier.css` rule for `.project-category`. It lived in `polish.css`, which
   loaded *before* `atelier.css`, but specificity outranks order, so the
   hardcoded blue won in dark mode. Now `var(--accent)`, at `atelier.css:255`.
2. **The dropdown has no shadow at all.** `base.css:1466` sets `box-shadow: none
   !important` on `.dropdown-content`, which beats the intended `6px 8px 0
   var(--ink)` at `atelier.css:2139` however specific that rule is. Originally
   recorded here as "dark mode renders the old `0 8px 16px rgba(0,0,0,0.3)`
   shadow" — wrong: the prober found that rule inert and deleting it changed
   nothing, because the `!important` none was already winning. Both themes get a
   flat dropdown.
3. **Dropdown hover leaks two properties.** `base.css:225-226` and
   `base.css:236` (`color: #ffffff !important`, `border-left-color: #2a7ae2
   !important`) survive because the `atelier.css` rule only sets `background`.
   These are `:hover` rules, which the prober reports as unverifiable, so they
   need fixing by hand.
4. **The success toast has no dark variant.** `atelier.css:278` gives
   `.lock-notification--success` a hardcoded `#1a1713` background, which stays
   near-black in dark mode. Worth checking its text contrast.
5. **Tapping "Work" in the mobile drawer also scrolls the page.**
   `toggleDropdown` in `script.js` calls `preventDefault`, but the same file
   separately binds a smooth-scroll handler to every `a[href^="#"]` — and one
   listener calling `preventDefault` does not stop another listener on the same
   element. Both run, so the submenu opens *and* the page jumps to Case
   Studies.
6. **Drawer items can become unreachable.** `atelier.css:2134` sets
   `flex-wrap: wrap` on `.nav-links` globally. On mobile the drawer is a
   fixed-height `flex-direction: column`, so when the items exceed the viewport
   height — which happens as soon as the submenu expands — they wrap into a
   second column beyond the drawer's width and are clipped off-screen. Story
   and Contact are the casualties.

Bugs 2 and 3 are dead declarations in `base.css` that only survive on
specificity; they are prime candidates for the Phase 3 pruning. Bugs 5 and 6
are covered by the `nav-drawer-*` scenarios, so they can be fixed safely.

### A trap to remember when tokenising

`#1a1713` and `#f3eee4` are simultaneously light `--ink`/dark `--paper` and
light `--paper`/dark `--ink` — the two tokens are exact swaps of each other. A
hardcoded instance of either is therefore ambiguous, and substituting the wrong
token inverts the colour in dark mode. Two places depend on staying hardcoded
because they need *fixed* contrast against a `--spin` background:
`motion.css:1126` and `atelier.css:2770`.

`atelier.css:279` is a third hardcoded instance, and it is bug 4 above rather
than a deliberate exception.

## Dead-rule audit

```bash
node tools/css-audit.mjs            # summary per file
node tools/css-audit.mjs --list     # every unmatched selector
```

Loads both pages at three viewports, applies the state classes that JavaScript
would (`.fx-in`, `.dark-theme`, drawer open, modal open, and so on), and reports
selectors that match no element anywhere.

**The headline result is that almost nothing is dead this way: 14 selectors out
of 1,159, about 1%** — and they are nearly all resets for elements the markup
does not contain (`table`, `iframe`, `select`, `td`). So there is no easy win
here, and the Phase 3 pruning has to go after *overridden declarations*
instead, which is a much harder question and needs `npm run computed` to
answer.

Two traps this tool hit, worth knowing before trusting a similar result:

- **Runtime classes.** A page sitting still has no `.fx-in` on anything, so
  every reveal rule in `motion.css` looked dead — 51 selectors. Those classes
  are now applied before the audit runs.
- **Class names built by string concatenation.** `portfolio-lock.js` creates its
  toast with `lock-notification--${type}`, so the literal
  `lock-notification--success` appears nowhere and the rule looked dead while
  being perfectly live. The audit now also searches the scripts for prefixes a
  name could have been assembled from, and treats any hit as "still in use".

Both failure modes point the same way: a selector matching nothing *right now*
is weak evidence. The tool is deliberately biased toward leaving rules alone.

## Pruning workflow

Since the waste is overridden declarations rather than unmatched selectors,
finding it means measuring what each rule actually contributes.

```bash
node tools/rule-probe.mjs --sheet=base.css --json=probe.json
node tools/prune-rules.mjs --probe=probe.json --dry
node tools/prune-rules.mjs --probe=probe.json
npm run computed          # the real proof
npm run test:visual
```

`rule-probe.mjs` notes what each rule declares, blanks it through the CSSOM,
and re-reads the same properties on the elements it targets and their
descendants. Nothing moved means the rule was contributing nothing. Blanking is
equivalent to deleting — the declarations stop applying while every other
rule's specificity and order stay put — and the rule is restored either way, so
one page load probes a whole stylesheet.

It then does a second sweep that blanks the entire set of candidate deletions at
once and compares a fixed property list across every element, putting rules back
until the page is identical again. Per-rule verdicts cannot see two rules that
cover for each other, and this is what catches them; see below.

It exists because `npm run computed` takes six minutes, which is enough to
answer "did this batch break anything" but not "which of these 44 rules is the
problem". Bisecting with it would take hours; this answers per rule in
milliseconds, and the batch it produces is then confirmed once with the real
harness.

Verdicts:

| Verdict | Meaning |
| --- | --- |
| `live` | Removing it changes something. Keep. |
| `inert` | Matched and measured; every declaration is overridden. Safe to delete. |
| `unmatched` | Matches nothing in any probed state. Not pruned by default — the element may be built by JavaScript. |
| `unverifiable` | A `:hover`/`:focus`/`:active` rule, or one whose media query never applied at any probed width. Either would look inert whatever it contains. |

`prune-rules.mjs` deletes the `inert` rules, refusing to write if the braces
stop balancing or two ranges overlap.

### Eight things that had to be got right

Each of these produced a confidently wrong answer first, and each was caught by
`npm run computed` after the deletions were applied:

- **Probing at rest is not enough.** Without the drawer and modal states, every
  `.nav-links.open` rule looked unmatched — true of a still page and a terrible
  reason to delete them. The prober now uses the shared scenario list.
- **Transitions hide the effect of a deletion.** Blanking a transitioned
  property does not change the computed style; it starts animating towards the
  new value, so an immediate read returns the old one.
  `.theme-toggle-icon-wrapper { transform: translateX(0) }` — the only rule
  providing that transform — was reported inert in all 22 states for this
  reason. Ordinary properties are now measured with transitions suppressed,
  where a deletion takes effect at once. But suppressing transitions rewrites
  every `transition-*` to `none`, which hid changes to those properties and cost
  the transitions on links and on `body` in an earlier attempt. So there are two
  passes over every state, covering disjoint property sets: transitions off for
  everything else, transitions on for `transition-*`, which is sound because
  those properties are not themselves animated.
- **A dormant media query proves nothing.** Blanking a rule inside a query that
  does not currently match provably changes nothing, which says nothing about
  the widths where it does match. With only 375/800/1440 probed, a rule inside
  `(min-width: 992px) and (max-width: 1199px)` was dormant everywhere and read
  as inert. The prober now checks `matchMedia` before judging a rule, sweeps a
  width either side of every declared breakpoint, and reports a rule whose query
  never applied as unverifiable rather than dead. This alone moved 32 rules out
  of the delete list, 15 of them provably live.
- **Both themes, every state.** Probing the drawer, lock screen and modal in
  dark only meant any rule that a `body.dark-theme` rule happens to override was
  measured inert while being the only thing styling that element in light mode.
  That pruned the light drawer's position and its close button.
- **Redundant pairs cannot be judged one at a time.** `base.css` hides
  `.drawer-close-btn-li` on desktop in two separate rules, so each is inert on
  its own and removing both leaves the button visible. Leaving inert rules
  blanked so later rules are judged in context looks like the fix and is worse:
  verdicts combine across states while the blanking happens within one, so
  `.nav-links.open .drawer-close-btn-li` was judged inert with a rule blanked
  ahead of it that is live with the drawer shut and survived the prune — hiding
  the close button in the open drawer. Hence the batch validation pass, which
  tests the set that will actually be deleted instead of reasoning about it. It
  reinstated 5 of 144 candidates.
- **`querySelectorAll` cannot match a pseudo-element.** `.foo::before` returned
  nothing and two decorative rules were declared dead while painting on screen.
  The pseudo is stripped for matching and passed to `getComputedStyle`.
- **Lines are not a safe unit for deletion.** `base.css` had `@media
  (max-width: 768px) {body.dark-theme .nav-links {` — a media query opening on
  the same line as its first rule. Deleting by line took the `@media {` with it
  and the orphaned brace swallowed an image reset 3,000 lines away. Cuts are
  made by character offset.
- **Repeated selectors need consistent numbering.** The prober counts
  occurrences across the whole sheet; the pruner briefly counted them per media
  block, and four rules failed to match.

### When the two harnesses disagree

It happens, and the computed one wins. `index-desktop-light` has reported 0.34%
of pixels changed, and `index-desktop-dark` 0.21%, while all 25 computed
snapshots were byte-identical. The diff image was red over the hero and About photos only —
the GSAP wobble, whose inline-styled geometry the computed harness exempts by
design. Re-running the scenario against the previous commit failed the same
way, which settled it.

Worth knowing: **the wobble can exceed the 0.2% threshold**, so a screenshot
failure confined to those two photos is not evidence of anything on its own.
Check `npm run computed`, and confirm by re-running the single scenario with
`--filter=`, which is the quickest way to tell a flake from a regression.

The computed harness has its own flake of the same origin, now handled: GSAP
writes `transform-origin` inline next to the transforms it manages and on its
own schedule, so the cards behind the work modal reported one value in one run
and another in the next with the stylesheets untouched. It is exempted when held
inline, as `transform` and `filter` already were.

`tools/probe-one.mjs` is kept for when a verdict needs explaining: given a
state, a selector and a property, it lists every rule in every stylesheet that
sets that property on the element, and whether the selector and the media query
apply. Reading the cascade for `.drawer-close-btn-li` is how the redundant-pair
problem above was found.

## Refactor status

An architecture review identified the CSS layer as the main maintenance risk:
8,374 lines across five files with 838 `!important` declarations, three
competing breakpoint systems, and design tokens scoped to `html.atelier`
instead of `:root`. A phased refactor is underway.

Phase 3 first moved those lines into three files without touching a single rule,
then began pruning what the merge exposed. The CSS is now 7,624 lines and 772
`!important`s, every deletion measured rather than reasoned about.

`base.css` took the bulk of it: of its 417 measurable rules, 139 contributed
nothing to any of the 38 probed states and are gone — 632 lines, a fifth of the
file. 84 more are `:hover`/`:focus` rules that cannot be judged this way and 15
match nothing at all, so they stay.

One number is worth keeping in view. Of the 47 `body.dark-theme` rules in
`base.css`, 44 turned out to contribute nothing — but the three that remained
included `body.dark-theme .navbar, .footer-section, .section`, whose colour
every element that `atelier.css` does not explicitly recolour was inheriting.
Deleting the 44 alongside it would have changed 4,000 properties per dark
scenario, and no amount of reading the files had revealed which of the 47
mattered. That is the shape of this codebase, and why the phase is slow.

- [x] **Phase 0** — safety net: branch, `.gitignore`, this document, visual-regression baselines
- [x] **Phase 1** — quick wins: cache-bust sync, `og:url` fix, WebP images, SEO files
- [x] **Phase 2** — design tokens moved to `:root`, redundant dark rules removed
- [ ] **Phase 3** — collapse five stylesheets into three
  - [x] computed-style harness, the oracle the pruning needs
  - [x] merged 5 files into 3, cascade-identical, no rules changed
  - [x] pruned 44 superseded dark-theme rules from `base.css` (167 lines)
  - [x] pruned the rest of `base.css`: 139 rules, 632 lines
  - [ ] probe `atelier.css` and `motion.css`
  - [ ] fix bugs 2 and 3 by hand — an `!important` and two `:hover` rules the
        prober cannot judge, and all three change the page on purpose
- [ ] **Phase 4** — unify breakpoints
- [ ] **Phase 5** — extract content into a data layer
- [ ] **Phase 6** — decide the future of the lock screen

The **no-build-step property is intentional** and should survive the refactor.
The `package.json` in this repo exists solely for the visual-regression test
harness (see `tests/`) and is never required to deploy or serve the site.
