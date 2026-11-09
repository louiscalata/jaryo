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

# Original 85 must remain byte-addressable and intact
curated85 = json.loads((LAB / "data/curated-85.json").read_text(encoding="utf-8"))
families85 = curated85["families"]
if len(families85) != 17:
    fail(f"curated-85 expected 17 families, got {len(families85)}")
opts85 = [o for f in families85 for o in f["options"]]
if len(opts85) != 85:
    fail(f"curated-85 expected 85 options, got {len(opts85)}")
ids85 = [o["id"] for o in opts85]
if len(ids85) != len(set(ids85)):
    fail("duplicate curated-85 IDs")

f17 = {o["id"]: o for o in json.load(open(LAB / "data/f17-color-systems-v2.json"))["options"]}
opt_path = ROOT / "options.json"
if opt_path.exists():
    catalog = {o["id"]: o for o in json.load(open(opt_path))}
    for oid in ids85:
        if oid.startswith("F17"):
            if oid not in f17: fail(f"missing F17 source {oid}")
        else:
            if oid not in catalog: fail(f"missing catalog source {oid}")
else:
    warn("parent options.json absent — standalone lab ZIP; skip full-catalog cross-check")
    for oid in ids85:
        if oid.startswith("F17") and oid not in f17:
            fail(f"missing F17 source {oid}")

# Extended lab data (additive F18/F19)
ext_path = LAB / "data/curated-extended.json"
if ext_path.exists():
    ext = json.loads(ext_path.read_text(encoding="utf-8"))
    fams = ext["families"]
    # First 17 families' options must match curated-85 exactly
    for i, f in enumerate(families85):
        if fams[i]["id"] != f["id"]:
            fail(f"extended family order mismatch at {i}: {fams[i]['id']} vs {f['id']}")
        if json.dumps(fams[i]["options"], sort_keys=True) != json.dumps(f["options"], sort_keys=True):
            fail(f"extended mutated original options for {f['id']}")
    ids = [o["id"] for f in fams for o in f["options"]]
    if len(ids) != len(set(ids)):
        fail("duplicate extended IDs")
    if "F18" not in {f["id"] for f in fams}:
        fail("missing F18 Legacy studies")
    if "F19" not in {f["id"] for f in fams}:
        fail("missing F19 Red interactive UI")
    f18 = next(f for f in fams if f["id"] == "F18")
    f19 = next(f for f in fams if f["id"] == "F19")
    for o in f18["options"] + f19["options"]:
        if "provenance" not in o:
            fail(f"{o['id']} missing provenance")
        if not o.get("provenance", {}).get("source_project"):
            fail(f"{o['id']} provenance.source_project missing")
    for o in f19["options"]:
        t = o.get("tokens") or {}
        for k in ("bg", "text", "accent_identity", "selected_bg", "selected_fg"):
            if k not in t:
                fail(f"{o['id']} missing token {k}")
    # embedded-data must match extended
    emb = (LAB / "data/embedded-data.js").read_text(encoding="utf-8")
    if "F18.01" not in emb or "F19.01" not in emb:
        fail("embedded-data.js missing F18/F19")
else:
    warn("curated-extended.json absent — lab is original 85 only")

# DOM/HTML basics
index = (LAB / "index.html").read_text(encoding="utf-8")
for needle in ("family-nav", "cards", "jaryo"):
    if needle not in index.lower() and needle not in index:
        warn(f"index.html may be missing {needle}")

if errors:
    print("FAIL")
    for e in errors: print(" -", e)
    sys.exit(1)
print("OK validate_lab")
for w in warns: print("warn:", w)
