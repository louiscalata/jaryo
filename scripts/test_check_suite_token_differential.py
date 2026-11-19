"""Fixture tests for the Python oracle in check_suite_token_differential.py (LOU-86)."""

import importlib.util
import json
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "check_suite_token_differential", Path(__file__).with_name("check_suite_token_differential.py")
)
diff = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diff)

EXPORT = {
    "color": {
        "light": {
            "ink": {
                "$type": "color",
                "$value": {"colorSpace": "srgb", "components": [0.0, 0.0, 0.0], "hex": "#000000"},
            },
            "paper": {
                "$type": "color",
                "$value": {"colorSpace": "srgb", "components": [1.0, 1.0, 1.0], "hex": "#ffffff"},
            },
        },
    },
    "dimension": {"gap": {"$type": "dimension", "$value": {"value": 4.0, "unit": "px"}}},
}
SUITE = {"palette": {"light": {"ink": "#000", "paper": "#FFFFFE"}}, "spacing": {"gap": 4}}


class ParseTests(unittest.TestCase):
    def test_rejects_duplicate_and_prototype_keys(self):
        for text in ('{"a": 1, "a": 2}', '{"__proto__": 1}'):
            with self.subTest(text=text), self.assertRaises(diff.InvalidInputError):
                diff.parse(text)

    def test_rejects_constants_syntax_and_empty_root(self):
        for text in ('{"a": NaN}', '{"a": 1e999}', "{", "{}", "[1]"):
            with self.subTest(text=text), self.assertRaises(diff.InvalidInputError):
                diff.parse(text)

    def test_numbers_become_floats(self):
        self.assertEqual(diff.parse('{"a": 1}'), {"a": 1.0})
        self.assertIsInstance(diff.parse('{"a": 1}')["a"], float)


class HelperTests(unittest.TestCase):
    def test_strict_separates_signed_zero_and_bool(self):
        self.assertTrue(diff.strict(0.0, 0.0))
        self.assertFalse(diff.strict(0.0, -0.0))
        self.assertFalse(diff.strict(1.0, True))
        self.assertTrue(diff.strict({"a": [1.0]}, {"a": [1.0]}))

    def test_norm_expands_short_hex_and_adds_alpha(self):
        self.assertEqual(diff.norm("#AbC"), "#aabbccff")
        self.assertEqual(diff.norm("#abcd"), "#aabbccdd")
        self.assertEqual(diff.norm("#112233"), "#112233ff")
        self.assertIsNone(diff.norm("112233"))
        self.assertIsNone(diff.norm(3))

    def test_ptr_escapes_json_pointer(self):
        self.assertEqual(diff.ptr("", "a/b~c"), "/a~1b~0c")


class CompareTests(unittest.TestCase):
    def test_small_fixture_summary(self):
        report = diff.compare(json.dumps(EXPORT), json.dumps(SUITE))
        summary = report["summary"]
        self.assertEqual(report["schema"], "jaryo-suite-token-differential/v1")
        self.assertEqual(summary["exportTokens"], 3)
        self.assertEqual(summary["suiteLeaves"], 3)
        self.assertEqual(summary["colorShared"], 2)
        self.assertEqual(summary["colorExact"], 0)
        self.assertEqual(summary["colorNormalized"], 1)
        self.assertEqual(summary["colorDifferent"], 1)
        self.assertEqual(summary["rawShared"], 0)
        shared = {row["name"]: row for row in report["colors"]["shared"]}
        self.assertTrue(shared["/light/ink"]["normalized"])
        self.assertFalse(shared["/light/paper"]["normalized"])

    def test_invalid_export_token_is_rejected(self):
        bad = {"dimension": {"gap": {"$type": "dimension", "$value": {"value": 4.0, "unit": "em"}}}}
        with self.assertRaises(diff.InvalidInputError):
            diff.compare(json.dumps(bad), json.dumps(SUITE))


if __name__ == "__main__":
    unittest.main()
