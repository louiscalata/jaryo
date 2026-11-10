// Every color literal in the reference screens must be a spec token, pure black/white (mono skin) or the scrim.
import fs from "node:fs";
const TOKENS = new Set(["0b1012", "141a1c", "f4f1ea", "9aa3a8", "5a676c", "e8d7a8", "c47a3a", "8fc4a0", "8fb4d6", "ffd2c8", "3a2020", "3b4448", "6b2a1e", "1f4a72", "000", "000000", "fff", "ffffff"]);
let bad = 0;
for (const f of ["reference/index.html", "reference/hero.html"]) {
  const s = fs.readFileSync(f, "utf8");
  const hexes = [...new Set((s.match(/#[0-9a-fA-F]{3,8}\b/g) || []).map(x => x.slice(1).toLowerCase()))];
  const stray = hexes.filter(h => !TOKENS.has(h) && !/^[0-9]+$/.test(h));
  const rgba = [...new Set(s.match(/rgba?\([^)]*\)/g) || [])].filter(x => !/^rgba\(0,\s*0,\s*0,\s*\.72\)$/.test(x));
  const ok = !stray.length && !rgba.length; if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"} ${f}: ${hexes.length} hex literals${stray.length ? "; not in tokens: " + stray.join(",") : ""}${rgba.length ? "; other: " + rgba.join(",") : ""}`);
}
process.exit(bad ? 1 : 0);
