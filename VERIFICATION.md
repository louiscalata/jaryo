# VERIFICATION — 2026-11-09 (grok-bot-1)

Everything ran live: headless Chromium (Playwright 1.x, Chrome Headless Shell 158) loading the lab over a local http server, with real clicks and key presses. A `file://` load was also checked: the embedded data loads with no page errors.

## Option counts
- **Before:** 17 families / 85 options (80 monochrome, 5 color). All 85 rendered and click-selectable.
- **After:** 17 / 85 (80 + 5), all 85 rendered in the DOM.
- All 85 were clicked at both 1280px and 260px. Each one became `.chosen`, the radio was checked, it persisted to localStorage, and the summary ended at 17/17.

## axe-core (WCAG 2.0/2.1/2.2 A+AA plus best-practice)
Each width was scanned in 6 views: F01, F13 (motion) and F17 (color) compare, plus Journeys, Your choices and Docs.

Before, "dark" equals light, because the old build had no dark theme.

| mode | width | before: violations | before: h-scroll | after: rules / nodes | after: h-scroll |
|---|---|---|---|---|---|
| light | 260 | 2 rules / 4 nodes (color-contrast:3, scrollable-region-focusable:1) | yes | 0 / 0 | no |
| light | 375 | 2 rules / 4 nodes (color-contrast:3, scrollable-region-focusable:1) | yes | 0 / 0 | no |
| light | 768 | 1 rules / 3 nodes (color-contrast:3) | no | 0 / 0 | no |
| light | 1280 | 1 rules / 3 nodes (color-contrast:3) | no | 0 / 0 | no |
| dark | 260 | 2 rules / 4 nodes (color-contrast:3, scrollable-region-focusable:1) | yes | 0 / 0 | no |
| dark | 375 | 2 rules / 4 nodes (color-contrast:3, scrollable-region-focusable:1) | yes | 0 / 0 | no |
| dark | 768 | 1 rules / 3 nodes (color-contrast:3) | no | 0 / 0 | no |
| dark | 1280 | 1 rules / 3 nodes (color-contrast:3) | no | 0 / 0 | no |
| reduced-motion | 260 | 2 rules / 4 nodes (color-contrast:3, scrollable-region-focusable:1) | yes | 0 / 0 | no |
| reduced-motion | 375 | 2 rules / 4 nodes (color-contrast:3, scrollable-region-focusable:1) | yes | 0 / 0 | no |
| reduced-motion | 768 | 1 rules / 3 nodes (color-contrast:3) | no | 0 / 0 | no |
| reduced-motion | 1280 | 1 rules / 3 nodes (color-contrast:3) | no | 0 / 0 | no |
| dark-reduced-motion | 260 | 2 rules / 4 nodes (color-contrast:3, scrollable-region-focusable:1) | yes | 0 / 0 | no |
| dark-reduced-motion | 375 | 2 rules / 4 nodes (color-contrast:3, scrollable-region-focusable:1) | yes | 0 / 0 | no |
| dark-reduced-motion | 768 | 1 rules / 3 nodes (color-contrast:3) | no | 0 / 0 | no |
| dark-reduced-motion | 1280 | 1 rules / 3 nodes (color-contrast:3) | no | 0 / 0 | no |

**What the "before" findings were:**
- **color-contrast:** F17 chip text, for example #f4f1ea on #8fc4a0 at 1.76:1 and #b8ffc8 on #33ff66 at 1.16:1.
- **scrollable-region-focusable:** `#export-box`.
- **Horizontal scroll:** the Docs panel at 260px was 468px wide.

## Live smoke (`verification/smoke-after.json`)
- PASS — options-count data (w=1280)
- PASS — options-count DOM rendered (w=1280)
- PASS — nav groups: monochrome set (16 families) + color batch (F17) both present (w=1280)
- PASS — all options selectable by click (w=1280)
- PASS — summary shows 17/17 (w=1280)
- PASS — no horizontal overflow after click-through (w=1280)
- PASS — options-count data (w=260)
- PASS — options-count DOM rendered (w=260)
- PASS — nav groups: monochrome set (16 families) + color batch (F17) both present (w=260)
- PASS — all options selectable by click (w=260)
- PASS — summary shows 17/17 (w=260)
- PASS — no horizontal overflow after click-through (w=260)
- PASS — radiogroup role + label + single tab stop
- PASS — Tab lands on first radio when none chosen
- PASS — radio focus ring visible (label outline dashed 3px)
- PASS — arrow/Home/End/Space move+select, roving tabindex follows, persisted
- PASS — Tab leaves group (one stop), Shift+Tab returns to checked radio
- PASS — Expand button keyboard (Space) toggles aria-expanded
- PASS — tablist arrows/Home/End with roving tabindex
- PASS — theme toggle dark persists across reload, choices untouched
- PASS — focus-visible ring on all tabbed element types (light, w=1280)
- PASS — focus ring contrast >= 3:1 vs page (light, w=1280)
- PASS — focus-visible ring on all tabbed element types (light, w=260)
- PASS — focus ring contrast >= 3:1 vs page (light, w=260)
- PASS — focus-visible ring on all tabbed element types (dark, w=1280)
- PASS — focus ring contrast >= 3:1 vs page (dark, w=1280)
- PASS — focus-visible ring on all tabbed element types (dark, w=260)
- PASS — focus ring contrast >= 3:1 vs page (dark, w=260)
- PASS — default motion: dash animates, transitions on
- PASS — reduced-motion: dash animation off, transitions ~0, smooth scroll off, note shown
- PASS — w=260: all visible controls >=44x44 and inside viewport
- PASS — no console errors across smoke run

Console and page errors: 0 across all runs.

## Package checks
- `validate_lab.py`: PASS.
- `test_persistence_rules.mjs`: PASS. One assertion was updated for the label-in-name markup.
- `test_lab_dom.mjs` with jsdom: PASS.
- `node --check lab.js`: OK.

## Not verified
- Real screen readers (VoiceOver, NVDA, TalkBack) and how they announce the roving radiogroup and tabs.
- Real phones or cover-screen devices, touch input, and OS zoom or text scaling. Only emulated viewports were used, at DPR 2 for the narrow screenshots.
- Firefox and Safari/WebKit. Only Chromium was run. `:has()` focus ringing has a `:focus-within` fallback, but it is untested.
- Windows forced-colors mode: CSS was added but not rendered.
- Import JSON through a real file picker. The existing jsdom test covers its wiring.

## Known leftovers
- Multi-tab conflict is still not implemented. This is an existing, documented limit.
- Preview mocks stay light "paper" in the dark theme by design.
- The toast overlays content for 3.2 s on narrow screens.
- axe colour checks can't evaluate text over gradients or images, and those cases were not hand-checked.
