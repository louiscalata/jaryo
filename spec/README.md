# Jaryo interface spec (v0.6)

Work in progress. This folder holds the composed interface spec, two reference screens for a fictional pipeline, a read-only adaptor spike, a sample pipeline used to exercise the adaptor, and tests.

It is separate from the interactive design lab at the repository root. The lab compares design options; this folder records one composed design and a small adaptor experiment.

## Layout

| Path | What |
|---|---|
| `docs/spec/JARYO-INTERFACE-SPEC.md` | Interface spec v0.6 (the reference screens are still v0.5e) |
| `reference/` | App and website reference screens, plus static adaptor views |
| `adaptor/` | Read-only adaptor (`manifest + run record → view`) |
| `pipeline/` | Sample pipeline, checks, and recorded runs |
| `tests/` | jsdom and adaptor tests |
| `docs/pitch/` | Pitch page (source and built HTML) |
| `docs/evidence/` | Accessibility-tree pass notes and simulator screenshots |
| `HASHES.txt` | sha256 of the tracked reference, adaptor, and pipeline files |

## Run the tests

From this `spec/` directory:

```bash
JSDOM=/path/to/node_modules/jsdom node tests/decisions.test.mjs reference/index.html
node tests/adaptor.test.mjs
JSDOM=/path/to/node_modules/jsdom node tests/render.test.mjs
JSDOM=/path/to/node_modules/jsdom node tests/reference-a11y.test.mjs
```

Optional: `node pipeline/run.mjs` runs the sample pipeline and writes a new run record.

jsdom has no layout or safe-area insets, so the browser-facing tests say nothing about the CSS.

## Limits

- Design spec and spike only. Not installable. No adaptor for a pipeline written independently.
- No screen-reader pass and no physical-device pass yet. The accessibility-tree pass is markup structure only.
- Personal design-pick exports, internal review receipts, and Jev notes are not included.
- The reference screens use the Copper Workshop (F17.01) tokens as their own skin. The lab at the repository root lists Copper as an EXAMPLE only and does not record it as anyone's choice; the two statements apply to different things.
