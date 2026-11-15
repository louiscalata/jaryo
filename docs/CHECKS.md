# Validation checks (non-browser)

Run from the repository root:

```bash
python3 scripts/validate_lab.py
node scripts/test_smoke_cli.mjs
node scripts/test_focus_coverage.mjs
```

The Node tests check command parsing, engine-identity failure paths and focus assessments with fixtures. They do not launch a browser or establish native browser behavior.

Expected:
- `data/curated-85.json` has 17 families and 85 options, with unique IDs. The extended catalog's first 17 families use those same option records.
- Extended catalog phrase, in the README and the lab: 19 families · 85 curated + 12 optional (97 total)
- The family list in `index.html` matches `data/curated-extended.json`
- The summary line starts at `0 / 19 families chosen (validated)`
- F18 and F19 are present. Each of their options has provenance, and each F19 option has its color tokens.
- `data/embedded-data.js` includes F18.01 and F19.01.
- `node scripts/test_lab_dom.mjs` (it imports `scripts/test_lab_visual_contract.mjs`; run as in [AGENTS.md](../AGENTS.md#static-and-dom-checks)) rejects lab text placed directly on a CSS gradient and checks the narrow toast: the next tap or key dismisses it and the page reserves its height while it shows. These are source and jsdom checks, not rendered results.

[CI](../.github/workflows/ci.yml) configures Playwright Firefox and WebKit smoke on the PC or hosted Linux runners, plus hosted Chromium smoke, axe checks and forced-colors emulation. Mac checks remain browser-free. The audited historical PC jobs logged Chromium twice, so their passing counts do not prove Firefox/WebKit coverage; matching requested/actual engine names and versions (Firefox 132.0, WebKit 18.2) and the full four-job matrix are verified on `72f4e50` (push run `43667280382`) and PR head `d42ece7` (run `43665683075`), as recorded in [roadmap.md](../roadmap.md#browser-identity-correction). A later head needs its own run.

Real Safari on Apple hardware and Windows forced-colors on hardware remain NOT_RUN. Chromium emulation does not establish those hardware results.
