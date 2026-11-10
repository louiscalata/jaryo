#!/usr/bin/env python3
"""Fail if the lab's local asset references do not resolve on disk.

GitHub Pages serves this repository from the root. Relative href/src/url()
paths must exist so the published site does not 404.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []


def local_refs(text: str) -> list[str]:
    found = re.findall(r"""(?:href|src|url)\(\s*['"]?([^'")\s#?]+)""", text)
    found += re.findall(r"""(?:href|src)\s*=\s*['"]([^'"]+)['"]""", text)
    out = []
    for raw in found:
        if raw.startswith(("http://", "https://", "data:", "mailto:", "#", "//")):
            continue
        if raw.startswith("blob:"):
            continue
        # Script templates such as href="${url}" are not file paths.
        if "${" in raw or raw.startswith("$"):
            continue
        out.append(raw.split("#", 1)[0].split("?", 1)[0])
    return out


def check_file(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    for ref in local_refs(text):
        target = (path.parent / ref).resolve()
        if not str(target).startswith(str(ROOT)):
            errors.append(f"{path.relative_to(ROOT)} -> {ref} escapes the repo")
            continue
        if not target.is_file():
            errors.append(f"{path.relative_to(ROOT)} -> missing {ref}")


for rel in ("index.html", "lab.css", "lab.js"):
    file = ROOT / rel
    if not file.is_file():
        errors.append(f"missing {rel}")
        continue
    check_file(file)

stages = ROOT / "lab-stages.js"
if stages.is_file():
    check_file(stages)
stage_css = ROOT / "lab-stages.css"
if stage_css.is_file():
    check_file(stage_css)

# Pages root publish: these entry files must stay at the repository root.
for rel in ("index.html", "lab.css", "lab.js", "data/embedded-data.js", ".nojekyll"):
    if not (ROOT / rel).exists():
        errors.append(f"pages entry missing: {rel}")

if errors:
    print("FAIL check_assets")
    for err in errors:
        print(" -", err)
    sys.exit(1)
print("OK check_assets")
