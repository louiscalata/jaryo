// Usage: node shots.mjs <labDir> <outDir> — real screenshots of the running page (http), light+dark × 260/375/1280
import { chromium } from "playwright";
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
const [labDir, outDir] = process.argv.slice(2);
const types = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".png":"image/png" };
const server = http.createServer((req, res) => { const p = path.join(labDir, decodeURIComponent(req.url.split("?")[0]).replace(/^\/$/, "/index.html")); if (!p.startsWith(labDir) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }); fs.createReadStream(p).pipe(res); }).listen(0);
fs.mkdirSync(outDir, { recursive: true });
const b = await chromium.launch();
for (const scheme of ["light", "dark"]) for (const w of [260, 375, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: w < 500 ? 780 : 860 }, colorScheme: scheme, deviceScaleFactor: w < 500 ? 2 : 1 });
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${server.address().port}/index.html`); await p.waitForSelector(".opt-card");
  await p.locator(".opt-card .choose-label").nth(1).click();   // a real chosen state
  await p.waitForTimeout(3500);                                 // let toast clear
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(100);
  await p.screenshot({ path: path.join(outDir, `${scheme}-${w}-top.png`) });
  await p.locator("#section-title").scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, -12));
  await p.screenshot({ path: path.join(outDir, `${scheme}-${w}-cards.png`) });
  await ctx.close();
}
await b.close(); server.close(); console.log("ok");
