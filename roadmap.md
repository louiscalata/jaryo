# Roadmap

Canonical roadmap for this repository.

## CI availability

- [x] Route Chromium forced-colors emulation to GitHub-hosted Ubuntu 24.04.
- [ ] Verify the required CI jobs on this revision before merge.

Static checks retain their existing Mac runner mapping. Firefox and WebKit
retain their existing PC runner mapping. Fork pull requests use hosted runners.

## Native checks

Real Safari on Apple hardware, Windows forced-colors on hardware, real screen
readers and physical-phone checks remain NOT_RUN, as listed in README.md.
Chromium emulation and Playwright results do not establish those results.
