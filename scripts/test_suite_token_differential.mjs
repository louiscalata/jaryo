// Fabricated fixtures; no other checkout, browser or network is required.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compareTokenTexts } from './suite_token_differential.mjs';

const token = (type, value) => ({ $type: type, $value: value });
const srgb = hex => ({ colorSpace: 'srgb', components: [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255), hex });
const dimension = (value, unit = 'px') => ({ value, unit });
const colorExport = (value = srgb('#ffffff')) => ({ color: { light: { bg: token('color', value) } } });
const colorSuite = (value = '#ffffff') => ({ palette: { light: { bg: value } } });
const text = (value) => JSON.stringify(value);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const typography = () => ({
  fontFamily: '{fontFamily.sans}',
  fontSize: '{dimension.fs-3}',
  fontWeight: '{fontWeight.regular}',
  letterSpacing: dimension(-0.16),
  lineHeight: 1.5,
});

export function runChecks(compare) {
  let cases = 0;
  function check(name, fn) {
    try { fn(); }
    catch (error) { error.message = `${name}: ${error.message}`; throw error; }
    cases++;
  }
  const accept = (left, right) => {
    let result;
    assert.doesNotThrow(() => { result = compare(left, right); });
    return result;
  };
  const report = (left, right) => accept(text(left), text(right));
  const reject = (left, right) => assert.throws(() => compare(left, right), (error) => error.code === 'INVALID_INPUT');
  const goodExport = text(colorExport());
  const goodSuite = text(colorSuite());
  const missingColorValue = [
    ['', 'object'], ['/colorSpace', 'string'], ['/components', 'array'],
    ['/components/0', 'number'], ['/components/1', 'number'], ['/components/2', 'number'], ['/hex', 'string'],
  ].map(([suffix, exportType]) => ({ name: `/color/light/bg/$value${suffix}`, exportType, suiteType: 'missing' }));

  check('case-only color normalization and complete base report', () => {
    const result = report(colorExport(), colorSuite('#FFFFFF'));
    assert.equal(result.schema, 'jaryo-suite-token-differential/v1');
    assert.deepEqual(result.sources, {
      export: { sha256: digest(goodExport) },
      suite: { sha256: digest(text(colorSuite('#FFFFFF'))) },
    });
    assert.deepEqual(result.inventories.export, [{ name: '/color/light/bg', type: 'color', value: srgb('#ffffff') }]);
    assert.deepEqual(result.inventories.suite, [{ name: '/palette/light/bg', type: 'string', value: '#FFFFFF' }]);
    assert.deepEqual(result.rawNames, {
      shared: [], exportOnly: ['/color/light/bg'], suiteOnly: ['/palette/light/bg'],
    });
    assert.deepEqual(result.colors, {
      mapping: { export: '/color', suite: '/palette', rule: 'same theme and local name only' },
      shared: [{
        name: '/light/bg', exportName: '/color/light/bg', suiteName: '/palette/light/bg',
        exportValue: '#ffffff', suiteValue: '#FFFFFF', exact: false, normalized: true,
      }],
      exportOnly: [], suiteOnly: [],
    });
    assert.deepEqual(result.structure, [
      { name: '/color', exportType: 'object', suiteType: 'missing' },
      { name: '/color/light', exportType: 'object', suiteType: 'missing' },
      { name: '/color/light/bg', exportType: 'object', suiteType: 'missing' },
      { name: '/color/light/bg/$type', exportType: 'string', suiteType: 'missing' },
      ...missingColorValue,
      { name: '/palette', exportType: 'missing', suiteType: 'object' },
      { name: '/palette/light', exportType: 'missing', suiteType: 'object' },
      { name: '/palette/light/bg', exportType: 'missing', suiteType: 'string' },
    ]);
    assert.deepEqual(result.summary, {
      exportTokens: 1, suiteLeaves: 1, rawShared: 0, rawExact: 0, rawNormalized: 0,
      exportOnly: 1, suiteOnly: 1, colorShared: 1, colorExact: 0, colorNormalized: 1,
      colorDifferent: 0, colorExportOnly: 0, colorSuiteOnly: 0, structuralDifferences: 14,
    });
  });
  check('exact color match', () => {
    const result = report(colorExport(srgb('#aabbcc')), colorSuite('#aabbcc'));
    assert.equal(result.colors.shared[0].exact, true);
    assert.equal(result.colors.shared[0].normalized, true);
    assert.equal(result.summary.colorExact, 1);
    assert.equal(result.summary.colorNormalized, 1);
    assert.equal(result.summary.colorDifferent, 0);
  });
  check('different colors remain different', () => {
    const result = report(colorExport(srgb('#010203')), colorSuite('#010204'));
    assert.equal(result.colors.shared[0].exact, false);
    assert.equal(result.colors.shared[0].normalized, false);
    assert.equal(result.summary.colorNormalized, 0);
    assert.equal(result.summary.colorDifferent, 1);
  });
  check('components within half a channel step preserve the export hex', () => {
    const value = { colorSpace: 'srgb', components: [0.5, 0.5, 0], hex: '#7f8000' };
    const result = report(colorExport(value), colorSuite('#7f8000'));
    assert.deepEqual(result.inventories.export[0].value, value);
    assert.equal(result.colors.shared[0].exact, true);
  });
  for (const [name, left, right, normalized] of [
    ['short and long hex', '#aabbcc', '#AbC', true],
    ['opaque long alpha', '#aabbcc', '#aabbccff', true],
    ['opaque short alpha', '#aabbcc', '#abcf', true],
    ['alpha retained', '#aabbcc', '#abce', false],
    ['black is not white', '#000000', '#fff', false],
    ['hex digits are not discarded', '#123456', '#123457', false],
  ]) check(name, () => {
    const result = report(colorExport(srgb(left)), colorSuite(right));
    assert.equal(result.colors.shared[0].normalized, normalized);
    assert.equal(result.summary.colorDifferent, normalized ? 0 : 1);
  });
  check('missing color name', () => {
    const left = colorExport(); left.color.light.fg = token('color', srgb('#000000'));
    const result = report(left, colorSuite());
    assert.deepEqual(result.colors.exportOnly, ['/light/fg']);
    assert.deepEqual(result.colors.suiteOnly, []);
    assert.equal(result.summary.colorExportOnly, 1);
    assert.equal(result.summary.colorShared, 1);
  });
  check('extra color name', () => {
    const right = colorSuite(); right.palette.light.accent = '#123';
    const result = report(colorExport(), right);
    assert.deepEqual(result.colors.exportOnly, []);
    assert.deepEqual(result.colors.suiteOnly, ['/light/accent']);
    assert.equal(result.summary.colorSuiteOnly, 1);
  });
  check('themes are distinct', () => {
    const result = report(colorExport(), { palette: { dark: { bg: '#ffffff' } } });
    assert.deepEqual(result.colors.shared, []);
    assert.deepEqual(result.colors.exportOnly, ['/light/bg']);
    assert.deepEqual(result.colors.suiteOnly, ['/dark/bg']);
  });
  check('local names are case-sensitive', () => {
    const result = report(colorExport(), { palette: { light: { BG: '#ffffff' } } });
    assert.deepEqual(result.colors.shared, []);
    assert.deepEqual(result.colors.exportOnly, ['/light/bg']);
    assert.deepEqual(result.colors.suiteOnly, ['/light/BG']);
  });
  check('semantic aliases are not guessed', () => {
    const result = report({ color: { light: { fg: token('color', srgb('#000000')) } } }, { palette: { light: { text: '#000' } } });
    assert.deepEqual(result.colors.shared, []);
    assert.deepEqual(result.colors.exportOnly, ['/light/fg']);
    assert.deepEqual(result.colors.suiteOnly, ['/light/text']);
  });
  check('secondary color mapping excludes dimension and font tokens', () => {
    const left = {
      ...colorExport(),
      dimension: { hit: token('dimension', dimension(44)) },
      fontFamily: { sans: token('fontFamily', ['A', 'B']) },
    };
    const result = report(left, { metadata: 'fixture' });
    assert.deepEqual(result.colors.shared, []);
    assert.deepEqual(result.colors.exportOnly, ['/light/bg']);
    assert.deepEqual(result.colors.suiteOnly, []);
    assert.equal(result.summary.colorExportOnly, 1);
    assert.equal(result.summary.colorSuiteOnly, 0);
    assert.equal(result.summary.exportTokens, 3);
  });
  check('exact raw name and normalized raw color', () => {
    const result = report(colorExport(srgb('#aabbcc')), { color: { light: { bg: '#AABBCC' } } });
    assert.deepEqual(result.rawNames.shared, [{
      name: '/color/light/bg', exportType: 'color', suiteType: 'string',
      exportValue: srgb('#aabbcc'), suiteValue: '#AABBCC', exact: false, normalized: true,
    }]);
    assert.equal(result.summary.rawShared, 1);
    assert.equal(result.summary.rawExact, 0);
    assert.equal(result.summary.rawNormalized, 1);
    assert.equal(result.summary.exportOnly, 0);
    assert.equal(result.summary.suiteOnly, 0);
    assert.deepEqual(result.colors.exportOnly, ['/light/bg']);
    assert.deepEqual(result.colors.suiteOnly, []);
  });
  check('raw exact values are counted', () => {
    const result = report({ letterSpacing: { track: token('number', 0.06) } }, { letterSpacing: { track: 0.06 } });
    assert.equal(result.rawNames.shared[0]?.exact, true);
    assert.equal(result.rawNames.shared[0]?.normalized, true);
    assert.equal(result.summary.rawExact, 1);
    assert.equal(result.summary.rawNormalized, 1);
  });
  check('raw dimensions are not normalized', () => {
    const result = report({ dimension: { hit: token('dimension', dimension(44)) } }, { dimension: { hit: '44px' } });
    assert.equal(result.rawNames.shared[0]?.exact, false);
    assert.equal(result.rawNames.shared[0]?.normalized, false);
  });
  check('raw numeric type does not coerce a string', () => {
    const result = report({ fontWeight: { regular: token('fontWeight', 400) } }, { fontWeight: { regular: '400' } });
    assert.equal(result.rawNames.shared[0]?.exact, false);
    assert.equal(result.rawNames.shared[0]?.normalized, false);
    assert.equal(result.rawNames.shared[0]?.exportType, 'fontWeight');
    assert.equal(result.rawNames.shared[0]?.suiteType, 'string');
  });
  check('font arrays retain their order', () => {
    const left = { fontFamily: { sans: token('fontFamily', ['A', 'B']) } };
    assert.equal(report(left, { fontFamily: { sans: ['A', 'B'] } }).rawNames.shared[0]?.exact, true);
    assert.equal(report(left, { fontFamily: { sans: ['B', 'A'] } }).rawNames.shared[0]?.exact, false);
  });
  check('array element type is not coerced', () => {
    const result = report({ fontFamily: { sans: token('fontFamily', ['1']) } }, { fontFamily: { sans: [1] } });
    assert.equal(result.rawNames.shared[0]?.exact, false);
  });
  check('all export groups and description metadata', () => {
    const left = {
      $description: 'Fixture export.',
      color: { light: { bg: { ...token('color', srgb('#ffffff')), $description: 'Fixture color.' } } },
      dimension: { size: token('dimension', dimension(1.25, 'rem')) },
      letterSpacing: { $description: 'em multipliers', tracking: token('number', -0.01) },
      fontFamily: { sans: token('fontFamily', ['A']), alias: token('fontFamily', '{fontFamily.sans}') },
      fontWeight: { regular: token('fontWeight', 400) },
      typography: { body: token('typography', typography()) },
    };
    const result = report(left, { metadata: 'fixture' });
    assert.equal(result.summary.exportTokens, 7);
    assert.deepEqual(result.inventories.export.map((entry) => entry.name), [
      '/color/light/bg', '/dimension/size', '/fontFamily/alias', '/fontFamily/sans', '/fontWeight/regular', '/letterSpacing/tracking', '/typography/body',
    ]);
    assert.deepEqual(result.inventories.export[1].value, dimension(1.25, 'rem'));
    assert.deepEqual(result.inventories.export[5], { name: '/letterSpacing/tracking', type: 'number', value: -0.01 });
    assert.deepEqual(result.inventories.export[6].value, typography());
  });
  check('Suite null, arrays and empty objects remain leaves', () => {
    const result = report(colorExport(), { z: null, b: [1, { a: true }], a: {}, n: 1, truth: false });
    assert.deepEqual(result.inventories.suite, [
      { name: '/a', type: 'object', value: {} },
      { name: '/b', type: 'array', value: [1, { a: true }] },
      { name: '/n', type: 'number', value: 1 },
      { name: '/truth', type: 'boolean', value: false },
      { name: '/z', type: 'null', value: null },
    ]);
    assert.equal(result.summary.suiteLeaves, 5);
    assert.deepEqual(result.rawNames.suiteOnly, ['/a', '/b', '/n', '/truth', '/z']);
  });
  check('JSON pointer escaping prevents name collisions', () => {
    const left = { dimension: { 'a/b~c': token('dimension', dimension(1)) } };
    const right = { dimension: { 'a/b~c': '1px', 'a~1b~0c': '2px' } };
    const result = report(left, right);
    assert.equal(result.rawNames.shared[0]?.name, '/dimension/a~1b~0c');
    assert.deepEqual(result.rawNames.suiteOnly, ['/dimension/a~01b~00c']);
  });
  check('color pointer escaping', () => {
    const result = report({ color: { light: { 'a/~bg': token('color', srgb('#ffffff')) } } }, { palette: { light: { 'a/~bg': '#fff' } } });
    assert.equal(result.colors.shared[0].name, '/light/a~1~0bg');
  });
  check('sorted report names and deterministic serialized output', () => {
    const left = { color: { light: { z: token('color', srgb('#111111')), a: token('color', srgb('#ffffff')) }, dark: { a: token('color', srgb('#000000')) } } };
    const right = { palette: { light: { z: '#111', a: '#FFF' }, dark: { a: '#000' } }, z: 1, a: 2 };
    const result = report(left, right);
    assert.equal(JSON.stringify(result), JSON.stringify(report(left, right)));
    assert.deepEqual(result.colors.shared.map((entry) => entry.name), ['/dark/a', '/light/a', '/light/z']);
    for (const rows of [result.inventories.export, result.inventories.suite, result.structure]) {
      const names = rows.map((entry) => entry.name);
      assert.deepEqual(names, [...names].sort());
    }
    assert.deepEqual(result.rawNames.suiteOnly, [...result.rawNames.suiteOnly].sort());
  });
  check('inventories sort full escaped pointers across nested siblings', () => {
    const result = report({ color: { light: { '/': token('color', srgb('#ffffff')), a: token('color', srgb('#000000')) } } }, { a: { x: 1 }, 'a-b': 2 });
    assert.deepEqual(result.inventories.export.map(entry => entry.name), ['/color/light/a', '/color/light/~1']);
    assert.deepEqual(result.inventories.suite.map(entry => entry.name), ['/a-b', '/a/x']);
  });
  check('palette prefix requires a path separator', () => {
    const result = report(colorExport(), { ...colorSuite(), palette2: { light: { bg: '#000' } } });
    assert.deepEqual(result.colors.suiteOnly, []);
    assert.equal(result.summary.colorShared, 1);
  });
  check('empty Suite array is a leaf', () => {
    assert.deepEqual(report(colorExport(), { a: [] }).inventories.suite, [{ name: '/a', type: 'array', value: [] }]);
  });
  for (const [source, value] of [['{"a":-1}', -1], ['{"a":1e2}', 100]]) {
    check(`valid JSON number ${source}`, () => {
      assert.equal(accept(goodExport, source).inventories.suite[0].value, value);
    });
  }
  for (const value of [1, 1000]) check(`inclusive font weight ${value}`, () => {
    const result = report({ fontWeight: { regular: token('fontWeight', value) } }, { a: 1 });
    assert.equal(result.inventories.export[0].value, value);
  });
  check('group description is metadata', () => {
    const result = report({ dimension: { $description: 'd', a: token('dimension', dimension(1)) } }, { a: 1 });
    assert.equal(result.summary.exportTokens, 1);
    assert.equal(result.inventories.export[0].name, '/dimension/a');
  });
  check('source digests use UTF-8 bytes', () => {
    const left = text({ ...colorExport(), $description: 'é' });
    const right = text({ a: 'é' });
    assert.deepEqual(accept(left, right).sources, {
      export: { sha256: digest(Buffer.from(left, 'utf8')) },
      suite: { sha256: digest(Buffer.from(right, 'utf8')) },
    });
  });
  check('object key insertion order does not change comparison', () => {
    const a = report({ fontFamily: { sans: token('fontFamily', ['A', 'B']) } }, { fontFamily: { sans: ['A', 'B'] } });
    const b = compare('{"fontFamily":{"sans":{"$value":["A","B"],"$type":"fontFamily"}}}', '{"fontFamily":{"sans":["A","B"]}}');
    assert.deepEqual(a.rawNames, b.rawNames);
    assert.deepEqual(a.inventories, b.inventories);
  });
  check('structure distinguishes a token object from a scalar', () => {
    const result = report(colorExport(), { color: { light: { bg: '#ffffff' } } });
    assert.deepEqual(result.structure, [
      { name: '/color/light/bg', exportType: 'object', suiteType: 'string' },
      { name: '/color/light/bg/$type', exportType: 'string', suiteType: 'missing' },
      ...missingColorValue,
    ]);
    assert.equal(result.summary.structuralDifferences, 9);
  });
  check('structure records array lengths and missing descendants', () => {
    const left = { fontFamily: { sans: token('fontFamily', ['A', 'B']) } };
    const right = { fontFamily: { sans: token('fontFamily', ['A']) } };
    const result = report(left, right);
    assert.deepEqual(result.structure, [
      { name: '/fontFamily/sans/$value', exportType: 'array', suiteType: 'array', exportLength: 2, suiteLength: 1 },
      { name: '/fontFamily/sans/$value/1', exportType: 'string', suiteType: 'missing' },
    ]);
  });
  check('same structure does not imply equal values', () => {
    const result = report(colorExport(), colorExport(srgb('#000000')));
    assert.deepEqual(result.structure, []);
    assert.equal(result.summary.structuralDifferences, 0);
    assert.equal(result.summary.rawShared, 0);
  });
  check('null and primitive structural types remain distinct', () => {
    const result = report({ fontWeight: { regular: token('fontWeight', 400) } }, { fontWeight: { regular: { $type: null, $value: true } } });
    assert.deepEqual(result.structure, [
      { name: '/fontWeight/regular/$type', exportType: 'string', suiteType: 'null' },
      { name: '/fontWeight/regular/$value', exportType: 'number', suiteType: 'boolean' },
    ]);
  });
  check('hashes identify raw bytes including whitespace', () => {
    const a = compare(goodExport, goodSuite);
    const b = compare(`${goodExport}\n`, goodSuite);
    assert.notEqual(a.sources.export.sha256, b.sources.export.sha256);
    assert.equal(b.sources.export.sha256, digest(`${goodExport}\n`));
    assert.equal(a.sources.suite.sha256, b.sources.suite.sha256);
  });
  check('hostile metadata stays inert JSON data', () => {
    const hostile = '<script>alert("fixture")</script>\n\u001b[31m`$(touch nope)`';
    const result = report(colorExport(), { note: hostile });
    assert.equal(result.inventories.suite[0].value, hostile);
    assert.equal(JSON.parse(JSON.stringify(result)).inventories.suite[0].value, hostile);
    assert.equal({}.polluted, undefined);
  });

  for (const [name, value] of [
    ['empty export', {}], ['description-only export', { $description: 'No tokens.' }],
    ['unknown group', { motion: { duration: token('dimension', dimension(1)) } }],
    ['empty group', { dimension: {} }], ['primitive group', { dimension: 1 }],
    ['array group', { dimension: [] }], ['null group', { dimension: null }],
    ['missing value', { dimension: { hit: { $type: 'dimension' } } }],
    ['missing type', { dimension: { hit: { $value: dimension(44) } } }],
    ['extra leaf field', { dimension: { hit: { ...token('dimension', dimension(44)), extra: true } } }],
    ['wrong group type', { dimension: { hit: token('color', dimension(44)) } }],
    ['wrong description type', { ...colorExport(), $description: 1 }],
    ['wrong leaf description type', { color: { light: { bg: { ...token('color', srgb('#ffffff')), $description: 1 } } } }],
    ['null value', { color: { light: { bg: token('color', null) } } }],
    ['color number', { color: { light: { bg: token('color', 123) } } }],
    ['legacy color string', colorExport('#ffffff')],
    ['color alpha is outside export schema', colorExport({ ...srgb('#aabbcc'), hex: '#abcd' })],
    ['long alpha is outside export schema', colorExport({ ...srgb('#aabbcc'), hex: '#aabbccdd' })],
    ['short export hex', colorExport({ ...srgb('#aabbcc'), hex: '#abc' })],
    ['uppercase export hex', colorExport({ ...srgb('#aabbcc'), hex: '#AABBCC' })],
    ['hex disagrees with components', colorExport({ ...srgb('#aabbcc'), hex: '#aabbcd' })],
    ['extra color property', colorExport({ ...srgb('#ffffff'), alpha: 1 })],
    ['unsupported color space', colorExport({ ...srgb('#ffffff'), colorSpace: 'display-p3' })],
    ['component outside unit interval', colorExport({ ...srgb('#ffffff'), components: [1, 1.001, 1] })],
    ['dimension number', { dimension: { hit: token('dimension', 44) } }],
    ['em dimension', { dimension: { hit: token('dimension', dimension(0.06, 'em')) } }],
    ['legacy dimension string', { dimension: { hit: token('dimension', '44px') } }],
    ['dimension extra property', { dimension: { hit: token('dimension', { ...dimension(44), extra: 0 }) } }],
    ['dimension nonnumeric value', { dimension: { hit: token('dimension', dimension('44')) } }],
    ['letter spacing string', { letterSpacing: { track: token('number', '0.06') } }],
    ['letter spacing boolean', { letterSpacing: { track: token('number', true) } }],
    ['color token at shallow depth', { color: { light: token('color', srgb('#ffffff')) } }],
    ['unsupported color theme', { color: { custom: { bg: token('color', srgb('#ffffff')) } } }],
    ['dimension token at deep depth', { dimension: { a: { b: token('dimension', dimension(1)) } } }],
    ['empty group beside valid group', { ...colorExport(), dimension: {} }],
    ['reserved group property', { color: { light: { $x: token('color', srgb('#ffffff')) } } }],
    ['empty font array', { fontFamily: { sans: token('fontFamily', []) } }],
    ['empty font name', { fontFamily: { sans: token('fontFamily', ['']) } }],
    ['whitespace font name', { fontFamily: { sans: token('fontFamily', [' ']) } }],
    ['non-string font', { fontFamily: { sans: token('fontFamily', [1]) } }],
    ['literal font string', { fontFamily: { sans: token('fontFamily', 'Sans') } }],
    ['wrong font alias group', { fontFamily: { sans: token('fontFamily', '{dimension.sans}') } }],
    ['font alias trailing content', { fontFamily: { sans: token('fontFamily', '{fontFamily.sans}x') } }],
    ['weight string', { fontWeight: { regular: token('fontWeight', '400') } }],
    ['weight fraction', { fontWeight: { regular: token('fontWeight', 400.5) } }],
    ['weight zero', { fontWeight: { regular: token('fontWeight', 0) } }],
    ['weight too large', { fontWeight: { regular: token('fontWeight', 1001) } }],
    ['typography array', { typography: { body: token('typography', []) } }],
    ['typography null', { typography: { body: token('typography', null) } }],
  ]) check(`reject ${name}`, () => reject(text(value), goodSuite));

  for (const [name, value] of [
    ['leading color whitespace', ' #fff'], ['trailing color whitespace', '#fff '],
    ['CSS function', 'rgb(0,0,0)'], ['named color', 'white'],
    ['hostile CSS', '#fff; background:url(javascript:alert(1))'],
    ['hostile markup', '<img src=x onerror=alert(1)>'],
    ['invalid hex length', '#fffff'], ['invalid hex digit', '#ggg'],
  ]) check(`reject ${name}`, () => {
    reject(text(colorExport({ ...srgb('#ffffff'), hex: value })), goodSuite);
    reject(goodExport, text(colorSuite(value)));
  });

  check('typography permits a dimension reference for letter spacing', () => {
    const value = { ...typography(), letterSpacing: '{dimension.track-body}' };
    assert.deepEqual(report({ typography: { body: token('typography', value) } }, { a: 1 }).inventories.export[0].value, value);
  });
  for (const [field, value] of [
    ['fontFamily', '{dimension.sans}'], ['fontSize', 14], ['fontSize', ['{dimension.a}']], ['fontWeight', '{fontFamily.bold}'],
    ['letterSpacing', '0.06em'], ['lineHeight', '1.5'], ['lineHeight', 0], ['lineHeight', -1],
  ]) check(`reject typography ${field} ${text(value)}`, () => {
    reject(text({ typography: { body: token('typography', { ...typography(), [field]: value }) } }), goodSuite);
  });
  check('reject missing typography field', () => {
    const value = typography(); delete value.fontSize;
    reject(text({ typography: { body: token('typography', value) } }), goodSuite);
  });
  check('reject extra typography field', () => {
    reject(text({ typography: { body: token('typography', { ...typography(), extra: 'value' }) } }), goodSuite);
  });
  for (const [name, value] of [
    ['empty Suite', {}], ['palette scalar', { palette: 1 }], ['palette null', { palette: null }],
    ['palette array', { palette: [] }], ['empty palette', { palette: {} }],
    ['empty palette theme', { palette: { light: {} } }], ['palette theme scalar', { palette: { light: 1 } }],
    ['palette theme array', { palette: { light: [] } }], ['nonempty palette theme array', { palette: { light: ['#fff'] } }],
    ['palette color array', { palette: { light: { bg: ['#fff'] } } }], ['palette color number', { palette: { light: { bg: 1 } } }],
    ['palette color object', { palette: { light: { bg: srgb('#ffffff') } } }],
  ]) check(`reject ${name}`, () => reject(goodExport, text(value)));

  for (const [name, value] of [
    ['empty input', ''], ['null root', 'null'], ['array root', '[]'], ['number root', '1'],
    ['nonempty numeric array root', '[1]'], ['nonempty object array root', '[{"a":1}]'],
    ['string root', '"value"'], ['boolean root', 'true'], ['trailing data', '{} {}'],
    ['trailing comma', '{"a":1,}'], ['comment', '{/*fixture*/"a":1}'],
    ['NaN', '{"a":NaN}'], ['overflow number', '{"a":1e400}'], ['bad escape', '{"a":"\\x41"}'],
    ['unescaped control', '{"a":"\n"}'], ['unterminated string', '{"a":"value}'],
    ['form feed whitespace', '{"a":\f1}'], ['wrong colon', '{"a";1}'],
    ['wrong object comma', '{"a":1;"b":2}'], ['wrong array comma', '{"a":[1;2]}'],
    ['missing colon', '{"a" 1}'], ['leading zero', '{"a":01}'], ['BOM', '\uFEFF{"a":1}'],
  ]) check(`reject malformed JSON ${name} on either side`, () => {
    reject(value, goodSuite);
    reject(goodExport, value);
  });
  check('reject trailing data after a valid nonempty root', () => {
    reject(`${goodExport} false`, goodSuite);
    reject(goodExport, `${goodSuite} false`);
  });
  for (const value of [
    '{"a":1,"a":2}', '{"a":1,"\\u0061":2}',
    '{"outer":{"a":1,"a":2}}', '{"outer":[{"a":1,"a":2}]}',
  ]) check(`reject duplicate Suite keys ${value}`, () => reject(goodExport, value));
  check('reject duplicate export value', () => {
    reject(goodExport.replace('"$value":', `"$value":${text(srgb('#000000'))},"$value":`), goodSuite);
  });
  check('reject escaped duplicate export value', () => {
    reject(goodExport.replace('"$value":', `"$value":${text(srgb('#000000'))},"\\u0024value":`), goodSuite);
  });
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    check(`reject dangerous key ${key}`, () => {
      reject(goodExport, `{"${key}":{"polluted":true}}`);
      reject(goodExport, `{"safe":[{"${key}":1}]}`);
      assert.equal({}.polluted, undefined);
    });
  }
  check('reject depth above the input bound', () => {
    const deep = '{"nested":'.repeat(66) + '1' + '}'.repeat(66);
    reject(goodExport, deep);
    reject(deep, goodSuite);
  });
  check('reject input above the byte bound', () => {
    const large = text({ note: 'x'.repeat(4 * 1024 * 1024) });
    reject(goodExport, large);
    reject(large, goodSuite);
  });
  check('accept exact nesting boundary', () => {
    const result = accept(goodExport, '{"n":'.repeat(64) + '1' + '}'.repeat(64));
    assert.equal(result.inventories.suite[0].value, 1);
  });
  check('reject first nesting level above boundary', () => {
    reject(goodExport, '{"n":'.repeat(65) + '1' + '}'.repeat(65));
  });
  for (const count of [99997, 99998]) check(`accept ${count + 2} JSON value nodes`, () => {
    const result = accept(goodExport, '{"a":[' + Array(count).fill('0').join(',') + ']}');
    assert.equal(result.inventories.suite[0].value.length, count);
  });
  for (const count of [99999, 100000]) check(`reject ${count + 2} JSON value nodes`, () => {
    reject(goodExport, '{"a":[' + Array(count).fill('0').join(',') + ']}');
  });
  check('accept exact input byte boundary', () => {
    const right = '{"a":1}' + ' '.repeat(4 * 1024 * 1024 - 7);
    assert.equal(Buffer.byteLength(right, 'utf8'), 4 * 1024 * 1024);
    assert.equal(accept(goodExport, right).inventories.suite[0].value, 1);
  });
  check('byte boundary counts UTF-8 rather than code units', () => {
    const right = text({ n: 'é'.repeat(2 * 1024 * 1024) });
    assert.ok(right.length < 4 * 1024 * 1024);
    assert.ok(Buffer.byteLength(right, 'utf8') > 4 * 1024 * 1024);
    reject(goodExport, right);
  });
  return cases;
}

export function runCliChecks() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jaryo-suite-differential-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_CONFIG_')));
  env.TMPDIR = root;
  const checker = fileURLToPath(new URL('./suite_token_differential.mjs', import.meta.url));
  const left = path.join(root, 'export.json');
  const right = path.join(root, 'suite.json');
  const run = (args) => spawnSync(process.execPath, [checker, ...args], { cwd: root, env, encoding: 'utf8', timeout: 10000 });
  let cases = 0;
  function invalid(args) {
    const result = run(args);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).error, 'INVALID_INPUT');
    assert.ok(!result.stderr.includes(root), 'local input paths must not leak');
    cases++;
  }
  try {
    fs.writeFileSync(left, text(colorExport()));
    fs.writeFileSync(right, text(colorSuite('#000000')));
    const first = run([left, right]);
    assert.equal(first.error, undefined);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stderr, '');
    assert.equal(first.stdout, `${JSON.stringify(compareTokenTexts(text(colorExport()), text(colorSuite('#000000'))), null, 2)}\n`);
    assert.equal(JSON.parse(first.stdout).summary.colorDifferent, 1);
    assert.ok(!first.stdout.includes(root));
    cases++;
    const second = run([left, right]);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(first.stdout, second.stdout);
    cases++;
    if (process.platform !== 'win32') {
      const link = path.join(root, 'checker-link.mjs');
      fs.symlinkSync(checker, link);
      const linked = spawnSync(process.execPath, [link, left, right], { cwd: root, env, encoding: 'utf8', timeout: 10000 });
      assert.equal(linked.error, undefined);
      assert.equal(linked.status, 0, linked.stderr);
      assert.equal(linked.stderr, '');
      assert.equal(linked.stdout, first.stdout);
      cases++;
      const preservedLink = spawnSync(process.execPath, ['--preserve-symlinks-main', link, left, right], {
        cwd: root, env, encoding: 'utf8', timeout: 10000,
      });
      assert.equal(preservedLink.error, undefined);
      assert.equal(preservedLink.status, 0, preservedLink.stderr);
      assert.equal(preservedLink.stderr, '');
      assert.equal(preservedLink.stdout, first.stdout);
      cases++;
      const fifo = path.join(root, 'input.fifo');
      const created = spawnSync('mkfifo', [fifo], { cwd: root, env, encoding: 'utf8', timeout: 10000 });
      assert.equal(created.error, undefined);
      assert.equal(created.status, 0, created.stderr);
      invalid([fifo, right]);
      invalid([left, fifo]);
      if (fs.existsSync('/dev/null')) {
        invalid(['/dev/null', right]);
        const preload = path.join(root, 'replace-after-stat.cjs');
        const replacement = path.join(root, 'replacement');
        fs.writeFileSync(preload, `
const fs = require('node:fs');
const original = fs.statSync;
fs.statSync = function(file, ...args) {
  const result = original.call(this, file, ...args);
  if (file === process.argv[3]) {
    fs.renameSync(process.env.INPUT_REPLACEMENT, file);
  }
  return result;
};
`);
        fs.symlinkSync('/dev/null', replacement);
        const changed = spawnSync(process.execPath, ['--require', preload, checker, left, right], {
          cwd: root, env: { ...env, INPUT_REPLACEMENT: replacement }, encoding: 'utf8', timeout: 10000,
        });
        assert.equal(changed.error, undefined);
        assert.equal(changed.status, 2, changed.stdout + changed.stderr);
        assert.equal(changed.stdout, '');
        assert.equal(JSON.parse(changed.stderr).message, 'input must be a regular file');
        cases++;
        fs.unlinkSync(right);
        fs.writeFileSync(right, text(colorSuite('#000000')));
        const replacementFifo = path.join(root, 'replacement.fifo');
        const createdReplacement = spawnSync('mkfifo', [replacementFifo], { cwd: root, env, encoding: 'utf8', timeout: 10000 });
        assert.equal(createdReplacement.error, undefined);
        assert.equal(createdReplacement.status, 0, createdReplacement.stderr);
        const changedFifo = spawnSync(process.execPath, ['--require', preload, checker, left, right], {
          cwd: root, env: { ...env, INPUT_REPLACEMENT: replacementFifo }, encoding: 'utf8', timeout: 2000,
        });
        assert.equal(changedFifo.error, undefined, 'a file replaced by a FIFO must not block');
        assert.equal(changedFifo.status, 2, changedFifo.stdout + changedFifo.stderr);
        assert.equal(changedFifo.stdout, '');
        assert.equal(JSON.parse(changedFifo.stderr).message, 'input must be a regular file');
        cases++;
        fs.unlinkSync(right);
        fs.writeFileSync(right, text(colorSuite('#000000')));
      }
    }
    invalid([]);
    invalid([left]);
    invalid([left, right, 'extra']);
    invalid([path.join(root, 'absent.json'), right]);
    invalid([root, right]);
    fs.writeFileSync(right, '{"palette":{"light":{"bg":"#fff","bg":"#000"}}}');
    invalid([left, right]);
    for (const bytes of [[0xc3, 0x28], [0xc0, 0xaf], [0xe2, 0x82], [0xed, 0xa0, 0x80], [0x80]]) {
      fs.writeFileSync(right, Buffer.concat([Buffer.from('{"a":"'), Buffer.from(bytes), Buffer.from('"}')]));
      invalid([left, right]);
    }
    fs.writeFileSync(right, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text(colorSuite()), 'utf8')]));
    invalid([left, right]);
    fs.writeFileSync(right, text(colorSuite()));
    fs.writeFileSync(left, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text(colorExport()), 'utf8')]));
    invalid([left, right]);
    fs.writeFileSync(left, text(colorExport()));
    fs.writeFileSync(right, text({ note: 'x'.repeat(4 * 1024 * 1024) }));
    invalid([left, right]);
    return cases;
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

export function runSuiteTokenDifferentialChecks() {
  const cases = runChecks(compareTokenTexts);
  const cliCases = runCliChecks();
  console.log(`PASS suite token differential: ${cases} fixture cases, ${cliCases} CLI cases`);
  return { cases, cliCases };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSuiteTokenDifferentialChecks();
}
