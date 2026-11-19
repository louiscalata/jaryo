#!/usr/bin/env python3
"""Compare generated token reports with a standard-library Python oracle.

Run with no arguments for a seeded corpus. Supply --export-file, --suite-file,
and optionally --report-file to also check a saved snapshot and CLI bytes.
Only Python's standard library and the existing Node runtime are required.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import random
import re
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path

sys.setrecursionlimit(20000)
MAXB = 4 * 1024 * 1024
EXPORT_HEX = re.compile(r"#[0-9a-f]{6}\Z")
HEXANY = re.compile(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\Z")
JSWS = "\t\n\x0b\x0c\r                  　﻿"
GROUPS = ("color", "dimension", "letterSpacing", "fontFamily", "fontWeight", "typography")


class InvalidInputError(Exception):
    pass


def u16(s):
    return s.encode("utf-16-be", "surrogatepass")


def decoded_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result or key in ("__proto__", "constructor", "prototype"):
            raise InvalidInputError("key")
        result[key] = value
    return result


def parse(text):
    if len(text.encode("utf-8", "surrogatepass")) > MAXB:
        raise InvalidInputError("bytes")

    def const(_):
        raise InvalidInputError("const")

    def num(s):
        f = float(s)
        if math.isinf(f):
            raise InvalidInputError("inf")
        return f

    try:
        v = json.loads(text, object_pairs_hook=decoded_pairs, parse_constant=const, parse_float=num, parse_int=num)
    except (ValueError, RecursionError) as exc:
        raise InvalidInputError("syntax") from exc
    count = [0]

    def walk(x, depth):
        count[0] += 1
        if depth > 64 or count[0] > 100000:
            raise InvalidInputError("limit")
        if isinstance(x, dict):
            for c in x.values():
                walk(c, depth + 1)
        elif isinstance(x, list):
            for c in x:
                walk(c, depth + 1)

    walk(v, 0)
    if not isinstance(v, dict) or not v:
        raise InvalidInputError("root")
    return v


def kind(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, float):
        return "number"
    if isinstance(v, str):
        return "string"
    if isinstance(v, list):
        return "array"
    return "object"


def ptr(base, key):
    return base + "/" + str(key).replace("~", "~0").replace("/", "~1")


def strict(a, b):
    if type(a) is not type(b):
        return False
    if isinstance(a, float):
        return a == b and math.copysign(1, a) == math.copysign(1, b)
    if isinstance(a, list):
        return len(a) == len(b) and all(strict(x, y) for x, y in zip(a, b))
    if isinstance(a, dict):
        return a.keys() == b.keys() and all(strict(a[k], b[k]) for k in a)
    return a == b


def norm(v):
    if not isinstance(v, str) or not HEXANY.match(v):
        return None
    h = v[1:].lower()
    if len(h) <= 4:
        h = "".join(c + c for c in h)
    if len(h) == 6:
        h += "ff"
    return "#" + h


def ref(group, v):
    return isinstance(v, str) and re.match(r"\{" + group + r"\.[A-Za-z0-9-]+\}\Z", v) is not None


def valid_dimension(v):
    return (
        isinstance(v, dict)
        and set(v) == {"value", "unit"}
        and isinstance(v["value"], float)
        and v["unit"] in ("px", "rem")
    )


def valid_color(v):
    return (
        isinstance(v, dict)
        and set(v) == {"colorSpace", "components", "hex"}
        and v["colorSpace"] == "srgb"
        and isinstance(v["hex"], str)
        and EXPORT_HEX.fullmatch(v["hex"]) is not None
        and isinstance(v["components"], list)
        and len(v["components"]) == 3
        and all(
            isinstance(c, float) and 0 <= c <= 1 and abs(c * 255 - int(v["hex"][i : i + 2], 16)) <= 0.5
            for i, c in zip((1, 3, 5), v["components"])
        )
    )


def token_type(group):
    return "number" if group == "letterSpacing" else group


def valid(group, v):
    if group == "color":
        return valid_color(v)
    if group == "dimension":
        return valid_dimension(v)
    if group == "letterSpacing":
        return isinstance(v, float)
    if group == "fontFamily":
        if isinstance(v, list):
            return len(v) > 0 and all(isinstance(i, str) and i.strip(JSWS) != "" for i in v)
        return ref("fontFamily", v)
    if group == "fontWeight":
        return isinstance(v, float) and v.is_integer() and 1 <= v <= 1000
    if group == "typography":
        if not isinstance(v, dict) or set(v) != {"fontFamily", "fontSize", "fontWeight", "letterSpacing", "lineHeight"}:
            return False
        return (
            ref("fontFamily", v["fontFamily"])
            and ref("dimension", v["fontSize"])
            and ref("fontWeight", v["fontWeight"])
            and (valid_dimension(v["letterSpacing"]) or ref("dimension", v["letterSpacing"]))
            and isinstance(v["lineHeight"], float)
            and v["lineHeight"] > 0
        )
    return False


def export_inventory(root):
    out = []

    def desc(node):
        if "$description" in node and not isinstance(node["$description"], str):
            raise InvalidInputError("desc")

    def visit(node, name, group, depth):
        if not isinstance(node, dict):
            raise InvalidInputError("group")
        desc(node)
        if "$value" in node or "$type" in node:
            if (
                "$value" not in node
                or not strict(node.get("$type"), token_type(group))
                or not valid(group, node["$value"])
                or set(node) - {"$type", "$value", "$description"}
                or depth != (3 if group == "color" else 2)
            ):
                raise InvalidInputError("token")
            out.append({"name": name, "type": node["$type"], "value": node["$value"]})
            return
        keys = sorted((k for k in node if k != "$description"), key=u16)
        if not keys:
            raise InvalidInputError("empty")
        for k in keys:
            if k.startswith("$"):
                raise InvalidInputError("prop")
            if group == "color" and depth == 1 and k not in ("light", "dark"):
                raise InvalidInputError("theme")
            visit(node[k], ptr(name, k), group, depth + 1)

    desc(root)
    for g in sorted((k for k in root if k != "$description"), key=u16):
        if g not in GROUPS:
            raise InvalidInputError("unknown group")
        visit(root[g], ptr("", g), g, 1)
    if not out:
        raise InvalidInputError("none")
    return sorted(out, key=lambda item: u16(item["name"]))


def suite_inventory(root):
    if "palette" in root:
        pal = root["palette"]
        if not isinstance(pal, dict) or not pal:
            raise InvalidInputError("palette")
        for theme in pal.values():
            if not isinstance(theme, dict) or not theme or any(norm(v) is None for v in theme.values()):
                raise InvalidInputError("theme")
    out = []

    def visit(node, name):
        if isinstance(node, dict) and node:
            for k in sorted(node, key=u16):
                visit(node[k], ptr(name, k))
        else:
            out.append({"name": name, "type": kind(node), "value": node})

    visit(root, "")
    return sorted(out, key=lambda item: u16(item["name"]))


def raw(root):
    out = {}

    def visit(node, name):
        out[name] = (kind(node), len(node) if isinstance(node, list) else None)
        if isinstance(node, dict):
            for k, v in node.items():
                visit(v, ptr(name, k))
        elif isinstance(node, list):
            for i, v in enumerate(node):
                visit(v, ptr(name, i))

    visit(root, "")
    return out


def names(left, right, color):
    a = {i["name"]: i for i in left}
    b = {i["name"]: i for i in right}
    assert len(a) == len(left) and len(b) == len(right), "name collision"
    shared = []
    for n in sorted(a, key=u16):
        if n not in b:
            continue
        x, y = a[n], b[n]
        export_value = x["value"]["hex"] if color else x["value"]
        exact = strict(export_value, y["value"])
        hex_color = norm(x["value"]["hex"]) if x["type"] == "color" else None
        normalized = exact or (hex_color is not None and hex_color == norm(y["value"]))
        row = {"name": n}
        if color:
            row.update(exportName=x["src"], suiteName=y["src"])
        else:
            row.update(exportType=x["type"], suiteType=y["type"])
        row.update(exportValue=export_value, suiteValue=y["value"], exact=exact, normalized=normalized)
        shared.append(row)
    return {
        "shared": shared,
        "exportOnly": sorted((n for n in a if n not in b), key=u16),
        "suiteOnly": sorted((n for n in b if n not in a), key=u16),
    }


def compare(etext, stext):
    exp, suite = parse(etext), parse(stext)
    left, right = export_inventory(exp), suite_inventory(suite)
    rawnames = names(left, right, False)
    cl = [{**i, "src": i["name"], "name": i["name"][len("/color") :]} for i in left if i["type"] == "color"]
    cr = [
        {**i, "src": i["name"], "name": i["name"][len("/palette") :]}
        for i in right
        if i["name"].startswith("/palette/")
    ]
    colors = {
        "mapping": {"export": "/color", "suite": "/palette", "rule": "same theme and local name only"},
        **names(cl, cr, True),
    }
    ra, rb = raw(exp), raw(suite)
    structure = []
    for n in sorted(set(ra) | set(rb), key=u16):
        x, y = ra.get(n), rb.get(n)
        if x == y:
            continue
        row = {"name": n, "exportType": x[0] if x else "missing", "suiteType": y[0] if y else "missing"}
        if x and y and x[0] == "array" and y[0] == "array":
            row.update(exportLength=x[1], suiteLength=y[1])
        structure.append(row)

    def cnt(rows, key):
        return sum(1 for r in rows if r[key])

    def sha(text):
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    return {
        "schema": "jaryo-suite-token-differential/v1",
        "sources": {"export": {"sha256": sha(etext)}, "suite": {"sha256": sha(stext)}},
        "summary": {
            "exportTokens": len(left),
            "suiteLeaves": len(right),
            "rawShared": len(rawnames["shared"]),
            "rawExact": cnt(rawnames["shared"], "exact"),
            "rawNormalized": cnt(rawnames["shared"], "normalized"),
            "exportOnly": len(rawnames["exportOnly"]),
            "suiteOnly": len(rawnames["suiteOnly"]),
            "colorShared": len(colors["shared"]),
            "colorExact": cnt(colors["shared"], "exact"),
            "colorNormalized": cnt(colors["shared"], "normalized"),
            "colorDifferent": len(colors["shared"]) - cnt(colors["shared"], "normalized"),
            "colorExportOnly": len(colors["exportOnly"]),
            "colorSuiteOnly": len(colors["suiteOnly"]),
            "structuralDifferences": len(structure),
        },
        "inventories": {"export": left, "suite": right},
        "rawNames": rawnames,
        "colors": colors,
        "structure": structure,
    }


def loose(a, b):
    """Equality between oracle values and parsed tool JSON; numbers by value, booleans distinct."""
    if isinstance(a, bool) or isinstance(b, bool):
        return a is b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a == b
    if type(a) is not type(b):
        return False
    if isinstance(a, list):
        return len(a) == len(b) and all(loose(x, y) for x, y in zip(a, b))
    if isinstance(a, dict):
        return a.keys() == b.keys() and all(loose(a[k], b[k]) for k in a)
    return a == b


KEYS = [
    "a",
    "b",
    "bg",
    "fg",
    "light",
    "dark",
    "x/y",
    "t~1",
    "a-b",
    "A",
    "é",
    "\U0001d4b3",
    "￮",
    "$x",
    "",
    "0",
    "1",
    "10",
    "text",
    "toString",
    "hasOwnProperty",
    "valueOf",
    "length",
    "surface",
    "surface-2",
    "muted",
    "a/b",
    "a~b",
    "~",
    "/",
    "palette",
    "color",
    "dimension",
]
THEMES = ["light", "dark", "x/y", "t~1", "hc"]
NAMES = ["bg", "fg", "muted", "surface", "surface-2", "a/b", "~n", "border", "toString"]
HEXD = "0123456789abcdefABCDEF"
HOSTILE = [
    None,
    True,
    False,
    0,
    1,
    -1,
    1.5,
    400,
    1001,
    0.0,
    "",
    " ",
    "#fff",
    "#FFF",
    "#ffff",
    "#ffffffff",
    "#ggg",
    " #fff",
    "#fff ",
    "rgb(0,0,0)",
    "44px",
    "44PX",
    "-0.01em",
    "1rem",
    "{fontFamily.sans}",
    "{dimension.a}",
    [],
    {},
    [1],
    ["A"],
    ["A", ""],
    [""],
    [None],
    {"a": 1},
    "white",
    "<script>",
    "\u001c",
    1e20,
    -0.0,
    "400",
    ["\u001c"],
    [" "],
    ["﻿"],
    [" x "],
    "#FFFFFF",
    "#abc",
    "#aabbcc",
]


class CorpusGenerator:
    def __init__(self, seed):
        self.random = random.Random(seed)
        self.text_mutations = self._text_mutations()

    def hexcolor(self, n=None):
        n = n or self.random.choice([3, 6])
        return "#" + "".join(self.random.choice(HEXD) for _ in range(n))

    def typography(self):
        return {
            "fontFamily": "{fontFamily." + self.random.choice(["sans", "mono-1", "A"]) + "}",
            "fontSize": "{dimension.fs-" + str(self.random.randint(1, 5)) + "}",
            "fontWeight": "{fontWeight.regular}",
            "letterSpacing": self.random.choice(["{dimension.track}", self.valid_value("dimension")]),
            "lineHeight": self.random.choice([1, 1.5, 1.25, 2, 0.5]),
        }

    def valid_value(self, group):
        if group == "color":
            hex_color = self.hexcolor(6).lower()
            components = [round(int(hex_color[i : i + 2], 16) / 255, 4) for i in (1, 3, 5)]
            return {"colorSpace": "srgb", "components": components, "hex": hex_color}
        if group == "dimension":
            return {"value": self.random.choice([44, 0, -1, 12.25]), "unit": self.random.choice(["px", "rem"])}
        if group == "letterSpacing":
            return self.random.choice([0, -0.01, 0.06])
        if group == "fontFamily":
            return self.random.choice(
                [["A"], ["A", "B"], ["IBM Plex Sans", "sans-serif"], "{fontFamily.sans}", "{fontFamily.a-1}"]
            )
        if group == "fontWeight":
            return self.random.choice([1, 400, 700, 1000, 400.0])
        return self.typography()

    def token(self, group):
        t = {"$type": token_type(group), "$value": self.valid_value(group)}
        if self.random.random() < 0.15:
            t["$description"] = self.random.choice(["d", "", "x" * 5])
        if self.random.random() < 0.5:
            t = dict(reversed(list(t.items())))
        return t

    def gen_export(self):
        root = {}
        if self.random.random() < 0.3:
            root["$description"] = "fixture"
        groups = self.random.sample(GROUPS, self.random.randint(1, len(GROUPS)))
        for g in groups:
            if g == "color":
                node = {}
                for th in self.random.sample(["light", "dark"], self.random.randint(1, 2)):
                    node[th] = {n: self.token("color") for n in self.random.sample(NAMES, self.random.randint(1, 5))}
                    if self.random.random() < 0.1:
                        node[th]["$description"] = "theme"
            else:
                node = {
                    n: self.token(g)
                    for n in self.random.sample(KEYS[:12] + NAMES, self.random.randint(1, 4))
                    if not n.startswith("$")
                }
                if not node:
                    node = {"a": self.token(g)}
            if self.random.random() < 0.1:
                node["$description"] = "group"
            root[g] = node
        return root

    def paths(self, node, pre=()):
        out = [pre]
        if isinstance(node, dict):
            for k, v in node.items():
                out += self.paths(v, pre + (k,))
        elif isinstance(node, list):
            for i, v in enumerate(node):
                out += self.paths(v, pre + (i,))
        return out

    def setp(self, root, p, value):
        cur = root
        for k in p[:-1]:
            cur = cur[k]
        cur[p[-1]] = value

    def getp(self, root, p):
        for k in p:
            root = root[k]
        return root

    def rand_json(self, depth=0):
        r = self.random.random()
        if depth > 3 or r < 0.45:
            return self.random.choice(HOSTILE[:26] + [self.hexcolor(self.random.choice([3, 4, 6, 8])), "v", 2, 3.25])
        if r < 0.7:
            return [self.rand_json(depth + 1) for _ in range(self.random.randint(0, 3))]
        return {k: self.rand_json(depth + 1) for k in self.random.sample(KEYS, self.random.randint(0, 4))}

    def mutate_export(self, root):
        ps = [p for p in self.paths(root) if p]
        kind = self.random.random()
        p = self.random.choice(ps)
        if kind < 0.45:
            self.setp(root, p, self.random.choice(HOSTILE))
        elif kind < 0.6:
            node = self.getp(root, p)
            if isinstance(node, dict):
                node[self.random.choice(["extra", "$extra", "$type", "$value", "$description", "x"])] = (
                    self.random.choice(HOSTILE)
                )
        elif kind < 0.7:
            self.setp(root, p, {"n": self.getp(root, p)})
        elif kind < 0.8:
            root[self.random.choice(["motion", "colour", "Color", "palette", "$schema"])] = {
                "a": self.token("dimension")
            }
        elif kind < 0.9:
            node = self.getp(root, p)
            if isinstance(node, dict) and node:
                del node[self.random.choice(list(node))]
        else:
            self.setp(root, p, self.rand_json())
        return root

    def variant(self, c):
        r = self.random.random()
        if not isinstance(c, str) or not c.startswith("#"):
            return c
        h = c[1:]
        if r < 0.2:
            return c
        if r < 0.4:
            return "#" + h.upper() if self.random.random() < 0.5 else "#" + h.lower()
        if r < 0.55 and len(h) == 3:
            return "#" + "".join(ch + ch for ch in h)
        if r < 0.7:
            return "#" + h + ("f" if len(h) == 3 else "FF")
        if r < 0.8:
            return "#" + h + ("e" if len(h) == 3 else "80")
        if r < 0.9 and len(h) == 6 and h[0] == h[1] and h[2] == h[3] and h[4] == h[5]:
            return "#" + h[0] + h[2] + h[4]
        return self.hexcolor(self.random.choice([3, 4, 6, 8]))

    def palette_suite(self, exp):
        root, pal = {}, {}
        col = exp.get("color") if isinstance(exp, dict) else None
        if isinstance(col, dict):
            for th, names in col.items():
                if isinstance(names, dict) and self.random.random() < 0.85:
                    pal[th] = {}
                    for n, t in names.items():
                        if self.random.random() < 0.8 and isinstance(t, dict):
                            value = t.get("$value")
                            pal[th][n] = self.variant(value.get("hex") if isinstance(value, dict) else value)
                    for n in self.random.sample(NAMES + ["text", "accent"], self.random.randint(0, 2)):
                        pal[th].setdefault(n, self.hexcolor(self.random.choice([3, 4, 6, 8])))
        for th in self.random.sample(THEMES, self.random.randint(0, 2)):
            pal.setdefault(th, {self.random.choice(NAMES): self.hexcolor(self.random.choice([3, 4, 6, 8]))})
        root["palette"] = pal
        for k in self.random.sample(KEYS, self.random.randint(0, 3)):
            if k != "palette":
                root[k] = self.rand_json(1)
        if self.random.random() < 0.15:
            ps = [p for p in self.paths(root["palette"]) if p]
            if ps:
                self.setp(root["palette"], self.random.choice(ps), self.random.choice(HOSTILE))
        return root

    def flat(self, node):
        if isinstance(node, dict):
            if "$value" in node and self.random.random() < 0.9:
                v = node["$value"]
                r = self.random.random()
                if r < 0.4:
                    return json.loads(json.dumps(v))
                if r < 0.7:
                    return self.variant(v) if isinstance(v, str) else (list(reversed(v)) if isinstance(v, list) else v)
                return self.random.choice(HOSTILE)
            return {k: self.flat(v) for k, v in node.items() if self.random.random() < 0.9}
        return node

    def gen_suite(self, exp):
        mode = self.random.random()
        root = {}
        if mode < 0.2:
            root = self.rand_json(0)
            if not isinstance(root, dict):
                root = {"v": root}
        elif mode < 0.55:
            root = self.palette_suite(exp)
        elif mode < 0.8:
            root = self.flat(json.loads(json.dumps(exp))) if isinstance(exp, dict) else {"a": 1}
            if not isinstance(root, dict):
                root = {"a": root}
        else:
            root = json.loads(json.dumps(exp)) if isinstance(exp, dict) else {"a": 1}
            ps = [p for p in self.paths(root) if p]
            for _ in range(self.random.randint(0, 3)):
                if ps:
                    try:
                        self.setp(root, self.random.choice(ps), self.rand_json(2))
                    except (KeyError, IndexError, TypeError):
                        # Earlier mutations can invalidate a later edit position.
                        pass
        return root

    def dump(self, value):
        r = self.random.random()
        try:
            if r < 0.3:
                return json.dumps(value)
            if r < 0.5:
                return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
            if r < 0.7:
                return json.dumps(value, indent=self.random.choice([1, 2, "\t"]), ensure_ascii=False)
            if r < 0.85:
                return json.dumps(value, sort_keys=True)
            return " \n" + json.dumps(value, indent=2) + "\r\n\t "
        except TypeError:
            return json.dumps(value)

    def _text_mutations(self):
        return [
            lambda t: t.replace("{", '{"a":1,"a":2,', 1),
            lambda t: t.replace("{", '{"k":1,"\\u006b":2,', 1),
            lambda t: t.replace("{", '{"__proto__":{"p":1},', 1),
            lambda t: t.replace("{", '{"constructor":1,', 1),
            lambda t: t[:-1] + ',"prototype":[]}' if t.endswith("}") else t,
            lambda t: t + " x",
            lambda t: t + "{}",
            lambda t: "﻿" + t,
            lambda t: t[: self.random.randint(0, max(0, len(t) - 1))],
            lambda t: t.replace(":", ': NaN,"q":', 1),
            lambda t: t.replace("{", '{"big":1e400,', 1),
            lambda t: t.replace("{", '{"n":01,', 1),
            lambda t: t.replace("{", '{"n":-0,"m":1E+2,"o":1.0,"p":-1.5e-3,', 1),
            lambda t: t.replace("{", '{"n":1.,', 1),
            lambda t: t.replace("{", '{"n":.5,', 1),
            lambda t: t.replace("{", '{"n":+1,', 1),
            lambda t: t.replace("{", '{"n":0x10,', 1),
            lambda t: t.replace("{", '{"s":"\\ud800","t":"\\u0000\\/\\b",', 1),
            lambda t: t.replace("{", '{"s":"\\x41",', 1),
            lambda t: t.replace("{", '{"s":"a\tb",', 1),
            lambda t: t.replace("{", "{'s':1,", 1),
            lambda t: t.replace("{", '{"s":1,,', 1),
            lambda t: t.replace("}", ",}", 1),
            lambda t: t.replace("{", "{/*c*/", 1),
            lambda t: '{"n":' * 63 + t + "}" * 63,
            lambda t: '{"n":' * 64 + t + "}" * 64,
            lambda t: '{"n":' * 65 + t + "}" * 65,
            lambda t: '{"n":' * 60 + "[[[[[1]]]]]" + "}" * 60,
            lambda t: '{"n":' * 60 + "[[[[1]]]]" + "}" * 60,
            lambda t: '{"n":' * 60 + "[[[1]]]" + "}" * 60,
            lambda t: t.replace("{", '{"deep":' + "[" * 62 + "]" * 62 + ",", 1),
            lambda t: t.replace("{", '{"deep":' + "[" * 63 + "1" + "]" * 63 + ",", 1),
            lambda t: t.replace("{", '{"deep":' + "[" * 64 + "]" * 64 + ",", 1),
            lambda t: t.replace("{", '{"deep":' + "[" * 65 + "]" * 65 + ",", 1),
            lambda t: t.replace("{", '{"true":tru,', 1),
            lambda t: t.replace("{", '{"t":true,"f":false,"z":null,"e":[],"o":{},', 1),
            lambda t: t.replace('"', "", 1),
            lambda t: (lambda i: t[:i] + t[i + 1 :])(self.random.randint(0, max(0, len(t) - 1))),
            lambda t: (lambda i: t[:i] + self.random.choice('{}[],:"\\ 01eE-+.tn') + t[i:])(
                self.random.randint(0, len(t))
            ),
            lambda t: "",
            lambda t: self.random.choice(["null", "[]", "1", '"s"', "true", "{}", "[{}]", '{"a":{}}', " ", '{"":0}']),
        ]

    def maybe_textmut(self, text, probability):
        if self.random.random() < probability:
            try:
                return self.random.choice(self.text_mutations)(text)
            except (IndexError, ValueError):
                # A mutation without a matching edit position leaves its input intact.
                return text
        return text

    def cases(self, structured_count, parser_count):
        for _ in range(structured_count):
            exp = self.gen_export()
            if self.random.random() < 0.35:
                try:
                    exp = self.mutate_export(exp)
                except (KeyError, IndexError, TypeError):
                    # An earlier shape change can invalidate a later edit position.
                    pass
            suite = self.gen_suite(exp)
            yield {"e": self.maybe_textmut(self.dump(exp), 0.08), "s": self.maybe_textmut(self.dump(suite), 0.12)}
        good = json.dumps({"color": {"light": {"bg": self.token("color")}}})
        for _ in range(parser_count):
            base = self.dump(self.rand_json(0) if self.random.random() < 0.7 else self.gen_suite(self.gen_export()))
            for _ in range(self.random.randint(1, 3)):
                base = self.maybe_textmut(base, 0.9)
            if self.random.random() < 0.5:
                yield {"e": good, "s": base}
            else:
                yield {"e": base, "s": json.dumps({"k": 1})}


def record_coverage(want, stats):
    summary = want["summary"]
    stats["sharedRawNames"] += summary["rawShared"] > 0
    stats["sharedColors"] += summary["colorShared"] > 0
    stats["normalizedNotExact"] += summary["colorNormalized"] > summary["colorExact"]
    stats["differentColors"] += summary["colorDifferent"] > 0
    stats["identicalStructure"] += summary["structuralDifferences"] == 0
    stats["arrayLengthChanges"] += any("exportLength" in row for row in want["structure"])
    stats["samePathTypeChanges"] += any(
        "missing" not in (row["exportType"], row["suiteType"]) and "exportLength" not in row
        for row in want["structure"]
    )


def compare_corpus(cases, output):
    tally = Counter({"validMatches": 0, "invalidMatches": 0, "mismatches": 0, "unexpectedErrors": 0})
    stats = Counter()
    with cases.open(encoding="utf-8") as inputs, output.open(encoding="utf-8") as results:
        for index, line in enumerate(inputs):
            case = json.loads(line)
            result_line = results.readline()
            if not result_line:
                raise AssertionError(f"missing result for corpus case {index}")
            actual = json.loads(result_line)
            try:
                want = compare(case["e"], case["s"])
            except InvalidInputError:
                want = None
            if actual.get("err", "INVALID_INPUT") != "INVALID_INPUT":
                tally["unexpectedErrors"] += 1
            matched = (
                actual.get("err") == "INVALID_INPUT" if want is None else "ok" in actual and loose(want, actual["ok"])
            )
            if matched:
                tally["invalidMatches" if want is None else "validMatches"] += 1
                if want is not None:
                    record_coverage(want, stats)
            else:
                tally["mismatches"] += 1
                print(f"MISMATCH corpus case {index}: {json.dumps(case, ensure_ascii=True)[:300]}", file=sys.stderr)
        if results.readline():
            raise AssertionError("unexpected extra corpus result")
    return dict(tally), dict(stats)


def run_node(node, arguments, env):
    return subprocess.run([node, *arguments], check=True, timeout=120, capture_output=True, env=env)


def check_snapshot(args, implementation, env):
    exported = args.export_file.read_bytes()
    suite = args.suite_file.read_bytes()
    want = compare(exported.decode("utf-8"), suite.decode("utf-8"))
    first = run_node(args.node, [str(implementation), str(args.export_file), str(args.suite_file)], env).stdout
    second = run_node(args.node, [str(implementation), str(args.export_file), str(args.suite_file)], env).stdout
    if first != second:
        raise AssertionError("snapshot CLI output is nondeterministic")
    for result in (first, second):
        if not loose(want, json.loads(result)):
            raise AssertionError("snapshot report disagrees with the Python oracle")
    if args.report_file and first != args.report_file.read_bytes():
        raise AssertionError("snapshot CLI bytes differ from the saved report")
    left, right = raw(parse(exported.decode("utf-8"))), raw(parse(suite.decode("utf-8")))
    return {
        "comparisons": 2,
        "deterministic": True,
        "savedReportMatches": 2 if args.report_file else None,
        "summary": want["summary"],
        "exportTypes": dict(Counter(row["type"] for row in want["inventories"]["export"])),
        "suitePaletteColors": sum(row["name"].startswith("/palette/") for row in want["inventories"]["suite"]),
        "rawExportNodes": len(left),
        "rawSuiteNodes": len(right),
        "rawSharedNodes": len(set(left) & set(right)),
    }


def positive_count(value):
    number = int(value)
    if number < 0:
        raise argparse.ArgumentTypeError("case counts must be nonnegative")
    return number


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--structured-cases", type=positive_count, default=6000)
    parser.add_argument("--parser-cases", type=positive_count, default=3000)
    parser.add_argument("--seed", type=int, default=20261116)
    parser.add_argument("--node", default="node")
    parser.add_argument("--export-file", type=Path)
    parser.add_argument("--suite-file", type=Path)
    parser.add_argument("--report-file", type=Path)
    args = parser.parse_args()
    if bool(args.export_file) != bool(args.suite_file) or (args.report_file and not args.export_file):
        parser.error("--export-file and --suite-file must be supplied together; --report-file requires both")
    scripts = Path(__file__).resolve().parent
    implementation = scripts / "suite_token_differential.mjs"
    env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_CONFIG_")}
    with tempfile.TemporaryDirectory(prefix="jaryo-token-corpus-") as temporary:
        root = Path(temporary)
        env["TMPDIR"] = str(root)
        cases, output = root / "cases.jsonl", root / "results.jsonl"
        with cases.open("w", encoding="utf-8") as handle:
            for case in CorpusGenerator(args.seed).cases(args.structured_cases, args.parser_cases):
                handle.write(json.dumps(case) + "\n")
        run_node(
            args.node,
            [str(scripts / "suite_token_differential_corpus.mjs"), str(implementation), str(cases), str(output)],
            env,
        )
        tally, coverage = compare_corpus(cases, output)
        result = {
            "seed": args.seed,
            "structuredCases": args.structured_cases,
            "parserCases": args.parser_cases,
            "total": args.structured_cases + args.parser_cases,
            **tally,
            "deterministicValidCases": tally["validMatches"],
            "coverage": coverage,
        }
        if args.export_file:
            result["snapshot"] = check_snapshot(args, implementation, env)
        print(json.dumps(result, sort_keys=True))
        if tally["mismatches"] or tally["unexpectedErrors"]:
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
