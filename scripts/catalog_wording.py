#!/usr/bin/env python3
"""Catalog wording checks derived from data/curated-extended.json."""

from __future__ import annotations

import re

# Files that must carry the catalog phrase as literal text.
PHRASE_FILES = ("README.md", "index.html", "AGENTS.md", "REVIEW-CHECKLIST.md", "docs/CHECKS.md")
MONOCHROME_LAST = 16
COLOR_FAMILY = 17
LEGACY_FAMILY = 18
RED_FAMILY = 19


def family_number(family_id: str) -> int | None:
    """Return the number in an Fnn family ID, or None for another shape."""
    match = re.fullmatch(r"F(\d+)", family_id)
    return int(match.group(1)) if match else None


def option_counts(fams: list[dict]) -> dict[str, int]:
    """Count total options and the monochrome, color, legacy and Red groups."""
    total = sum(len(fam.get("options", [])) for fam in fams)
    by_family: dict[int, int] = {}
    for fam in fams:
        number = family_number(str(fam.get("id", "")))
        if number is not None:
            by_family[number] = by_family.get(number, 0) + len(fam.get("options", []))
    monochrome_numbers = [number for number in by_family if 1 <= number <= MONOCHROME_LAST]
    return {
        "total": total,
        "monochrome": sum(by_family[number] for number in monochrome_numbers),
        "color": by_family.get(COLOR_FAMILY, 0),
        "legacy": by_family.get(LEGACY_FAMILY, 0),
        "red": by_family.get(RED_FAMILY, 0),
        "last_monochrome": max(monochrome_numbers, default=MONOCHROME_LAST),
    }


def catalog_phrase(fams: list[dict], curated_n: int) -> str:
    """Build the catalog phrase from the loaded family and option counts."""
    counts = option_counts(fams)
    optional_n = counts["total"] - curated_n
    return f"{len(fams)} families · {curated_n} curated + {optional_n} optional ({counts['total']} total)"


def breakdown_sentence(fams: list[dict], curated_n: int) -> str:
    """Build the README breakdown sentence from the loaded counts."""
    counts = option_counts(fams)
    optional_n = counts["total"] - curated_n
    last_mono = counts["last_monochrome"]
    return (
        f"The {curated_n} curated options are {counts['monochrome']} monochrome (F01–F{last_mono:02d}) "
        f"and {counts['color']} color (F17). The {optional_n} optional options are "
        f"{counts['legacy']} legacy studies (F18) and {counts['red']} Red interactive UI (F19)."
    )


def catalog_wording_errors(fams: list[dict], curated_n: int, texts: dict[str, str]) -> list[str]:
    """Return catalog wording errors for the phrase files and the README breakdown."""
    errors: list[str] = []
    phrase = catalog_phrase(fams, curated_n)
    for name in PHRASE_FILES:
        if phrase not in texts.get(name, ""):
            errors.append(f"{name} missing catalog phrase {phrase}")
    counts = option_counts(fams)
    optional_n = counts["total"] - curated_n
    if counts["monochrome"] + counts["color"] != curated_n:
        errors.append(
            f"README breakdown counts {counts['monochrome']} monochrome + "
            f"{counts['color']} color != {curated_n} curated"
        )
    if counts["legacy"] + counts["red"] != optional_n:
        errors.append(
            f"README breakdown counts {counts['legacy']} legacy + "
            f"{counts['red']} Red != {optional_n} optional"
        )
    sentence = breakdown_sentence(fams, curated_n)
    if sentence not in texts.get("README.md", ""):
        errors.append(f"README.md missing catalog breakdown {sentence}")
    return errors
