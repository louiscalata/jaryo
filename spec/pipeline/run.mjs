// The pipeline runner: runs the manifest's steps in dependency order and writes an append-only JSONL run record.
// It imports only the shared credential redactor (adaptor/redact.mjs), not the adaptor; its steps do verify this repository.
// Step output and reasons are redacted before they are written; run files are 0600 in a 0700 directory.
// If the manifest declares a heartbeat ({ intervalMs, staleAfterMs }), it writes a heartbeat line every intervalMs
// while a step runs, so a reader can tell a long step from a dead runner.
// usage: node pipeline/run.mjs [--manifest <file>] [--runs-dir <dir>] [--cwd <dir>]
import fs from "node:fs"; import path from "node:path"; import { spawn } from "node:child_process"; import { fileURLToPath } from "node:url";
import { redactText } from "../adaptor/redact.mjs";
const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : d; };
const manifestPath = arg("--manifest", path.join(here, "pipeline/jaryo-verify.manifest.json"));
const dir = arg("--runs-dir", path.join(here, "pipeline/runs"));
const cwd = arg("--cwd", here);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
if (!fs.lstatSync(dir).isDirectory()) throw new Error("runs path must be a directory, not a symlink");
if (process.platform !== "win32") fs.chmodSync(dir, 0o700);

// New file number = highest existing number + 1, created exclusively so two runners never share a file.
let n, fd, file;
for (let tries = 0; tries < 20; tries++) {
  n = Math.max(0, ...fs.readdirSync(dir).map(f => /^run-(\d+)\.jsonl$/.exec(f)).filter(Boolean).map(m => parseInt(m[1], 10))) + 1;
  file = path.join(dir, `run-${String(n).padStart(4, "0")}.jsonl`);
  try { fd = fs.openSync(file, "wx", 0o600); break; } catch (e) { if (e.code !== "EEXIST") throw e; }
}
if (fd === undefined) { console.error("could not create a run file"); process.exit(1); }
// Every reason is redacted as it is written; step output is redacted whole before its tail is selected (below).
const emit = o => fs.writeSync(fd, JSON.stringify({ run: n, ts: new Date().toISOString(), ...o,
  ...(typeof o.reason === "string" ? { reason: redactText(o.reason) } : {}) }) + "\n");
const scrub = s => String(s).split(cwd).join("<cwd>")
  .split(process.env.HOME || "\u0000").join("~").split(process.env.USERPROFILE || "\u0000").join("~");

// Same bounds as the adaptor (adaptor/jaryo-adaptor.mjs): a declaration it would reject writes no heartbeat.
const hb = manifest.declares && manifest.declares.heartbeat;
const beatMs = hb && typeof hb === "object" && Number.isInteger(hb.intervalMs) && Number.isInteger(hb.staleAfterMs)
  && hb.intervalMs >= 100 && hb.intervalMs <= 600000 && hb.staleAfterMs > hb.intervalMs && hb.staleAfterMs <= 3600000 ? hb.intervalMs : null;
// Per-stream output cap, as spawnSync's default maxBuffer: over it the step is stopped and fails with ENOBUFS.
const MAX_BUFFER = 1024 * 1024;

// Run one command; resolves like spawnSync's result (status, signal, error, stdout, stderr).
const runCmd = (cmd, beat) => new Promise(resolve => {
  const r = { status: null, signal: null, error: undefined, stdout: "", stderr: "" };
  const timer = beat ? setInterval(beat, beatMs) : null;
  let done = false;
  let killTimer = null;
  const finish = () => { if (done) return; done = true; if (timer) clearInterval(timer); if (killTimer) clearTimeout(killTimer); resolve(r); };
  let child;
  try { child = spawn(cmd[0], cmd.slice(1), { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) { r.error = e; finish(); return; }
  const bufs = { stdout: [], stderr: [] }, sizes = { stdout: 0, stderr: 0 };
  for (const k of ["stdout", "stderr"]) child[k].on("data", d => {
    if (r.error) return;
    sizes[k] += d.length;
    if (sizes[k] > MAX_BUFFER) {
      r.error = Object.assign(new Error(`spawn ${cmd[0]} ENOBUFS`), { code: "ENOBUFS" });
      child.kill("SIGTERM");
      killTimer = setTimeout(() => { if (!done) child.kill("SIGKILL"); }, 500);
      killTimer.unref?.();
      return;
    }
    bufs[k].push(d);
  });
  child.on("error", e => { if (!r.error) r.error = e; if (child.exitCode === null && child.pid === undefined) finish(); });
  child.on("close", (code, signal) => {
    r.stdout = Buffer.concat(bufs.stdout).toString("utf8"); r.stderr = Buffer.concat(bufs.stderr).toString("utf8");
    if (!r.error) { r.status = code; r.signal = signal; }
    finish();
  });
});

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
  const r = await runCmd(s.cmd, beatMs ? () => emit({ step: s.id, event: "heartbeat" }) : null);
  const out = redactText((r.stdout || "") + (r.stderr || "")).split("\n").filter(Boolean).map(scrub);
  const ok = r.status === 0 && !r.error;
  status.set(s.id, ok ? "ok" : "failed");
  const why = r.error ? scrub(r.error.message) : r.signal ? `killed by ${r.signal}` : undefined;
  emit({ step: s.id, status: ok ? "ok" : "failed", exit: r.status, ms: Date.now() - t0, tail: out.slice(-6), ...(why ? { reason: why } : {}) });
}
emit({ event: "run-end" });
fs.closeSync(fd);
console.log(`run ${n}: ` + [...status].map(([k, v]) => `${k}=${v}`).join(" ") + `\nrecord: ${path.relative(here, file)}`);
