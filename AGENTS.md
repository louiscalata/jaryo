# Jaryo

Jaryo is an adaptive black-and-white design language for interfaces onto pipelines. This repository is the design lab and the interface spec. It is a documentation tool. A saved choice is a preference, not a product change. Demo pipelines are fictional. Nothing here installs.

Say what you ran. If you did not run a check, write NOT_RUN and the reason. Do not invent measurements, screen-reader passes, or device results.

## Repo map

- `index.html`, `lab.js`, `lab.css`, `lab-stages.js`, `lab-stages.css` — the interactive lab
- `data/` — catalogs. `data/curated-85.json` stays byte-stable. The extended catalog is `data/curated-extended.json` and `data/embedded-data.js`
- `assets/fonts/` — IBM Plex Sans, IBM Plex Mono, and Libre Baskerville (OFL). Licenses: `docs/FONTS.md`
- `tokens/jaryo.tokens.json` — DTCG export from `scripts/export_tokens.py`. Export only; other repos do not consume it yet
- `scripts/` — validators, persistence and DOM tests, Playwright smoke under `scripts/browser/`
- `spec/` — interface spec, reference screens, read-only adaptor, and a sample pipeline. Separate from the lab
- `spec/HASHES.txt` — sha256 of the tracked reference, adaptor, and pipeline files. Update it only in the change that edits those files
- `docs/` — typography, font licenses, checks, screenshots
- `verification/` — recorded smoke and axe results
- `.github/workflows/ci.yml` — CI
- `.nojekyll` — Pages serves the repository root as static files

## Commands

From the repository root:

```bash
python3 scripts/validate_lab.py
python3 scripts/export_tokens.py --check
python3 scripts/check_assets.py
node --check lab.js
node --check lab-stages.js
node scripts/test_persistence_rules.mjs
node scripts/test_lab_dom.mjs
```

`test_lab_dom.mjs` runs its DOM cases when jsdom resolves (`JARYO_JSDOM_PATH`, `/tmp/jsdom-install/node_modules/jsdom`, or `node_modules/jsdom`). Without jsdom the static asserts still run and the DOM cases are skipped.

Open the lab:

```bash
python3 -m http.server 8765
```

Then open http://127.0.0.1:8765/ . Opening `index.html` from disk also works. Embedded data loads if fetch fails.

From `spec/`:

```bash
shasum -a 256 -c HASHES.txt
node pipeline/check-tokens.mjs
node pipeline/check-contrast.mjs
node tests/adaptor.test.mjs
```

These three need `JSDOM` set to a jsdom package. They do not start without it:

```bash
node tests/decisions.test.mjs reference/index.html
node tests/render.test.mjs
node tests/reference-a11y.test.mjs
```

The sample pipeline runner writes a new JSONL file under `spec/pipeline/runs/`. Leave it alone unless that new run file is the task.

## CI and Pages

`.github/workflows/ci.yml` runs on push and pull_request. The required checks are the three jobs:

- `check` — Node 22, the root command block above, and `shasum -a 256 -c HASHES.txt` from `spec/`
- `browsers` — Playwright 1.49.1 Firefox and WebKit smoke at 1280, 375, and 260 (`scripts/browser/smoke.mjs`)
- `forced-colors` — Chromium forced-colors emulation (`scripts/browser/forced-colors-smoke.mjs`)

GitHub Pages publishes the `main` branch root at https://louiscalata.github.io/jaryo/ . There is no Pages workflow. `scripts/check_assets.py` checks the lab's relative links for that publish.

Real Safari on Apple hardware: NOT_RUN. Windows forced-colors on hardware: NOT_RUN. Those CI jobs are Playwright and Chromium emulation, not those devices. Playwright was NOT_RUN while this file was written. CI runs it.

## Conventions

- Keep a diff small. Lab visuals, spec claims, and catalogs are often in flight on other branches.
- Family counts come from `data/curated-extended.json`. The phrase is `19 families · 85 curated + 12 optional (97 total)`.
- `data/curated-85.json` stays byte-stable.
- Escape catalog and storage text with `esc` in `lab.js` before it is inserted into HTML.
- Choices persist in `localStorage` under `jaryo-adaptive-lab-choices-v1`, in an envelope that includes `writerId`. Another tab's `storage` event must adopt that write, or warn when it cannot be read, and must not write back from the handler.
- Do not describe the lab as a shipped product, live telemetry, or an installer.

## Hard rules

- Never edit `AGIW.md`.
- No secrets. No Notion page IDs, database IDs, or agent IDs anywhere in the tree.
- Honest NOT_RUN. Do not mark a screen reader, a physical phone, Safari on Apple hardware, or Windows forced-colors as done unless that run happened.
- No git tags and no GitHub releases without Louis's yes.

## Design

- Typography reference: https://louiscalata.myportfolio.com/typography-1
- Red interactive UI (F19) is the option set derived from that booklet. Booklet red is `#C21A27`.
- Card titles and reading text use IBM Plex Sans. IDs, nav, and spec lines use IBM Plex Mono.
- The other references are Mendacity, Plague, Brawler, and Contrails 2.0. They are the F18 Legacy studies.
- Accessibility gates: axe 0 violations, CLS under 0.1, and forced-colors. In forced-colors the selected control and the focused control stay visible, with their text.

Screen reds for F19 are the contrast-checked pairs in `data/red-interactive-ui.json`. Do not replace those pairs with booklet red unless contrast is rechecked. Full type rules: `docs/TYPOGRAPHY-PRINCIPLES.md`.
