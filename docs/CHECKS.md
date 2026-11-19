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

The token comparison regression module runs through `test_lab_dom.mjs` and can
also run alone without jsdom:

```bash
node scripts/test_suite_token_differential.mjs
node scripts/test_suite_token_differential_mutations.mjs
python3 scripts/check_suite_token_differential.py
```

These checks cover the offline token comparator's API/CLI boundaries, deliberately
faulty implementations, and a seeded corpus compared with a separate
standard-library oracle. Each harness removes its private temporary fixtures.
The Python command requires Node on PATH and uses only the Python standard
library. To check a supplied Suite snapshot against the saved report:

```bash
python3 scripts/check_suite_token_differential.py --export-file tokens/jaryo.tokens.json --suite-file suite.tokens.json --report-file docs/data/suite-token-differential.json
```

The standalone corpus and mutation checks do not run automatically in the Lab
runner. See [the comparison contract](SUITE-TOKEN-DIFFERENTIAL.md) for input pins,
measured results and NOT_RUN checks.

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
- `data/curated-85.json` has 17 families and 85 curated options, with unique IDs. The extended catalog's first 17 families use those same option records.
- Extended catalog phrase, in README.md, AGENTS.md, REVIEW-CHECKLIST.md, docs/CHECKS.md and the lab: 19 families · 85 curated + 12 optional (97 total)
- The README breakdown sentence (monochrome, color, legacy, Red) is derived from the extended catalog counts and must appear there.
- The family list in `index.html` matches `data/curated-extended.json`
- The summary line starts at `0 / 19 families chosen (validated)`
- F18 and F19 are present. Each of their options has provenance, and each F19 option has its color tokens.
- `data/embedded-data.js` includes F18.01 and F19.01.
- `node scripts/test_lab_dom.mjs` (it imports `scripts/test_lab_visual_contract.mjs`; run as in [AGENTS.md](../AGENTS.md#static-and-dom-checks)) rejects lab text placed directly on a CSS gradient and checks the narrow toast: the next tap or key dismisses it and the page reserves its height while it shows. These are source and jsdom checks, not rendered results.

[CI](../.github/workflows/ci.yml) configures Playwright Firefox and WebKit smoke on GitHub-hosted Ubuntu 24.04, plus hosted Chromium smoke, axe checks and forced-colors emulation. Mac checks remain browser-free. The audited historical PC jobs logged Chromium twice, so their passing counts do not prove Firefox/WebKit coverage; matching requested/actual engine names and versions (Firefox 132.0, WebKit 18.2) and the full four-job matrix are verified on `72f4e50` (push run `43667280382`) and PR head `d42ece7` (run `43665683075`), as recorded in [roadmap.md](../roadmap.md#browser-identity-correction). Hosted Ubuntu 24.04 runs for #60, #61 and #62 logged the same identities and 326/326 each (receipts in [roadmap.md](../roadmap.md#ci-availability)). A later head needs its own run.

Real Safari on Apple hardware and Windows forced-colors on hardware remain NOT_RUN. Chromium emulation does not establish those hardware results.

## Spec view regression checks

Set `TMPDIR` to a private temporary directory and `JSDOM` to an existing
jsdom package. These commands run individually from `spec/`:

```bash
node tests/adaptor.test.mjs
node tests/nisi-reader-agreement.test.mjs
node tests/nisi-journal-adaptor.test.mjs
node tests/nisi-differential.test.mjs
node tests/render.test.mjs
node tests/reference-a11y.test.mjs
node tests/generated-view.test.mjs
node tests/hash-coverage.test.mjs
node tests/view-contract.test.mjs
node tests/view-contract-harness.mjs mutations --output "$TMPDIR/mutations.json"
node tests/view-contract-harness.mjs differential --output "$TMPDIR/differential.json"
node tests/adaptor-security.test.mjs
node tests/adaptor-security-harness.mjs mutations --output "$TMPDIR/security-mutations.json"
node tests/adaptor-security-harness.mjs differential --baseline "$BASELINE_ADAPTOR" --output "$TMPDIR/security-differential.json"
```

`adaptor.test.mjs` includes the journal, reader-agreement and corpus replay
checks. The standalone reader commands above allow focused reruns without
changing the strict reader gate or its recorded corpus.

The renderer also copies `spec/` into a directory named `sp ace %41 é#q` and
runs its checks there. The generated-view check compares each committed adaptor
page with the page builder's output. It also rebuilds every embedded view from
its recorded run, historical manifest declarations and generation time. This
checks record consistency and reproducible rendering; it does not independently
establish where the historical declarations came from.

The explicit contract harness checks caller clocks, FAILED reasons, output
regions, spoken state words, review counts and inspector actions. It keeps
scratch mutants and logs in a private temporary directory and counts a mutant
only when a named contract assertion fails. The differential mode compares
generated records with expected states and reasons, both builders' clock
behavior with JavaScript Date conversion, and jsdom selections with the view
data. An optional `--baseline-root <spec snapshot>` also compares whole views
with a saved adaptor, allowing only the intended FAILED-reason change. Its
baseline comparison is separate from its expected-result checks.

`hash-coverage.test.mjs` checks tracked reference, adaptor and pipeline coverage
and runs the repository's `shasum -a 256 -c HASHES.txt` procedure. When updating
the manifest, regenerate each listed file's digest with `shasum -a 256`, include
all paths returned by `git ls-files -- pipeline`, and include new test files.
Run the coverage check after regeneration. Do not run `pipeline/run.mjs` to
refresh hashes: its recorded runs are historical inputs.

These checks use source and jsdom only. Full Lab/spec suites, native browsers,
screen readers, layout, hardware and current-head CI require separate evidence.

## Sample-record security checks

`adaptor-security.test.mjs` passes 75/75 checks. Against the original 70
checks, the pre-change adaptor at `aa39fc000de5de11dfdfb1073fc7f1b9b5ea74d1`
passed 20/70 and failed 50. The focused cases cover corrupt suffixes and
per-step recovery, foreign results, restarts, heartbeat and clock isolation,
credential redaction, private keys (including PGP blocks and orphan END
markers), ordinary filenames and empty tails. The runner redacts its full
output before keeping the last six lines, redacts every failure and review
reason, and writes run files owner-only (LOU-56). Long near-match names and
long blank runs finish within a generous time bound (LOU-89). Renderer checks also
require credentials to be absent from the generated page source and the
inspector DOM.

For the differential command above, save the pre-change adaptor in a private
temporary directory and set `BASELINE_ADAPTOR` to that module:

```bash
git show aa39fc000de5de11dfdfb1073fc7f1b9b5ea74d1:spec/adaptor/jaryo-adaptor.mjs > "$TMPDIR/baseline-adaptor.mjs"
BASELINE_ADAPTOR="$TMPDIR/baseline-adaptor.mjs"
```

The mutation mode catches 51/51 distinct behavioral mutants by named assertion
failures after successful imports. Syntax errors, failed imports and
non-assertion failures are rejected as invalid witnesses. The differential
mode uses a separate stream model for 8,192 hostile records, whole-view
comparison for 8,192 compatible records and literal expected output for 8,192
credential cases; all report zero mismatches. These are separate evidence
counts, with no claim that they are exhaustive.

The combined adaptor entry point passes 587/587 checks, including the unchanged
strict reader tests and corpus replay. Focused jsdom checks pass 51/51 renderer,
211/211 view contracts, 21/21 decisions and 16/16 reference accessibility;
generated-page checks pass 6/6. Fresh generation with the pinned Nisi reader
reproduces all 6,923 corpus cases byte-for-byte. The view contract harness
catches 40/40 adaptor and 49/49 template mutants and reports zero mismatches
for 8,192 adaptor inputs, 8,192 journal clocks, 4,137 baseline comparisons and
4,096 selections across 64 jsdom pages.

Full Lab/spec suites, hosted CI, browser smoke, axe, layout, screen readers,
physical devices, services and real pipeline runs are NOT_RUN for this check
record. Source and jsdom results do not establish those results. Each source
revision needs review and current-head CI before merge.
