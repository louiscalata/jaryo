# CHANGES — 2026-11-09 polish (grok-bot-1)

Base: `jaryo-adaptive-design-lab-lab-20261106-kb-20261106-221648-importrefresh.zip` (unmodified).
The catalog data is unchanged: `data/*.json` and `embedded-data.js` are byte-identical, with 85 IDs (80 monochrome F01–F16 plus 5 color F17).

## Visual direction
- The look is now black and white with a factory feel and quiet surfaces. Monochrome is the default and primary look.
- The header is a machine-plate row: a `JRY·LAB` plate, the title, and the version on the right. A thin hatched hazard strip sits under it.
- The storage banner is monochrome: a surface fill with a heavy left rule. Error banners use a double rule plus a `!` prefix, so warm yellow and pink fills are gone.
- The sidebar is split into **Monochrome set · 80 options** and **Color batch · 5 options · optional**. F17 colors appear only inside their own preview cards and never in the chrome.
- Type scale: 11/12/13/15/20/24 px. Mono stencil labels are uppercase with tracking. Body prose is sans 13px at line-height 1.5.
- Spacing rhythm: 4/8/12/16/24/32 px tokens, used across the header, sidebar, tabs, cards and tables.
- Cards:
  - The ID bar shows the ID, its index (`2/5`) and `■ CHOSEN`.
  - Mechanism, Why curated, Tradeoff and Narrow get spec-sheet labels.
  - The actions sit under a hairline rule.
  - A chosen card gets an inset rule plus an offset block shadow.
- Tabs are a joined, segmented strip on a 2px baseline.
- The table has an inverted header row and zebra rows.
- The toast is inverted and spans the full width on narrow screens.
- Motion is limited to 120–160 ms colour and box-shadow transitions, a 4px panel fade-in and a toast rise. All of it is removed under reduced motion.

## Accessibility
- **Option radiogroup (`#cards`):**
  - `role=radiogroup`, labelled by the section title and described by keyboard help.
  - Roving tabindex, so the group is one Tab stop: the checked radio, or the first one when none is checked.
  - ←/↑ and →/↓ move and select, with wrap-around. Home and End jump to the first and last option. Space selects.
  - Every move persists, just like a click.
- **Radio names:** the radio's name now comes from its `<label>`: the visible "Choose · ID" plus a screen-reader-only option name. This replaces `aria-label` and satisfies WCAG 2.5.3 label-in-name. `scripts/test_persistence_rules.mjs` was updated to assert the new markup.
- **Expand buttons** have `aria-controls` pointing at their preview stage, and a screen-reader-only ID so their names are unique.
- **Tabs:**
  - Full tabs pattern: `aria-controls`, `aria-labelledby` on the panels, and roving tabindex.
  - ←/→ and Home/End move between tabs with automatic activation.
  - Panels with no focusable content get `tabindex=0`.
- **Focus:** a global `:focus-visible` ring (3px dashed plus a 2px halo).
  - Light: #000 on #fff, 21:1.
  - Dark: #ffd75e on #0c0c0c, 14:1.
  - The radio ring goes on the whole label pill via `:has(:focus-visible)`, with a `:focus-within` fallback. There is no ring on mouse clicks.
- **Dark theme:** new. It follows `prefers-color-scheme`, and a Theme select (System/Light/Dark) overrides it. The choice is saved under a separate localStorage key and never touches the choices envelope.
  - Preview stages stay light "paper" in both themes, because the SVG mocks are drawn in #000/#fff.
- **Contrast:**
  - All text tokens pass AA in both themes.
  - F17 chips, the CTA and the muted line now pick an AA-passing ink from the option's own tokens, falling back to #000/#fff. Token values are unchanged.
  - The chips also gained ●/▶ glyphs.
- **Export `<pre>`:** now focusable, as a labelled region. The summary table has a caption and `scope=col`.
- **Forced colors:** added support for forced-colors mode.

## Responsive (down to ~260px)
- Breakpoints at 1400, 980, 640, 480 and 300px.
- At 480px and below:
  - The toolbar becomes a 2-column grid.
  - The family nav becomes a compact ID grid. The full title stays in the accessible name.
  - Tabs go 2×2, and card actions stack full-width.
- ASCII previews wrap instead of clipping. Long codes and URLs wrap.
- No horizontal scroll at 260, 375, 768 or 1280 in any view.
- All visible controls are at least 44×44 at 260px.

## Reduced motion
- Under `prefers-reduced-motion: reduce`:
  - Animations and transitions are ~0.
  - The F13 dash animation is off.
  - Smooth scroll is off.
  - The panel fade and toast rise are off.
  - F13.02 and F13.07 show a "Reduced motion: … static" note.

## Tooling (in `scripts/browser/`, not shipped dependencies)
- `audit.mjs`: axe-core across modes × widths × views.
- `smoke.mjs`: live smoke test.
- `shots.mjs`: screenshots.
- Results are in `verification/`.
