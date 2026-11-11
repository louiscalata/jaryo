# Jaryo

Jaryo is an adaptive black-and-white design language for interfaces onto pipelines. This repository contains the interactive design lab and the interface spec. A saved choice is a browser preference, not a product change. Demo pipelines are fictional.

Report the checks that actually ran. Use NOT_RUN with a reason for missing evidence. Source tests and browser emulation do not establish screen-reader or physical-device results.

## Repo map

- `index.html`, `lab.js`, `lab.css`, `lab-stages.js`, `lab-stages.css` — the interactive lab.
- `data/curated-85.json` — the original 17 families and 85 option records. Preserve their IDs and content; whole-file byte identity is not a historical guarantee.
- `data/curated-extended.json` and `data/embedded-data.js` — 19 families and 97 options, including optional F18/F19.
- `assets/fonts/` — bundled IBM Plex Sans, IBM Plex Mono and Libre Baskerville. Licenses: `docs/FONTS.md`.
- `tokens/jaryo.tokens.json` — DTCG export from `scripts/export_tokens.py`. An export is not proof that another product consumes it.
- `scripts/` — validators, persistence and DOM tests; browser scripts are under `scripts/browser/`.
- `spec/` — interface spec, reference screens, read-only adaptor and sample pipeline, separate from the lab.
- `spec/HASHES.txt` — tracked reference, adaptor and pipeline hashes. Update it in the same change that edits a listed file.
- `docs/` and `verification/` — design rules, dated checks and retained evidence.
- `.github/workflows/ci.yml` — authoritative CI commands and runner routing.
- `roadmap.md` — canonical scope, progress and acceptance gates. Update it when those change.
- `.nojekyll` — GitHub Pages serves the repository root as static files.

## Static and DOM checks

Run from the repository root. The DOM command requires jsdom 26.1.0. Point `JARYO_JSDOM_PATH` at an existing package, or create an isolated temporary dependency directory:

```bash
task_deps="$(mktemp -d)"
npm install --prefix "$task_deps" --ignore-scripts --no-audit --no-fund jsdom@26.1.0
export JARYO_JSDOM_PATH="$task_deps/node_modules/jsdom"
```

Then run:

```bash
python3 scripts/validate_lab.py
python3 scripts/export_tokens.py --check
python3 scripts/check_assets.py
node --check lab.js
node --check lab-stages.js
node scripts/test_persistence_rules.mjs
node scripts/test_smoke_cli.mjs
node scripts/test_lab_dom.mjs
( cd spec && shasum -a 256 -c HASHES.txt )
```

Missing jsdom is a failure. Do not report a static-only result as a DOM pass. CI installs the pinned package under `$RUNNER_TEMP/jaryo-jsdom` with package scripts disabled and passes `JARYO_JSDOM_PATH` explicitly to Lab checks. Do not replace this with a shared fixed temporary directory or a global install.

To inspect the static lab, `python3 -m http.server 8765 --bind 127.0.0.1` serves the repository. Opening `index.html` directly also supports embedded catalog data when fetch is unavailable. Do not start a server unless it is needed for the assigned task.

From `spec/`, these checks are also available:

```bash
node pipeline/check-tokens.mjs
node pipeline/check-contrast.mjs
node tests/adaptor.test.mjs
```

The adaptor test creates private temporary fixtures; it does not rewrite the tracked pipeline runs.

`tests/decisions.test.mjs reference/index.html`, `tests/render.test.mjs` and `tests/reference-a11y.test.mjs` require `JSDOM` set to a jsdom package. The sample pipeline runner writes a new JSONL file under `spec/pipeline/runs/`; leave it alone unless generating that run is the task.

## CI and browser boundary

The workflow runs on push and pull_request with four jobs. This table describes configured coverage; engine identity must also be verified in native receipts:

| Job | Same-repository event | Fork pull request | Coverage |
| --- | --- | --- | --- |
| `check` | self-hosted `mac-m5` | hosted `ubuntu-latest` | Python/Node/static/DOM checks and spec hashes |
| `browsers` | self-hosted `pc-win` | hosted `ubuntu-24.04` | Playwright 1.49.1 Firefox and WebKit smoke at 1280, 375 and 260 |
| `forced-colors` | hosted `ubuntu-24.04` | hosted `ubuntu-24.04` | Chromium forced-colors emulation |
| `chromium` | hosted `ubuntu-24.04` | hosted `ubuntu-24.04` | Chromium smoke at 1280, 375 and 260 plus default-view axe checks in light/dark at 1280 and 375 |

Audited historical `browsers` jobs for #29, #35, #44, #45, #46 and #32 each reported Chromium twice. This is consistent with legacy Windows PowerShell losing the empty positional argument; historical child argv and exact PowerShell versions were not captured. Their successful job counts remain facts, but those receipts do not prove Firefox or WebKit. The corrected CLI uses `--browser=firefox`, `--browser=webkit` or `--browser=chromium`, prints requested/actual engine and version, and fails an identity mismatch. Fresh Firefox/WebKit proof remains pending in `roadmap.md`.

Concurrency groups PR runs by PR number and cancels their superseded runs. Push runs use unique run-ID groups and are not cancelled by this rule. Keep the event name in the group so PR and push runs do not share a scheduling group. Accepted source revisions and their native CI receipts are recorded in `roadmap.md`; a later guide or source revision still needs its own current-head checks.

Never run Playwright, headless Chrome or Lighthouse on the Mac. Keep Mac checks to the static and jsdom commands above. Use the workflow's platform-specific dependency and browser commands on its PC or hosted Linux runner.

On a prepared Linux runner, the browser scripts accept these commands:

```bash
SMOKE_WIDTHS=1280,375,260 node scripts/browser/smoke.mjs "$PWD" "$RUNNER_TEMP/smoke-firefox.json" --browser=firefox
SMOKE_WIDTHS=1280,375,260 node scripts/browser/smoke.mjs "$PWD" "$RUNNER_TEMP/smoke-webkit.json" --browser=webkit
node scripts/browser/forced-colors-smoke.mjs "$PWD" "$RUNNER_TEMP/forced-colors-emulation.json"
SMOKE_WIDTHS=1280,375,260 node scripts/browser/smoke.mjs "$PWD" "$RUNNER_TEMP/smoke-chromium.json" --browser=chromium
node scripts/browser/axe-ci.mjs "$PWD" "$RUNNER_TEMP/axe-ci.json"
```

The optional screenshot directory precedes the explicit browser flag. Legacy four-positional-argument calls remain supported, but CI must not rely on an empty placeholder; an ambiguous shifted browser argument is rejected. `test_smoke_cli.mjs` checks parsing and identity failure paths without importing Playwright.

Keep the 97-option and 19-family assertions and ordinary click hit testing. Do not use force clicks, sleep workarounds or weaker assertions to make CI green. Current-head CI must pass before merge; historical passing heads do not validate a new revision.

Real Safari on Apple hardware, physical phones, screen readers and Windows forced-colors on hardware remain separate checks. Playwright WebKit and Chromium emulation do not establish those results.

## Catalog and persistence

The catalog phrase is `19 families · 85 curated + 12 optional (97 total)`. F01–F17 are curated; F18/F19 are optional. Keep README, static navigation, generated navigation and validation consistent with the catalog.

Escape catalog and storage text with `esc()` before inserting it into HTML. Choices use `jaryo-adaptive-lab-choices-v1` in localStorage with a writerId. A received foreign localStorage event adopts the saved choices without writing back; unreadable payloads keep displayed choices and warn. Ignore sessionStorage events. Clear events drop saved choices so a later save does not resurrect them. Simultaneous saves can still overwrite each other.

## Design

- Use US English in lab copy.
- Typography reference: https://louiscalata.myportfolio.com/typography-1
- F19 is Red interactive UI, derived from that booklet; booklet red is `#C21A27`.
- Preserve the contrast-checked pairs in `data/red-interactive-ui.json`; recheck and record contrast when changing a pair.
- Card titles and reading text use IBM Plex Sans. Machine IDs and spec labels use IBM Plex Mono. The comparison page includes the Libre Baskerville study.
- F18 references are Mendacity, Plague, Brawler and Contrails 2.0.
- Preserve current card flow, the named narrow family scroller, visible large IDs and the comparison specimen when reconciling later typography work. Do not load a broad override stylesheet to resolve a small change.
- For UI changes, retain axe, CLS under 0.1 and forced-colors evidence at their actual scope. In forced colors, selected and focused controls must remain visible with their text. The required CI jobs do not by themselves establish every accessibility gate.

Consult `docs/TYPOGRAPHY-PRINCIPLES.md`, `docs/FONTS.md`, `docs/CHECKS.md`, `VERIFICATION.md` and `spec/README.md` before changing their respective contracts.

## Publication and hard rules

GitHub Pages publishes `main` at `/` to https://louiscalata.github.io/jaryo/. There is no separate Pages workflow. Preserve both header links, the catalog phrase and Copper's EXAMPLE ONLY status.

- Keep one writer per file and preserve unrelated work. Use one focused PR per concern; state the full scope of an authorized cumulative maintenance PR.
- Never push directly to main. Merge only after the current required checks pass, using a merge commit. Do not change auto-merge settings or close competing PRs unless assigned that action.
- Never edit `AGIW.md`.
- No secrets, Notion page/database IDs or agent IDs in the tree, commits or logs.
- No tags or GitHub releases without Louis's explicit direction.
- Do not describe the lab as a shipped product, live telemetry or an installer, or an exported token file as a live integration without evidence.
