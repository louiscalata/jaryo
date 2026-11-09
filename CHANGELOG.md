# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `spec/`: interface spec v0.5e, reference screens, read-only adaptor spike, sample pipeline, tests, and pitch page (work in progress).

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
