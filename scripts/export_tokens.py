#!/usr/bin/env python3
"""Write tokens/jaryo.tokens.json from the custom properties in lab.css.

DTCG-inspired string-value export; this is not a DTCG 2025.10 conformant file.
Groups: color (light and dark), dimension, fontFamily, fontWeight, typography.
Font stacks are copied from the CSS. This script does not choose a face.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS = ROOT / "lab.css"
OUT = ROOT / "tokens" / "jaryo.tokens.json"

IGNORED = {"lh", "lh-tight", "lh-body", "lh-ui", "dur", "dur-2", "ease", "hatch"}

DESCRIPTION = "Export only. AGIW Suite and OPOS do not consume this file yet."


def css_text() -> str:
    return CSS.read_text(encoding="utf-8")


def brace_block(css: str, marker: str) -> str:
    i = css.find(marker)
    if i < 0:
        raise SystemExit(f"missing CSS block {marker}")
    start = css.find("{", i)
    end = css.find("}", start)
    return css[start + 1 : end]


def declarations(block: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for name, value in re.findall(r"--([^\s:;{}]+)\s*:\s*([^;]+)(?:;|\Z)", block):
        found[name] = " ".join(value.split())
    return found


def split_stack(raw: str) -> list[str]:
    parts: list[str] = []
    buf: list[str] = []
    quote = False
    for ch in raw:
        if ch == '"':
            quote = not quote
            continue
        if ch == "," and not quote:
            parts.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
    tail = "".join(buf).strip()
    if tail:
        parts.append(tail)
    return [p for p in parts if p]


def color_token(value: str) -> dict:
    return {"$type": "color", "$value": value.lower()}


def dimension_token(name: str, value: str) -> dict | None:
    if re.fullmatch(r"-?\d+(?:\.\d+)?px", value) or re.fullmatch(r"-?\d+(?:\.\d+)?em", value):
        return {"$type": "dimension", "$value": value}
    if name.startswith("track") and value == "0":
        return {"$type": "dimension", "$value": "0em"}
    return None


def build() -> dict:
    css = css_text()
    light = declarations(brace_block(css, ":root {"))
    dark = declarations(brace_block(css, ':root[data-theme="dark"]'))
    system_dark = declarations(brace_block(css, ':root:not([data-theme="light"])'))
    if system_dark != dark:
        raise SystemExit("system-dark declarations differ from explicit dark declarations")

    colors_light = {}
    colors_dark = {}
    dimensions = {}
    families = {}
    weights = {}

    for name, value in light.items():
        if re.fullmatch(r"#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?", value):
            colors_light[name] = color_token(value)
            continue
        dim = dimension_token(name, value)
        if dim and (name.startswith("fs-") or name.startswith("s") or name in {"hit"} or name.startswith("track")):
            dimensions[name] = dim
            continue
        if name.startswith("fw-") and value.isdigit():
            weights[name.removeprefix("fw-")] = {"$type": "fontWeight", "$value": int(value)}
            continue
        if name in {"mono", "sans", "font-serif-study"}:
            families[name] = {"$type": "fontFamily", "$value": split_stack(value)}
            continue
        if name in {"font-machine", "font-reading", "font-display"} and value.startswith("var(--"):
            ref = re.search(r"var\(--([A-Za-z0-9-]+)\)", value)
            if ref:
                families[name] = {"$type": "fontFamily", "$value": "{fontFamily." + ref.group(1) + "}"}
                continue
        if name not in IGNORED:
            raise SystemExit(f"unclassified light declaration: --{name}: {value}")

    for name, value in dark.items():
        if re.fullmatch(r"#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?", value):
            colors_dark[name] = color_token(value)
        else:
            raise SystemExit(f"unclassified dark declaration: --{name}: {value}")

    typography = {
        "body": {
            "$type": "typography",
            "$value": {
                "fontFamily": "{fontFamily.font-reading}",
                "fontSize": "{dimension.fs-3}",
                "fontWeight": "{fontWeight.regular}",
                "letterSpacing": "{dimension.track-body}",
                "lineHeight": float(light["lh-body"]),
            },
        },
        "title": {
            "$type": "typography",
            "$value": {
                "fontFamily": "{fontFamily.font-reading}",
                "fontSize": "{dimension.fs-4}",
                "fontWeight": "{fontWeight.bold}",
                "letterSpacing": "{dimension.track-display-tight}",
                "lineHeight": float(light["lh-tight"]),
            },
        },
        "display": {
            "$type": "typography",
            "$value": {
                "fontFamily": "{fontFamily.font-display}",
                "fontSize": "{dimension.fs-display}",
                "fontWeight": "{fontWeight.bold}",
                "letterSpacing": "{dimension.track-display}",
                "lineHeight": float(light["lh-tight"]),
            },
        },
        "meta": {
            "$type": "typography",
            "$value": {
                "fontFamily": "{fontFamily.font-machine}",
                "fontSize": "{dimension.fs-1}",
                "fontWeight": "{fontWeight.semibold}",
                "letterSpacing": "{dimension.track-meta}",
                "lineHeight": float(light["lh-ui"]),
            },
        },
    }

    return {
        "$description": DESCRIPTION,
        "color": {"light": colors_light, "dark": colors_dark},
        "dimension": dimensions,
        "fontFamily": families,
        "fontWeight": weights,
        "typography": typography,
    }


def render() -> str:
    return json.dumps(build(), indent=2, ensure_ascii=False) + "\n"


def main() -> int:
    text = render()
    check = "--check" in sys.argv[1:]
    if check:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current != text:
            print("FAIL export_tokens: tokens/jaryo.tokens.json is not the file scripts/export_tokens.py writes")
            return 1
        print("OK export_tokens")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
