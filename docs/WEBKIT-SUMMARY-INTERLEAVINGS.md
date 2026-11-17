# Browser-free WebKit summary investigation

The hosted WebKit cause is **still open**. The bounded single-page jsdom
search did not reproduce the shortfall. Application behavior and workflows
are unchanged. These checks model DOM and storage behavior; they provide no
native WebKit, rendering, hit-testing, screen-reader or device evidence.

## Source and historical evidence

The application source checked is `cb1f7c4`. The base was subsequently updated
to `18f3b12`; that update changes no page, lab, preview or catalog inputs to
these checks. The earlier base
`87e3637` and failing head `3abf9b5` have byte-identical `lab.js` and
`lab-stages.js` files:

| File | SHA-256 |
| --- | --- |
| `lab.js` | `0d6355f5057cf88db7fc27fc6271387ea8a74944d66835a064cb5142b8451232` |
| `lab-stages.js` | `065bf8de38efb63a53359784b4818bc7ffb7712bfb04dca05170ade63664db18` |

The older failing heads `3ff0174` and `3e99fc9` use a different lab source:
its SHA-256 is `a44be8d4024164616371ab93506903c43d7da1fc396c9c4f49ba65c72eeb5e3b`.
The change from either head to `3abf9b5` includes 294 insertions and 104
deletions in `lab.js`, with other differences in the page, catalog and preview
script. The replay scope below distinguishes those sources.

Historical job logs and run metadata record:

| Run / job | Observed shortfall | Evidence limits |
| --- | --- | --- |
| [43798248189 / 133071955544](https://github.com/louiscalata/jaryo/actions/runs/43798248189/job/133071955544) | `3abf9b5`, `pc-win-jaryo`, width 1280: 97 verified clicks, then 18 / 19; WebKit total 325 / 326 | Actual-engine receipt identifies WebKit 18.2. This source waits 5000 ms for the summary. Widths 375 and 260 pass. |
| [42872203855 / 130026072385](https://github.com/louiscalata/jaryo/actions/runs/42872203855/job/130026072385) | `3ff0174`, `pc-win-jaryo`, width 260: 97 verified clicks, then 18 / 19; total 44 / 45 webkit | Old positional CLI, no actual-engine identity receipt, no later 5000 ms wait. |
| [42816144872 / 129829626416](https://github.com/louiscalata/jaryo/actions/runs/42816144872/job/129829626416) | Hosted Ubuntu image `ubuntu-24.04`, width 260: 97 verified clicks, then 18 / 19; total 44 / 45 webkit | Checkout executed synthetic merge `0ffcd5b7b183a40cb33dbc38db12eab618249ec7`; API PR head is `3e99fc9`. Linux argv preserves the WebKit argument, but there is no actual-engine receipt and no later 5000 ms wait. |

All these failures lack the later missing-family diagnostics. The per-click
smoke observation checks only the current family's saved option, radio, marker,
and chosen card. It does **not** prove that previously accepted families remain
in storage at the summary read. Consequently the historical evidence does not
establish globally unchanged storage, the missing family, or the writer/banner
state. The downloaded logs contain 18 / 19 failures, not a 17 / 19 failure.

The refreshed later hosted runs are `43801219760`, `43801224982`,
`43803419245`, `43803425556`, `43804299114`, and `43804304442`; jobs are
`133081690647`, `133081786400`, `133088627196`, `133088647174`,
`133091414668`, and `133091514874`, respectively. Each logs matching
requested/actual Firefox 132.0 and WebKit 18.2 identities, totals 326 / 326
for both, and summary 19 / 19 at widths 1280, 375, and 260. These are historical
receipts at their recorded heads, not current-branch CI.

## Choice-changing paths examined

`renderSummary()` reads `choices[f.id]`; `acceptedChoiceCount()` reduces the
catalog against that in-memory map. The choice-changing paths are:

- Initial load and catalog normalization, which replace the map.
- `choose()` and validated import, which assign family entries.
- CAS conflict adoption, which replaces the map and restores the pending pick.
- Reset, which clears the map and restores it if storage removal fails.
- Foreign storage adoption/clear, which replaces or clears the map.

There is **no lab heartbeat**. `index.html` loads the embedded catalog,
`lab-stages.js`, and `lab.js`. The only lab timeout hides the toast; it does
not read or mutate choices. The heartbeat under `spec/pipeline/run.mjs` belongs
to the separate sample pipeline and is not loaded by the lab page.

## Harness and observed matrix

`scripts/test_summary_interleavings.mjs` evaluates the actual lab and preview
scripts in jsdom with `runScripts: "outside-only"`. It does not splice in an
API, call private choice functions, load URL resources, start a server, or use a
browser. Boot uses the natural DOMContentLoaded event and a controlled fetch
promise; both successful catalog fetch and embedded fallback are fixtures.

Clicks activate `.choose-label`, visit the catalog in smoke order, and toggle
the first preview's expand/collapse controls. Acceptance mirrors the current
family's smoke observation. Every sequence checkpoint additionally compares
the entire expected family map with exported choices, export count, summary
text, every summary row, and current storage. The final summary is opened and
the fake clock advances 5000 ms. The oracle reads rendered export/summary
surfaces; it does not inspect the private map directly.

Executed with Node v24.22.2 and an existing jsdom 26.1.0 package:

| Category | Cases | Scope / result |
| --- | ---: | --- |
| Single page | 12 | All 97 options at configured widths 1280, 375, 260 with timers held, microtask boundaries, or toast deadlines 3199/3200 ms; first-option forward, reverse, rotated orders plus duplicate label activations. All full-map checks pass. |
| Current foreign snapshots | 20 | Snapshot delivered at every family boundary, including before the first and after the last pick. Current storage matches the event; adoption does not write back. |
| Storage event contracts | 10 | Own writer and subsequent save, unrelated key, sessionStorage, malformed bytes and summary warning, per-key/storage-wide clear, invalid entries, foreign-adoption toast for missing keys and changed values, and non-null payload on a null-key clear event. |
| Storage failures | 3 | Save, read, and reset removal exceptions. Screen-only choices and failed-reset rollback match the contract. |
| Reset | 1 | Successful clear and the next local save. |
| Catalog | 4 | Load normalization, a foreign event while fetch is pending, catalog-mismatch reject reason, and rejection of non-string options. |
| CAS | 2 | Pending pick/conflict toast, retry clears unsaved state, duplicate retry does not write, and matching late event is skipped exactly once. The screen-only conflicts are not counted as accepted. |
| Cross-tab positive controls | 2 | Late foreign snapshots deliberately produce 18 / 19 and 17 / 19 with all 19 families still stored. |
| Nonstandard storage fault models | 2 | Delay setItem visibility until before/after the next click; at least the first click fails storage acceptance. |
| Storage load/save | 3 | Loaded last-seen baseline, empty raw text on load/save, and saved writer identity. |
| Import | 1 | Real file-input change applies incoming choices and saves the merged map. |
| **Total** | **60** | **1681 accepted / 1686 smoke-style observed clicks; 3507 full-map checkpoints.** |

The single-page category alone has 987 accepted / 987 observed clicks and 2046
full-map checkpoints, with no shortfall. Counts refer to `pick()` observations;
the storage-exception cases separately activate handlers while observation
reads would throw. The five unaccepted observations are two screen-only CAS
conflicts and three delayed-visibility fault observations, each asserted as
unaccepted. Navigation and expand/collapse activations are not counted
as option observations. Widths configure innerWidth/matchMedia, not layout or
native hit testing. The matrix is a finite deterministic search, not an
exhaustive JavaScript/WebKit scheduler or engine model.

### What the controls demonstrate

In each cross-tab control a virtual external writer writes an older snapshot
between the local save's storage read and write. The local write then stores
the complete map; its click is accepted. The older event is delivered only
after the click sequence, with the captured oldValue and historical newValue.
The handler adopts the event snapshot without writing back, and memory's
rendered summary loses families while current storage remains complete. A
further 5000 ms does not restore them. No event is dispatched reentrantly
inside the synchronous local click handler.

This explains a **possible cross-tab disagreement**, not the hosted smoke's
cause. That smoke opens a fresh context containing one page, and the retained
failure logs establish no foreign writer. The control requires an extra actor
absent from the demonstrated smoke setup. It is retained as a diagnostic
example of the existing storage adoption contract, not a proposed fix or an
assertion that the behavior is desirable.

The delayed-write controls deliberately violate synchronous localStorage
visibility. A shortfall there cannot satisfy the original observation that
every click passed the storage check. Neither control justifies changing
`lab.js` for the hosted issue.

## Added storage and import assertions

The module also checks a loaded foreign envelope followed by a local save;
empty text on load and before save; catalog-mismatch and non-string rejection;
the CAS self-writer filter; clearing pending choices after retry; the saved
envelope writer ID; conflict and foreign-adoption toast text/visibility;
value-sensitive map comparisons; warning-path summary refresh; a `key: null`
event with a non-null payload; and clearing the one-event conflict marker.
The import case drives `#import-file` through its real `change` handler with
`input.files`, checking both exported choices and persisted choices.

Expected counts are fixed per category, so omitting a case fails the run.
`JARYO_SUMMARY_CATEGORIES` can select named categories; the same fixed guards
apply to the selected subset, and unknown category names fail.

## Mutation sensitivity

`scripts/check_summary_interleavings_mutations.mjs` is part of the repository.
It changes private temporary copies of `lab.js`, runs syntax preflights, then
runs the targeted module sequentially against each source. It requires a
passing unmodified baseline. It does not mutate the working application.
The mutation set includes the original 56 storage, normalization, summary,
choice, timer, reset and import mutations plus additional distinct mutations.

| Mutation set | Valid mutants | Assertion kills | Survivors |
| --- | ---: | ---: | ---: |
| Original inventory | 56 | 53 | 3 |
| Additional mutations | 24 | 24 | 0 |
| **Total** | **80** | **77** | **3** |

All 16 previously killable gaps fail the enhanced module. There are **0**
preflight rejects, syntax rejects, timeouts, infrastructure failures, runtime
errors or invalid results. The unmodified baseline passes all **60 / 60**
cases. Source, test and harness SHA-256 hashes are recorded in the report and
checked unchanged at completion. All 80 mutated source contents are distinct.

The following three survivors are equivalent only for the click-driven
observers in this module; this is a bounded coverage statement:

- `conflict-not-quiet`: making conflict adoption announce immediately is
  hidden by the subsequent conflict toast in the same synchronous click.
- `conflict-no-refresh`: the next pick or navigation rebuilds the same DOM;
  the final choice, summary, storage and toast observations are unchanged.
- `sync-no-radio`: default label activation in these jsdom click cases checks
  the radio before the lab synchronizes the chosen card. This module does not independently call that
  synchronization function with an unchecked radio.

Mutant syntax failures, timeouts and infrastructure errors are separate from
assertion kills. A downstream page error counts only when the module fails its
explicit no-page-error assertion. Every survivor is listed above; any other
survivor makes the mutation command fail.

## Historical replay scope

| Source | Category set | Result |
| --- | --- | --- |
| Application source `cb1f7c4` | All categories | 60 / 60; 1681 accepted / 1686 observed clicks; 3507 checkpoints |
| Failing head `3ff0174` | Single page + current foreign snapshots | 32 / 32; 1367 / 1367 clicks; 2846 checkpoints |
| Failing PR head `3e99fc9` | Single page + current foreign snapshots | 32 / 32; 1367 / 1367 clicks; 2846 checkpoints |

Each older head passes all 12 single-page cases (987 / 987 observations,
2046 checkpoints) without a shortfall and all 20 foreign-current cases.
These results use each head's own page, lab, preview script and catalog.

The older trees were replayed only for `single-page` and `foreign-current`:
12 and 20 cases respectively. Storage-error copy and the other categories
were not replayed on them. In particular, the current malformed-storage banner
assertion is incompatible with the older copy. The synthetic merge
`0ffcd5b7b183a40cb33dbc38db12eab618249ec7` used by the hosted job was not
replayed; `3e99fc9` is that job's recorded PR head, not its exact checkout.
These are jsdom source replays, not native engine results or an explanation
of the hosted shortfall.

## Run the checks

From the repository root, point at an **existing jsdom 26.1.0 package**:

```sh
JARYO_JSDOM_PATH="<an existing jsdom 26.1.0 install>" node scripts/test_summary_interleavings.mjs
JARYO_JSDOM_PATH="<an existing jsdom 26.1.0 install>" node scripts/check_summary_interleavings_mutations.mjs
```

The targeted module first tries `JARYO_JSDOM_PATH`, then
`.test-deps/node_modules/jsdom`, then Node's normal `jsdom` resolution. Missing
jsdom fails the run. No dependency install is part of either command.
`--report summary.json` writes complete case records for the targeted module.
Set `TMPDIR` to a private temporary directory when sharing a machine.
`--report mutations.json` writes the mutation baseline, source hashes,
per-mutant classifications, failure details and every survivor.

To replay exactly the historical category subset, archive each head into a
separate empty temporary directory, then use that directory as the source root:

```sh
replay_dir="$(mktemp -d)"
git archive 3ff0174 index.html lab.js lab-stages.js data | tar -x -C "$replay_dir"
JARYO_SUMMARY_ROOT="$replay_dir" JARYO_SUMMARY_CATEGORIES=single-page,foreign-current JARYO_JSDOM_PATH="<an existing jsdom 26.1.0 install>" node scripts/test_summary_interleavings.mjs
```

Repeat with `3e99fc9` and a new empty directory. No external private mutation
or differential harness is needed for the numbers reported here. Earlier
28-mutant and full-source differential figures came from an external private
harness that is not in the repository; those figures are superseded here and
are not claimed reproducible from this repository.

## Validation and remaining evidence

- Targeted module: **60 / 60** cases pass.
- `node --check` for `lab.js`, `lab-stages.js` and both new scripts: pass.
- `node scripts/test_persistence_rules.mjs`: all reported groups pass.
- Ruff **0.17.4** `check --no-cache`: pass; `format --check --no-cache`:
  **4 files already formatted**. Ruff covers existing Python; no Python changed.
- `node scripts/test_ci_runners.mjs`: **17 / 17** checks pass.
- Unknown category names, including inherited-object names, are rejected.
- No dependency installs were required.

The new targeted module and mutation command are **manual checks**, not wired
into CI or `docs/CHECKS.md`. Complete Lab and Spec suites are **NOT_RUN** for
this change because the machine is shared. Native browsers, current-head CI,
forced-colors/axe, real Safari, screen readers and physical devices are also
**NOT_RUN**. Source/DOM checks cannot substitute for those results.

The next useful evidence is a hosted failure carrying the existing
missing-family diagnostics or a reproduction reachable in the fresh
single-page setup. The roadmap item remains open until that identifies the
cause.
