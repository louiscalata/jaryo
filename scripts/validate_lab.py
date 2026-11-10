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

# Catalog phrase is derived from the extended file, not a hand-typed leftover.
if ext_path.exists():
    n_fam = len(fams)
    n_opt = len(ids)
    curated_n = int(ext["source_catalog"]["curated_count"])
    optional_n = n_opt - curated_n
    phrase = f"{n_fam} families · {curated_n} curated + {optional_n} optional ({n_opt} total)"
    readme_text = (LAB / "README.md").read_text(encoding="utf-8")
    index_html = (LAB / "index.html").read_text(encoding="utf-8")
    lab_js = (LAB / "lab.js").read_text(encoding="utf-8")
    if phrase not in readme_text:
        fail(f"README.md missing catalog phrase {phrase}")
    if phrase not in index_html:
        fail(f"index.html missing catalog phrase {phrase}")
    template = "${families} families · ${curated} curated + ${optional} optional (${total} total)"
    if template not in lab_js:
        fail("lab.js does not build the catalog phrase from the loaded counts")
    stale = ("17 × 5", "85 options", "97 options (85 original)")
    for label, text in (("README.md", readme_text), ("index.html", index_html), ("lab.js", lab_js)):
        for old in stale:
            if old in text:
                fail(f"stale count phrase {old!r} in {label}")
    # The family list is in the HTML so the first paint matches the script.
    # Otherwise the empty list grows and pushes the grammar demo (mobile CLS).
    nav_m = re.search(r'<div id="family-nav">(.*?)</div>', index_html, re.S)
    if not nav_m:
        fail("index.html is missing #family-nav")
    else:
        nav_html = nav_m.group(1)
        buttons = re.findall(
            r'data-fam="(F\d+)" title="(.*?)" aria-current="(true|false)"',
            nav_html,
        )
        if [b[0] for b in buttons] != [f["id"] for f in fams]:
            fail("index.html family nav ids do not match curated-extended.json")
        for fam, (fid, title, current) in zip(fams, buttons):
            expect_title = f"{fid} · {fam['title']}"
            if title != expect_title:
                fail(f"index.html nav title for {fid} is {title!r}, expected {expect_title!r}")
            expect_current = "true" if fid == "F01" else "false"
            if current != expect_current:
                fail(f"index.html nav aria-current for {fid} is {current}")
        def group_count(pred):
            return sum(len(f["options"]) for f in fams if pred(f["id"]))
        expected_groups = [
            f"Monochrome set · {group_count(lambda i: re.match(r'F(0[1-9]|1[0-6])$', i))} options",
            f"Color batch · {group_count(lambda i: i == 'F17')} options · optional",
            f"Legacy studies · {group_count(lambda i: i == 'F18')} options",
            f"Red interactive UI · {group_count(lambda i: i == 'F19')} options · optional",
        ]
        for label in expected_groups:
            if label not in nav_html:
                fail(f"index.html family nav missing group label {label!r}")
    summary = f"0 / {n_fam} families chosen (validated)"
    if summary not in index_html:
        fail(f"index.html summary count should start at {summary}")

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
