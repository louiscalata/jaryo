#!/usr/bin/env python3
"""Write tokens/jaryo.tokens.json from the custom properties in lab.css.

The file is DTCG 2025.10 conformant: Design Tokens Format Module 2025.10 and
Color Module 2025.10.
Groups: color (light and dark), dimension, letterSpacing, fontFamily,
fontWeight, typography.
Font stacks are copied from the CSS. This script does not choose a face.
The --track* custom properties are em values. They are exported as numbers in
the letterSpacing group because DTCG dimensions allow only px and rem.
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


def round_number(number: float) -> int | float:
    rounded = round(number, 4)
    return int(rounded) if float(rounded).is_integer() else rounded


def hex_digits(value: str) -> str:
    digits = value.lstrip("#").lower()
    if len(digits) == 3:
        digits = "".join(digit * 2 for digit in digits)
    return digits


def color_token(value: str) -> dict:
    digits = hex_digits(value)
    components = [round_number(int(digits[i : i + 2], 16) / 255) for i in (0, 2, 4)]
    return {
        "$type": "color",
        "$value": {"colorSpace": "srgb", "components": components, "hex": "#" + digits},
    }


def dimension_value(number: float, unit: str) -> dict:
    return {"value": round_number(number), "unit": unit}


def dimension_token(value: str) -> dict | None:
    match = re.fullmatch(r"(-?\d+(?:\.\d+)?)(px|rem)", value)
    if not match:
        return None
    return {"$type": "dimension", "$value": dimension_value(float(match.group(1)), match.group(2))}


def letter_spacing_token(value: str) -> dict | None:
    if value == "0":
        return {"$type": "number", "$value": 0}
    match = re.fullmatch(r"(-?\d+(?:\.\d+)?)em", value)
    if not match:
        return None
    return {"$type": "number", "$value": round_number(float(match.group(1)))}


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
    letter_spacing = {}
    families = {}
    weights = {}

    for name, value in light.items():
        if re.fullmatch(r"#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?", value):
            colors_light[name] = color_token(value)
            continue
        if name.startswith("track"):
            spacing = letter_spacing_token(value)
            if spacing is None:
                raise SystemExit(f"unclassified letter spacing declaration: --{name}: {value}")
            letter_spacing[name] = spacing
            continue
        dim = dimension_token(value)
        if dim and (name.startswith("fs-") or name.startswith("s") or name == "hit"):
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

    def track_px(spacing: str, size: str) -> dict:
        em = letter_spacing[spacing]["$value"]
        return dimension_value(em * dimensions[size]["$value"]["value"], "px")

    typography = {
        "body": {
            "$type": "typography",
            "$value": {
                "fontFamily": "{fontFamily.font-reading}",
                "fontSize": "{dimension.fs-3}",
                "fontWeight": "{fontWeight.regular}",
                "letterSpacing": track_px("track-body", "fs-3"),
                "lineHeight": float(light["lh-body"]),
            },
        },
        "title": {
            "$type": "typography",
            "$value": {
                "fontFamily": "{fontFamily.font-reading}",
                "fontSize": "{dimension.fs-4}",
                "fontWeight": "{fontWeight.bold}",
                "letterSpacing": track_px("track-display-tight", "fs-4"),
                "lineHeight": float(light["lh-tight"]),
            },
        },
        "display": {
            "$type": "typography",
            "$value": {
                "fontFamily": "{fontFamily.font-display}",
                "fontSize": "{dimension.fs-display}",
                "fontWeight": "{fontWeight.bold}",
                "letterSpacing": track_px("track-display", "fs-display"),
                "lineHeight": float(light["lh-tight"]),
            },
        },
        "meta": {
            "$type": "typography",
            "$value": {
                "fontFamily": "{fontFamily.font-machine}",
                "fontSize": "{dimension.fs-1}",
                "fontWeight": "{fontWeight.semibold}",
                "letterSpacing": track_px("track-meta", "fs-1"),
                "lineHeight": float(light["lh-ui"]),
            },
        },
    }

    return {
        "$description": DESCRIPTION,
        "color": {"light": colors_light, "dark": colors_dark},
        "dimension": dimensions,
        "letterSpacing": {
            "$description": "Letter spacing in em: multiply by the font size.",
            **letter_spacing,
        },
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
