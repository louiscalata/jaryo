# Roadmap

Canonical roadmap for this repository.

The first section is the project's goal and its staged plan. The sections after it track the lab's CI, persistence and browser evidence. A box is ticked only where a receipt (a merged PR, a file in this repository or a CI job) is cited next to it. There are no dates: each stage starts when the one before it passes.

## Project goal: an interface over a pipeline you already run

Jaryo is meant to read what a pipeline already declares (steps, inputs, runs, logs), draw exactly that and nothing more, draw everything else as `? [UNKNOWN]`, and put every consequential action behind a review. The plan and its exit tests are the pitch page's ("The plan", `spec/docs/pitch/jaryo-pitch.src.html`, built to `spec/docs/pitch/jaryo-pitch.html`). Today the repository holds a design spec, two reference screens on a fictional pipeline and a read-only adaptor spike. No independent pipeline is connected, nobody outside the design process has used it, and nothing installs (`spec/README.md`, Limits).

### Stage 0: publish the design source

- [x] The spec, reference screens, adaptor and tests live in this repository under `spec/` (spec section 10, decision 5, status 2026-11-13).

### Stage 1: close the checks that need no backend

Exit: each check has a written pass or fail, and every failure is fixed or listed.

- [ ] VoiceOver pass on the reference screens. NOT_RUN. Only a markup-structure check exists (`spec/tests/reference-a11y.test.mjs`); it is not a screen-reader result.
- [ ] NVDA pass on the reference screens. NOT_RUN.
- [ ] Run the reference screens on a physical iPhone, including the home-screen launch and its safe-area padding. NOT_RUN. The simulator evidence in `spec/docs/evidence/ios/` is not a physical device.
- [ ] Native file-picker Esc check, by hand. NOT_RUN.

### Stage 2: one real pipeline, read-only

Exit: for a named real pipeline, a fixture that omits one referenced step and one status from the adaptor output renders them as UNKNOWN; every step and state shown matches the pipeline's own run record; a deliberate guess-a-status change makes a test fail.

Done, on pipelines this project wrote or generated:

- [x] Read-only adaptor spike on a self-authored sample pipeline: manifest plus run record to a `jaryo-view/0` document (`spec/adaptor/jaryo-adaptor.mjs`, `spec/pipeline/`, `spec/docs/adaptor/ADAPTOR-V0.md`). A state is copied from the record, a declared step with no record is UNKNOWN, and a record for an undeclared step is shown unnamed. The sample is not independent evidence (ADAPTOR-V0, first paragraph).
- [x] The manifest declares the heartbeat that makes RUNNING possible; without one a started step is UNKNOWN (#56, `d42ece7`; merge `72f4e50`).
- [x] Second read-only adaptor for the Nisi run journal (`nisi-run-journal-v1`), merged as #60 (`bd45bd4`). It labels the view unauthenticated, bounds input at 4 MiB, uses Jaryo's clock and does not check the hash chain.
- [x] Reader-based differential for the Nisi adaptor. `spec/pipeline/fixtures/nisi-differential-corpus.jsonl` now records 6,923 states from Nisi `276ed7e5`, including 2,297 reader-specific cases. The adaptor agrees on all 2,260 complete, listable states and has no hard false-RUNNING disagreements; 185 step instances within the documented 60 s clock allowance remain intentional. RUNNING now requires the reader-held prefix and a header clock within that allowance. Tests first reproduced the header, prefix and canonical-record defects; the reader suite passes 174 assertions and kills 52 distinct mutants. `spec/tests/adaptor.test.mjs` passes 476/476 combined checks. Separate generated checks cover 12,000 forged states and 3,000 Nisi-writer journals with no mismatches. See ADAPTOR-V0 for counts, boundaries and NOT_RUN evidence.
- [x] Spec v0.6 adds a sixth state, FAILED, apart from BLOCKED, and writes down where a state comes from (spec sections 2, 5, 6.7 and 6.9); the view template and `check-contrast.mjs` follow (#69, `87e3637`; merged). This closes ADAPTOR-V0 findings 1 to 3.

- [x] Fix selection of recorded results with empty output, retain FAILED reason lines in the adaptor example, reject invalid caller clocks in both view builders, and pin the accessible FAILED word and review count. Combined targeted checks pass 517/517 adaptor, 360/360 journal, 226/226 reader (174 contracts and 52 assertion-killed mutants), 33/33 corpus replay, 48/48 renderer including the copied special-character path, 16/16 reference accessibility, 211/211 focused view contracts and 4/4 generated-page checks. The strict reader source and agreement corpus are unchanged; fresh generation from the pinned reader reproduces all 6,923 cases byte-for-byte. These are source and jsdom results (`spec/tests/`; commands and scope in `docs/CHECKS.md`).
- [x] Cover all 12 tracked pipeline files in the integrity manifest. All 35 hashes verify and coverage checks pass 26/26 (`spec/HASHES.txt`, `spec/tests/hash-coverage.test.mjs`). Historical run files are unchanged.
- [x] Check the view changes with 40/40 adaptor and 49/49 template mutants caught by named assertions, 8,192 generated adaptor inputs, 8,192 journal clock checks, 4,137 whole-view baseline comparisons and 4,096 template selections across 64 jsdom pages, with 0 differential mismatches (`spec/tests/view-contract-harness.mjs`). Full Lab/spec suites, hosted CI, native browsers, layout, screen readers and physical devices are NOT_RUN for this check record.
- [x] Invalidate earlier sample-record evidence after corrupt JSONL. When the selected run-start has an explicit run ID, ignore explicitly mismatched event IDs; events without run IDs remain eligible. When the selected run-start has no run ID, tagged events are also accepted, so this path does not establish run isolation. Redact captured credentials before view construction. Preserve the existing per-step declared-heartbeat rule, strict Nisi reader, caller-clock bounds, FAILED reasons and renderer review behavior. Focused security checks pass 70/70 (pre-change adaptor: 20/70), catch 48/48 distinct behavioral mutants and report zero mismatches for 8,192 hostile records, 8,192 compatible whole views and 8,192 credential cases. The combined adaptor entry point passes 587/587; renderer 51/51, view contracts 211/211, decisions 21/21, reference accessibility 16/16 and generated views 6/6 pass. Fresh generation reproduces the pinned 6,923-case reader corpus byte-for-byte. All adaptor snapshots replay their historical declarations and times. Commands and limits are in `docs/CHECKS.md`; full Lab/spec suites, hosted CI, browser/layout checks, screen readers and physical devices are NOT_RUN for this check record. Review and current-head CI are required for each source revision.

Not done:

- [ ] Owner confirmation of spec v0.6. The spec header states v0.6 is "not yet reviewed or confirmed by the owner", and section 10 lists FAILED under "Proposed in v0.6". The 15 Codex rounds cover v0.5e only.
- [ ] Show a FAILED step on the app reference screen. `spec/reference/index.html` and `spec/reference/hero.html` are still v0.5e and have no FAILED rendering; only the adaptor view pages do.
- [ ] Write down the host, adaptor and state boundaries, and what an adaptor must declare (steps, links between them, inputs, runs, logs, actions, and the reason for any it lacks). ADAPTOR-V0 records what the two spikes read; it is not yet a contract for a pipeline someone else wrote.
- [ ] Choose the first real pipeline (open decision below).
- [ ] Choose the install route (open decision below).
- [ ] Connect one independent, named pipeline and render it, then meet the exit test above. The adaptor and reader-boundary mutants in ADAPTOR-V0 show the guess-a-status rule holds for the two spikes; they are not that exit test.
- [ ] Test the Nisi journal adaptor on a journal from a real Nisi run, not only synthetic and generated ones; regenerate the corpus when Nisi changes.
- [ ] Refresh the pitch page's figures. It is dated v0.5e, 2026-11-07, and still quotes "63 adaptor checks" and "21 renderer checks" and says the spec has no failed state, where ADAPTOR-V0 now records 245 combined adaptor checks, 27 renderer checks and spec v0.6.

### Stage 3: test with people

Exit: each task has a pass rule written beforehand (the pitch's example is 4 of 5 complete it unaided), and failures are fixed before stage 4.

- [ ] Choose the tasks and write their pass rules. Proposed: about five visually oriented users who do not use a terminal; five is a starting number, not a sample size. Tasks such as finding why a run is blocked and cancelling a review.
- [ ] Run the sessions. No user test has been done; the only human input so far is the owner's 17 design picks and five behaviour decisions.

### Stage 4: gated actions

Exit: a gated run completes, and a cancelled or refused one leaves the pipeline untouched, on two different pipelines.

- [ ] Enable one declared action, such as retry, behind the review gate against a sandbox pipeline, and decide who may run actions. No action runs today; the adaptor and pages are read-only.
- [ ] Repeat the stage 2 test on a second, different pipeline.

### Stage 5: make it installable

Exit: three people who did not build it install it on their own pipeline and reach a first view without help.

- [ ] Replace the placeholder install line and connect path with real ones. Nothing installs today.

### Decisions needed from the owner

- [ ] Install route: CLI, MCP, or an MCP-Apps-style host. MCP alone does not draw a UI; the pitch's landscape section suggests riding an existing protocol.
- [ ] First real pipeline: not chosen. Spec decision 5 keeps the lab separate from AGIW Suite, so a pipeline outside it is the default; the AGIW inference monitor fits only if that separation is lifted, and the lab notes disagree on it.
- [ ] Maintenance ownership: confirm who maintains the spec, screens and tests.
- [ ] Confirm or reject FAILED as a sixth state (spec v0.6).
- [ ] Go or hold. The pitch recommends going to stage 1 and then stage 2, and building no more screens before a real pipeline is connected.

## CI availability

- [x] Route Chromium forced-colors emulation to GitHub-hosted Ubuntu 24.04.
- [x] Record the successful three-job CI matrix on the accepted maintenance revision (#45; engine-coverage qualification below).
- [x] Route the required Firefox/WebKit `browsers` job to GitHub-hosted Ubuntu 24.04 for every event. The self-hosted PC runner `pc-win-jaryo` is offline, so the `browsers` jobs for #57, #58 and #59 stayed queued. This replaced the earlier PC runner mapping; `scripts/test_ci_runners.mjs` checks the routing.
- [x] Record hosted Ubuntu 24.04 Firefox and WebKit receipts (requested/actual identity, version, totals) from the hosted `browsers` job. Every job below ran on image `ubuntu-24.04` and logged `BROWSER {"requested":"firefox","actual":"firefox","version":"132.0"}` with `TOTAL 326 / 326 firefox`, then `BROWSER {"requested":"webkit","actual":"webkit","version":"18.2"}` with `TOTAL 326 / 326 webkit`: #61 head `c9e56a6`, push run `43801219760` job `133081690647` and pull-request run `43801224982` job `133081786400`; #60 head `3553372`, push run `43803419245` job `133088627196` and pull-request run `43803425556` job `133088647174`; #62 head `e868510`, push run `43804299114` job `133091414668` and pull-request run `43804304442` job `133091514874`. These are Playwright 1.49.1 Linux builds at those three heads only; each later head needs its own run, and they are not real Safari. The #56 receipts came from Playwright's Windows builds on `pc-win-jaryo` and do not cover the Linux builds.
- [ ] Find the cause of the intermittent WebKit summary shortfall. After every one of the 97 clicks was verified in the DOM and in storage, the summary can still read 18 / 19 (or 17 / 19) even after the 5 s wait. Seen only in WebKit, on `pc-win-jaryo` (push job `133071955544` at `3abf9b5`, 1280; job `130026072385`, 260) and on hosted Ubuntu 24.04 (job `129829626416`, 260). The PR run of the same `3abf9b5` head passed 326/326. A failing summary check now logs which family differs in the summary and in storage, plus the stored writerId, banner and toast text (failure-only diagnostics, #62). The six hosted runs recorded above all passed WebKit 326/326, so the shortfall did not recur there and the new diagnostics have not captured a failure yet. This stays open: the cause and a browser-free reproduction are not found.

Static checks retain their existing Mac runner mapping. Firefox and WebKit smoke
runs on GitHub-hosted Ubuntu 24.04; native Firefox and WebKit identity is verified
on hosted runs for #60, #61 and #62 (above) and, for Windows builds, for #56 at
`72f4e50` (receipts below). Each later head needs its own run. Fork pull requests
use hosted runners.

## Saved choices across tabs

- [x] Adopt foreign localStorage writes without writing back; preserve visible choices for unreadable payloads and ignore sessionStorage changes.
- [x] Drop cleared saved choices before a later local save, including storage-wide clear events.
- [x] Verify the integrated storage revision in #29 and the cumulative maintenance revision in #45 (receipts below).

## Maintenance integration

- [x] Integrate guarded click readiness and foreign-storage reconciliation from #35 and #29.
- [x] Reconcile catalog identity and status documentation (#23, #27), apostrophe escaping (#30), shared pitch image references (#31), and curated/optional labels (#26).
- [x] Require jsdom for DOM tests and install its pinned test dependency in CI (#25).
- [x] Record all six successful push/PR checks on the cumulative maintenance revision (#45; engine-coverage qualification below).
- [x] Reconcile the separate typography and expanded-sheet proposals (#36, #37) with the current layout. Both PRs are CLOSED, unmerged. The compatible expanded-layout parts were adapted in #47 (merge `19e3c56`); #47's description calls it a partial reconciliation and defers #36's conflicting global hierarchy (open item under "Visual reconciliation candidate").
- [x] Retain the current agent guide in #32 after all eight current-head checks passed; #39 is superseded (receipt below).

## Additional CI coverage

- [x] Add pull-request concurrency that cancels superseded PR runs and gives separate push runs unique groups (#33).
- [x] Add hosted Chromium smoke and axe coverage with isolated dependencies and a Mac launch refusal (#41).
- [x] Record all eight successful push/PR checks on the added-coverage revision, including hosted Chromium (#46; engine-coverage qualification below).

## Accepted source and CI receipts

These job-name receipts apply to the tested heads listed here. Successful counts
do not establish which engine ran: the audited historical browser jobs below
were Chromium-only. An original proposal's ancestry or an older passing run does
not validate a later revision.

| PR | Tested head | Accepted merge | CI job result |
| --- | --- | --- | --- |
| [#29](https://github.com/louiscalata/jaryo/pull/29) | `c3d6453eb88f526eb3593809452c5ddf9d06dcc5` | `e5df3f238ec601b9ebf512605cb801ba9e07bfa3` | 6/6 SUCCESS: check, browsers and forced-colors on push and PR |
| [#45](https://github.com/louiscalata/jaryo/pull/45) | `cef74771912a20d9f4d12e80e0dc02026c405565` | `5a0ed3f22c2875b8e882368c96240165c5fe7860` | 6/6 SUCCESS: check, browsers and forced-colors on push and PR |
| [#46](https://github.com/louiscalata/jaryo/pull/46) | `a7fc8fbcdf232424a7ea1235c4478d060a11e986` | `ccc96b96eb345b7cb36930940945f7ca0266e265` | 8/8 SUCCESS: check, browsers, forced-colors and chromium on push and PR |
| [#32](https://github.com/louiscalata/jaryo/pull/32) | `808cb450ced78b0a0ac2af2a374b1d8202e2ff43` | `52e5576895a469f4edcbb4db2405d90845171699` | 8/8 SUCCESS: check, browsers, forced-colors and chromium on push and PR |
| [#56](https://github.com/louiscalata/jaryo/pull/56) | `d42ece7bf735c33fb8982a813dcb0dfbbec8c858` | `72f4e50461d63a57dda0bdae897cfcfc78e16a55` | 8/8 SUCCESS: check, browsers, forced-colors and chromium on push (run `43667280382`) and PR (run `43665683075`); native engine identity below |

## Browser identity correction

- [x] Preserve historical green check counts while qualifying engine coverage: all six audited accepted PC jobs listed below logged `TOTAL 45 / 45 chromium` twice, despite Firefox/WebKit step labels.
- [x] Diagnose #47 head `d0d2bce014265a1929a9032fd654c6e22b809cbf`: PC browser job `130342121894` also ran Chromium in its first command; its failure prevented the second command from running. This is not Firefox/WebKit proof.
- [x] Prepare validated explicit browser flags, browser-free CLI regression tests and requested/actual engine name plus version receipts. Preserve existing job names, runners, dependencies and assertions.
- [x] Verify fresh Firefox and WebKit native runs with matching requested/actual identities and versions on the corrected current head. Push run `43667280382` at `72f4e50` (#56 merge), PC job `132669362830` on runner `pc-win-jaryo` (self-hosted, `pc-win`), logged `BROWSER {"requested":"firefox","actual":"firefox","version":"132.0"}` then `TOTAL 326 / 326 firefox`, and `BROWSER {"requested":"webkit","actual":"webkit","version":"18.2"}` then `TOTAL 326 / 326 webkit`. PR run `43665683075` at head `d42ece7`, PC job `132664397157` on the same runner, logged the same identities, versions and totals. These are Playwright 1.49.1 builds at these two heads only, not real Safari.
- [x] Verify the complete current-head CI matrix after the native failure corrections; historical job labels and synthetic checks do not satisfy this gate. Push run `43667280382` at `72f4e50`: check, browsers, chromium (`chromium` 131.0.6778.33, `TOTAL 326 / 326 chromium`) and forced-colors (`TOTAL 162 / 162 chromium-forced-colors-emulation`) all SUCCESS. PR run `43665683075` at `d42ece7`: the same four jobs SUCCESS.
- [x] Verify card-wide selection and native Firefox/WebKit smoke on the revised head. Job `131363037421` recorded Firefox 132.0 at 323/324, with F07.03 and F15.02 clicks landing on non-selecting card DIVs at 1280; the job exited before WebKit ran. At `72f4e50`, PC job `132669362830` logged `PASS all options selectable by click` with 97 of 97 clicked and no failures at 1280, 375 and 260 in both Firefox and WebKit. Browser-free regression covers card selection and control exclusions, not native hit testing.

| Accepted PR | Audited PC browser job | Native engine result |
| --- | --- | --- |
| #29 | `130310065781` | 45/45 Chromium, twice |
| #35 | `130309511897` | 45/45 Chromium, twice |
| #44 | `130305049485` | 45/45 Chromium, twice |
| #45 | `130317925273` | 45/45 Chromium, twice |
| #46 | `130328444114` | 45/45 Chromium, twice |
| #32 | `130333836919` | 45/45 Chromium, twice |

These native receipts directly establish Chromium execution. The command/parser
source and a browser-free argv probe are consistent with legacy empty-argument
loss; historical child argv and exact PowerShell versions were not captured.

## Visual reconciliation candidate

- [x] Adapt only the compatible expanded booklet title and preview/notes treatment from #36/#37; preserve current normal cards, folios, named scroller and contrast tokens.
- [x] Retain two-track expanded normal cards and full-width wide-family frames with notes below; defer #36's conflicting global hierarchy.
- [x] Prepare native smoke assertions for multiple expanded normal cards, wide F18/F19 frames, keyboard focus, clipping/overflow and forced-colors emulation at 1280, 375, 260 and 1920. Native execution passed at `72f4e50` (push run `43667280382`) and PR head `d42ece7` (run `43665683075`): every expanded-layout and keyboard check at all four widths, 1920 included, passed in light and dark in Firefox 132.0 and WebKit 18.2 (browsers jobs `132669362830` and `132664397157`) and in Chromium (job `132669362970`), and in forced-colors emulation (job `132669363006`). Later heads need their own run.
- [x] Preserve the first failing native receipts at `d0d2bce`: reduced-motion root overflow, visible-overflow misclassification and translucent forced-color outline handling require the bounded corrections under review.
- [x] Add browser-free expanded-layout assessment regressions and wire them into the existing `test_lab_dom.mjs` runner. Checks on the unchanged assessment module from `87e3637`: 193/193 regression cases (189 builder cases plus 4 gap tests from the independent verification), 63/63 assertion-killed behavioral mutants, 1,036/1,036 differential oracle checks plus 85/85 saved-baseline comparisons, 17/17 CI routing and 35/35 focus cases. Ruff 0.17.4 check and format pass. Harness commands and evidence limits are in [docs/CHECKS.md](docs/CHECKS.md). No production module or workflow change was needed. Full Lab/spec suites and native checks remain NOT_RUN for this staged change; independent verification and landing follow separately.
- [x] Review the scoped source before publication. The Codex code and security reviews of #47 completed on head `a67dec4` with no findings (PR comment, 2026-11-11), and #47 was merged by the owner as `19e3c56`. This is advice from a reviewer model plus the owner's merge, not a user test.
- [ ] Decide whether to adopt #36's conflicting global typography hierarchy. #47 deferred it and #36 was closed unmerged, so the current layout keeps its own hierarchy until the owner decides.
- [x] Verify responsive rendering, keyboard interaction, contrast and forced colors on the native candidate. The receipt is the third item above: expanded-layout, keyboard-focus and title/outline contrast checks at 1280, 375, 260 and 1920 in light and dark passed in Firefox 132.0, WebKit 18.2 and Chromium (push `72f4e50`, PR head `d42ece7`), and in Chromium forced-colors emulation. The lab source (`index.html`, `lab.js`, `lab.css`, `lab-stages.js`, `lab-stages.css`, `data/`) has no commit since `72f4e50`, and the hosted runs at #60, #61 and #62 heads logged 326/326 for Firefox and WebKit again. This covers emulation and Playwright builds only; real Safari, Windows forced-colors hardware, screen readers and physical phones stay NOT_RUN (Native checks, below).

## Native checks

Real Safari on Apple hardware, Windows forced-colors on hardware, real screen
readers and physical-phone checks remain NOT_RUN, as listed in README.md.
Chromium emulation and Playwright results do not establish those results.
Playwright's Windows Firefox and WebKit builds are no longer run in CI since the
`browsers` job moved to hosted Ubuntu; a hosted `windows-latest` job could add them back.
