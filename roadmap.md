# Roadmap

Canonical roadmap for this repository.

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
- [ ] Reconcile the separate typography and expanded-sheet proposals (#36, #37) with the current layout.
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
- [ ] Review the scoped source and remaining design choices before publication.
- [ ] Verify responsive rendering, keyboard interaction, contrast and forced colors on the final native candidate.

## Native checks

Real Safari on Apple hardware, Windows forced-colors on hardware, real screen
readers and physical-phone checks remain NOT_RUN, as listed in README.md.
Chromium emulation and Playwright results do not establish those results.
Playwright's Windows Firefox and WebKit builds are no longer run in CI since the
`browsers` job moved to hosted Ubuntu; a hosted `windows-latest` job could add them back.
