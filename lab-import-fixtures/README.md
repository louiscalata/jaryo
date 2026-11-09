# Lab import fixtures

Sample JSON files for testing the lab’s Import control. They are fictional. They are not user preferences. F17.01 Copper is never selected here (example only).

## Files

| File | Expected behavior |
|------|-------------------|
| `01-valid-partial-sample.json` | Merge F01–F03 sample ids; other prior families kept |
| `02-all-invalid.json` | Reject; existing selections unchanged |
| `03-empty-object.json` | Reject empty; unchanged (use Reset to clear) |
| `04-mismatched-ids.json` | Merge only valid F03; reject cross-family/unknown; keep prior others |
| `05-catalog-mismatch.json` | Merge F01; status flags catalog-mismatch |
| `06-duplicate-same-as-sample.json` | Re-import same F01; unchanged count; siblings kept |
| `07-bare-map-valid.json` | Bare map form of sample F01–F03 |
| `08-malformed.txt` | Parse fail; unchanged (not a `.json` on purpose) |

## How to use

1. Serve the lab (`python3 -m http.server` in the repo root) or open `index.html`.
2. Optionally choose some families first.
3. Toolbar → **Import JSON** → pick one fixture.
4. Confirm toast and banner match the table; Summary export reflects merge, not wipe.

## Checks

```bash
python3 scripts/validate_lab.py
node scripts/test_persistence_rules.mjs
node --check lab.js
```
