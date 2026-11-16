// Chromium axe smoke for CI. Not a full audit.
// Usage: node axe-ci.mjs <labDir> <outJson>
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createStaticServer, listenLoopback, closeServer } from "./static-server.mjs";

if (process.platform === "darwin") {
  console.error("Chromium browser checks run in hosted CI, not on the Mac.");
  process.exit(1);
}

const cases = [
  { name: "light-1280", colorScheme: "light", width: 1280 },
  { name: "light-375", colorScheme: "light", width: 375 },
  { name: "dark-1280", colorScheme: "dark", width: 1280 },
  { name: "dark-375", colorScheme: "dark", width: 375 },
];

async function runAudit(chromium, axeSrc, labRoot, outJson) {
  const server = createStaticServer(labRoot);
  const contexts = new Set();
  let browser;
  let failed = 0;
  const results = [];
  try {
    await listenLoopback(server);
    const url = `http://127.0.0.1:${server.address().port}/index.html`;
    browser = await chromium.launch({ args: ["--use-mock-keychain", "--password-store=basic"] });
    for (const c of cases) {
      const ctx = await browser.newContext({ viewport: { width: c.width, height: 900 }, colorScheme: c.colorScheme });
      contexts.add(ctx);
      try {
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
      } finally {
        await ctx.close();
        contexts.delete(ctx);
      }
    }
    fs.mkdirSync(path.dirname(outJson), { recursive: true });
    fs.writeFileSync(outJson, JSON.stringify(results, null, 2));
    return failed;
  } finally {
    try {
      for (const ctx of contexts) {
        try { await ctx.close(); } catch { /* Browser close below is the remaining cleanup boundary. */ }
      }
      if (browser) await browser.close();
    } finally {
      await closeServer(server);
    }
  }
}

const { chromium } = await import("playwright");
const require = createRequire(import.meta.url);
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const [labDir, outJson] = process.argv.slice(2);
if (!labDir || !outJson) {
  console.error("usage: node axe-ci.mjs <labDir> <outJson>");
  process.exit(1);
}
const labRoot = fs.realpathSync(path.resolve(labDir));
if (!fs.statSync(labRoot).isDirectory()) throw new Error("labDir must be a directory");
if (await runAudit(chromium, axeSrc, labRoot, outJson)) process.exitCode = 1;
