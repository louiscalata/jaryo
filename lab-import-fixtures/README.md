# Lab import fixtures (FICTIONAL)

Purpose: validated sample JSON files for **manual browser Import** against the standalone Jaryo adaptive design lab (`.`). Parent agents may import specific files in a real browser session later.

**These are not user preferences.** They do not fabricate user choices. F17.01 Copper is never selected here (EXAMPLE only). Catalog remains **85 curated IDs** / **170** full-history count.

Do **not** drive the lab UI via Shell / CDP / `js eval` from agents for acceptance claims.

## Files

| File | Expected lab behavior (post import-persistence fix) |
|------|------------------------------------------------------|
| `01-valid-partial-sample.json` | Merge F01–F03 SAMPLE ids; other prior families kept |
| `02-all-invalid.json` | Reject; existing selections unchanged |
| `03-empty-object.json` | Reject empty; unchanged (use Reset to clear) |
| `04-mismatched-ids.json` | Merge only valid F03; reject cross-family/unknown; keep prior others |
| `05-catalog-mismatch.json` | Merge F01; banner/status flags catalog-mismatch |
| `06-duplicate-same-as-sample.json` | Re-import same F01; unchanged count; siblings kept |
| `07-bare-map-valid.json` | Bare map form of SAMPLE F01–F03 |
| `08-malformed.txt` | Parse fail; unchanged (not a `.json` on purpose) |

## How to use (human / parent browser)

1. Serve the lab (`python3 -m http.server` in the lab dir) or open the ZIP’s `index.html`.
2. Optionally choose some families first.
3. Toolbar → **Import JSON** → pick one fixture.
4. Confirm toast + banner match the table; Summary export reflects merge, not wipe.

## Checks (agent, non-GUI)

```bash
cd .
python3 scripts/validate_lab.py
node scripts/test_persistence_rules.mjs
node --check lab.js
```
