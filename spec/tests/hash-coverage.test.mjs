// The integrity manifest must cover the tracked files its README promises.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url"; import { spawnSync } from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0, failed = 0;
const ok = (c, m) => { n++; if (!c) { failed++; console.log("FAIL", m); } else console.log("PASS", m); };
const entries = fs.readFileSync(path.join(root, "HASHES.txt"), "utf8").trim().split("\n").map(line => line.match(/^([a-f0-9]{64})  (.+)$/));
ok(entries.every(Boolean), "every integrity entry is a SHA-256 and a file path");
const listed = entries.filter(Boolean).map(m => m[2]);
ok(new Set(listed).size === listed.length, "integrity paths are unique");
const tracked = spawnSync("git", ["ls-files", "-z", "--", "reference", "adaptor", "pipeline"], { cwd: root, encoding: "utf8" });
ok(tracked.status === 0, "tracked spec paths can be enumerated");
for (const file of tracked.stdout.split("\0").filter(Boolean)) ok(listed.includes(file), `integrity manifest covers ${file}`);
const checked = spawnSync("shasum", ["-a", "256", "-c", "HASHES.txt"], { cwd: root, encoding: "utf8" });
ok(checked.status === 0, "every listed integrity hash matches its file");
if (checked.status !== 0) process.stdout.write(checked.stdout + checked.stderr);
console.log(`${n - failed}/${n} passed`);
process.exit(failed ? 1 : 0);
