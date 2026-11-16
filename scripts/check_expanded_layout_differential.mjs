// Independent, browser-free oracle for the expanded-card assessment helpers.
// Usage: node scripts/check_expanded_layout_differential.mjs [--baseline=/absolute/module.mjs]
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { contrast, contrastOverOpaqueSurface, hasClippedOverflow, assessExpandedLayout } from "./browser/expanded-layout.mjs";
import { layoutFixture, overflowMetrics } from "./fixtures/expanded-layout.mjs";

const totals = Object.create(null);
let passed = 0;
function check(category, label, run) {
  try { run(); }
  catch (error) { console.error(`FAIL [${category}] ${label}: ${error.message}`); throw error; }
  totals[category] = (totals[category] || 0) + 1;
  passed++;
}
function close(actual, expected, label) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-10, `${label}: got ${actual}, expected ${expected}`);
}

// Reference parser intentionally uses delimiter slicing and Number(), not the
// production regular expression or its token conversion flow.
function oracleRgb(value, allowAlpha = false) {
  if (typeof value !== "string") return null;
  const open = value.indexOf("("), closeAt = value.lastIndexOf(")");
  if (open < 0 || closeAt !== value.length - 1 || value.indexOf("(", open + 1) >= 0 || value.indexOf(")") !== closeAt) return null;
  const fn = value.slice(0, open).toLowerCase();
  if (fn !== "rgb" && fn !== "rgba") return null;
  const parts = value.slice(open + 1, closeAt).split(",").map(x => x.trim());
  if (parts.length !== (fn === "rgb" ? 3 : 4)) return null;
  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
  if (parts.some(x => !numeric.test(x))) return null;
  const values = parts.map(x => Number(x));
  if (values.some(x => !Number.isFinite(x))) return null;
  if (values.slice(0, 3).some(x => x < 0 || x > 255)) return null;
  const alpha = values.length === 4 ? values[3] : 1;
  if (alpha < 0 || alpha > 1 || (!allowAlpha && alpha !== 1)) return null;
  return [values[0], values[1], values[2], alpha];
}
function oracleLum(color) {
  if (!color) return NaN;
  const weighted = color.slice(0, 3).map((channel, i) => {
    const encoded = channel / 255;
    const linear = encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
    return linear * [0.2126, 0.7152, 0.0722][i];
  });
  return weighted[0] + weighted[1] + weighted[2];
}
function oracleContrast(a, b) {
  const la = oracleLum(oracleRgb(a)), lb = oracleLum(oracleRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function oracleComposite(foreground, background) {
  const fg = oracleRgb(foreground, true), bg = oracleRgb(background);
  if (!fg || !bg) return NaN;
  const blended = [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
  return (Math.max(oracleLum([...blended, 1]), oracleLum(bg)) + 0.05) /
    (Math.min(oracleLum([...blended, 1]), oracleLum(bg)) + 0.05);
}

const colors = [
  "rgb(0,0,0)", "rgb(255,255,255)", "rgb(127,127,127)", "rgb(10,10,10)",
  "rgb(11,11,11)", "rgb(255,0,0)", "rgb(0,255,0)", "rgb(0,0,255)",
  "RGB(+0, 0e0, .0)", "rgba(0,0,0,1)", "rgba(0,0,0,.5)", "rgba(255,255,255,.25)",
  "rgba(20,80,190,.73)", "rgb(0 0 0)", "rgb(0%,0%,0%)", "transparent", "CanvasText",
  "rgb(256,0,0)", "rgba(0,0,0,1.1)", "rgb(1e309,0,0)", null,
];
for (const a of colors) for (const b of colors) {
  check("RGB contrast oracle", `${String(a)} on ${String(b)}`, () => {
    const expected = oracleContrast(a, b), actual = contrast(a, b);
    if (Number.isNaN(expected)) assert.ok(Number.isNaN(actual), `expected NaN, got ${actual}`);
    else close(actual, expected, "contrast");
  });
}
for (const fg of colors) for (const bg of colors) {
  check("alpha compositing oracle", `${String(fg)} over ${String(bg)}`, () => {
    const expected = oracleComposite(fg, bg), actual = contrastOverOpaqueSurface(fg, bg);
    if (Number.isNaN(expected)) assert.ok(Number.isNaN(actual), `expected NaN, got ${actual}`);
    else close(actual, expected, "composited contrast");
  });
}

// Axis-by-axis excess oracle: only scroll excess on a non-visible axis matters;
// NaN comparisons are false by definition, and zero client-size uses same rule.
function oracleClips(m) {
  const x = m.overflowX !== "visible" && m.scrollWidth - m.clientWidth > 1;
  const y = m.overflowY !== "visible" && m.scrollHeight - m.clientHeight > 1;
  return x || y;
}
for (const axis of ["X", "Y"]) for (const overflow of ["visible", "hidden", "clip", "auto", "scroll"]) {
  for (const client of [0, 100]) for (const excess of [-1, 0, 1, 1.001, 2, NaN]) {
    const field = axis === "X" ? "scrollWidth" : "scrollHeight";
    const clientField = axis === "X" ? "clientWidth" : "clientHeight";
    const overflowField = "overflow" + axis;
    const m = overflowMetrics({ [overflowField]:overflow, [field]:client + excess, [clientField]:client });
    check("axis clipping oracle", `${axis}/${overflow}/client=${client}/excess=${excess}`, () => assert.equal(hasClippedOverflow(m), oracleClips(m)));
  }
}
for (const [field, value] of [["scrollWidth", NaN], ["clientWidth", NaN], ["scrollHeight", NaN], ["clientHeight", NaN]]) {
  const m = overflowMetrics({ [field]:value });
  check("axis clipping NaN oracle", field, () => assert.equal(hasClippedOverflow(m), oracleClips(m)));
}

const keys = ["expanded", "placement", "width", "containment", "separateCards", "rootFits", "folios", "titleContrast", "forcedColors"];
const allTrue = Object.fromEntries(keys.map(k => [k, true]));
function mutate(label, change, expectedFalse, options = {}) {
  const { snapshot, options: defaults } = layoutFixture(options);
  change(snapshot);
  const expected = { ...allTrue };
  for (const name of expectedFalse) expected[name] = false;
  check("layout explicit oracle", label, () => assert.deepEqual(assessExpandedLayout(snapshot, { ...defaults, ...options }), expected));
}
for (const width of [260, 375, 980, 981, 1280, 1920]) for (const wide of [false, true]) {
  const fixture = layoutFixture({ width, wide });
  check("layout valid scenarios", `width=${width},wide=${wide}`, () => assert.deepEqual(assessExpandedLayout(fixture.snapshot, fixture.options), allTrue));
}
mutate("one aria state", s => { s.cards[0].ariaExpanded = "false"; }, ["expanded"]);
mutate("missing note", s => { s.cards[0].notes.pop(); }, ["placement"]);
mutate("title-preview gap beyond tolerance", s => { s.cards[0].title.bottom = s.cards[0].preview.top + 1.01; }, ["placement"]);
mutate("stacked note before preview bottom", s => { s.cards[0].notes[4].top = s.cards[0].preview.bottom - 1.01; }, ["placement"], { width:375 });
mutate("inline note before preview edge", s => { s.cards[0].notes[4].left = s.cards[0].preview.right - 1.01; }, ["placement"], { width:1280 });
mutate("wide preview misaligned", s => { s.cards[0].preview.left += 1.01; }, ["width"], { wide:true });
mutate("desktop card not expanded", s => { s.cards[0].card.width = s.collapsedWidth + 1; }, ["width"], { width:1280 });
mutate("narrow card width mismatch", s => { s.cards[0].card.width += 1.01; }, ["width"], { width:375 });
mutate("child outside body", s => { s.cards[0].children.push({ ...s.cards[0].body, right:s.cards[0].body.right + 1.01 }); }, ["containment"]);
mutate("clipped descendant", s => { s.cards[0].clipped.push("fixture descendant"); }, ["containment"]);
mutate("card overlap", s => { const a=s.cards[0].card; s.cards[1].card={...a}; }, ["separateCards"]);
mutate("root overflow exceeds tolerance", s => { s.rootOverflow=1.01; }, ["rootFits"]);
mutate("folio family mismatch", s => { s.cards[0].folioFamily="IBM Plex Sans"; }, ["folios"]);
mutate("title below contrast threshold", s => { s.cards[0].titleColor="rgb(119,119,119)"; }, ["titleContrast", "forcedColors"]);
mutate("forced color border absent only", s => { s.cards[0].borderStyle="none"; }, ["forcedColors"]);
mutate("forced color border contrast low only", s => { s.cards[0].borderColor="rgb(149,149,149)"; }, ["forcedColors"]);
mutate("forced color title hidden only", s => { s.cards[0].titleVisible=false; }, ["forcedColors"]);
mutate("wrong count gates three count-dependent fields", s => { s.cards.pop(); }, ["expanded", "placement", "width"]);

function normalized(value) {
  if (typeof value === "number" && Number.isNaN(value)) return "<NaN>";
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, normalized(value[k])]));
  return value;
}
function equalResult(a, b) { assert.deepEqual(normalized(a), normalized(b)); }
const baselineArg = process.argv.slice(2).find(x => x.startsWith("--baseline="));
if (baselineArg) {
  const baselinePath = baselineArg.slice("--baseline=".length);
  assert.ok(path.isAbsolute(baselinePath), "--baseline must be an absolute module path");
  const baseline = await import(pathToFileURL(baselinePath).href);
  const sample = ["rgb(0,0,0)", "rgb(127,127,127)", "rgba(0,0,0,.5)", "rgb(0 0 0)", "CanvasText", null];
  for (const a of sample) for (const b of sample) {
    check("baseline contrast comparison", `${String(a)} / ${String(b)}`, () => equalResult(contrast(a, b), baseline.contrast(a, b)));
    check("baseline alpha comparison", `${String(a)} / ${String(b)}`, () => equalResult(contrastOverOpaqueSurface(a, b), baseline.contrastOverOpaqueSurface(a, b)));
  }
  for (const axis of ["X", "Y"]) for (const delta of [0, 1, 1.5, 2, NaN]) {
    const field = axis === "X" ? "scrollWidth" : "scrollHeight";
    const clientField = axis === "X" ? "clientWidth" : "clientHeight";
    const overflowField = "overflow" + axis;
    const m = overflowMetrics({ [overflowField]:"clip", [field]:100 + delta, [clientField]:100 });
    check("baseline clipping comparison", `${axis}/${delta}`, () => equalResult(hasClippedOverflow(m), baseline.hasClippedOverflow(m)));
  }
  for (const options of [{width:1280}, {width:375}, {width:1280,wide:true}]) {
    const { snapshot, options: opts } = layoutFixture(options);
    check("baseline layout comparison", JSON.stringify(options), () => equalResult(assessExpandedLayout(snapshot, opts), baseline.assessExpandedLayout(snapshot, opts)));
  }
}

for (const [category, count] of Object.entries(totals)) console.log(`CATEGORY ${category}: ${count}`);
console.log(`TOTAL ${passed} / ${passed} browser-free expanded layout differential`);
