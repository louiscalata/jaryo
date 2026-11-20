// The integrity manifest must cover the tracked files its README promises.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url"; import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0, failed = 0;
const ok = (c, m) => { n++; if (!c) { failed++; console.log("FAIL", m); } else console.log("PASS", m); };
const run = (cmd, args, opts) => {
  const r = spawnSync(cmd, args, opts);
  if (r.error || r.stdout == null || r.stderr == null) {
    const why = r.error ? r.error.message : "missing stdout or stderr";
    const stderr = `${r.stderr ?? ""}${r.stderr ? "\n" : ""}${why}`;
    return { ...r, status: r.status ?? 1, stdout: r.stdout ?? "", stderr };
  }
  return r;
};
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const entries = fs.readFileSync(path.join(root, "HASHES.txt"), "utf8").trim().split(/\r?\n/).map(line => line.match(/^([a-f0-9]{64})  (.+)$/));
ok(entries.every(Boolean), "every integrity entry is a SHA-256 and a file path");
const listed = entries.filter(Boolean).map(m => m[2]);
ok(new Set(listed).size === listed.length, "integrity paths are unique");
const attrPaths = ["HASHES.txt", ...listed];
const attr = run("git", ["check-attr", "eol", "--", ...attrPaths], { cwd: root, encoding: "utf8" });
ok(attr.status === 0, "git check-attr eol runs");
if (attr.status !== 0) process.stdout.write(attr.stdout + attr.stderr);
const attrMap = {};
for (const line of attr.stdout.split(/\r?\n/).filter(Boolean)) {
  const m = line.match(/^(.+?): eol: (.+)$/);
  if (m) attrMap[m[1]] = m[2];
}
ok(attrMap["HASHES.txt"] === "lf", "HASHES.txt eol is lf");
for (const p of listed) ok(attrMap[p] === "lf", `eol is lf for ${p}`);
const tracked = run("git", ["ls-files", "-z", "--", "reference", "adaptor", "pipeline"], { cwd: root, encoding: "utf8" });
ok(tracked.status === 0, "tracked spec paths can be enumerated");
if (tracked.status !== 0) process.stdout.write(tracked.stdout + tracked.stderr);
for (const file of (tracked.stdout || "").split("\0").filter(Boolean)) ok(listed.includes(file), `integrity manifest covers ${file}`);
const mismatches = [];
for (const m of entries.filter(Boolean)) {
  const digest = m[1];
  const file = m[2];
  try {
    const actual = sha256(fs.readFileSync(path.join(root, file)));
    if (actual !== digest) mismatches.push(`${file}: expected ${digest}, got ${actual}`);
  } catch (err) {
    mismatches.push(`${file}: ${err.message}`);
  }
}
ok(mismatches.length === 0, "every listed integrity hash matches its file");
if (mismatches.length) process.stdout.write(mismatches.join("\n") + "\n");
console.log(`${n - failed}/${n} passed`);
process.exit(failed ? 1 : 0);
