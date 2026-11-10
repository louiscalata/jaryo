# Validation checks (non-browser)

Run: `python3 scripts/validate_lab.py`

Expected:
- `data/curated-85.json` has 17 families and 85 options, with unique IDs.
- Extended catalog phrase, in the README and the lab: 19 families · 85 curated + 12 optional (97 total)
- The family list in `index.html` matches `data/curated-extended.json`
- The summary line starts at `0 / 19 families chosen (validated)`
- Unique stable IDs
- Every curated option has mechanism, tradeoff, curation_rationale
- Every non-F17 option has a distinct preview renderer key in lab.js or an ascii preview
- All F17 curated options have tokens
- index.html references lab.css, lab.js, embedded-data.js
- Export payload shape keys present in lab.js
- No claim of live telemetry or an installable product in the banners

CI also runs the lab smoke on Playwright Firefox and WebKit, and a Chromium forced-colors emulation. Real Safari on Apple hardware and Windows forced-colors on hardware are not tested.
