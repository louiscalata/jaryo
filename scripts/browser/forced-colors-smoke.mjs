// Chromium forced-colors emulation. Not a Windows hardware test.
// Usage: node forced-colors-smoke.mjs <labDir> <outJson>
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const [labDir, outJson] = process.argv.slice(2);
if (!labDir || !outJson) {
  console.error("usage: node forced-colors-smoke.mjs <labDir> <outJson>");
  process.exit(1);
}
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".md": "text/markdown", ".txt": "text/plain" };
const server = http.createServer((req, res) => {
  const p = path.join(labDir, decodeURIComponent(req.url.split("?")[0]).replace(/^\/$/, "/index.html"));
  if (!p.startsWith(labDir) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/index.html`;
const out = { mode: "chromium-forced-colors-emulation", hardware: "NOT_RUN", checks: [], errors: [] };
const check = (name, pass, detail) => {
  out.checks.push({ name, pass: !!pass, detail });
  console.log(pass ? "PASS" : "FAIL", name, detail !== undefined ? JSON.stringify(detail) : "");
};

const browser = await chromium.launch(process.env.SMOKE_CHANNEL ? { channel: process.env.SMOKE_CHANNEL } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, forcedColors: "active" });
const page = await ctx.newPage();
page.on("pageerror", (e) => out.errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") out.errors.push(m.text()); });
await page.goto(url);
await page.waitForSelector(".opt-card");

const words = await page.evaluate(() => ({
  h1: document.querySelector("h1")?.innerText || "",
  title: document.querySelector("#section-title")?.innerText || "",
  card: document.querySelector(".opt-card h3")?.innerText || "",
}));
check("emulation keeps the title, family heading, and first option name", /jaryo/i.test(words.h1) && words.title.length > 0 && words.card.length > 0, words);

await page.locator(".opt-card .choose-label").first().click();
const selected = await page.evaluate(() => {
  const card = document.querySelector(".opt-card.chosen");
  const marker = card?.querySelector(".chosen-marker");
  const label = card?.querySelector(".choose-label");
  const box = label ? label.getBoundingClientRect() : { width: 0, height: 0 };
  const style = label ? getComputedStyle(label) : null;
  return {
    marker: marker?.textContent || "",
    w: box.width,
    h: box.height,
    visibility: style?.visibility,
    opacity: style?.opacity,
    color: style?.color,
    text: label?.innerText || "",
  };
});
check("selected radio stays visible and keeps its text", selected.marker.includes("CHOSEN") && selected.text.length > 0 && selected.w > 0 && selected.h > 0 && selected.visibility !== "hidden" && Number(selected.opacity) !== 0, selected);

await page.locator('.tab[aria-selected="true"]').focus();
let landed = false;
for (let i = 0; i < 12; i++) {
  await page.keyboard.press("Tab");
  landed = await page.evaluate(() => document.activeElement.matches('input[type="radio"]'));
  if (landed) break;
}
const focused = await page.evaluate(() => {
  const el = document.activeElement;
  const label = el.closest(".choose-label") || el;
  const box = label.getBoundingClientRect();
  const style = getComputedStyle(label);
  return {
    tag: el.tagName,
    text: (label.innerText || el.value || "").trim(),
    w: box.width,
    h: box.height,
    focusVisible: el.matches(":focus-visible"),
    outline: style.outlineStyle,
    outlineWidth: style.outlineWidth,
    color: style.color,
    visibility: style.visibility,
  };
});
check("focused control stays visible and keeps its text", landed && focused.focusVisible && focused.text.length > 0 && focused.w >= 44 && focused.h >= 44 && focused.visibility !== "hidden" && focused.outline !== "none", focused);

const lost = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll("h1, h2, h3, .choose-text, .chosen-marker, .btn, .navbtn")];
  return nodes.filter((el) => {
    const text = (el.innerText || "").trim();
    if (!text) return false;
    const s = getComputedStyle(el);
    return s.visibility === "hidden" || s.opacity === "0" || s.color === "transparent" || s.color === "rgba(0, 0, 0, 0)";
  }).map((el) => (el.innerText || "").trim().slice(0, 40));
});
check("forced-colors emulation does not drop visible text", lost.length === 0, lost);
check("no console errors in the emulation", out.errors.length === 0, out.errors);

fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, JSON.stringify(out, null, 2));
const passed = out.checks.filter((c) => c.pass).length;
console.log("TOTAL", passed, "/", out.checks.length, "chromium-forced-colors-emulation");
await browser.close();
server.close();
if (passed !== out.checks.length || out.errors.length) process.exit(1);
