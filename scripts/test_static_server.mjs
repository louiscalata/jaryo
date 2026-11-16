// Browser-free checks for the browser scripts' static server. Calls the request handler directly: no port is opened.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { createStaticHandler } from "./browser/static-server.mjs";
let passed = 0;
async function test(name, run) { await run(); passed++; console.log("PASS", name); }

// <tmp>/jaryo/ is the lab root; <tmp>/jaryo-pw/ is a sibling, like the PC runner's Playwright install.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jaryo-static-"));
const lab = path.join(tmp, "jaryo"), sibling = path.join(tmp, "jaryo-pw");
fs.mkdirSync(path.join(lab, "data"), { recursive: true });
fs.mkdirSync(sibling);
fs.writeFileSync(path.join(lab, "index.html"), "<p>lab</p>");
fs.writeFileSync(path.join(lab, "data", "a b.json"), "{}");
fs.writeFileSync(path.join(sibling, "x.txt"), "SIBLING");
let linked = false;
try { fs.symlinkSync(sibling, path.join(lab, "node_modules"), "junction"); linked = true; } catch { /* no symlink permission */ }
const handler = createStaticHandler(lab);

function request(url, method = "GET") {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const res = new Writable({ write(chunk, enc, cb) { chunks.push(chunk); cb(); } });
    res.statusCode = null; res.headers = {}; res.headersSent = false;
    res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
    res.writeHead = (status, headers = {}) => { res.statusCode = status; res.headersSent = true; for (const [k, v] of Object.entries(headers)) res.setHeader(k, v); return res; };
    res.once("finish", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    res.once("close", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8"), destroyed: true }));
    try { handler({ method, url }, res); } catch (error) { reject(error); }
  });
}

await test("serves index.html for /", async () => {
  const r = await request("/");
  assert.equal(r.status, 200); assert.equal(r.body, "<p>lab</p>"); assert.equal(r.headers["content-type"], "text/html");
});
await test("decodes an encoded file name and ignores the query", async () => {
  const r = await request("/data/a%20b.json?v=1");
  assert.equal(r.status, 200); assert.equal(r.headers["content-type"], "application/json");
});
await test("raw /../ to a sibling directory never serves the sibling", async () => {
  const r = await request("/../jaryo-pw/x.txt");
  assert.notEqual(r.status, 200); assert.ok(!r.body.includes("SIBLING"));
});
await test("encoded ..%2f to a sibling directory is 403", async () => {
  const r = await request("/..%2fjaryo-pw%2fx.txt");
  assert.equal(r.status, 403); assert.ok(!r.body.includes("SIBLING"));
});
await test("malformed percent-encoding is 400, not a thrown URIError", async () => {
  assert.equal((await request("/%E0%A4%A")).status, 400);
});
await test("an encoded NUL is 400", async () => {
  assert.equal((await request("/index.html%00.png")).status, 400);
});
await test("a directory is 404, not an EISDIR stream error", async () => {
  assert.equal((await request("/data")).status, 404);
  assert.equal((await request("/data/")).status, 404);
});
await test("a missing file is 404", async () => {
  assert.equal((await request("/nope.html")).status, 404);
});
await test("methods other than GET and HEAD are 405", async () => {
  const r = await request("/", "POST");
  assert.equal(r.status, 405); assert.equal(r.headers.allow, "GET, HEAD");
});
await test("HEAD answers 200 with no body", async () => {
  const r = await request("/", "HEAD");
  assert.equal(r.status, 200); assert.equal(r.body, "");
});
if (linked) {
  await test("a link inside the root that points outside it is 403", async () => {
    const r = await request("/node_modules/x.txt");
    assert.equal(r.status, 403); assert.ok(!r.body.includes("SIBLING"));
  });
}

// Every browser script uses the shared server and binds loopback only.
const browserDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "browser");
for (const name of ["smoke.mjs", "forced-colors-smoke.mjs", "audit.mjs", "axe-ci.mjs", "shots.mjs"]) {
  await test(`${name} uses static-server.mjs and opens no server of its own`, async () => {
    const src = fs.readFileSync(path.join(browserDir, name), "utf8");
    assert.match(src, /from "\.\/static-server\.mjs"/);
    assert.match(src, /await listenLoopback\(server\)/);
    assert.doesNotMatch(src, /http\.createServer|\.listen\(/);
  });
}
await test("static-server.mjs listens on 127.0.0.1 only", async () => {
  const src = fs.readFileSync(path.join(browserDir, "static-server.mjs"), "utf8");
  assert.deepEqual(src.match(/\.listen\([^)]*\)/g), ['.listen(0, "127.0.0.1")']);
});
fs.rmSync(tmp, { recursive: true, force: true });
console.log("TOTAL", passed, "/", passed, "browser-free static server");
