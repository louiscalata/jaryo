# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `spec/`: interface spec v0.6 (a design spec, not a production build; reference screens are still v0.5e), reference screens, read-only adaptor spike, sample pipeline, tests, and pitch page (v0.6 in #69).
- Explicit saved-choice persistence status keeps reset failures, unreadable foreign writes, recovery controls and exported status consistent (#49).
- `spec/`: the sample pipeline manifest declares a heartbeat (`declares.heartbeat`), the runner writes heartbeat lines while a step runs, and the adaptor judges RUNNING against the declared window instead of a built-in 120 s. Without a declared heartbeat a started step is UNKNOWN (#56).
- `spec/`: a second read-only adaptor, `adaptor/nisi-journal-adaptor.mjs`, maps a Nisi run journal (`nisi-run-journal-v1`) and a manifest to the same `jaryo-view/0` document. It checks the journal's project against the manifest, bounds input bytes, uses Jaryo's clock, does not check the hash chain and labels the view unauthenticated (#60).
- `spec/`: a differential check of the Nisi journal adaptor against Nisi's own reader. `adaptor/differential-nisi.mjs` generates 4,624 journal states, `pipeline/fixtures/nisi-differential-corpus.jsonl` records Nisi's verdicts for them (Nisi `3bfc6021`), and `tests/nisi-differential.test.mjs` replays them against the adaptor with no dependency on the other repository (#66).
- `docs/python-style.md` and `ruff.toml` set one Python convention (Ruff, line length 120, double quotes, Python files only). CI's check job runs `ruff check` and `ruff format --check` with Ruff pinned at 0.17.4 (#57).
- `scripts/browser/static-server.mjs`, one loopback-only static server that stays inside the lab root, and `scripts/test_static_server.mjs`, a browser-free test that runs in the check job (#58).
- `scripts/test_ci_runners.mjs` reads `ci.yml` without a YAML dependency. It fails if a blocking job targets an offline self-hosted label, if a Playwright job targets the Mac, or if the browsers job loses its hosted runner, timeout, apt dependencies, engines or widths (#61).
- Token and spec checks detect unclassified declarations (including a last declaration with no semicolon and custom property names outside `[A-Za-z0-9-]`) and dark-theme drift. `spec/pipeline/check-tokens.mjs` scans every spec HTML file for colors. CI runs the token export test and the spec checks (#53).
- When a browser smoke check fails it records what failed: the click and change targets and each selection value (`1363df8`, #50), and, for the WebKit summary check, the families whose summary row or stored choice differs, the stored map and writerId, and the banner, toast and live-region text (#62). A passing check logs what it logged before.

### Changed

- The required Firefox and WebKit `browsers` job runs on GitHub-hosted `ubuntu-24.04` for every event, with `--with-deps` and a 30-minute timeout. The self-hosted `pc-win-jaryo` runner it used is offline, and the Windows PowerShell steps are gone. The smoke commands, widths and Playwright 1.49.1 pin are unchanged (#61).
- The four remaining Python scripts are reformatted with `ruff format` and nothing else (#57).
- `README.md` and `AGENTS.md` list the same check commands as CI (#53); `AGENTS.md`, `README.md`, `VERIFICATION.md` and `docs/CHECKS.md` say how the browsers job runs (#61).
- `spec/`: spec v0.6 adds a sixth state, FAILED (proposed, awaiting the owner's confirmation), with its own word and shape and no new colour, and writes down where a state comes from (a step with no record is UNKNOWN; RUNNING needs a declared heartbeat). The adaptor view template and the three `reference/adaptor-view*.html` pages style FAILED apart from BLOCKED, `check-contrast.mjs` gains one pair, and `tests/render.test.mjs` pins the difference. Closes adaptor findings 1 to 3 (#69).

### Removed

- `scripts/curate_and_build.py`. It expected the removed `adaptive-design-lab/` layout, stopped with `FileNotFoundError` on `options.json`, and nothing referenced it (#57).

### Fixed

- Clicking the passive part of an option card selects the option through the same change path as the radio. Before, only the radio and the Expand button were handled, and two CI clicks (F07.03, F15.02) landed on the card and did not select. Labels, Expand and preview controls keep their own behaviour (`af065d3`, #50).
- Preview controls (frame width, tone, alignment, picks, cycle position, disclosure) keep their state when the lab rebuilds its cards. Before, switching family, Reset, Import or a change from another tab returned them to their defaults (#48).
- A successful save clears stale diagnostics. Reset removes the storage key, and an empty envelope with a different catalog version loads as no saved selections instead of malformed. Pressed preview buttons use system highlight colors in forced colors, the F13.07 trace runs once, and a card is not selected when a text selection ends inside it (#52).
- The browser smoke pages are served by the shared loopback-only server. The five browser scripts each had an inline server that bound every interface and joined the raw request path onto the lab directory, so a path such as `/../jaryo-pw/x.txt` could read a sibling directory, and a malformed escape or a directory path ended the run (#58).
- `spec/`: `pipeline/run.mjs` and four spec tests failed in a checkout whose path has a space, because they built paths from the percent-encoded `URL.pathname`. They use `fileURLToPath`. The adaptor's main-module check never matched a path with a space, a symlink or a Windows drive path, so its CLI printed nothing and exited 0. It now compares against `pathToFileURL(realpath(argv[1])).href`, and a new adaptor test runs both CLIs from a directory with a space in its name (#64).
- `spec/`: the Nisi journal adaptor no longer shows RUNNING for an entry Nisi's own writer would refuse (a wrong-typed or missing field, an identifier outside Nisi's format, a float in the payload, negative zero, `retryOf` or `revokes` on the wrong state). The differential check found 120 such states (#66).
- A save re-reads stored choices first and adopts another tab's newer write instead of overwriting it; the change is kept on screen until it is made again. The envelope format is unchanged and the re-read and write are not atomic (#54).
- On narrow screens the next tap or key press dismisses the toast, and while it shows the page reserves its height so focused controls and the page end can scroll clear of it (#55).
- The F06.08 hatched preview label sits on a solid plate instead of the stripes; a source check now rejects text placed directly on a gradient (#55).

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
