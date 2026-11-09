# Jaryo

Jaryo is an adaptive black-and-white design language used across [AGIW Suite](https://github.com/louiscalata/agiw-suite), [OPOS](https://fortheloveof.studio/), and [Nisi](https://github.com/louiscalata/nisi).

This repository is the interactive design lab: a static local page for comparing curated options, saving choices, and exporting JSON. It is a documentation and design tool, not a production product.

Site: [fortheloveof.studio/code/jaryo](https://fortheloveof.studio/code/jaryo/)

All projects in this repository are work in progress.

Interface spec, reference screens, and a read-only adaptor spike: [`spec/`](spec/).

## Open the lab

```bash
git clone https://github.com/louiscalata/jaryo.git
cd jaryo
python3 -m http.server 8765
# open http://127.0.0.1:8765/
```

You can also open `index.html` directly. Embedded data loads if fetch is blocked.

## What’s in the lab

- 17 families, 85 curated options (80 monochrome, 5 optional color)
- Theme: System / Light / Dark (persisted separately from choices)
- Layouts from about 260px wide to desktop
- Keyboard support for option groups and tabs (arrow keys, Home/End, Space)
- Reduced-motion support via `prefers-reduced-motion`
- Import / export of choice JSON; reset; recovery download when storage is malformed

![Lab light, 1280px](docs/screenshots/lab-light-1280.png)

![Lab dark, 1280px](docs/screenshots/lab-dark-1280.png)

![Lab light, 260px](docs/screenshots/lab-light-260.png)

## Checks

```bash
python3 scripts/validate_lab.py
node scripts/test_persistence_rules.mjs
node --check lab.js
```

Browser smoke and axe scripts live under `scripts/browser/` and need Playwright.

## Tested

Verified 2026-11-09 in headless Chromium (Playwright) against a local HTTP server. Details: [VERIFICATION.md](VERIFICATION.md).

- Smoke: 32/32 passed, 0 console errors
- axe-core: 0 violations in light, dark, reduced motion, and dark + reduced motion at 260, 375, 768, and 1280 px
- All 85 options selectable at 1280 and 260 px; no horizontal overflow
- Option radiogroups and tabs: one Tab stop each; arrow keys and Home/End; Space selects
- Focus ring contrast ≥ 3:1 in light and dark
- Package checks: `validate_lab.py`, `test_persistence_rules.mjs`, `test_lab_dom.mjs`, `node --check lab.js`

## Not yet tested

- Real screen readers (VoiceOver, NVDA, TalkBack)
- Real phones, cover screens, touch, OS zoom / text scaling
- Firefox and Safari / WebKit
- Windows forced-colors mode (CSS present, not rendered)
- Import through a real OS file picker (jsdom covers wiring)

## Known limits

- Two open tabs can overwrite each other’s saved choices
- On narrow screens the toast covers content for about 3 seconds
- Preview mocks stay light “paper” in dark theme by design
- Text over gradients was not hand-checked for contrast

## License

[Apache License 2.0](LICENSE). Copyright 2026 Louis Calata. See [NOTICE](NOTICE).
