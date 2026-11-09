// WCAG 2.x contrast for the token pairs in the spec (section 4). Exits 1 if a pair is below its minimum.
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = h => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const PAIRS = [
  ["text on bg", "#F4F1EA", "#0B1012", 4.5], ["text on surface", "#F4F1EA", "#141A1C", 4.5],
  ["muted on bg", "#9AA3A8", "#0B1012", 4.5], ["muted on surface", "#9AA3A8", "#141A1C", 4.5],
  ["border on bg", "#5A676C", "#0B1012", 3], ["border on surface", "#5A676C", "#141A1C", 3],
  ["focus on bg", "#E8D7A8", "#0B1012", 3], ["focus on surface", "#E8D7A8", "#141A1C", 3],
  ["copper ink on copper", "#0B1012", "#C47A3A", 4.5], ["copper on bg", "#C47A3A", "#0B1012", 3],
  ["ok on surface", "#8FC4A0", "#141A1C", 4.5], ["run on surface", "#8FB4D6", "#141A1C", 4.5],
  ["blocked on blocked bg", "#FFD2C8", "#3A2020", 4.5], ["ink on selected fill", "#0B1012", "#F4F1EA", 4.5],
  ["sel-sub on selected fill", "#3B4448", "#F4F1EA", 4.5], ["sel-blocked on selected fill", "#6B2A1E", "#F4F1EA", 4.5],
];
let bad = 0;
for (const [n, f, b, min] of PAIRS) { const r = ratio(f, b); const pass = r >= min; if (!pass) bad++; console.log(`${pass ? "PASS" : "FAIL"} ${n}: ${r.toFixed(2)}:1 (min ${min})`); }
process.exit(bad ? 1 : 0);
