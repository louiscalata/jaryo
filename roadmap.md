# Roadmap

Canonical roadmap for this repository.

## CI availability

- [x] Route Chromium forced-colors emulation to GitHub-hosted Ubuntu 24.04.
- [ ] Verify the required CI jobs on this revision before merge.

Static checks retain their existing Mac runner mapping. Firefox and WebKit
retain their existing PC runner mapping. Fork pull requests use hosted runners.

## Saved choices across tabs

- [x] Adopt foreign localStorage writes without writing back; preserve visible choices for unreadable payloads and ignore sessionStorage changes.
- [x] Drop cleared saved choices before a later local save, including storage-wide clear events.
- [ ] Verify the required CI jobs on the integrated storage revision before merge.

## Maintenance integration

- [x] Integrate guarded click readiness and foreign-storage reconciliation from #35 and #29.
- [x] Reconcile catalog identity and status documentation (#23, #27), apostrophe escaping (#30), shared pitch image references (#31), and curated/optional labels (#26).
- [x] Require jsdom for DOM tests and install its pinned test dependency in CI (#25).
- [ ] Verify the required CI jobs on the cumulative maintenance revision before merge.
- [ ] Reconcile the separate typography and expanded-sheet proposals (#36, #37) with the current layout, then retain one current agent guide (#32, #39).

## Additional CI coverage

- [x] Add pull-request concurrency that cancels superseded PR runs and gives separate push runs unique groups (#33).
- [x] Add hosted Chromium smoke and axe coverage with isolated dependencies and a Mac launch refusal (#41).
- [ ] Verify the current native CI matrix, including the added Chromium job, before merge.

## Native checks

Real Safari on Apple hardware, Windows forced-colors on hardware, real screen
readers and physical-phone checks remain NOT_RUN, as listed in README.md.
Chromium emulation and Playwright results do not establish those results.
