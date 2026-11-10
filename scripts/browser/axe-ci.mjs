// Chromium axe smoke for CI. Not a full audit.
// Usage: node axe-ci.mjs <labDir> <outJson>
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const [labDir, outJson] = process.argv.slice(2);
if (!labDir || !outJson) {
  console.error("usage: node axe-ci.mjs <labDir> <outJson>");
  process.exit(1);
}
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const p = path.join(labDir, decodeURIComponent(req.url.split("?")[0]).replace(/^\/$/, "/index.html"));
  if (!p.startsWith(labDir) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/index.html`;
const cases = [
  { name: "light-1280", colorScheme: "light", width: 1280 },
  { name: "light-375", colorScheme: "light", width: 375 },
  { name: "dark-1280", colorScheme: "dark", width: 1280 },
  { name: "dark-375", colorScheme: "dark", width: 375 },
];
const browser = await chromium.launch();
const results = [];
let failed = 0;
for (const c of cases) {
  const ctx = await browser.newContext({ viewport: { width: c.width, height: 900 }, colorScheme: c.colorScheme });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForSelector(".opt-card");
  await page.addScriptTag({ content: axeSrc });
  const violations = await page.evaluate(async () => {
    const res = await axe.run(document, { resultTypes: ["violations"], runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } });
    return res.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  });
  const nodes = violations.reduce((n, v) => n + v.nodes, 0);
  failed += nodes;
  results.push({ name: c.name, violations });
  console.log(nodes === 0 ? "PASS" : "FAIL", c.name, JSON.stringify(violations));
  await ctx.close();
}
fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, JSON.stringify(results, null, 2));
await browser.close();
server.close();
if (failed) process.exit(1);
