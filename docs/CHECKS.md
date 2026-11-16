# Validation checks (non-browser)

Run from the repository root:

```bash
python3 scripts/validate_lab.py
node scripts/test_smoke_cli.mjs
node scripts/test_focus_coverage.mjs
node scripts/test_expanded_layout.mjs
node scripts/test_ci_runners.mjs
```

The Node tests check command parsing, engine-identity failure paths, focus and expanded-layout assessments with fixtures, and read `.github/workflows/ci.yml` to check runner routing and that every script it runs exists. They do not launch a browser or establish native browser behavior.

`test_expanded_layout.mjs` uses fabricated snapshot rectangles, overflow metrics
and resolved RGB styles. It imports no DOM or browser library. The existing
`test_lab_dom.mjs` runner imports it, so the configured Lab check includes it;
the standalone command above needs no jsdom. It pins root overflow assessment,
visible versus clipped overflow, translucent outline compositing, WCAG contrast,
layout and typography predicates, exact tolerances, zero-size boxes and NaN.
These tests do not exercise snapshot collection, CSS layout, reduced-motion
rendering or native forced-colors/keyboard behavior.

Optional targeted harnesses, each with a private temporary directory:

```bash
task_mutants="$(mktemp -d)"
TMPDIR="$task_mutants" node scripts/check_expanded_layout_mutations.mjs
task_differential="$(mktemp -d)"
TMPDIR="$task_differential" node scripts/check_expanded_layout_differential.mjs
```

The mutation harness syntax-checks each copied module and counts only failures
with a named test and an assertion error. It first checks an unmodified control
and retains each mutant and its log under its private temporary directory. The
differential harness compares against a separate color/alpha and clipping oracle
and explicit full-result layout expectations. Its optional
`--baseline=/absolute/path/expanded-layout.mjs` also compares public helpers with
a saved baseline module; baseline agreement is separate from oracle evidence.

Expected:
- `data/curated-85.json` has 17 families and 85 options, with unique IDs. The extended catalog's first 17 families use those same option records.
- Extended catalog phrase, in the README and the lab: 19 families · 85 curated + 12 optional (97 total)
- The family list in `index.html` matches `data/curated-extended.json`
- The summary line starts at `0 / 19 families chosen (validated)`
- F18 and F19 are present. Each of their options has provenance, and each F19 option has its color tokens.
- `data/embedded-data.js` includes F18.01 and F19.01.
- `node scripts/test_lab_dom.mjs` (it imports `scripts/test_lab_visual_contract.mjs`; run as in [AGENTS.md](../AGENTS.md#static-and-dom-checks)) rejects lab text placed directly on a CSS gradient and checks the narrow toast: the next tap or key dismisses it and the page reserves its height while it shows. These are source and jsdom checks, not rendered results.

[CI](../.github/workflows/ci.yml) configures Playwright Firefox and WebKit smoke on GitHub-hosted Ubuntu 24.04, plus hosted Chromium smoke, axe checks and forced-colors emulation. Mac checks remain browser-free. The audited historical PC jobs logged Chromium twice, so their passing counts do not prove Firefox/WebKit coverage; matching requested/actual engine names and versions (Firefox 132.0, WebKit 18.2) and the full four-job matrix are verified on `72f4e50` (push run `43667280382`) and PR head `d42ece7` (run `43665683075`), as recorded in [roadmap.md](../roadmap.md#browser-identity-correction). Hosted Ubuntu 24.04 runs for #60, #61 and #62 logged the same identities and 326/326 each (receipts in [roadmap.md](../roadmap.md#ci-availability)). A later head needs its own run.

Real Safari on Apple hardware and Windows forced-colors on hardware remain NOT_RUN. Chromium emulation does not establish those hardware results.
