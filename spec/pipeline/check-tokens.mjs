// Check CSS in all reference and adaptor HTML against the spec color palette.
import fs from "node:fs";
import path from "node:path";
const TOKENS = new Set(["0b1012", "141a1c", "f4f1ea", "9aa3a8", "5a676c", "e8d7a8", "c47a3a", "8fc4a0", "8fb4d6", "ffd2c8", "3a2020", "3b4448", "6b2a1e", "1f4a72", "000", "000000", "fff", "ffffff"]);
const NAMED = new Set(`aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(' '));
function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? htmlFiles(path.join(dir, e.name)) : e.name.endsWith('.html') ? [path.join(dir, e.name)] : []);
}
let bad = 0;
for (const f of ['reference', 'adaptor'].flatMap(htmlFiles).sort()) {
  const html = fs.readFileSync(f, 'utf8');
  const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>|\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map(m => m[1] ?? `{${m[2] ?? m[3]}}`).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  // Hex literals (minus character references) and color functions (minus comments) are collected from the whole page, not only from CSS.
  const hexes = [...new Set([...html.replace(/&#x?[0-9a-f]+;/gi, '').matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0].slice(1).toLowerCase()))];
  const stray = hexes.filter(h => !TOKENS.has(h));
  const funcs = [...new Set(html.replace(/\/\*[\s\S]*?\*\//g, '').match(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\([^)]*\)/gi) || [])].filter(x => !/^rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*\.72\s*\)$/i.test(x));
  // Examine declaration values, excluding custom-property references and quoted strings.
  const values = [...css.matchAll(/(?:^|[;{])\s*(?:--[\w-]+|[\w-]+)\s*:\s*([^;}]+)/g)].map(m => m[1].replace(/var\([^)]*\)|"[^"]*"|'[^']*'/g, ''));
  const names = [...new Set(values.flatMap(v => v.match(/\b[a-z]+\b/gi) || []).map(v => v.toLowerCase()).filter(v => NAMED.has(v)))];
  const ok = !stray.length && !funcs.length && !names.length;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${f}: ${hexes.length} hex literals${stray.length ? '; not in tokens: ' + stray.join(',') : ''}${funcs.length ? '; color functions: ' + funcs.join(',') : ''}${names.length ? '; named colors: ' + names.join(',') : ''}`);
}
process.exit(bad ? 1 : 0);
