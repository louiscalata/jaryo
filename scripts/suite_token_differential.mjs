/** Offline comparison of the lab export and a Suite token/config snapshot. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_DEPTH = 64;
const MAX_NODES = 100000;
const TYPES = new Set(['color', 'dimension', 'fontFamily', 'fontWeight', 'typography']);
const own = (value, key) => Object.hasOwn(value, key);
const kind = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const pointer = (base, key) => `${base}/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`;
const sorted = values => [...values].sort();
const byName = (a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

function invalid(message) {
  const error = new Error(message);
  error.code = 'INVALID_INPUT';
  throw error;
}

// JSON.parse alone loses duplicate keys. Parse the grammar before extracting
// tokens, comparing decoded keys (including escaped spellings) at every depth.
export function parseTokenJson(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_BYTES) invalid('input exceeds byte limit or is not text');
  let offset = 0;
  let nodes = 0;
  const whitespace = () => { while (/[\t\n\r ]/.test(text[offset] ?? '\0')) offset++; };
  function string() {
    const start = offset++;
    while (offset < text.length) {
      const char = text[offset++];
      if (char === '\\') offset++;
      else if (char === '"') {
        try { return JSON.parse(text.slice(start, offset)); }
        catch { invalid('invalid JSON string'); }
      }
    }
    invalid('unterminated JSON string');
  }
  function value(depth) {
    if (depth > MAX_DEPTH || ++nodes > MAX_NODES) invalid('JSON nesting or node limit exceeded');
    whitespace();
    const char = text[offset];
    if (char === '"') return string();
    if (char === '{') {
      offset++;
      const result = {};
      whitespace();
      if (text[offset] === '}') { offset++; return result; }
      while (offset < text.length) {
        whitespace();
        if (text[offset] !== '"') invalid('object key must be a JSON string');
        const key = string();
        if (own(result, key)) invalid('duplicate JSON key');
        if (['__proto__', 'constructor', 'prototype'].includes(key)) invalid('unsafe JSON key');
        whitespace();
        if (text[offset++] !== ':') invalid('missing JSON colon');
        result[key] = value(depth + 1);
        whitespace();
        const end = text[offset++];
        if (end === '}') return result;
        if (end !== ',') invalid('missing JSON comma');
      }
      invalid('unterminated JSON object');
    }
    if (char === '[') {
      offset++;
      const result = [];
      whitespace();
      if (text[offset] === ']') { offset++; return result; }
      while (offset < text.length) {
        result.push(value(depth + 1));
        whitespace();
        const end = text[offset++];
        if (end === ']') return result;
        if (end !== ',') invalid('missing JSON comma');
      }
      invalid('unterminated JSON array');
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(literal, offset)) { offset += literal.length; return result; }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(offset));
    if (!number) invalid('invalid JSON value');
    offset += number[0].length;
    const result = Number(number[0]);
    if (!Number.isFinite(result)) invalid('non-finite JSON number');
    return result;
  }
  const result = value(0);
  whitespace();
  if (offset !== text.length) invalid('trailing JSON content');
  if (kind(result) !== 'object' || Object.keys(result).length === 0) invalid('root must be a nonempty JSON object');
  return result;
}

// Only hexadecimal syntax is normalized. No CSS evaluation, reference
// resolution, unit conversion, whitespace trimming or semantic alias guessing.
export function normalizeColor(value) {
  if (typeof value !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) return null;
  let hex = value.slice(1).toLowerCase();
  if (hex.length <= 4) hex = [...hex].map(char => char + char).join('');
  if (hex.length === 6) hex += 'ff';
  return `#${hex}`;
}

function validateValue(type, value) {
  if (type === 'color') return typeof value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value);
  if (type === 'dimension') return typeof value === 'string' && /^-?\d+(?:\.\d+)?(?:px|em)$/.test(value);
  if (type === 'fontFamily') return (Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string' && item.trim().length > 0))
    || (typeof value === 'string' && /^\{fontFamily\.[A-Za-z0-9-]+\}$/.test(value));
  if (type === 'fontWeight') return Number.isInteger(value) && value >= 1 && value <= 1000;
  if (type === 'typography') {
    if (kind(value) !== 'object') return false;
    const refs = { fontFamily: 'fontFamily', fontSize: 'dimension', fontWeight: 'fontWeight', letterSpacing: 'dimension' };
    return isDeepStrictEqual(sorted(Object.keys(value)), sorted([...Object.keys(refs), 'lineHeight']))
      && Object.entries(refs).every(([key, group]) => typeof value[key] === 'string' && new RegExp(`^\\{${group}\\.[A-Za-z0-9-]+\\}$`).test(value[key]))
      && typeof value.lineHeight === 'number' && value.lineHeight > 0;
  }
  return false;
}

function exportInventory(root) {
  const result = [];
  function visit(value, name, group, depth) {
    if (kind(value) !== 'object') invalid('export group must be an object');
    if (own(value, '$description') && typeof value.$description !== 'string') invalid('export description must be text');
    if (own(value, '$value') || own(value, '$type')) {
      if (!own(value, '$value') || value.$type !== group || !validateValue(group, value.$value)
          || Object.keys(value).some(key => !['$type', '$value', '$description'].includes(key))
          || depth !== (group === 'color' ? 3 : 2)) invalid('invalid export token shape or value');
      result.push({ name, type: value.$type, value: value.$value });
      return;
    }
    const keys = sorted(Object.keys(value).filter(key => key !== '$description'));
    if (!keys.length) invalid('empty export group');
    for (const key of keys) {
      if (key.startsWith('$')) invalid('unsupported export property');
      visit(value[key], pointer(name, key), group, depth + 1);
    }
  }
  if (own(root, '$description') && typeof root.$description !== 'string') invalid('export description must be text');
  for (const group of sorted(Object.keys(root).filter(key => key !== '$description'))) {
    if (!TYPES.has(group)) invalid('unsupported export group');
    visit(root[group], pointer('', group), group, 1);
  }
  if (!result.length) invalid('export contains no tokens');
  return result.sort(byName);
}

function suiteInventory(root) {
  if (own(root, 'palette')) {
    if (kind(root.palette) !== 'object' || !Object.keys(root.palette).length) invalid('Suite palette must contain themes');
    for (const theme of Object.values(root.palette)) {
      if (kind(theme) !== 'object' || !Object.keys(theme).length || Object.values(theme).some(value => normalizeColor(value) === null)) invalid('Suite palette must contain hex colors');
    }
  }
  const result = [];
  function visit(value, name) {
    if (kind(value) === 'object' && Object.keys(value).length) {
      for (const key of sorted(Object.keys(value))) visit(value[key], pointer(name, key));
    } else result.push({ name, type: kind(value), value });
  }
  visit(root, '');
  return result.sort(byName);
}

function rawStructure(root) {
  const result = new Map();
  function visit(value, name) {
    result.set(name, { type: kind(value), ...(Array.isArray(value) ? { length: value.length } : {}) });
    if (value !== null && typeof value === 'object') {
      for (const key of sorted(Object.keys(value))) visit(value[key], pointer(name, key));
    }
  }
  visit(root, '');
  return result;
}

function compareNames(left, right, color = false) {
  const a = new Map(left.map(item => [item.name, item]));
  const b = new Map(right.map(item => [item.name, item]));
  const shared = sorted(a.keys()).filter(name => b.has(name)).map(name => {
    const x = a.get(name), y = b.get(name);
    const exact = isDeepStrictEqual(x.value, y.value);
    const normalized = exact || ((color || x.type === 'color') && normalizeColor(x.value) !== null && normalizeColor(x.value) === normalizeColor(y.value));
    return color
      ? { name, exportName: x.sourceName, suiteName: y.sourceName, exportValue: x.value, suiteValue: y.value, exact, normalized }
      : { name, exportType: x.type, suiteType: y.type, exportValue: x.value, suiteValue: y.value, exact, normalized };
  });
  return { shared, exportOnly: sorted(a.keys()).filter(name => !b.has(name)), suiteOnly: sorted(b.keys()).filter(name => !a.has(name)) };
}

export function compareTokenTexts(exportText, suiteText) {
  const exported = parseTokenJson(exportText), suite = parseTokenJson(suiteText);
  const left = exportInventory(exported), right = suiteInventory(suite);
  const rawNames = compareNames(left, right);
  const colorLeft = left.filter(item => item.type === 'color').map(item => ({ ...item, sourceName: item.name, name: item.name.slice('/color'.length) }));
  const colorRight = right.filter(item => item.name.startsWith('/palette/')).map(item => ({ ...item, sourceName: item.name, name: item.name.slice('/palette'.length) }));
  const colors = { mapping: { export: '/color', suite: '/palette', rule: 'same theme and local name only' }, ...compareNames(colorLeft, colorRight, true) };
  const shapeLeft = rawStructure(exported), shapeRight = rawStructure(suite);
  const structure = sorted(new Set([...shapeLeft.keys(), ...shapeRight.keys()])).flatMap(name => {
    const a = shapeLeft.get(name), b = shapeRight.get(name);
    if (a?.type === b?.type && a?.length === b?.length) return [];
    return [{ name, exportType: a?.type ?? 'missing', suiteType: b?.type ?? 'missing',
      ...(a?.type === 'array' && b?.type === 'array' ? { exportLength: a.length, suiteLength: b.length } : {}) }];
  });
  const count = (rows, key) => rows.filter(row => row[key]).length;
  const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');
  return {
    schema: 'jaryo-suite-token-differential/v1',
    sources: { export: { sha256: sha256(exportText) }, suite: { sha256: sha256(suiteText) } },
    summary: {
      exportTokens: left.length, suiteLeaves: right.length,
      rawShared: rawNames.shared.length, rawExact: count(rawNames.shared, 'exact'), rawNormalized: count(rawNames.shared, 'normalized'),
      exportOnly: rawNames.exportOnly.length, suiteOnly: rawNames.suiteOnly.length,
      colorShared: colors.shared.length, colorExact: count(colors.shared, 'exact'), colorNormalized: count(colors.shared, 'normalized'),
      colorDifferent: colors.shared.length - count(colors.shared, 'normalized'),
      colorExportOnly: colors.exportOnly.length, colorSuiteOnly: colors.suiteOnly.length,
      structuralDifferences: structure.length,
    },
    inventories: { export: left, suite: right }, rawNames, colors, structure,
  };
}

function readInput(file) {
  // Reject special files before opening; nonblocking open also handles a path
  // replaced by a FIFO between the stat and open without waiting for a writer.
  if (!fs.statSync(file).isFile()) invalid('input must be a regular file');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
  try {
    if (!fs.fstatSync(fd).isFile()) invalid('input must be a regular file');
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = fs.readSync(fd, buffer, length, buffer.length - length, null);
      if (read === 0) break;
      length += read;
    }
    if (length > MAX_BYTES) invalid('input exceeds byte limit');
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, length));
  } finally { fs.closeSync(fd); }
}

if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try {
    if (process.argv.length !== 4) invalid('usage: node scripts/suite_token_differential.mjs export.json suite.json');
    const report = compareTokenTexts(readInput(process.argv[2]), readInput(process.argv[3]));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: 'INVALID_INPUT', message: error.code === 'INVALID_INPUT' ? error.message : 'cannot read UTF-8 input files' })}\n`);
    process.exitCode = 2;
  }
}
