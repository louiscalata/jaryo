import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildView, latestRecordFile } from "../adaptor/jaryo-adaptor.mjs";
import { renderViewPage } from "../adaptor/build-view-page.mjs";

let n = 0, failed = 0; const ok = (c, m) => { n++; if (!c) { failed++; console.log("FAIL", m); } else console.log("PASS", m); };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "adaptor", "jaryo-cli.mjs");
const journal = path.join(root, "pipeline", "fixtures", "nisi-bundle-demo-journal.jsonl");
const manifest = path.join(root, "pipeline", "nisi-bundle-demo.manifest.json");
const recordDir = path.join(root, "pipeline", "runs");
const recordManifest = path.join(root, "pipeline", "jaryo-verify.manifest.json");

const before = {
  journal: fs.readFileSync(journal),
  manifest: fs.readFileSync(manifest),
  journalM: fs.statSync(journal).mtimeMs,
  manifestM: fs.statSync(manifest).mtimeMs,
};

let r = spawnSync(process.execPath, [cli, "connect", journal, "--manifest", manifest, "--json"], { encoding: "utf8" });
ok(r.status === 0, "json connect exits 0");
const view = JSON.parse(r.stdout);
ok(view.steps?.find(s => s.id === "fixed-run")?.state === "OK", "fixed-run ok");
ok(view.steps?.find(s => s.id === "tests")?.state === "UNKNOWN", "tests unknown");

r = spawnSync(process.execPath, [cli, "connect", journal, "--manifest", manifest], { encoding: "utf8" });
ok(r.status === 0, "summary exits 0");
ok(r.stdout.includes("OK       fixed-run"), "summary has fixed-run");
ok(r.stdout.includes("UNKNOWN  tests"), "summary has tests unknown");
ok(r.stdout.includes("unauthenticated"), "summary mentions unauthenticated");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jaryo-"));
const out = path.join(tmp, "view.html");
r = spawnSync(process.execPath, [cli, "connect", journal, "--manifest", manifest, "--out", out], { encoding: "utf8" });
ok(r.status === 0, "out exits 0");
ok(fs.existsSync(out) && fs.readFileSync(out, "utf8").includes("jaryo-view/0") && fs.readFileSync(out, "utf8").includes("fixed-run"), "html written");

ok(fs.readFileSync(journal).equals(before.journal) && fs.readFileSync(manifest).equals(before.manifest), "bytes unchanged");
ok(fs.statSync(journal).mtimeMs === before.journalM && fs.statSync(manifest).mtimeMs === before.manifestM, "mtimes unchanged");

r = spawnSync(process.execPath, [cli, "connect", journal, "--manifest", manifest, "--out", journal], { encoding: "utf8" });
ok(r.status === 2, "refuse out equal target");
ok(fs.readFileSync(journal).equals(before.journal), "target unchanged");
const out2 = path.join(tmp, "exists.html");
fs.writeFileSync(out2, "x");
r = spawnSync(process.execPath, [cli, "connect", journal, "--manifest", manifest, "--out", out2], { encoding: "utf8" });
ok(r.status === 2, "existing out refused");

r = spawnSync(process.execPath, [cli, "connect", recordDir, "--manifest", recordManifest, "--kind", "record", "--json"], { encoding: "utf8" });
ok(r.status === 0, "record kind exits 0");
const expected = buildView(JSON.parse(fs.readFileSync(recordManifest, "utf8")), fs.readFileSync(path.join(recordDir, latestRecordFile(fs.readdirSync(recordDir))), "utf8"));
ok(JSON.stringify(JSON.parse(r.stdout).steps) === JSON.stringify(expected.steps), "record states match adaptor");

r = spawnSync(process.execPath, [cli, "connect", journal, "--manifest", manifest, "--kind", "nope"], { encoding: "utf8" });
ok(r.status === 2 && !/^\s*at /m.test(r.stderr), "unknown kind no stack");
r = spawnSync(process.execPath, [cli, "connect", journal], { encoding: "utf8" });
ok(r.status === 2, "missing manifest exits 2");

r = spawnSync(process.execPath, [cli, "sources"], { encoding: "utf8" });
ok(r.stdout.includes("nisi") && r.stdout.includes("record"), "sources lists kinds");

const sourceText = fs.readFileSync(path.join(root, "adaptor", "sources.mjs"), "utf8");
ok(!/writeFileSync|appendFile|unlink|rmSync|renameSync|mkdirSync|child_process/.test(sourceText), "sources is read only");

const vfile = path.join(tmp, "view.json");
fs.writeFileSync(vfile, JSON.stringify(view));
const outHtml = path.join(tmp, "view2.html");
r = spawnSync(process.execPath, [path.join(root, "adaptor", "build-view-page.mjs"), vfile, outHtml], { encoding: "utf8" });
ok(r.status === 0, "build-view-page cli");
ok(fs.readFileSync(outHtml, "utf8") === renderViewPage(view), "renderViewPage matches cli");

console.log(`${n - failed}/${n} passed`);
process.exit(failed ? 1 : 0);
