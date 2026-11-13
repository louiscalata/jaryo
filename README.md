# Jaryo

Jaryo is a work-in-progress interface design lab for comparing layouts, typography and controls, saving choices in your browser, and exporting preferences. Its designs include monochrome, color and red-accent studies. It is a documentation and design tool, not a production product.

The lab explores interface ideas for [AGIW Suite](https://github.com/louiscalata/agiw-suite), [Old Phone OS](https://github.com/louiscalata/old-phone-os) and [Nisi](https://github.com/louiscalata/nisi); choosing an option here does not change those projects.

Live lab: [louiscalata.github.io/jaryo](https://louiscalata.github.io/jaryo/) · Project page: [fortheloveof.studio/code/jaryo](https://fortheloveof.studio/code/jaryo/)

Interface spec, reference screens, and a read-only adaptor spike: [`spec/`](spec/).

## Open the lab

```bash
git clone https://github.com/louiscalata/jaryo.git
cd jaryo
```

Open `index.html` in your browser. Embedded data loads if fetch is blocked.

## What’s in the lab

- 19 families · 85 curated + 12 optional (97 total). The 85 curated options are 80 monochrome (F01–F16) and 5 color (F17). The 12 optional options are 8 legacy studies (F18) and 4 Red interactive UI (F19).
- Theme: System / Light / Dark (persisted separately from choices)
- Shared typography tokens in `lab.css` (see [docs/TYPOGRAPHY-PRINCIPLES.md](docs/TYPOGRAPHY-PRINCIPLES.md)). Latin OFL faces load from `assets/fonts/`; licenses are in [docs/FONTS.md](docs/FONTS.md).
- Token export: `tokens/jaryo.tokens.json` (DTCG 2025.10), written by `scripts/export_tokens.py` from `lab.css`. Export only; AGIW Suite and OPOS do not consume this file yet.
- Layouts from about 260px wide to desktop
- Keyboard support for option groups and tabs (arrow keys, Home/End, Space)
- Reduced-motion support via `prefers-reduced-motion`
- Import / export of choice JSON; reset; recovery download when storage is malformed

### Families

| ID | Title | Options |
|---|---|---|
| F01–F16 | Monochrome set | 80 |
| F17 | Color systems | 5 |
| F18 | Legacy studies | 8 (optional) |
| F19 | Red interactive UI | 4 (optional) |

![Lab light, 1280px](docs/screenshots/lab-light-1280.png)

![Lab dark, 1280px](docs/screenshots/lab-dark-1280.png)

![Lab light, 260px](docs/screenshots/lab-light-260.png)

## Checks

```bash
python3 scripts/validate_lab.py
node scripts/test_persistence_rules.mjs
node --check lab.js
```

Browser smoke and axe scripts live under `scripts/browser/` and need Playwright. Run browser checks on the PC or hosted Linux runners; Mac checks stay browser-free (see [AGENTS.md](AGENTS.md#ci-and-browser-boundary)).

## Tested

Historical verification recorded 2026-11-09 in headless Chromium. Details: [VERIFICATION.md](VERIFICATION.md). These results do not establish a current-head pass.

- The 85 option IDs and their content are unchanged in `data/curated-85.json`.
- Extended catalog: 19 families · 85 curated + 12 optional (97 total), in `data/curated-extended.json` and `data/embedded-data.js`
- Smoke: 34/34 for legacy+typography passes; axe: 0 violations in reported modes/widths
- Package checks: `validate_lab.py`, `test_persistence_rules.mjs`, `node --check lab.js`

## Not yet tested

- Real screen readers (VoiceOver, NVDA, TalkBack)
- Real phones, cover screens, touch, OS zoom / text scaling
- Real Safari on Apple hardware: NOT_RUN.
- Fresh Firefox/WebKit engine-identity and version proof remains pending. CI configures smoke at 1280, 375 and 260, but the audited historical PC jobs logged Chromium twice; see [the browser identity correction](roadmap.md#browser-identity-correction).
- Windows forced-colors on hardware: NOT_RUN. Chromium forced-colors emulation is configured in CI and does not establish hardware results.
- Import through a real OS file picker (jsdom covers wiring)

## Known limits

- Two open tabs share one saved envelope. After another tab's storage event arrives, this tab adopts those saved choices before its next save. An unreadable write is left in place and the banner warns that saving would overwrite it. Simultaneous saves can still overwrite each other.
- On narrow screens the toast covers content for about 3 seconds
- Preview mocks stay light “paper” in dark theme by design
- Text over gradients was not hand-checked for contrast

## License

[Apache License 2.0](LICENSE). Copyright 2026 Louis Calata. See [NOTICE](NOTICE).
