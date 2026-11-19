/** Prove the fabricated fixture checks reject deliberate implementation faults. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const implementation = new URL('./suite_token_differential.mjs', import.meta.url);
const fixtures = new URL('./test_suite_token_differential.mjs', import.meta.url);
const source = fs.readFileSync(implementation, 'utf8');
const fixtureSource = fs.readFileSync(fixtures, 'utf8');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jaryo-token-mutations-'));
const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_CONFIG_')));
const mutations = [
  ['duplicate decoded keys accepted', "if (own(result, key)) invalid('duplicate JSON key');", ''],
  ['unsafe object keys accepted', "if (['__proto__', 'constructor', 'prototype'].includes(key)) invalid('unsafe JSON key');", ''],
  ['nesting bound relaxed', 'const MAX_DEPTH = 64;', 'const MAX_DEPTH = 128;'],
  ['byte bound relaxed', 'const MAX_BYTES = 4 * 1024 * 1024;', 'const MAX_BYTES = 8 * 1024 * 1024;'],
  ['nonfinite numbers accepted', "if (!Number.isFinite(result)) invalid('non-finite JSON number');", ''],
  ['trailing JSON ignored', "if (offset !== text.length) invalid('trailing JSON content');", ''],
  ['root shape unchecked', "if (kind(result) !== 'object' || Object.keys(result).length === 0) invalid('root must be a nonempty JSON object');", ''],
  ['short colors not expanded', "if (hex.length <= 4) hex = [...hex].map(char => char + char).join('');", ''],
  ['color case retained', 'let hex = value.slice(1).toLowerCase();', 'let hex = value.slice(1);'],
  ['opaque colors become transparent', "if (hex.length === 6) hex += 'ff';", "if (hex.length === 6) hex += '00';"],
  ['color normalization disabled', 'const normalized = exact || (hex !== null && hex === normalizeColor(y.value));', 'const normalized = exact;'],
  ['exact comparison ignores string case', 'const exact = isDeepStrictEqual(exportValue, y.value);', 'const exact = isDeepStrictEqual(String(exportValue).toLowerCase(), String(y.value).toLowerCase());'],
  ['noncolors included in color mapping', "const colorLeft = left.filter(item => item.type === 'color')", 'const colorLeft = left.filter(() => true)'],
  ['Suite palette comparison omitted', "const colorRight = right.filter(item => item.name.startsWith('/palette/'))", 'const colorRight = right.filter(() => false)'],
  ['export-only names omitted', 'exportOnly: sorted(a.keys()).filter(name => !b.has(name))', 'exportOnly: []'],
  ['Suite-only names omitted', 'suiteOnly: sorted(b.keys()).filter(name => !a.has(name))', 'suiteOnly: []'],
  ['report order reversed', 'const sorted = values => [...values].sort();', 'const sorted = values => [...values].sort().reverse();'],
  ['tilde pointer escaping omitted', ".replace(/~/g, '~0')", ''],
  ['slash pointer escaping omitted', ".replace(/\\//g, '~1')", ''],
  ['shared structural type changes omitted', 'if (a?.type === b?.type && a?.length === b?.length) return [];', 'if (a && b) return [];'],
  ['array length changes omitted', 'if (a?.type === b?.type && a?.length === b?.length) return [];', 'if (a?.type === b?.type) return [];'],
  ['source digest constant', "const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');", "const sha256 = () => '0'.repeat(64);"],
  ['dimension values unchecked', "if (type === 'dimension') return validDimension(value);", "if (type === 'dimension') return true;"],
  ['font weights unchecked', "if (type === 'fontWeight') return Number.isInteger(value) && value >= 1 && value <= 1000;", "if (type === 'fontWeight') return true;"],
  ['font families unchecked', "if (type === 'fontFamily') return", "if (type === 'fontFamily') return true ||"],
  ['typography member set unchecked', "return isDeepStrictEqual(sorted(Object.keys(value)), sorted([...Object.keys(refs), 'lineHeight']))", 'return true'],
  ['declared export type ignored', "value.$type !== type || ", ''],
  ['extra token fields accepted', "|| Object.keys(value).some(key => !['$type', '$value', '$description'].includes(key))", ''],
  ['uppercase export hex accepted', '/^#[0-9a-f]{6}$/.test(value.hex)', '/^#[0-9a-f]{6}$/i.test(value.hex)'],
  ['color channel disagreement accepted', ')) <= 0.5', ')) <= 255'],
  ['Suite palette values unchecked', 'Object.values(theme).some(value => normalizeColor(value) === null)', 'false'],
];
// Boundary, schema and CLI faults complement the original comparison mutations.
mutations.push(
  ['depth upper boundary exclusive', 'depth > MAX_DEPTH', 'depth >= MAX_DEPTH'],
  ['depth upper boundary relaxed by one', 'depth > MAX_DEPTH', 'depth > MAX_DEPTH + 1'],
  ['node limit removed', '++nodes > MAX_NODES', '++nodes < 0'],
  ['node limit multiplied by ten', 'const MAX_NODES = 100000;', 'const MAX_NODES = 1000000;'],
  ['byte upper boundary exclusive', "Buffer.byteLength(text, 'utf8') > MAX_BYTES", "Buffer.byteLength(text, 'utf8') >= MAX_BYTES"],
  ['UTF-16 units used for byte limit', "Buffer.byteLength(text, 'utf8') > MAX_BYTES", 'text.length > MAX_BYTES'],
  ['form feed accepted as whitespace', '/[\\t\\n\\r ]/', '/[\\t\\n\\r \\f]/'],
  ['any character accepted as colon', "if (text[offset++] !== ':') invalid('missing JSON colon');", 'offset++;'],
  ['object comma unchecked', "if (end !== ',') invalid('missing JSON comma');", '', 1],
  ['array comma unchecked', "if (end !== ',') invalid('missing JSON comma');", '', 2],
  ['empty array unsupported', "if (text[offset] === ']') { offset++; return result; }", ''],
  ['negative numbers rejected', '/^-?(?:0|[1-9]\\d*)', '/^(?:0|[1-9]\\d*)'],
  ['exponent unsupported', '(?:[eE][+-]?\\d+)?/.exec', '/.exec'],
  ['nonempty array root accepted', "if (kind(result) !== 'object' || Object.keys(result).length === 0)", "if (typeof result !== 'object' || result === null || Object.keys(result).length === 0)"],
  ['color string guard removed', "if (typeof value !== 'string' || !/^#(?:[\\da-f]{3}|[\\da-f]{4}", "if (!/^#(?:[\\da-f]{3}|[\\da-f]{4}"],
  ['em dimensions accepted', "['px', 'rem'].includes(value.unit)", "['px', 'rem', 'em'].includes(value.unit)"],
  ['extra dimension fields accepted', 'Object.keys(value).length === 2', 'Object.keys(value).length >= 2'],
  ['blank font name accepted', 'item.trim().length > 0', 'item.length > 0'],
  ['font alias end anchor removed', '/^\\{fontFamily\\.[A-Za-z0-9-]+\\}$/', '/^\\{fontFamily\\.[A-Za-z0-9-]+\\}/'],
  ['font weight upper boundary exclusive', 'value >= 1 && value <= 1000', 'value >= 1 && value < 1000'],
  ['font weight lower boundary exclusive', 'value >= 1 && value <= 1000', 'value > 1 && value <= 1000'],
  ['typography object guard removed', "if (kind(value) !== 'object') return false;", ''],
  ['typography reference string guard removed', "typeof value[key] === 'string' && new RegExp", 'new RegExp'],
  ['token depth unchecked', "\n          || depth !== (type === 'color' ? 3 : 2)) invalid", ') invalid'],
  ['empty export group accepted', "if (!keys.length) invalid('empty export group');", ''],
  ['dollar group key accepted', "if (key.startsWith('$')) invalid('unsupported export property');", ''],
  ['group description treated as token', "const keys = sorted(Object.keys(value).filter(key => key !== '$description'));", 'const keys = sorted(Object.keys(value));'],
  ['palette theme object guard removed', "if (kind(theme) !== 'object' || !Object.keys(theme).length || ", 'if (!Object.keys(theme).length || '],
  ['palette prefix missing separator', "item.name.startsWith('/palette/')", "item.name.startsWith('/palette')"],
  ['source digest uses Latin-1', ".update(text, 'utf8')", ".update(text, 'latin1')"],
  ['CLI strips BOM', 'ignoreBOM: true', 'ignoreBOM: false'],
  ['CLI compact output', 'JSON.stringify(report, null, 2)', 'JSON.stringify(report)'],
  ['opened descriptor regular-file guard removed', "if (!fs.fstatSync(fd).isFile()) invalid('input must be a regular file');", ''],
  ['export inventory pointer ordering removed', 'return result.sort(byName);', 'return result;', 1],
  ['Suite inventory pointer ordering removed', 'return result.sort(byName);', 'return result;', 2],
  ['CLI symlink entry resolution removed', 'fs.realpathSync(path.resolve(process.argv[1]))', 'path.resolve(process.argv[1])'],
  ['CLI blocking open after file replacement', 'fs.constants.O_RDONLY | fs.constants.O_NONBLOCK', 'fs.constants.O_RDONLY'],
  ['Suite arrays incorrectly descended', "if (kind(value) === 'object' && Object.keys(value).length) {", "if (value !== null && typeof value === 'object' && Object.keys(value).length) {"],
);

// These guards repeat validation later in the same synchronous input path.
// Keep the candidates executable so a future contract change exposes drift.
const equivalents = [
  ['object key quote guard removed', "if (text[offset] !== '\"') invalid('object key must be a JSON string');", '',
    'string() and JSON.parse still reject every unquoted object key'],
  ['CLI duplicate byte guard removed', "if (length > MAX_BYTES) invalid('input exceeds byte limit');", '',
    'parseTokenJson enforces the same UTF-8 byte limit on the decoded text'],
];

const runner = `
import { runChecks, runCliChecks } from './test_suite_token_differential.mjs';
import { compareTokenTexts } from './suite_token_differential.mjs';
try {
  const cases = runChecks(compareTokenTexts);
  const cliCases = runCliChecks();
  console.log(JSON.stringify({ outcome: 'SURVIVED', cases, cliCases }));
} catch (error) {
  if (error.code === 'ERR_ASSERTION') {
    console.log(JSON.stringify({ outcome: 'KILLED', message: error.message }));
    process.exitCode = 42;
  } else {
    console.error(JSON.stringify({ outcome: 'BROKEN', name: error.name, message: error.message }));
    process.exitCode = 43;
  }
}
`;

function replaceCandidate(label, anchor, replacement, occurrence) {
  const count = source.split(anchor).length - 1;
  assert.ok(occurrence ? count >= occurrence : count === 1, `mutation anchor count: ${label}: ${count}`);
  let offset = -1;
  for (let n = 0; n < (occurrence ?? 1); n++) offset = source.indexOf(anchor, offset + 1);
  return source.slice(0, offset) + replacement + source.slice(offset + anchor.length);
}

function runCandidate(name, candidate) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'suite_token_differential.mjs'), candidate);
  fs.writeFileSync(path.join(dir, 'test_suite_token_differential.mjs'), fixtureSource);
  fs.writeFileSync(path.join(dir, 'runner.mjs'), runner);
  const syntax = spawnSync(process.execPath, ['--check', path.join(dir, 'suite_token_differential.mjs')], {
    env: childEnv, encoding: 'utf8', timeout: 30000,
  });
  assert.equal(syntax.status, 0, `candidate syntax: ${name}: ${syntax.stderr}`);
  return spawnSync(process.execPath, [path.join(dir, 'runner.mjs')], {
    cwd: dir, env: { ...childEnv, TMPDIR: dir }, encoding: 'utf8', timeout: 30000,
    maxBuffer: 1024 * 1024,
  });
}

try {
  const baseline = runCandidate('baseline', source);
  assert.equal(baseline.status, 0, `baseline fixture failure: ${baseline.stdout}${baseline.stderr}`);
  const baselineResult = JSON.parse(baseline.stdout.trim().split('\n').at(-1));
  assert.equal(baselineResult.outcome, 'SURVIVED');
  console.log(`PASS baseline: ${baselineResult.cases} fixture cases, ${baselineResult.cliCases} CLI cases`);

  let killed = 0;
  let survived = 0;
  let broken = 0;
  for (const [index, [label, anchor, replacement, occurrence]] of mutations.entries()) {
    const candidate = replaceCandidate(label, anchor, replacement, occurrence);
    const result = runCandidate(`mutation-${String(index + 1).padStart(2, '0')}`, candidate);
    if (result.status === 42) {
      const verdict = JSON.parse(result.stdout.trim().split('\n').at(-1));
      assert.equal(verdict.outcome, 'KILLED');
      killed++;
      console.log(`KILLED ${index + 1}: ${label}`);
    } else if (result.status === 0) {
      survived++;
      console.log(`SURVIVED ${index + 1}: ${label}`);
    } else {
      broken++;
      console.log(`BROKEN ${index + 1}: ${label}: ${result.stderr || result.error?.message || result.signal}`);
    }
  }
  let equivalent = 0;
  for (const [index, [label, anchor, replacement, reason]] of equivalents.entries()) {
    const result = runCandidate(`equivalent-${index + 1}`, replaceCandidate(label, anchor, replacement));
    assert.equal(result.status, 0, `equivalence changed: ${label}: ${result.stdout}${result.stderr}`);
    equivalent++;
    console.log(`EQUIVALENT ${index + 1}: ${label}: ${reason}`);
  }
  console.log(`TOTAL ${killed}/${mutations.length} killed; ${survived} survived; ${broken} broken; ${equivalent} equivalent`);
  assert.equal(survived, 0, 'all non-equivalent mutants must fail the fixture assertions');
  assert.equal(broken, 0, 'execution errors outside contract assertions are not valid kills');
  assert.equal(killed, mutations.length);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
