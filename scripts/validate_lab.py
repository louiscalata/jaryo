#!/usr/bin/env python3
"""Non-browser validation for the Jaryo adaptive design lab."""
from __future__ import annotations
import json, re, sys
from pathlib import Path

LAB = Path(__file__).resolve().parents[1]
ROOT = LAB.parent
errors = []
warns = []

def fail(m): errors.append(m)
def warn(m): warns.append(m)

curated = json.loads((LAB / "data/curated-85.json").read_text(encoding="utf-8"))
families = curated["families"]
if len(families) != 17:
    fail(f"expected 17 families, got {len(families)}")
opts = [o for f in families for o in f["options"]]
if len(opts) != 85:
    fail(f"expected 85 options, got {len(opts)}")
ids = [o["id"] for o in opts]
if len(ids) != len(set(ids)):
    fail("duplicate curated IDs")

f17 = {o["id"]: o for o in json.load(open(LAB / "data/f17-color-systems-v2.json"))["options"]}
opt_path = ROOT / "options.json"
if opt_path.exists():
    catalog = {o["id"]: o for o in json.load(open(opt_path))}
    for oid in ids:
        if oid.startswith("F17"):
            if oid not in f17: fail(f"missing F17 source {oid}")
        else:
            if oid not in catalog: fail(f"missing catalog source {oid}")
else:
    warn("parent options.json absent — standalone lab ZIP; skip full-catalog cross-check")
    for oid in ids:
        if oid.startswith("F17") and oid not in f17:
            fail(f"missing F17 source {oid}")

for o in opts:
    for k in ("mechanism", "tradeoff", "curation_rationale", "name"):
        if not o.get(k): fail(f"{o['id']} missing {k}")
    if o["id"].startswith("F17") and not o.get("tokens"):
        fail(f"{o['id']} missing tokens")

js = (LAB / "lab.js").read_text(encoding="utf-8")
preview_keys = set(re.findall(r'"((?:F\d{2})\.\d{2})":\s*\(\)\s*=>', js))
for o in opts:
    if o["id"].startswith("F17"):
        continue
    if o["id"] not in preview_keys and not o.get("preview_ascii"):
        fail(f"no preview renderer or ascii for {o['id']}")
    elif o["id"] not in preview_keys:
        warn(f"{o['id']} falls back to ascii only (no dedicated PREVIEW key)")

# ensure dedicated previews for all non-F17 curated
missing_prev = [o["id"] for o in opts if not o["id"].startswith("F17") and o["id"] not in preview_keys]
if missing_prev:
    fail(f"missing distinct PREVIEW keys: {missing_prev}")

html = (LAB / "index.html").read_text(encoding="utf-8")
for req in ("lab.css", "lab.js", "embedded-data.js", "btn-reset", "btn-download", "btn-copy"):
    if req not in html:
        fail(f"index.html missing {req}")

for key in ("STORAGE_KEY", "exportPayload", "localStorage", "Reset", "JARYO_LAB_DATA"):
    if key == "Reset":
        if "resetChoices" not in js: fail("resetChoices missing")
    elif key not in js and key != "JARYO_LAB_DATA":
        # JARYO in embedded
        if key not in js: fail(f"lab.js missing {key}")

emb = LAB / "data/embedded-data.js"
if not emb.exists() or "window.JARYO_LAB_DATA" not in emb.read_text(encoding="utf-8")[:80]:
    fail("embedded-data.js missing or malformed")

# export/reset semantics present
if "jaryo-lab-choices.json" not in js:
    fail("download filename missing")
if "Choice preference" not in html and "Choice preference" not in js:
    warn("choice≠production notice weak")

# journeys
if len(curated.get("journeys", [])) < 4:
    fail("expected ≥4 journeys")

# asset presence
for p in [
    "assets/studies/L-state-grammar.png",
    "assets/studies/K-narrow-journey-copper.png",
    "assets/pilots/01-connect-discovery.png",
]:
    if not (LAB / p).exists():
        fail(f"missing asset {p}")

print("VALIDATION", "FAIL" if errors else "PASS")
for e in errors: print("ERROR:", e)
for w in warns: print("WARN:", w)
print(f"families={len(families)} options={len(ids)} preview_keys={len(preview_keys)}")
sys.exit(1 if errors else 0)
