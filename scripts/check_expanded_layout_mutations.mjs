// Optional targeted mutation check. Copies files under a private TMPDIR;
// never rewrites the source module, runs browsers or runs the full test suite.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scripts = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(scripts, "browser", "expanded-layout.mjs"), "utf8");
const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "jaryo-expanded-mutants-"));
const env = { ...process.env, TMPDIR:runDir };
for (const key of Object.keys(env)) if (key.startsWith("GIT_CONFIG_")) delete env[key];

// Each replacement must match once, remain valid JavaScript, and be killed by
// an assertion in the new regression module. Syntax/import errors do not count.
const mutants = [
  ["near excludes exact tolerance", "Math.abs(a - b) <= 1", "Math.abs(a - b) < 1"],
  ["near admits two pixels", "Math.abs(a - b) <= 1", "Math.abs(a - b) <= 2"],
  ["containment left loses tolerance", "inner.left >= outer.left - 1", "inner.left >= outer.left"],
  ["containment right loses tolerance", "inner.right <= outer.right + 1", "inner.right <= outer.right"],
  ["containment top loses tolerance", "inner.top >= outer.top - 1", "inner.top >= outer.top"],
  ["containment bottom loses tolerance", "inner.bottom <= outer.bottom + 1", "inner.bottom <= outer.bottom"],
  ["containment left too loose", "inner.left >= outer.left - 1", "inner.left >= outer.left - 2"],
  ["containment right too loose", "inner.right <= outer.right + 1", "inner.right <= outer.right + 2"],
  ["overlap includes exact X tolerance", "Math.max(a.left, b.left) + 1", "Math.max(a.left, b.left) + 0.999"],
  ["overlap includes exact Y tolerance", "Math.max(a.top, b.top) + 1", "Math.max(a.top, b.top) + 0.999"],
  ["unknown CSS calls fall back to black", "if (!call || call[0] !== color) return null;", "if (!call || call[0] !== color) return [0, 0, 0, 1];"],
  ["RGB ignores arity", "tokens.length !== count || ", ""],
  ["RGB accepts nonnumeric tokens", "!tokens.every(token => number.test(token))", "false"],
  ["RGB permits negative channels", "n < 0 || n > 255", "n > 255"],
  ["RGB permits oversized channels", "n < 0 || n > 255", "n < 0"],
  ["ordinary contrast accepts alpha", ": alpha !== 1", ": alpha < 0 || alpha > 1"],
  ["composite rejects valid translucency", "parseRgb(foreground, true)", "parseRgb(foreground)"],
  ["composite accepts translucent surface", "bg = parseRgb(background)", "bg = parseRgb(background, true)"],
  ["composite inverts foreground alpha", "n * fg[3] + bg[i] * (1 - fg[3])", "n * (1 - fg[3]) + bg[i] * fg[3]"],
  ["composite omits surface", "n * fg[3] + bg[i] * (1 - fg[3])", "n * fg[3]"],
  ["composite rounds channel", "return ratio(luminance(composite), luminance(bg))", "return ratio(luminance(composite.map(Math.round)), luminance(bg))"],
  ["luminance red weight", "linear[0] * 0.2126", "linear[0] * 0.2"],
  ["luminance green weight", "linear[1] * 0.7152", "linear[1] * 0.7"],
  ["luminance blue weight", "linear[2] * 0.0722", "linear[2] * 0.07"],
  ["luminance linear divisor", "n / 12.92", "n / 12"],
  ["luminance gamma exponent", "** 2.4", "** 2.2"],
  ["contrast ratio inverted", "(Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)", "(Math.min(x, y) + 0.05) / (Math.max(x, y) + 0.05)"],
  ["contrast offset changed", "Math.max(x, y) + 0.05", "Math.max(x, y) + 0.04"],
  ["visible X misclassified as clipped", 'm.overflowX !== "visible" && ', ""],
  ["visible Y misclassified as clipped", 'm.overflowY !== "visible" && ', ""],
  ["clipping requires both axes", '\n    || (m.overflowY', '\n    && (m.overflowY'],
  ["X clipping includes threshold", "m.scrollWidth > m.clientWidth + 1", "m.scrollWidth >= m.clientWidth + 1"],
  ["Y clipping includes threshold", "m.scrollHeight > m.clientHeight + 1", "m.scrollHeight >= m.clientHeight + 1"],
  ["X clipping too loose", "m.scrollWidth > m.clientWidth + 1", "m.scrollWidth > m.clientWidth + 2"],
  ["Y clipping too loose", "m.scrollHeight > m.clientHeight + 1", "m.scrollHeight > m.clientHeight + 2"],
  ["stacking breakpoint shifted", "wide || width <= 980", "wide || width < 980"],
  ["wide no longer stacks on desktop", "wide || width <= 980", "wide && width <= 980"],
  ["expansion ignores count", "expanded: s.cards.length === count && ", "expanded: "],
  ["expansion accepts one card only", 's.cards.every(c => c.ariaExpanded === "true")', 's.cards.some(c => c.ariaExpanded === "true")'],
  ["placement ignores count", "placement: s.cards.length === count && ", "placement: "],
  ["placement allows four notes", "c.notes.length >= 5", "c.notes.length >= 4"],
  ["placement demands six notes", "c.notes.length >= 5", "c.notes.length > 5"],
  ["title loses exact tolerance", "c.title.bottom <= c.preview.top + 1", "c.title.bottom < c.preview.top + 1"],
  ["stacked notes lose tolerance", "n.top >= c.preview.bottom - 1", "n.top >= c.preview.bottom"],
  ["side notes lose tolerance", "n.left >= c.preview.right - 1", "n.left >= c.preview.right"],
  ["side notes use only one record", "c.notes.every(n => n.left", "c.notes.some(n => n.left"],
  ["side first note may start at bottom", "c.notes[0].top < c.preview.bottom", "c.notes[0].top <= c.preview.bottom"],
  ["width ignores count", "width: s.cards.length === count && ", "width: "],
  ["desktop width accepts exact threshold", "c.card.width > s.collapsedWidth + 1", "c.card.width >= s.collapsedWidth + 1"],
  ["desktop width breakpoint shifted", "width > 980 ?", "width >= 980 ?"],
  ["containment accepts any child", "c.children.every(r => contained", "c.children.some(r => contained"],
  ["containment ignores clipped names", "c.clipped.length === 0", "c.clipped.length >= 0"],
  ["root overflow ignored", "rootFits: s.rootOverflow <= 1", "rootFits: true"],
  ["root exact threshold fails", "rootFits: s.rootOverflow <= 1", "rootFits: s.rootOverflow < 1"],
  ["folio size cannot equal title", "c.folioSize >= c.titleSize", "c.folioSize > c.titleSize"],
  ["folio identity ignored", "&& c.folioText === c.id", "&& true"],
  ["folio family ignored", "/IBM Plex Mono/.test(c.folioFamily)", "true"],
  ["title contrast threshold lowered", "titleContrast: s.cards.every(c => contrast(c.titleColor, c.background) >= 4.5)", "titleContrast: s.cards.every(c => contrast(c.titleColor, c.background) >= 4.4)"],
  ["forced-colors ignores title visibility", "&& c.titleVisible &&", "&& true &&"],
  ["forced-colors ignores title text", "c.titleText.trim() &&", "true &&"],
  ["forced-colors ignores border style", 'c.borderStyle !== "none" &&', "true &&"],
  ["forced-colors accepts zero border", "c.borderWidth > 0", "c.borderWidth >= 0"],
  ["forced-colors border threshold lowered", "contrast(c.borderColor, c.background) >= 3", "contrast(c.borderColor, c.background) >= 2.9"],
];

function prepare(label, moduleSource) {
  const directory = path.join(runDir, label);
  fs.mkdirSync(path.join(directory, "scripts", "browser"), { recursive:true });
  fs.mkdirSync(path.join(directory, "scripts", "fixtures"), { recursive:true });
  fs.writeFileSync(path.join(directory, "scripts", "browser", "expanded-layout.mjs"), moduleSource);
  for (const rel of ["test_expanded_layout.mjs", "fixtures/expanded-layout.mjs"]) {
    fs.copyFileSync(path.join(scripts, rel), path.join(directory, "scripts", rel));
  }
  return directory;
}
function execute(directory, args) {
  const result = spawnSync(process.execPath, args, { cwd:directory, env, encoding:"utf8", timeout:10000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null, "child ended with a signal");
  return result;
}

const baselineDir = prepare("baseline", source);
const baseline = execute(baselineDir, ["scripts/test_expanded_layout.mjs"]);
fs.writeFileSync(path.join(baselineDir, "tests.log"), baseline.stdout + baseline.stderr);
assert.equal(baseline.status, 0, "unmodified module must pass before mutation\n" + baseline.stderr);
console.log("PASS unmodified module control");
const results = [];
for (const [index, [name, before, after]] of mutants.entries()) {
  assert.equal(source.split(before).length - 1, 1, name + ": replacement must match once");
  const mutated = source.replace(before, after);
  assert.notEqual(mutated, source);
  const directory = prepare("mutant-" + String(index + 1).padStart(2, "0"), mutated);
  const syntax = execute(directory, ["--check", "scripts/browser/expanded-layout.mjs"]);
  assert.equal(syntax.status, 0, name + ": invalid JavaScript\n" + syntax.stderr);
  const result = execute(directory, ["scripts/test_expanded_layout.mjs"]);
  fs.writeFileSync(path.join(directory, "tests.log"), result.stdout + result.stderr);
  const failingCase = /^FAIL (.+)$/m.exec(result.stderr)?.[1];
  const killed = result.status === 1 && /AssertionError/.test(result.stderr) && !!failingCase;
  results.push({ name, killed, failingCase:failingCase || null });
  console.log(killed ? "KILLED" : "SURVIVED", name, failingCase ? "=> " + failingCase : "");
}
fs.writeFileSync(path.join(runDir, "results.json"), JSON.stringify(results, null, 2) + "\n");
const killed = results.filter(result => result.killed).length;
console.log("TOTAL", killed, "/", results.length, "expanded-layout mutants killed; evidence", runDir);
assert.ok(results.length >= 30, "at least 30 mutants are required");
assert.equal(killed, results.length, "every valid behavioral mutant must fail an assertion");
