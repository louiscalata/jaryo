// Tests for adaptor/jaryo-adaptor.mjs and pipeline/run.mjs.
// The rule under test: no status is ever inferred, only copied from a record (RUNNING being the one named exception).
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adaptorPath = path.join(root, "adaptor/jaryo-adaptor.mjs");

const HB = { intervalMs: 10000, staleAfterMs: 120000 };
const M = { id: "p", name: "P", declares: { actions: ["run", "logs", "retry"], events: false, heartbeat: HB }, steps: [
  { id: "a", name: "Step A", needs: [] }, { id: "b", name: "Step B", needs: ["a"] }, { id: "c", name: "Step C", needs: ["b"], consequential: true } ] };
const T0 = Date.parse("2026-11-07T20:00:00Z");
let tick = 0;
const L = (...o) => o.map(x => JSON.stringify({ ts: new Date(T0 + 1000 * tick++).toISOString(), run: 1, ...x })).join("\n");
const Lfix = (ts, ...o) => o.map(x => JSON.stringify({ ts, run: 1, ...x })).join("\n");

async function suite(mod) {
  const { buildView, latestRecordFile } = mod; const out = [];
  const t = (name, cond) => out.push({ name, pass: !!cond });
  const st = (v, id) => v.steps.find(s => s.id === id).state;
  const now = T0 + 20 * 1000;
  let v;
  // copied statuses
  v = buildView(M, L({ event: "run-start" }, { step: "a", status: "ok", exit: 0 }, { step: "b", status: "failed", exit: 1 }, { step: "c", status: "blocked", reason: "needs b (failed)" }, { event: "run-end" }), now);
  t("ok/failed/blocked are copied from the record", st(v, "a") === "OK" && st(v, "b") === "FAILED" && st(v, "c") === "BLOCKED");
  t("a blocked step keeps the record's reason", v.steps[2].reason === "needs b (failed)");
  t("counts match the rows", v.review.counts.failed === 1 && v.review.counts.blocked === 1 && v.review.counts.unknown === 0 && v.review.counts.total === 3);
  // A failed result keeps the cause available in the row, even without output or a recorded reason.
  t("a failed result without a reason uses the spec wording and its recorded exit", v.steps[1].reason === "This step ran and failed: exit 1. See its last output.");
  for (const [reason, exit, expected] of [
    ["command could not start", 127, "command could not start"],
    ["  explicit detail  ", 2, "  explicit detail  "],
    ["", 3, "This step ran and failed: exit 3. See its last output."],
    ["  ", 4, "This step ran and failed: exit 4. See its last output."],
    [null, undefined, "This step ran and failed. See its last output."],
    [undefined, "unknown", "This step ran and failed. See its last output."],
    [undefined, -9, "This step ran and failed: exit -9. See its last output."],
  ]) {
    const failedView = buildView(M, L({ event: "run-start" }, { step: "a", status: "failed", reason, exit }, { event: "run-end" }), now);
    t(`a failed result retains an explicit reason or uses only its recorded exit (${String(reason)}, ${String(exit)})`, failedView.steps[0].state === "FAILED" && failedView.steps[0].reason === expected);
  }
  const infiniteExit = buildView(M, '{"step":"a","status":"failed","exit":1e400}', now);
  t("a failed result with an unrepresentable exit does not invent an exit code", infiniteExit.steps[0].reason === "This step ran and failed. See its last output.");
  // A caller-supplied clock is validated before timestamps are formatted or liveness is judged.
  for (const bad of [NaN, Infinity, -Infinity, 8640000000000001, -8640000000000001, 1e100, "0", null, true]) {
    let err = null; try { buildView(M, "", bad); } catch (e) { err = e; }
    t(`an invalid now (${String(bad)}) is refused with a deliberate clock error`, err instanceof TypeError && err.message === "now must be a finite number within the JavaScript Date range");
  }
  for (const valid of [-8640000000000000, -8640000000000000 + 1, -0.5, 0, 0.5, 8640000000000000 - 1, 8640000000000000]) {
    let result = null; try { result = buildView(M, "", valid); } catch {}
    t(`a valid now (${valid}) keeps its Date representation`, result?.generatedAt === new Date(valid).toISOString());
  }
  // no record
  v = buildView(M, "", now);
  t("no record at all: every step is UNKNOWN and there is no run", v.steps.every(s => s.state === "UNKNOWN") && v.run === null);
  v = buildView(M, L({ event: "run-start" }, { step: "a", status: "ok" }, { event: "run-end" }), now);
  t("a step with no record in the latest run is UNKNOWN (not inferred from its dependencies)", st(v, "b") === "UNKNOWN" && /no record/.test(v.steps[1].reason));
  // undeclared
  v = buildView(M, L({ event: "run-start" }, { step: "a", status: "ok" }, { step: "ghost", status: "ok" }, { event: "run-end" }), now);
  t("an undeclared step is listed, UNKNOWN and unnamed", v.undeclared.length === 1 && v.undeclared[0].state === "UNKNOWN" && v.undeclared[0].name === null && v.undeclared[0].logId === "ghost");
  t("undeclared steps count as unknown in the review summary", v.review.counts.unknown === 3); // b and c have no record, plus the undeclared ghost
  // RUNNING vs stale
  v = buildView(M, L({ event: "run-start" }, { step: "a", event: "step-start" }), T0 + 30000);
  t("started, run open and recent: RUNNING", st(v, "a") === "RUNNING" && v.run.state === "running");
  v = buildView(M, L({ event: "run-start" }, { step: "a", event: "step-start" }), T0 + 10 * 60000);
  t("started, run open but stale: UNKNOWN, never RUNNING", st(v, "a") === "UNKNOWN" && v.run.state === "unknown");
  v = buildView(M, Lfix("2099-01-01T00:00:00Z", { event: "run-start" }, { step: "a", event: "step-start" }), T0 + 10 * 60000);
  t("a timestamp in the future never makes a step RUNNING, and is warned about", st(v, "a") === "UNKNOWN" && v.warnings.some(w => /future/.test(w)));
  v = buildView(M, L({ event: "run-start" }, { step: "a", event: "step-start", ts: 5 }), T0 + 1000);
  t("a numeric ts is not trusted for liveness", st(v, "a") !== "RUNNING" || v.lastEventAt !== null);
  v = buildView(M, JSON.stringify({ event: "run-start", run: 1 }) + "\n" + JSON.stringify({ step: "a", event: "step-start" }), T0 + 1000);
  t("no timestamps at all: never RUNNING", st(v, "a") === "UNKNOWN");
  v = buildView(M, L({ event: "run-start" }, { step: "a", event: "step-start" }, { event: "run-end" }), now);
  t("a step started in a run that ended, with no result: UNKNOWN with a reason that says the run ended", st(v, "a") === "UNKNOWN" && /run ended/.test(v.steps[0].reason));
  t("the view says when it was generated and when the record last moved", v.generatedAt === new Date(now).toISOString() && v.lastEventAt !== null);
  // declared heartbeat: RUNNING is judged only against the window the manifest declares
  const NOHB = { ...M, declares: { actions: M.declares.actions, events: false } };
  const at = ms => new Date(T0 + ms).toISOString();
  const rec = (...o) => o.map(([ms, x]) => JSON.stringify({ ts: at(ms), run: 1, ...x })).join("\n");
  v = buildView(NOHB, rec([0, { event: "run-start" }], [1000, { step: "a", event: "step-start" }]), T0 + 2000);
  t("no declared heartbeat: a fresh start is UNKNOWN, never RUNNING, and says why", st(v, "a") === "UNKNOWN" && /declares no heartbeat/.test(v.steps[0].reason) && v.run.state === "unknown");
  t("no declared heartbeat: capabilities.heartbeat is null", v.capabilities.heartbeat === null);
  t("a declared heartbeat is copied into capabilities", JSON.stringify(buildView(M, "", now).capabilities.heartbeat) === JSON.stringify(HB));
  v = buildView(M, rec([0, { event: "run-start" }], [1000, { step: "a", event: "step-start" }], [590000, { step: "a", event: "heartbeat" }]), T0 + 600000);
  t("a long step with a fresh heartbeat is RUNNING although its start is old", st(v, "a") === "RUNNING" && v.run.state === "running");
  v = buildView(M, rec([0, { event: "run-start" }], [1000, { step: "a", event: "step-start" }], [60000, { step: "a", event: "heartbeat" }]), T0 + 60000 + 120001);
  t("a heartbeat that stopped longer ago than staleAfterMs is UNKNOWN", st(v, "a") === "UNKNOWN" && /no heartbeat/.test(v.steps[0].reason));
  const SHORT = { ...M, declares: { ...M.declares, heartbeat: { intervalMs: 5000, staleAfterMs: 30000 } } };
  v = buildView(SHORT, rec([0, { event: "run-start" }], [1000, { step: "a", event: "step-start" }]), T0 + 45000);
  t("the declared staleAfterMs is used, not a built-in window", st(v, "a") === "UNKNOWN" && /30 s/.test(v.steps[0].reason));
  v = buildView(M, rec([0, { event: "run-start" }], [1000, { step: "a", event: "step-start" }], [400000, { step: "b", event: "step-start" }], [598000, { step: "b", event: "heartbeat" }]), T0 + 600000);
  t("another step's heartbeat does not keep a silent step alive", st(v, "a") === "UNKNOWN" && st(v, "b") === "RUNNING");
  v = buildView(M, rec([0, { event: "run-start" }], [1000, { step: "a", event: "heartbeat" }]), T0 + 2000);
  t("a heartbeat without a step-start does not make a step RUNNING", st(v, "a") === "UNKNOWN");
  v = buildView(M, rec([0, { event: "run-start" }], [1000, { step: "a", status: "ok", exit: 0 }], [2000, { step: "a", event: "heartbeat" }]), T0 + 3000);
  t("a heartbeat after a result does not replace the result", st(v, "a") === "OK");
  v = buildView(M, rec([0, { event: "run-start" }], [1000, { step: "a", event: "step-start" }], [2000, { step: "a", event: "heartbeat" }], [3000, { event: "run-end" }]), T0 + 4000);
  t("a heartbeat does not outlive the run's end", st(v, "a") === "UNKNOWN" && /run ended/.test(v.steps[0].reason));
  for (const bad of ["fast", 10000, [1], {}, { intervalMs: 0, staleAfterMs: 1000 }, { intervalMs: 5000, staleAfterMs: 5000 }, { intervalMs: 1.5, staleAfterMs: 9000 },
    { intervalMs: 1000, staleAfterMs: 7200000 }, { intervalMs: 50, staleAfterMs: 1000 }, { intervalMs: "1000", staleAfterMs: "9000" }, { staleAfterMs: 9000 }]) {
    v = buildView({ ...M, declares: { ...M.declares, heartbeat: bad } }, rec([0, { event: "run-start" }], [1000, { step: "a", event: "step-start" }]), T0 + 2000);
    t(`a malformed heartbeat ${JSON.stringify(bad)} is warned about, null, and never RUNNING`, v.capabilities.heartbeat === null && st(v, "a") === "UNKNOWN" && v.warnings.some(w => /heartbeat/.test(w)));
  }
  // restart
  v = buildView(M, L({ event: "run-start" }, { step: "a", status: "failed", exit: 1 }, { step: "a", event: "step-start" }), now);
  t("a step started again after a result no longer shows the old result", st(v, "a") === "RUNNING" && /again/.test(v.steps[0].reason));
  v = buildView(M, L({ event: "run-start" }, { step: "a", status: "ok", exit: 0 }, { step: "a", event: "step-start" }), T0 + 10 * 60000);
  t("restarted and stale: UNKNOWN, with the superseded result noted", st(v, "a") === "UNKNOWN" && /superseded/.test(v.steps[0].reason));
  // review
  v = buildView(M, L({ event: "run-start" }, { step: "c", status: "review", reason: "paid" }, { event: "run-end" }), now);
  t("a consequential step recorded as review is REVIEW and listed as consequential", st(v, "c") === "REVIEW" && v.review.consequentialSteps.includes("c"));
  // unrecognised and contradictory
  for (const s of ["great", "OK", {}, 7]) { v = buildView(M, L({ event: "run-start" }, { step: "a", status: s }), now); t(`an unrecognised status ${JSON.stringify(s)} is UNKNOWN`, st(v, "a") === "UNKNOWN" && /unrecognised/.test(v.steps[0].reason)); }
  v = buildView(M, L({ event: "run-start" }, { step: "a", status: "ok", exit: 1 }, { event: "run-end" }), now);
  t("status ok with a non-zero exit is UNKNOWN: the record contradicts itself", st(v, "a") === "UNKNOWN" && /contradicts/.test(v.steps[0].reason));
  v = buildView(M, L({ event: "run-start" }, { step: "a", status: "failed", exit: 0 }, { event: "run-end" }), now);
  t("status failed with exit 0 is UNKNOWN: the record contradicts itself", st(v, "a") === "UNKNOWN");
  // corrupt and shaped input
  v = buildView(M, L({ event: "run-start" }, { step: "a", status: "ok", exit: 0 }) + "\n{not json\n[1,2]\n", now);
  t("corrupt lines warn and invalidate an earlier status", v.warnings.length === 2 && st(v, "a") === "UNKNOWN" && /invalid record line/.test(v.steps[0].reason) && v.steps[0].lastRun === null);
  v = buildView(M, "﻿" + L({ event: "run-start" }, { step: "a", status: "ok", exit: 0 }, { event: "run-end" }), now);
  t("a byte-order mark does not break the first line", v.run && v.run.id === 1 && st(v, "a") === "OK");
  v = buildView(M, L({ step: "a", status: "ok", exit: 0 }, { event: "run-end" }), now);
  t("steps with no run-start: the run state is unknown and warned about", v.run && v.run.state === "unknown" && v.warnings.some(w => /no run-start/.test(w)));
  v = buildView({ steps: "nope", declares: { actions: "run" } }, "", now);
  t("a malformed manifest gives no steps, no actions, warnings, and does not throw", v.steps.length === 0 && v.warnings.length === 2 && v.actions.every(a => !a.available));
  v = buildView({ id: "p", steps: [{ id: "a", needs: "b" }, { name: "no id" }, null] }, "", now);
  t("steps without an id are ignored; a bad needs list becomes empty", v.steps.length === 1 && v.steps[0].needs.length === 0 && v.warnings.length >= 2);
  v = buildView({ id: "p", steps: [{ id: "a" }, { id: "a" }, { id: "b", needs: ["a", "missing", "a"] }] },
    L({ event: "run-start" }, { step: "a", status: "ok", exit: 0 }), now);
  t("duplicate manifest ids warn, stay UNKNOWN, and link to the first matching row",
    v.steps.slice(0, 2).every(s => s.state === "UNKNOWN")
    && v.warnings.some(w => /more than once/.test(w))
    && v.steps[0].next.join(",") === "b,b"
    && v.steps[1].next.length === 0
    && v.steps[2].next.length === 0);
  v = buildView(M, L({ event: "run-start" }, { step: "__proto__", status: "ok" }, { step: "constructor", status: "ok" }), now);
  t("prototype-style ids are ordinary undeclared ids", v.undeclared.length === 2);
  v = buildView(M, L({ event: "run-start" }, { step: "a", status: "ok", exit: 0, tail: Array.from({ length: 50 }, (_, i) => "x".repeat(2000) + i) }), now);
  t("the output tail is capped in lines and in line length", v.steps[0].lastRun.tail.length === 6 && v.steps[0].lastRun.tail.every(x => x.length <= 500));
  // runs
  v = buildView(M, L({ event: "run-start", run: 1 }, { step: "a", status: "failed", exit: 1 }, { event: "run-end" }, { event: "run-start", run: 2 }, { step: "b", status: "ok", exit: 0, run: 2 }), T0 + 8000);
  t("a file holding two runs shows only the last, and says so", v.run.id === 2 && st(v, "a") === "UNKNOWN" && st(v, "b") === "OK" && v.warnings.some(w => /2 runs/.test(w)));
  v = buildView(M, L({ event: "run-start", run: 2 }, { step: "a", event: "step-start", run: 2 }, { event: "run-end", run: 1 }), now);
  t("a run-end from a different run does not end this run", v.run.state !== "ended" && v.warnings.some(w => /different run/.test(w)));
  t("the newest record file is chosen by number, not by text",
    latestRecordFile(["run-0002.jsonl", "run-0010.jsonl", "run-9.jsonl", "notes.txt"]) === "run-0010.jsonl"
    && latestRecordFile([]) === null
    && latestRecordFile(["run-10.jsonl", "run-0010.jsonl"]) === "run-0010.jsonl"
    && latestRecordFile(["run-0010.jsonl", "run-10.jsonl"]) === "run-10.jsonl");
  const newest = "run-09007199254740993.jsonl";
  const older = "run-9007199254740992.jsonl";
  const sameNumber = "run-9007199254740993.jsonl";
  t("record numbers above the safe integer range compare exactly",
    latestRecordFile([newest, older]) === newest
    && latestRecordFile([older, newest]) === newest
    && latestRecordFile([newest, sameNumber]) === sameNumber
    && latestRecordFile([sameNumber, newest]) === newest);
  // actions
  v = buildView(M, "", now);
  const pause = v.actions.find(a => a.id === "pause");
  t("an undeclared action is unavailable, with the reason", pause.available === false && /does not declare pause/.test(pause.reason));
  t("declared run and retry require review; logs does not", v.actions.find(a => a.id === "run").review && v.actions.find(a => a.id === "retry").review && v.actions.find(a => a.id === "logs").review === false);
  v = buildView({ ...M, declares: { actions: ["deploy", "delete", "overwrite"] } }, "", now);
  t("deploy, delete and overwrite also require review", ["deploy", "delete", "overwrite"].every(a => v.actions.find(x => x.id === a).review === true));
  t("the event stream is null when the manifest says nothing, false only when it says false", buildView({ ...M, declares: { actions: [] } }, "", now).capabilities.eventStream === null && buildView(M, "", now).capabilities.eventStream === false);
  // later record wins within a run; links
  v = buildView(M, L({ event: "run-start" }, { step: "a", status: "failed", exit: 1 }, { step: "a", status: "ok", exit: 0 }), now);
  t("the last recorded status for a step wins", st(v, "a") === "OK");
  t("next links come from declared needs only", buildView(M, "", now).steps[0].next[0] === "b");
  return out;
}

const real = await import(pathToFileURL(adaptorPath));
let failed = 0, count = 0;
for (const r of await suite(real)) { count++; console.log(r.pass ? "PASS" : "FAIL", r.name); if (!r.pass) failed++; }


{
  const runs = fs.mkdtempSync(path.join(os.tmpdir(), "jaryo-numbered-runs-"));
  const bigint = globalThis.BigInt;
  let conversions = 0;
  try {
    for (let number = 2; number <= 32; number++) fs.mkdirSync(path.join(runs, `run-${number}.jsonl`));
    for (const file of ["run-1.jsonl", "run-01.jsonl"]) {
      fs.writeFileSync(path.join(runs, file), JSON.stringify({ event: "run-start", run: file }) + "\n");
    }
    fs.symlinkSync(path.join(runs, "missing.jsonl"), path.join(runs, "run-0.jsonl"), "file");
    const files = fs.readdirSync(runs);
    const expected = files.filter(file => file === "run-1.jsonl" || file === "run-01.jsonl").at(-1);
    globalThis.BigInt = value => { conversions++; return bigint(value); };
    const actual = real.loadRecord(M, runs, T0);
    const checks = [
      [actual.view.run?.id === expected && actual.inputPaths[0] === path.join(runs, expected),
        "numbered directories preserve the last listing tie and leave a lower dangling alias uninspected"],
      [conversions <= files.length, "numbered directories do not cause repeated filename-to-BigInt conversion"],
    ];
    for (const [pass, name] of checks) {
      count++;
      console.log(pass ? "PASS" : "FAIL", name);
      if (!pass) failed++;
    }
  } finally {
    globalThis.BigInt = bigint;
    fs.rmSync(runs, { recursive: true });
  }
}

// Large valid records must not exceed the engine's spread-argument limit while finding timestamps.
{
  const timestamp = new Date(T0 + 1000).toISOString();
  const heartbeat = JSON.stringify({ step: "a", event: "heartbeat", run: 1, ts: timestamp });
  const records = [
    JSON.stringify({ event: "run-start", run: 1, ts: timestamp }),
    JSON.stringify({ step: "a", event: "step-start", run: 1, ts: timestamp }),
    ...Array(150000).fill(heartbeat),
  ].join("\n");
  let largeView = null;
  try { largeView = real.buildView(M, records, T0 + 2000); } catch {}
  count++;
  const pass = largeView?.steps[0]?.state === "RUNNING";
  console.log(pass ? "PASS" : "FAIL", "adaptor: a valid large heartbeat record remains readable");
  if (!pass) failed++;
}

// Runner: real child processes against a temporary manifest.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jaryo-run-"));
  const man = { id: "t", name: "T", declares: { actions: ["run"] }, steps: [
    { id: "good", name: "Good", needs: [], cmd: ["node", "-e", "console.log('hi')"] },
    { id: "bad", name: "Bad", needs: [], cmd: ["node", "-e", "process.exit(3)"] },
    { id: "missing", name: "Missing", needs: [], cmd: ["definitely-not-a-command-xyz"] },
    { id: "after_bad", name: "After bad", needs: ["bad"], cmd: ["node", "-e", "0"] },
    { id: "needs_env", name: "Env", needs: [], requiresEnv: ["JARYO_TEST_NOPE"], cmd: ["node", "-e", "0"] },
    { id: "gate", name: "Gate", needs: ["good"], consequential: true, reason: "paid", cmd: ["node", "-e", "throw 1"] } ] };
  const mf = path.join(tmp, "m.json"), runs = path.join(tmp, "runs"); fs.writeFileSync(mf, JSON.stringify(man));
  const run = () => spawnSync("node", [path.join(root, "pipeline/run.mjs"), "--manifest", mf, "--runs-dir", runs, "--cwd", tmp], { encoding: "utf8" });
  run(); run(); run();
  if (process.platform !== "win32") fs.chmodSync(runs, 0o755);
  fs.unlinkSync(path.join(runs, "run-0001.jsonl")); // pruning an old record must not make the next run reuse a file
  const r4 = run();
  const files = fs.readdirSync(runs).sort();
  const ck = (name, c) => { count++; console.log(c ? "PASS" : "FAIL", name); if (!c) failed++; };
  ck("runner: after pruning, the next run gets a new number and its own file", files.join() === "run-0002.jsonl,run-0003.jsonl,run-0004.jsonl" && /run 4:/.test(r4.stdout));
  if (process.platform === "win32") console.log("SKIP runner: an existing run directory is 0700 (POSIX modes are not enforced on win32)");
  else ck("runner: an existing run directory is restricted to owner-only before writing", (fs.statSync(runs).mode & 0o777) === 0o700);
  const recs = fs.readFileSync(path.join(runs, "run-0004.jsonl"), "utf8").trim().split("\n").map(x => JSON.parse(x));
  const last = id => recs.filter(r => r.step === id && r.status).pop();
  ck("runner: exit 0 is ok, exit 3 is failed with the exit code", last("good").status === "ok" && last("bad").status === "failed" && last("bad").exit === 3);
  ck("runner: a command that cannot start is failed and says why", last("missing").status === "failed" && /ENOENT|not found/i.test(last("missing").reason || ""));
  ck("runner: a step behind a failed step is blocked and names it", last("after_bad").status === "blocked" && /needs bad \(failed\)/.test(last("after_bad").reason));
  ck("runner: a missing required env var blocks the step", last("needs_env").status === "blocked" && /JARYO_TEST_NOPE/.test(last("needs_env").reason));
  ck("runner: a consequential step is recorded as review and never executed", last("gate").status === "review" && !recs.some(r => r.step === "gate" && r.event === "step-start"));
  ck("runner: one run-start and one run-end", recs.filter(r => r.event === "run-start").length === 1 && recs.filter(r => r.event === "run-end").length === 1);
  ck("runner: the working directory is scrubbed from recorded output", !JSON.stringify(recs).includes(tmp));
  const view = real.buildView(man, fs.readFileSync(path.join(runs, "run-0004.jsonl"), "utf8"), Date.now());
  ck("end to end: the adaptor shows exactly the runner's statuses", view.steps.map(s => s.state).join() === "OK,FAILED,FAILED,BLOCKED,BLOCKED,REVIEW");
  ck("runner: no heartbeat is written when the manifest declares none", !recs.some(r => r.event === "heartbeat"));

  // A declared heartbeat: the runner writes one per interval while a step runs, and only then.
  const hman = { id: "h", name: "H", declares: { actions: ["run"], heartbeat: { intervalMs: 200, staleAfterMs: 2000 } }, steps: [
    { id: "slow", name: "Slow", needs: [], cmd: ["node", "-e", "setTimeout(() => console.log('done'), 1100)"] },
    { id: "quick", name: "Quick", needs: ["slow"], cmd: ["node", "-e", "0"] } ] };
  const hmf = path.join(tmp, "h.json"), hruns = path.join(tmp, "hruns"); fs.writeFileSync(hmf, JSON.stringify(hman));
  const hr = spawnSync("node", [path.join(root, "pipeline/run.mjs"), "--manifest", hmf, "--runs-dir", hruns, "--cwd", tmp], { encoding: "utf8" });
  const hrecs = fs.readFileSync(path.join(hruns, "run-0001.jsonl"), "utf8").trim().split("\n").map(x => JSON.parse(x));
  const idx = (p) => hrecs.findIndex(p);
  const beats = hrecs.map((r, i) => [r, i]).filter(([r]) => r.event === "heartbeat");
  const sStart = idx(r => r.step === "slow" && r.event === "step-start"), sEnd = idx(r => r.step === "slow" && r.status);
  ck("runner: a declared heartbeat is written repeatedly while a slow step runs", hr.status === 0 && beats.filter(([r]) => r.step === "slow").length >= 3);
  ck("runner: every heartbeat names the running step and falls between its start and its result", beats.every(([r, i]) => r.step === "slow" && i > sStart && i < sEnd));
  ck("runner: the slow step still records its own status and output", hrecs[sEnd].status === "ok" && hrecs[sEnd].exit === 0 && hrecs[sEnd].tail.includes("done"));
  const hv = real.buildView(hman, fs.readFileSync(path.join(hruns, "run-0001.jsonl"), "utf8"), Date.now());
  ck("end to end: heartbeats leave the recorded statuses unchanged", hv.steps.map(s => s.state).join() === "OK,OK" && hv.undeclared.length === 0);
  const open = hrecs.slice(0, sEnd).map(x => JSON.stringify(x)).join("\n");
  const lastBeat = Date.parse(beats[beats.length - 1][0].ts);
  ck("end to end: a record cut mid-step shows RUNNING within staleAfterMs of the last heartbeat and UNKNOWN after it",
    real.buildView(hman, open, lastBeat + 1500).steps[0].state === "RUNNING" && real.buildView(hman, open, lastBeat + 2500).steps[0].state === "UNKNOWN");

  // The runner accepts exactly the declarations the adaptor accepts: one the adaptor rejects writes no heartbeat.
  const rejected = [{ intervalMs: 200, staleAfterMs: 200 }, { intervalMs: 200, staleAfterMs: 3600001 }, { intervalMs: 200 }, { intervalMs: 600001, staleAfterMs: 3600000 }];
  const silent = rejected.map((h, k) => {
    const rman = { id: "r", name: "R", declares: { actions: ["run"], heartbeat: h }, steps: [
      { id: "slow", name: "Slow", needs: [], cmd: ["node", "-e", "setTimeout(() => 0, 700)"] } ] };
    const rmf = path.join(tmp, `r${k}.json`), rruns = path.join(tmp, `rruns${k}`); fs.writeFileSync(rmf, JSON.stringify(rman));
    spawnSync("node", [path.join(root, "pipeline/run.mjs"), "--manifest", rmf, "--runs-dir", rruns, "--cwd", tmp], { encoding: "utf8" });
    const rv = real.buildView(rman, "", Date.now());
    return rv.capabilities.heartbeat === null && !fs.readFileSync(path.join(rruns, "run-0001.jsonl"), "utf8").includes("\"heartbeat\"");
  });
  ck("runner: a heartbeat declaration the adaptor rejects writes no heartbeat lines", silent.every(Boolean));

  // Output over 1 MiB on one stream fails the step with ENOBUFS, as the synchronous runner did.
  const bman = { id: "b", name: "B", declares: { actions: ["run"] }, steps: [
    { id: "loud", name: "Loud", needs: [], cmd: ["node", "-e", "process.stdout.write('x'.repeat(1100000)); setTimeout(() => 0, 2000)"] },
    { id: "fits", name: "Fits", needs: [], cmd: ["node", "-e", "process.stdout.write('y'.repeat(1000000) + '\\nend')"] } ] };
  const bmf = path.join(tmp, "b.json"), bruns = path.join(tmp, "bruns"); fs.writeFileSync(bmf, JSON.stringify(bman));
  spawnSync("node", [path.join(root, "pipeline/run.mjs"), "--manifest", bmf, "--runs-dir", bruns, "--cwd", tmp], { encoding: "utf8" });
  const brecs = fs.readFileSync(path.join(bruns, "run-0001.jsonl"), "utf8").trim().split("\n").map(x => JSON.parse(x));
  const loud = brecs.find(r => r.step === "loud" && r.status), fits = brecs.find(r => r.step === "fits" && r.status);
  ck("runner: a step that writes more than 1 MiB to one stream is failed with ENOBUFS and stopped", loud.status === "failed" && /ENOBUFS/.test(loud.reason || "") && loud.ms < 1900);
  ck("runner: a step just under 1 MiB is still ok", fits.status === "ok" && fits.tail.includes("end"));

  // A command that ignores SIGTERM must still be stopped after an output-cap failure.
  if (process.platform === "win32") console.log("SKIP runner: ignored SIGTERM termination path (signal handlers differ on win32)");
  else {
    const stubborn = { id: "stubborn", name: "Stubborn", declares: { actions: ["run"] }, steps: [
      { id: "loud", name: "Loud", needs: [], cmd: ["node", "-e", "process.on('SIGTERM', () => {}); process.stdout.write('x'.repeat(1100000)); setTimeout(() => process.exit(0), 3000)"] } ] };
    const smf = path.join(tmp, "stubborn.json"), sruns = path.join(tmp, "stubborn-runs"); fs.writeFileSync(smf, JSON.stringify(stubborn));
    const stopped = spawnSync("node", [path.join(root, "pipeline/run.mjs"), "--manifest", smf, "--runs-dir", sruns, "--cwd", tmp], { encoding: "utf8", timeout: 6000 });
    const sfile = path.join(sruns, "run-0001.jsonl");
    const srecs = fs.existsSync(sfile) ? fs.readFileSync(sfile, "utf8").trim().split("\n").map(x => JSON.parse(x)) : [];
    const loudStop = srecs.find(r => r.step === "loud" && r.status);
    ck("runner: an over-limit child that ignores SIGTERM is force-stopped promptly", stopped.status === 0 && !stopped.error && loudStop?.status === "failed" && /ENOBUFS/.test(loudStop.reason || "") && loudStop.ms < 1800);
  }

  // Redaction happens before the tail window: a key whose BEGIN line falls outside the last six lines must not leak.
  const body = Array.from({ length: 8 }, (_, i) => `Rml4dHVyZUtleUJvZHk${i}`);
  const pem = ["-----BEGIN RSA PRIVATE KEY-----", ...body, "-----END RSA PRIVATE KEY-----", "after key"];
  const pgp = ["-----BEGIN PGP PRIVATE KEY BLOCK-----", "", "UGdwRml4dHVyZUJvZHkx", "=UGdw", "-----END PGP PRIVATE KEY BLOCK-----", "after pgp"];
  const fakeProfile = path.resolve("/jaryo-fixture-profile"); // a string only, outside HOME and the working directory
  const kman = { id: "k", name: "K", declares: { actions: ["run"] }, steps: [
    { id: "pem", name: "Pem", needs: [], cmd: ["node", "-e", `console.log(${JSON.stringify(pem.join("\n"))})`] },
    { id: "pgp", name: "Pgp", needs: [], cmd: ["node", "-e", `console.error(${JSON.stringify(pgp.join("\n"))})`] },
    { id: "profile", name: "Profile", needs: [], cmd: ["node", "-e", "console.log('profile ' + process.env.USERPROFILE)"] },
    { id: "nostart", name: "No start", needs: [], cmd: ["API_TOKEN=fixture-reason-secret"] },
    { id: "gated", name: "Gated", needs: [], consequential: true, reason: "uses PASSWORD=fixture-review-secret", cmd: ["node", "-e", "0"] } ] };
  const kmf = path.join(tmp, "k.json"), kruns = path.join(tmp, "kruns"); fs.writeFileSync(kmf, JSON.stringify(kman));
  spawnSync("node", [path.join(root, "pipeline/run.mjs"), "--manifest", kmf, "--runs-dir", kruns, "--cwd", tmp],
    { encoding: "utf8", env: { ...process.env, USERPROFILE: fakeProfile } });
  const kfile = path.join(kruns, "run-0001.jsonl"), ktext = fs.readFileSync(kfile, "utf8");
  const krecs = ktext.trim().split("\n").map(x => JSON.parse(x)), kres = id => krecs.find(r => r.step === id && r.status);
  ck("runner: a 10-line private key is redacted before the tail is selected", kres("pem").status === "ok"
    && !body.some(b => ktext.includes(b)) && !ktext.includes("END RSA PRIVATE KEY") && kres("pem").tail.join("\n") === "[REDACTED PRIVATE KEY]\nafter key");
  ck("runner: a PGP private key block is redacted", !ktext.includes("UGdwRml4dHVyZUJvZHkx") && !ktext.includes("PGP PRIVATE KEY BLOCK")
    && kres("pgp").tail.join("\n") === "[REDACTED PRIVATE KEY]\nafter pgp");
  ck("runner: a credential in a failure reason is redacted", kres("nostart").status === "failed"
    && /API_TOKEN=\[REDACTED\]/.test(kres("nostart").reason) && !ktext.includes("fixture-reason-secret"));
  ck("runner: a credential in a review reason is redacted", kres("gated").status === "review"
    && kres("gated").reason === "uses PASSWORD=[REDACTED]" && !ktext.includes("fixture-review-secret"));
  ck("runner: USERPROFILE is scrubbed from recorded output", !ktext.includes(fakeProfile) && kres("profile").tail.includes("profile ~"));
  if (process.platform === "win32") console.log("SKIP runner: run file is 0600 in a 0700 directory (POSIX modes are not enforced on win32)");
  else ck("runner: run file is 0600 in a 0700 directory", (fs.statSync(kfile).mode & 0o777) === 0o600 && (fs.statSync(kruns).mode & 0o777) === 0o700);

  // Both CLIs from a checkout whose path has a space: the adaptor prints the view, the runner finds its default manifest.
  const sp = fs.mkdtempSync(path.join(os.tmpdir(), "jaryo sp ace-"));
  for (const dir of ["adaptor", "pipeline"]) fs.cpSync(path.join(root, dir), path.join(sp, dir), { recursive: true });
  const cli = spawnSync("node", [path.join(sp, "adaptor/jaryo-adaptor.mjs"), "pipeline/jaryo-verify.manifest.json", "pipeline/runs"], { cwd: sp, encoding: "utf8" });
  let cliView = null; try { cliView = JSON.parse(cli.stdout); } catch {}
  ck("adaptor CLI: prints the view from a path with a space", cli.status === 0 && cliView !== null && cliView.schema === "jaryo-view/0" && cliView.pipeline.id === "jaryo-verify" && cliView.steps.length > 0);
  fs.writeFileSync(path.join(sp, "pipeline/jaryo-verify.manifest.json"), JSON.stringify({ id: "s", name: "S", declares: { actions: ["run"] }, steps: [
    { id: "one", name: "One", needs: [], cmd: ["node", "-e", "0"] } ] }));
  fs.rmSync(path.join(sp, "pipeline/runs"), { recursive: true, force: true });
  const sr = spawnSync("node", [path.join(sp, "pipeline/run.mjs")], { cwd: sp, encoding: "utf8" });
  const srFile = path.join(sp, "pipeline/runs/run-0001.jsonl");
  ck("runner: uses its default manifest and runs directory from a path with a space", sr.status === 0 && /run 1: one=ok/.test(sr.stdout) && fs.existsSync(srFile) && fs.readFileSync(srFile, "utf8").includes("\"run-end\""));
}

// Mutation checks: each broken adaptor must be caught by at least one test.
const src = fs.readFileSync(adaptorPath, "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jaryo-mut-"));
fs.copyFileSync(path.join(root, "adaptor/redact.mjs"), path.join(tmp, "redact.mjs")); // so each mutant's relative import resolves
const MUTANTS = [
  ["guess OK when a step has no record", `state = "UNKNOWN"; reason = started ? "no record for this step in the latest run" : "no run record";`, `state = "OK"; reason = null;`],
  ["show RUNNING for a stale start", `if (live && fresh(beat)) { state = "RUNNING";`, `if (true) { state = "RUNNING";`],
  ["assume a heartbeat the manifest does not declare", `const fresh = ts => hb !== null && ts !== null && now - ts <= hb.staleAfterMs;`, `const fresh = ts => ts !== null && now - ts <= (hb ? hb.staleAfterMs : 120000);`],
  ["ignore the declared window", `ts !== null && now - ts <= hb.staleAfterMs;`, `ts !== null && now - ts <= 120000;`],
  ["judge a step by another step's heartbeat", `if (live && fresh(beat)) {`, `if (live) {`],
  ["accept a window at or below the interval, or above the cap", `\n    || hb.staleAfterMs <= hb.intervalMs || hb.staleAfterMs > HEARTBEAT_MAX_STALE_MS) {`, `) {`],
  ["trust a future timestamp", `if (lastTs !== null && lastTs > now + SKEW_MS)`, `if (false)`],
  ["copy the undeclared step's recorded status", `name: null, state: "UNKNOWN", reason: "not declared`, `name: null, state: "OK", reason: "not declared`],
  ["accept any status string", `if (key && Object.prototype.hasOwnProperty.call(RECOGNISED, key)) {`, `if (true) {`],
  ["offer every action", `: { id: a, available: false, reason: \`n/a: manifest does not declare \${a}\` }`, `: { id: a, available: true, review: false }`],
  ["ignore a restart after a result", `else if (final && si < fi) {`, `else if (final) {`],
  ["ignore exit contradictions", `if ((key === "ok" && exit !== null && exit !== 0) || (key === "failed" && exit === 0))`, `if (false)`],
  ["merge every run in a file", `const start = Math.max(0, at);`, `const start = 0;`],
  ["accept a run-end from another run", `if (started !== null && event.run !== undefined && started.run !== undefined && event.run !== started.run) continue;`, `if (false) continue;`],
  ["drop retry from the review list", `export const REVIEW_ACTIONS = ["run", "retry", "deploy", "delete", "overwrite"];`, `export const REVIEW_ACTIONS = ["run", "deploy", "delete", "overwrite"];`],
  ["choose record files as text", `if (value >= number) {`, `if (latest === null || file >= latest) {`],
  ["uncapped tail", `.slice(-TAIL_LINES).map(x => String(x).slice(0, TAIL_CHARS))`, `.map(x => String(x))`],
  ["a duplicate id keeps its state", `if (dup.has(s.id)) { state = "UNKNOWN"; reason = "manifest declares this id more than once"; }`, `if (false) { }`],
];
for (const [name, from, to] of MUTANTS) {
  count++;
  if (!src.includes(from)) { console.log("FAIL mutant not applicable:", name); failed++; continue; }
  const f = path.join(tmp, `m-${MUTANTS.findIndex(m => m[0] === name)}.mjs`); fs.writeFileSync(f, src.split(from).join(to));
  let caught = false;
  try { caught = (await suite(await import(pathToFileURL(f)))).some(r => !r.pass); } catch { caught = true; }
  console.log(caught ? "PASS" : "FAIL", `mutation caught: ${name}`); if (!caught) failed++;
}

// The Nisi run journal adaptor's suite. CI runs only this file, so it is run from here and counted in the total.
const journal = await import(pathToFileURL(path.join(root, "tests/nisi-journal-adaptor.test.mjs")));
count += journal.count; failed += journal.failed;
// The Nisi differential check replays a recorded corpus of Nisi's own verdicts against that adaptor (no Nisi needed).
const differential = await import(pathToFileURL(path.join(root, "tests/nisi-differential.test.mjs")));
count += differential.count; failed += differential.failed;
const security = await import(pathToFileURL(path.join(root, "tests/adaptor-security.test.mjs")));
for (const r of security.suite(real)) { count++; console.log(r.pass ? "PASS" : "FAIL", r.name); if (!r.pass) failed++; }
console.log(`${count - failed}/${count} passed`);
process.exit(failed ? 1 : 0);
