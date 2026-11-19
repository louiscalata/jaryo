import importlib.util
import json
import re
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("export_tokens", Path(__file__).with_name("export_tokens.py"))
tokens = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tokens)
CSS = tokens.css_text()

ALIAS = re.compile(r"\{([^{}]+)\}")
TOKEN_TYPES = {"color", "dimension", "number", "fontFamily", "fontWeight", "typography"}
PROPERTY_TYPES = {
    "fontFamily": "fontFamily",
    "fontSize": "dimension",
    "fontWeight": "fontWeight",
    "letterSpacing": "dimension",
}


def is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def walk_tokens(node, path=()):
    if "$value" in node:
        yield path, node
        return
    for name, child in node.items():
        if not name.startswith("$"):
            yield from walk_tokens(child, (*path, name))


def resolve(root, path):
    node = root
    for part in path.split("."):
        if not isinstance(node, dict) or part not in node:
            raise KeyError(path)
        node = node[part]
    return node


def name_problems(root):
    problems = []
    for name, child in root.items():
        if name.startswith("$"):
            continue
        if any(mark in name for mark in "{}."):
            problems.append(f"invalid name {name!r}")
        if isinstance(child, dict):
            problems.extend(name_problems(child))
    return problems


def color_problems(label, value):
    if not isinstance(value, dict) or set(value) != {"colorSpace", "components", "hex"}:
        return [f"{label}: color $value must be {{colorSpace, components, hex}}"]
    problems = []
    if value["colorSpace"] != "srgb":
        problems.append(f"{label}: colorSpace {value['colorSpace']!r}")
    components = value["components"]
    if not isinstance(components, list) or len(components) != 3:
        return problems + [f"{label}: components {components!r}"]
    for component in components:
        if not is_number(component) or not 0 <= component <= 1:
            problems.append(f"{label}: component {component!r} is not a number in [0, 1]")
    hex_value = value["hex"]
    if not isinstance(hex_value, str) or not re.fullmatch(r"#[0-9a-f]{6}", hex_value):
        return problems + [f"{label}: hex {hex_value!r}"]
    for component, start in ((components[0], 1), (components[1], 3), (components[2], 5)):
        if is_number(component) and round(component * 255) != int(hex_value[start : start + 2], 16):
            problems.append(f"{label}: component {component!r} does not match {hex_value}")
    return problems


def dimension_problems(label, value):
    if not isinstance(value, dict) or set(value) != {"value", "unit"}:
        return [f"{label}: dimension $value must be {{value, unit}}"]
    problems = []
    number = value["value"]
    if not is_number(number):
        problems.append(f"{label}: dimension number {number!r}")
    elif isinstance(number, float) and number.is_integer():
        problems.append(f"{label}: whole number {number!r} must be an int")
    if value["unit"] not in {"px", "rem"}:
        problems.append(f"{label}: dimension unit {value['unit']!r}")
    return problems


def font_family_problems(label, value):
    if isinstance(value, str):
        return []
    if isinstance(value, list) and value and all(isinstance(item, str) for item in value):
        return []
    return [f"{label}: fontFamily {value!r}"]


def alias_problems(label, value, root, expected_type):
    match = ALIAS.fullmatch(value) if isinstance(value, str) else None
    if not match:
        return [f"{label}: {value!r} is not a {{group.token}} alias"]
    try:
        target = resolve(root, match.group(1))
    except KeyError:
        return [f"{label}: alias {value} does not resolve"]
    if target.get("$type") != expected_type:
        return [f"{label}: alias {value} type {target.get('$type')!r} != {expected_type!r}"]
    return []


def typography_problems(label, value, root):
    required = {"fontFamily", "fontSize", "fontWeight", "letterSpacing", "lineHeight"}
    if not isinstance(value, dict):
        return [f"{label}: typography $value is not an object"]
    problems = []
    missing = sorted(required - set(value))
    if missing:
        problems.append(f"{label}: typography missing {missing}")
        return problems
    for key in ("fontFamily", "fontSize", "fontWeight"):
        problems.extend(alias_problems(f"{label}.{key}", value[key], root, PROPERTY_TYPES[key]))
    problems.extend(dimension_problems(f"{label}.letterSpacing", value["letterSpacing"]))
    if not is_number(value["lineHeight"]):
        problems.append(f"{label}: lineHeight {value['lineHeight']!r}")
    return problems


def token_problems(label, token, root):
    expected = token.get("$type")
    value = token.get("$value")
    if expected not in TOKEN_TYPES:
        return [f"{label}: $type {expected!r}"]
    if expected == "color":
        return color_problems(label, value)
    if expected == "dimension":
        return dimension_problems(label, value)
    if expected == "fontFamily":
        return font_family_problems(label, value)
    if expected == "fontWeight":
        if not is_number(value) or not 1 <= value <= 1000:
            return [f"{label}: fontWeight {value!r}"]
        return []
    if expected == "typography":
        return typography_problems(label, value, root)
    if not is_number(value):
        return [f"{label}: number $value {value!r}"]
    return []


def conformance_problems(document):
    problems = name_problems(document)
    for path, token in walk_tokens(document):
        label = ".".join(path)
        problems.extend(token_problems(label, token, document))
        value = token.get("$value")
        if isinstance(value, str) and "{" in value:
            problems.extend(alias_problems(label, value, document, token.get("$type")))
    return problems


class TokenChecks(unittest.TestCase):
    def test_unknown_declaration_fails(self):
        with patch.object(
            tokens, "css_text", return_value=CSS.replace(":root {", ":root {\n --unclassified-test: rgb(1,2,3);", 1)
        ):
            with self.assertRaises(SystemExit):
                tokens.build()

    def test_unknown_last_declaration_without_semicolon_fails(self):
        start = CSS.index(":root {")
        end = CSS.index("}", start)
        modified = CSS[:end] + "  --zz: rgb(1,2,3)\n" + CSS[end:]
        with patch.object(tokens, "css_text", return_value=modified):
            with self.assertRaises(SystemExit) as raised:
                tokens.build()
        self.assertIn("--zz: rgb(1,2,3)", str(raised.exception))

    def test_unknown_declaration_with_underscore_fails(self):
        with patch.object(
            tokens, "css_text", return_value=CSS.replace(":root {", ":root {\n --my_tok: rgb(1,2,3);", 1)
        ):
            with self.assertRaises(SystemExit) as raised:
                tokens.build()
        self.assertIn("--my_tok: rgb(1,2,3)", str(raised.exception))

    def test_system_dark_divergence_fails(self):
        marker = ':root:not([data-theme="light"])'
        start = CSS.index(marker)
        modified = CSS[:start] + CSS[start:].replace("--bg:", "--bg: #123456; --unused-original:", 1)
        with patch.object(tokens, "css_text", return_value=modified):
            with self.assertRaises(SystemExit):
                tokens.build()

    def test_current_export_builds(self):
        self.assertTrue(tokens.build()["color"]["dark"])

    def test_build_output_is_dtcg_2025_10_conformant(self):
        self.assertEqual([], conformance_problems(tokens.build()))

    def test_three_digit_hex_expands(self):
        value = tokens.color_token("#C21")["$value"]
        self.assertEqual("#cc2211", value["hex"])
        self.assertEqual([0.8, 0.1333, 0.0667], value["components"])

    def test_em_value_is_not_a_dimension(self):
        self.assertIsNone(tokens.dimension_token("0.06em"))
        self.assertIsNone(tokens.dimension_token("-0.01em"))
        export = tokens.build()
        self.assertNotIn("em", json.dumps(export["dimension"]))
        for name, token in export["letterSpacing"].items():
            if not name.startswith("$"):
                self.assertEqual("number", token["$type"])

    def test_body_letter_spacing_is_px(self):
        letter_spacing = tokens.build()["typography"]["body"]["$value"]["letterSpacing"]
        self.assertEqual({"value": 0, "unit": "px"}, letter_spacing)

    def test_title_letter_spacing_multiplies_font_size(self):
        letter_spacing = tokens.build()["typography"]["title"]["$value"]["letterSpacing"]
        self.assertEqual({"value": -0.16, "unit": "px"}, letter_spacing)


if __name__ == "__main__":
    unittest.main()
