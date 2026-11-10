# AGENTS.md

## Overview

Jaryo is an adaptive black-and-white design language used by AGIW Suite, OPOS, and Nisi. This repository is the interactive design lab: a static page for comparing curated options, saving a browser preference, and exporting JSON. It is a design tool, not a product. The lab is black and white and text first. Typography follows the Typography 1 booklet. The catalog phrase is derived from the data and shared by the README and the page. Report only checks that actually ran.

## Repo map

- `index.html`, `lab.css`, `lab.js`, `lab-stages.js`, `lab-stages.css` — the lab UI
- `data/curated-85.json` — original curated file; keep it byte-stable
- `data/curated-extended.json` — 19 families and 97 options
- `data/embedded-data.js` — same catalog when `fetch` is blocked
- `data/red-interactive-ui.json` — F19 source
- `assets/fonts/` — SIL OFL Latin woff2: IBM Plex Sans, IBM Plex Mono, Libre Baskerville
- `tokens/jaryo.tokens.json` — DTCG 2025.10 export from `lab.css`. Export only; AGIW Suite and OPOS do not consume this file yet.
- `scripts/` — validators, token export, browser smoke
- `docs/` — typography, font licenses, check notes
- `spec/` — interface spec, reference screens, read-only adaptor spike
- `VERIFICATION.md` — measured results and what was not run

## Checks

Run from the repository root. These are the CI `check` job:

```bash
python3 scripts/validate_lab.py
python3 scripts/export_tokens.py --check
python3 scripts/check_assets.py
node --check lab.js
node --check lab-stages.js
node scripts/test_persistence_rules.mjs
node scripts/test_lab_dom.mjs
( cd spec && shasum -a 256 -c HASHES.txt )
```

Browser smoke uses Playwright 1.49.1. CI installs it on `ubuntu-24.04` (that pin's libraries match 24.04, not current `ubuntu-latest`). Firefox and WebKit:

```bash
SMOKE_WIDTHS=1280,375,260 node scripts/browser/smoke.mjs "$PWD" /tmp/smoke-firefox.json "" firefox
SMOKE_WIDTHS=1280,375,260 node scripts/browser/smoke.mjs "$PWD" /tmp/smoke-webkit.json "" webkit
```

Chromium forced-colors emulation (not Windows hardware):

```bash
node scripts/browser/forced-colors-smoke.mjs "$PWD" /tmp/forced-colors-emulation.json
```

## CI and Pages

`.github/workflows/ci.yml` runs on `push` and `pull_request`.

| Job | Runner | What it runs |
|---|---|---|
| `check` | `ubuntu-latest` | The commands in the first block above |
| `browsers` | `ubuntu-24.04` | Firefox and WebKit smoke at 1280, 375, and 260 |
| `forced-colors` | `ubuntu-24.04` | Chromium forced-colors emulation |

Merge only when `check`, `browsers`, and `forced-colors` are all green. Never push to main. Use a merge commit. One small pull request per concern.

GitHub Pages deploys the `main` branch, path `/`, to https://louiscalata.github.io/jaryo/. Real Safari on Apple hardware is NOT_RUN. Windows forced-colors on hardware is not tested.

## Conventions

- One small PR per concern. Do not mix unrelated fixes.
- Never push to main.
- Docs stay plain and factual. No hype, no unmeasured accessibility claims.
- US English (`color`, `license`).
- Keep both header links: the live lab and the project page.
- Copper stays EXAMPLE ONLY unless Louis changes that.

## Hard rules

- No secrets in the repo, commits, or logs.
- No Notion IDs or agent IDs in the repo.
- Honest status. A skipped or failed check is not a pass.
- No tags or releases unless Louis says yes.
- Never edit `AGIW.md`.

## Jaryo rules

- Typography reference: https://louiscalata.myportfolio.com/typography-1
- `Red interactive UI` is the F19 option set derived from that booklet. The booklet red is `#C21A27`. Body text stays ink. `#C21A27` on white passes AA for large and small text (6.05:1). On `#0c0c0c` it is 3.23:1 (large text only); small red text on dark paper must still clear 4.5:1, so adjust the dark shade only if needed and document the ratio.
- IBM Plex Sans is the card text. IBM Plex Mono is for IDs and code. Both are already bundled under the SIL OFL. See `docs/FONTS.md`.
- F18 legacy studies come from Mendacity, Plague, Brawler, and Contrails 2.0.
- Catalog counts must match `data/curated-extended.json`. The phrase is `19 families · 85 curated + 12 optional (97 total)`. `scripts/validate_lab.py` fails on stale phrases such as `17 × 5`, `85 options`, and `97 options (85 original)`.
- Accessibility gates for UI changes: axe 0 violations, CLS under 0.1, and the forced-colors emulation smoke. Do not claim screen readers, real phones, real Safari, or Windows forced-colors hardware unless those were run.

## Deeper docs

- `README.md` — how to open the lab and the current catalog line
- `docs/TYPOGRAPHY-PRINCIPLES.md` — roles, scale, and red contrast
- `docs/FONTS.md` — OFL licenses
- `docs/CHECKS.md` — what `validate_lab.py` asserts
- `VERIFICATION.md` — dated measurements
- `spec/README.md` — spec and adaptor scope
- `spec/docs/spec/JARYO-INTERFACE-SPEC.md` — interface spec
