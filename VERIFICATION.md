# VERIFICATION — 2026-11-09 legacy-uiux + typography-1

## Prior pass (legacy options + Red interactive UI)
- F18.01–F18.08 Legacy studies; F19.01–F19.04 Red interactive UI
- Original 85 byte-identical (sha256 `5726e220dfe735fde91fb9c9f9d3721ba968ce440dd81dace66f80966eea1f27`)
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

## Playwright Firefox and WebKit
- Command: `SMOKE_WIDTHS=1280,375,260 node scripts/browser/smoke.mjs <lab> <out.json> "" firefox` and the same with `webkit`
- CI job `browsers` installs Playwright 1.49.1 Firefox and WebKit and runs that smoke
- Real Safari on Apple hardware: NOT_RUN
