// The pipeline runner: runs the manifest's steps in dependency order and writes an append-only JSONL run record.
// It does not import or call any Jaryo code; its steps do verify this repository.
// usage: node pipeline/run.mjs [--manifest <file>] [--runs-dir <dir>] [--cwd <dir>]
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process";
const here = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : d; };
const manifestPath = arg("--manifest", path.join(here, "pipeline/jaryo-verify.manifest.json"));
const dir = arg("--runs-dir", path.join(here, "pipeline/runs"));
const cwd = arg("--cwd", here);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
fs.mkdirSync(dir, { recursive: true });

// New file number = highest existing number + 1, created exclusively so two runners never share a file.
let n, fd, file;
for (let tries = 0; tries < 20; tries++) {
  n = Math.max(0, ...fs.readdirSync(dir).map(f => /^run-(\d+)\.jsonl$/.exec(f)).filter(Boolean).map(m => parseInt(m[1], 10))) + 1;
  file = path.join(dir, `run-${String(n).padStart(4, "0")}.jsonl`);
  try { fd = fs.openSync(file, "wx"); break; } catch (e) { if (e.code !== "EEXIST") throw e; }
}
if (fd === undefined) { console.error("could not create a run file"); process.exit(1); }
const emit = o => fs.writeSync(fd, JSON.stringify({ run: n, ts: new Date().toISOString(), ...o }) + "\n");
const scrub = s => String(s).split(cwd).join("<cwd>").split(process.env.HOME || "\u0000").join("~");

emit({ event: "run-start", pipeline: manifest.id });
const status = new Map();
for (const s of manifest.steps) {
  const unmet = s.needs.find(d => status.get(d) !== "ok");
  const missingEnv = (s.requiresEnv || []).find(v => !process.env[v]);
  if (unmet) { status.set(s.id, "blocked"); emit({ step: s.id, status: "blocked", reason: `needs ${unmet} (${status.get(unmet)})` }); continue; }
  if (missingEnv) { status.set(s.id, "blocked"); emit({ step: s.id, status: "blocked", reason: `needs env ${missingEnv}` }); continue; }
  if (s.consequential) { status.set(s.id, "review"); emit({ step: s.id, status: "review", reason: s.reason }); continue; }
  emit({ step: s.id, event: "step-start" });
  const t0 = Date.now();
  const r = spawnSync(s.cmd[0], s.cmd.slice(1), { cwd, encoding: "utf8", env: process.env });
  const out = ((r.stdout || "") + (r.stderr || "")).split("\n").filter(Boolean).map(scrub);
  const ok = r.status === 0 && !r.error;
  status.set(s.id, ok ? "ok" : "failed");
  const why = r.error ? scrub(r.error.message) : r.signal ? `killed by ${r.signal}` : undefined;
  emit({ step: s.id, status: ok ? "ok" : "failed", exit: r.status, ms: Date.now() - t0, tail: out.slice(-6), ...(why ? { reason: why } : {}) });
}
emit({ event: "run-end" });
fs.closeSync(fd);
console.log(`run ${n}: ` + [...status].map(([k, v]) => `${k}=${v}`).join(" ") + `\nrecord: ${path.relative(here, file)}`);
