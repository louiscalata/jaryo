// Usage: node audit.mjs <labDir> <outJson> [screenshotDir]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const [labDir, outJson, shotDir] = process.argv.slice(2);
const types = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".png":"image/png" };
const server = http.createServer((req, res) => {
  const p = path.join(labDir, decodeURIComponent(req.url.split("?")[0]).replace(/^\/$/, "/index.html"));
  if (!p.startsWith(labDir) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }); fs.createReadStream(p).pipe(res);
}).listen(0);
const port = server.address().port;
const modes = [
  { name: "light", colorScheme: "light", reducedMotion: "no-preference" },
  { name: "dark", colorScheme: "dark", reducedMotion: "no-preference" },
  { name: "reduced-motion", colorScheme: "light", reducedMotion: "reduce" },
  { name: "dark-reduced-motion", colorScheme: "dark", reducedMotion: "reduce" },
];
const widths = [260, 375, 768, 1280];
const views = [
  { name: "F01", tab: "compare", fam: "F01" },
  { name: "F13", tab: "compare", fam: "F13" },
  { name: "F17", tab: "compare", fam: "F17" },
  { name: "journeys", tab: "journeys" },
  { name: "summary", tab: "summary" },
  { name: "docs", tab: "docs" },
];
const browser = await chromium.launch();
const results = [];
for (const m of modes) for (const w of widths) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: m.colorScheme, reducedMotion: m.reducedMotion });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForSelector(".opt-card");
  await page.addScriptTag({ content: axeSrc });
  const rec = { mode: m.name, width: w, views: {}, errors };
  const agg = {};
  for (const v of views) {
    if (v.fam) await page.click(`[data-fam="${v.fam}"]`);
    await page.click(`.tab[data-tab="${v.tab}"]`);
    await page.waitForTimeout(150);
    const r = await page.evaluate(async () => {
      const res = await axe.run(document, { resultTypes: ["violations"], runOnly: { type: "tag", values: ["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa","best-practice"] } });
      return res.violations.map((x) => ({ id: x.id, impact: x.impact, nodes: x.nodes.length, sample: x.nodes.slice(0,3).map(n=>n.target.join(" ")+" :: "+(n.failureSummary||"").slice(0,160)) }));
    });
    const hs = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    rec.views[v.name] = { violations: r, hscroll: hs.sw > hs.cw, scrollWidth: hs.sw, clientWidth: hs.cw };
    for (const x of r) agg[x.id] = (agg[x.id] || 0) + x.nodes;
    if (shotDir && (v.name === "F01" || v.name === "F17")) {
      fs.mkdirSync(shotDir, { recursive: true });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(shotDir, `${m.name}-${w}-${v.name}.png`), fullPage: w <= 375 ? false : false });
    }
  }
  rec.ruleTotals = agg;
  rec.violationRules = Object.keys(agg).length;
  rec.violationNodes = Object.values(agg).reduce((a, b) => a + b, 0);
  rec.anyHscroll = Object.values(rec.views).some((v) => v.hscroll);
  results.push(rec);
  console.log(m.name, w, "rules", rec.violationRules, "nodes", rec.violationNodes, JSON.stringify(agg), "hscroll", rec.anyHscroll, "errors", errors.length);
  await ctx.close();
}
fs.writeFileSync(outJson, JSON.stringify(results, null, 2));
await browser.close(); server.close();
