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

{
  const runs = path.join(tmp, "numbered runs");
  fs.mkdirSync(runs);
  const folder = path.join(runs, "run-3.jsonl");
  fs.mkdirSync(folder);
  const adaptor = path.join(root, "adaptor", "jaryo-adaptor.mjs");
  const commands = [
    [cli, "connect", runs, "--manifest", recordManifest, "--kind", "record", "--json"],
    [adaptor, recordManifest, runs],
  ];
  const check = (id, message) => {
    for (const args of commands) {
      const result = spawnSync(process.execPath, args, { encoding: "utf8" });
      ok(result.status === 0 && (JSON.parse(result.stdout).run?.id ?? null) === id, `${path.basename(args[0])}: ${message}`);
    }
  };
  check(null, "directories alone give an empty run");

  fs.writeFileSync(path.join(runs, "run-1.jsonl"), '{"event":"run-start","run":"regular"}\n');
  check("regular", "an older file wins over a numbered directory");

  const linkedFile = path.join(tmp, "linked run.jsonl");
  fs.writeFileSync(linkedFile, '{"event":"run-start","run":"linked"}\n');
  fs.symlinkSync(linkedFile, path.join(runs, "run-2.jsonl"), "file");
  fs.symlinkSync(folder, path.join(runs, "run-4.jsonl"), "dir");
  check("linked", "a file alias wins over a directory alias");

  fs.symlinkSync(path.join(tmp, "absent.jsonl"), path.join(runs, "run-5.jsonl"), "file");
  for (const args of commands) {
    const result = spawnSync(process.execPath, args, { encoding: "utf8" });
    ok(result.status !== 0 && result.stdout === "" && result.stderr.includes("ENOENT"), `${path.basename(args[0])}: a selected dangling alias still fails`);
  }

  const result = spawnSync(process.execPath, [adaptor, recordManifest, path.join(tmp, "missing runs")], { encoding: "utf8" });
  ok(result.status === 0 && JSON.parse(result.stdout).run === null, "standalone adaptor keeps the missing optional directory behavior");
}

r = spawnSync(process.execPath, [cli, "connect", journal, "--manifest", manifest, "--kind", "nope"], { encoding: "utf8" });
ok(r.status === 2 && !/^\s*at /m.test(r.stderr), "unknown kind no stack");
r = spawnSync(process.execPath, [cli, "connect", journal, "--manifest", path.join(tmp, "missing-manifest.json"), "--kind", "toString"], { encoding: "utf8" });
ok(r.status === 2 && r.stdout === "" && r.stderr === "unknown kind: toString\n", "an unregistered inherited kind is refused before reading the manifest");
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

// --out hardening (Glimmer review): never into the target's folder, never through a dangling symlink
{
  const besideJournal = path.join(path.dirname(journal), "jaryo-view-test.html");
  const r1 = spawnSync(process.execPath, [cli, "connect", journal, "--manifest", manifest, "--out", besideJournal], { encoding: "utf8" });
  ok(r1.status === 2 && !fs.existsSync(besideJournal), "out beside a target file (inside its folder) is refused");
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "jaryo-link-"));
  const link = path.join(d2, "view.html"); fs.symlinkSync(path.join(d2, "elsewhere.html"), link);
  const r2 = spawnSync(process.execPath, [cli, "connect", journal, "--manifest", manifest, "--out", link], { encoding: "utf8" });
  ok(r2.status === 2 && !fs.existsSync(path.join(d2, "elsewhere.html")), "a dangling symlink at out is refused and not followed");
  const r3 = spawnSync(process.execPath, [cli, "connect", journal, "--manifest", manifest, "--out", link, "--force"], { encoding: "utf8" });
  ok(r3.status === 2 && !fs.existsSync(path.join(d2, "elsewhere.html")), "a dangling symlink at out is refused even with --force");
}

// --force must not overwrite a protected input through a hard link outside its folder.
{
  const protectedDir = fs.mkdtempSync(path.join(os.tmpdir(), "jaryo-protected-"));
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "jaryo-hardlink-out-"));
  const protectedJournal = path.join(protectedDir, "journal.jsonl"), protectedManifest = path.join(protectedDir, "manifest.json");
  fs.copyFileSync(journal, protectedJournal); fs.copyFileSync(manifest, protectedManifest);
  for (const [source, label] of [[protectedJournal, "target"], [protectedManifest, "manifest"]]) {
    const hardLink = path.join(outputDir, `${label}.html`), beforeSource = fs.readFileSync(source);
    fs.linkSync(source, hardLink);
    const r4 = spawnSync(process.execPath, [cli, "connect", protectedJournal, "--manifest", protectedManifest, "--out", hardLink, "--force"], { encoding: "utf8" });
    ok(r4.status === 2 && fs.readFileSync(source).equals(beforeSource) && fs.readFileSync(hardLink).equals(beforeSource), `a hard link to the ${label} is refused and both paths stay unchanged`);
  }
}

// A record-directory connection reads its selected JSONL file, not just the directory entry.
{
  const protectedRuns = fs.mkdtempSync(path.join(os.tmpdir(), "jaryo-record-hardlink-source-"));
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "jaryo-record-hardlink-out-"));
  fs.writeFileSync(path.join(protectedRuns, "run-0001.jsonl"), "older record\n");
  const source = path.join(protectedRuns, "run-0002.jsonl");
  const output = path.join(outputDir, "view.html");
  const bytes = fs.readFileSync(path.join(recordDir, latestRecordFile(fs.readdirSync(recordDir))));
  fs.writeFileSync(source, bytes);
  fs.linkSync(source, output);
  const result = spawnSync(process.execPath,
    [cli, "connect", protectedRuns, "--manifest", recordManifest, "--kind", "record", "--out", output, "--force"],
    { encoding: "utf8" });
  ok(result.status === 2 && result.stderr.includes("refusing to overwrite an input file") &&
    fs.readFileSync(source).equals(bytes) && fs.readFileSync(output).equals(bytes),
    "a hard link to the selected record-directory JSONL input is refused and both paths stay unchanged");
}
console.log(`${n - failed}/${n} passed`);
process.exit(failed ? 1 : 0);
