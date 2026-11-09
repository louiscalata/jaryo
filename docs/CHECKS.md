# Validation checks (non-browser)

Run: `python3 scripts/validate_lab.py`

Expected:
- 17 families × 5 options = 85
- Unique stable IDs; all IDs exist in source catalog (F01–F16 from options.json; F17 from color-batch)
- Every curated option has mechanism, tradeoff, curation_rationale
- Every non-F17 option has a distinct preview renderer key in lab.js OR ascii preview
- All F17 curated options have tokens
- index.html references lab.css, lab.js, embedded-data.js
- Export payload shape keys present in lab.js
- No claim of live telemetry / installable product in banners

**Not run here:** real browser click/keyboard/storage E2E (no browser control tools in this executor). Ask parent to arrange interactive verification if required.
