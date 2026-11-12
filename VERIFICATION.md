# VERIFICATION — 2026-11-09 legacy-uiux + typography-1

The counts and measurements below are historical records, not a fresh current-head pass. Current native acceptance gates and the audited CI engine identities are tracked in [roadmap.md](roadmap.md#browser-identity-correction).

## Prior pass (legacy options + Red interactive UI)
- F18.01–F18.08 Legacy studies; F19.01–F19.04 Red interactive UI
- The 85 option IDs and their content are unchanged.
- Smoke 34/34 · axe 0 violations
- ZIP path (rebuilt this pass): see below

## Typography-1 lab-wide apply
- Principles: `docs/TYPOGRAPHY-PRINCIPLES.md` (and `docs/TYPOGRAPHY-PRINCIPLES.md`)
- Shared tokens in `lab.css` only; curated-85 untouched
- `python3 scripts/validate_lab.py` → OK
- Smoke: `verification/smoke-typography.json` → 34/34
- axe: `verification/axe-typography.json` → 0 violations (light/dark/reduced-motion × 260/375/768/1280)

## Screenshots
### Legacy/Red compare (earlier)
- `verification/compare/after-F18-legacy-light-1280.png`
- `verification/compare/after-F19-red-light-1280.png`
- `verification/compare/before-contrails-tactical.jpg`
- `verification/compare/before-typography-toc.jpg`

### Typography-apply before/after (F01, F02 existing · F19 new · 375 & 1280)
- before: `verification/typography-apply/before/{F01,F02,F19}-{375,1280}.png`
- after: `verification/typography-apply/after/{F01,F02,F19}-{375,1280}.png`

## Configured Playwright Firefox and WebKit checks
- [CI job `browsers`](.github/workflows/ci.yml) configures Playwright 1.49.1 Firefox and WebKit smoke at 1280, 375 and 260 on the PC or hosted Linux runners.
- Current command: `SMOKE_WIDTHS=1280,375,260 node scripts/browser/smoke.mjs <lab> <out.json> --browser=firefox` and the same with `--browser=webkit`. The optional screenshot directory precedes the explicit browser flag.
- The old commands relied on an empty positional screenshot argument. The audited historical accepted PC jobs logged `TOTAL 45 / 45 chromium` twice despite their Firefox/WebKit step labels; see [the retained audit](roadmap.md#browser-identity-correction). Those counts do not prove Firefox or WebKit execution.
- [The smoke CLI](scripts/browser/smoke-cli.mjs) validates requested/actual engine names and a nonempty version; [the smoke runner](scripts/browser/smoke.mjs) records that identity. Fresh matching Firefox/WebKit receipts and the complete corrected current-head CI matrix remain pending in the roadmap.
- Native browser execution for this documentation reconciliation: NOT_RUN (Mac browser-free checks only).
- Real Safari on Apple hardware: NOT_RUN

## Chromium forced-colors emulation
- Not a Windows hardware test. Windows forced-colors on hardware: not tested.
- `node scripts/browser/forced-colors-smoke.mjs <lab> /tmp/forced-colors-emulation.json`
- Checks that the selected radio and the focused control stay visible and keep their text.

## Mobile layout shift, local Lighthouse 12 (2026-11-10)
The family list is in `index.html`. An empty list filled by script was pushing `.grammar-box`.
Same machine, mobile emulation, before and after that change:
- before: CLS 0.148, accessibility 100, best practices 100, performance 75
- after: CLS 0, accessibility 100, best practices 100, performance 84
Desktop after: CLS 0, accessibility 100, best practices 100, performance 99
Live Pages numbers are measured again after this change is deployed.
