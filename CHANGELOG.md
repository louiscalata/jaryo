# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `spec/`: interface spec v0.5e (a design spec, not a production build), reference screens, read-only adaptor spike, sample pipeline, tests, and pitch page.
- Explicit saved-choice persistence status keeps reset failures, unreadable foreign writes, recovery controls and exported status consistent.
- `spec/`: the sample pipeline manifest declares a heartbeat (`declares.heartbeat`), the runner writes heartbeat lines while a step runs, and the adaptor judges RUNNING against the declared window instead of a built-in 120 s. Without a declared heartbeat a started step is UNKNOWN.
- `spec/`: a second read-only adaptor, `adaptor/nisi-journal-adaptor.mjs`, maps a Nisi run journal (`nisi-run-journal-v1`) and a manifest to the same `jaryo-view/0` document. It checks the journal's project against the manifest, bounds input bytes, uses Jaryo's clock, does not check the hash chain and labels the view unauthenticated.
- `spec/`: a differential check of the Nisi journal adaptor against Nisi's own reader. `adaptor/differential-nisi.mjs` generates 4,624 journal states, `pipeline/fixtures/nisi-differential-corpus.jsonl` records Nisi's verdicts for them (Nisi `3bfc6021`), and `tests/nisi-differential.test.mjs` replays them against the adaptor with no dependency on the other repository.

### Fixed

- `spec/`: the Nisi journal adaptor no longer shows RUNNING for an entry Nisi's own writer would refuse (a wrong-typed or missing field, an identifier outside Nisi's format, a float in the payload, negative zero, `retryOf` or `revokes` on the wrong state). The differential check found 120 such states.
- A save re-reads stored choices first and adopts another tab's newer write instead of overwriting it; the change is kept on screen until it is made again. The envelope format is unchanged and the re-read and write are not atomic.
- On narrow screens the next tap or key press dismisses the toast, and while it shows the page reserves its height so focused controls and the page end can scroll clear of it.
- The F06.08 hatched preview label sits on a solid plate instead of the stripes; a source check now rejects text placed directly on a gradient.

## [0.2.0] - 2026-11-09

### Added

- F18 Legacy studies (F18.01–F18.08) and F19 Red interactive UI (F19.01–F19.04).
- Extended catalog: 19 families / 97 options (`data/curated-extended.json`); original 85 unchanged.
- Lab-wide typography tokens in `lab.css` and `docs/TYPOGRAPHY-PRINCIPLES.md`.

### Notes

- Portfolio before/after source captures are not published; lab verification screenshots and JSON are.

## [0.1.0] - 2026-11-09

### Added

- Public interactive design lab for Jaryo (17 families, 85 curated options).
- System / Light / Dark theme with persistence separate from choices.
- Keyboard radiogroup and tab patterns; focus-visible rings; reduced-motion support.
- Layouts down to about 260px with no horizontal scroll in verified Chromium runs.
- Import / export / reset for choice JSON, with merge and reject rules.
- Verification receipts for smoke (32/32) and axe (0 violations) in Chromium.

### Notes

- Catalog option IDs and data content match the prior internal lab build; metadata paths were scrubbed for public release.
- Multi-tab conflict handling is not implemented.
