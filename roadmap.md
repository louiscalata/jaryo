# Roadmap

Canonical roadmap for this repository.

## CI availability

- [x] Route Chromium forced-colors emulation to GitHub-hosted Ubuntu 24.04.
- [x] Record the successful three-job CI matrix on the accepted maintenance revision (#45; engine-coverage qualification below).

Static checks retain their existing Mac runner mapping. Configured Firefox and
WebKit work retains its PC runner mapping; fresh engine-identity proof is pending
below. Fork pull requests use hosted runners.

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

## Browser identity correction

- [x] Preserve historical green check counts while qualifying engine coverage: all six audited accepted PC jobs listed below logged `TOTAL 45 / 45 chromium` twice, despite Firefox/WebKit step labels.
- [x] Diagnose #47 head `d0d2bce014265a1929a9032fd654c6e22b809cbf`: PC browser job `130342121894` also ran Chromium in its first command; its failure prevented the second command from running. This is not Firefox/WebKit proof.
- [x] Prepare validated explicit browser flags, browser-free CLI regression tests and requested/actual engine name plus version receipts. Preserve existing job names, runners, dependencies and assertions.
- [ ] Verify fresh Firefox and WebKit native runs with matching requested/actual identities and versions on the corrected current head.
- [ ] Verify the complete current-head CI matrix after the native failure corrections; historical job labels and synthetic checks do not satisfy this gate.

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
- [x] Prepare native smoke assertions for multiple expanded normal cards, wide F18/F19 frames, keyboard focus, clipping/overflow and forced-colors emulation at 1280, 375, 260 and 1920; native execution remains pending.
- [x] Preserve the first failing native receipts at `d0d2bce`: reduced-motion root overflow, visible-overflow misclassification and translucent forced-color outline handling require the bounded corrections under review.
- [ ] Review the scoped source and remaining design choices before publication.
- [ ] Verify responsive rendering, keyboard interaction, contrast and forced colors on the final native candidate.

## Native checks

Real Safari on Apple hardware, Windows forced-colors on hardware, real screen
readers and physical-phone checks remain NOT_RUN, as listed in README.md.
Chromium emulation and Playwright results do not establish those results.
