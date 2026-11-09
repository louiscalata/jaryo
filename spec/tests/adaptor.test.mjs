// Tests for adaptor/jaryo-adaptor.mjs and pipeline/run.mjs.
// The rule under test: no status is ever inferred, only copied from a record (RUNNING being the one named exception).
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const adaptorPath = path.join(root, "adaptor/jaryo-adaptor.mjs");

const M = { id: "p", name: "P", declares: { actions: ["run", "logs", "retry"], events: false }, steps: [
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
  t("corrupt lines are warnings and never change a status", v.warnings.length === 2 && st(v, "a") === "OK");
  v = buildView(M, "﻿" + L({ event: "run-start" }, { step: "a", status: "ok", exit: 0 }, { event: "run-end" }), now);
  t("a byte-order mark does not break the first line", v.run && v.run.id === 1 && st(v, "a") === "OK");
  v = buildView(M, L({ step: "a", status: "ok", exit: 0 }, { event: "run-end" }), now);
  t("steps with no run-start: the run state is unknown and warned about", v.run && v.run.state === "unknown" && v.warnings.some(w => /no run-start/.test(w)));
  v = buildView({ steps: "nope", declares: { actions: "run" } }, "", now);
  t("a malformed manifest gives no steps, no actions, warnings, and does not throw", v.steps.length === 0 && v.warnings.length === 2 && v.actions.every(a => !a.available));
  v = buildView({ id: "p", steps: [{ id: "a", needs: "b" }, { name: "no id" }, null] }, "", now);
  t("steps without an id are ignored; a bad needs list becomes empty", v.steps.length === 1 && v.steps[0].needs.length === 0 && v.warnings.length >= 2);
  v = buildView({ id: "p", steps: [{ id: "a" }, { id: "a" }] }, L({ event: "run-start" }, { step: "a", status: "ok", exit: 0 }), now);
  t("a duplicate manifest id makes both rows UNKNOWN and warns", v.steps.every(s => s.state === "UNKNOWN") && v.warnings.some(w => /more than once/.test(w)));
  v = buildView(M, L({ event: "run-start" }, { step: "__proto__", status: "ok" }, { step: "constructor", status: "ok" }), now);
  t("prototype-style ids are ordinary undeclared ids", v.undeclared.length === 2);
  v = buildView(M, L({ event: "run-start" }, { step: "a", status: "ok", exit: 0, tail: Array.from({ length: 50 }, (_, i) => "x".repeat(2000) + i) }), now);
  t("the output tail is capped in lines and in line length", v.steps[0].lastRun.tail.length === 6 && v.steps[0].lastRun.tail.every(x => x.length <= 500));
  // runs
  v = buildView(M, L({ event: "run-start", run: 1 }, { step: "a", status: "failed", exit: 1 }, { event: "run-end" }, { event: "run-start", run: 2 }, { step: "b", status: "ok", exit: 0 }), T0 + 8000);
  t("a file holding two runs shows only the last, and says so", v.run.id === 2 && st(v, "a") === "UNKNOWN" && st(v, "b") === "OK" && v.warnings.some(w => /2 runs/.test(w)));
  v = buildView(M, L({ event: "run-start", run: 2 }, { step: "a", event: "step-start" }, { event: "run-end", run: 1 }), now);
  t("a run-end from a different run does not end this run", v.run.state !== "ended" && v.warnings.some(w => /different run/.test(w)));
  t("the newest record file is chosen by number, not by text", latestRecordFile(["run-0002.jsonl", "run-0010.jsonl", "run-9.jsonl", "notes.txt"]) === "run-0010.jsonl" && latestRecordFile([]) === null);
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
  fs.unlinkSync(path.join(runs, "run-0001.jsonl")); // pruning an old record must not make the next run reuse a file
  const r4 = run();
  const files = fs.readdirSync(runs).sort();
  const ck = (name, c) => { count++; console.log(c ? "PASS" : "FAIL", name); if (!c) failed++; };
  ck("runner: after pruning, the next run gets a new number and its own file", files.join() === "run-0002.jsonl,run-0003.jsonl,run-0004.jsonl" && /run 4:/.test(r4.stdout));
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
}

// Mutation checks: each broken adaptor must be caught by at least one test.
const src = fs.readFileSync(adaptorPath, "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jaryo-mut-"));
const MUTANTS = [
  ["guess OK when a step has no record", `state = "UNKNOWN"; reason = started ? "no record for this step in the latest run" : "no run record";`, `state = "OK"; reason = null;`],
  ["show RUNNING for a stale start", `if (live) { state = "RUNNING";`, `if (true) { state = "RUNNING";`],
  ["trust a future timestamp", `if (lastTs !== null && lastTs > now + SKEW_MS)`, `if (false)`],
  ["copy the undeclared step's recorded status", `name: null, state: "UNKNOWN", reason: "not declared`, `name: null, state: "OK", reason: "not declared`],
  ["accept any status string", `if (key && Object.prototype.hasOwnProperty.call(RECOGNISED, key)) {`, `if (true) {`],
  ["offer every action", `: { id: a, available: false, reason: \`n/a: manifest does not declare \${a}\` }`, `: { id: a, available: true, review: false }`],
  ["ignore a restart after a result", `else if (final && si < fi) {`, `else if (final) {`],
  ["ignore exit contradictions", `if ((key === "ok" && exit !== null && exit !== 0) || (key === "failed" && exit === 0))`, `if (false)`],
  ["merge every run in a file", `const events = at >= 0 ? all.slice(at) : all;`, `const events = all;`],
  ["accept a run-end from another run", `(started === null || e.run === undefined || started.run === undefined || e.run === started.run)`, `true`],
  ["drop retry from the review list", `export const REVIEW_ACTIONS = ["run", "retry", "deploy", "delete", "overwrite"];`, `export const REVIEW_ACTIONS = ["run", "deploy", "delete", "overwrite"];`],
  ["sort record files as text", `.sort((a, b) => a[1] - b[1])`, `.sort((a, b) => (a[0] < b[0] ? -1 : 1))`],
  ["uncapped tail", `.slice(-TAIL_LINES).map(x => String(x).slice(0, TAIL_CHARS))`, `.map(x => String(x))`],
  ["a duplicate id keeps its state", `if (dup.has(s.id)) { state = "UNKNOWN"; reason = "manifest declares this id more than once"; }\n    else if (final && si < fi) {`, `if (false) { }\n    else if (final && si < fi) {`],
];
for (const [name, from, to] of MUTANTS) {
  count++;
  if (!src.includes(from)) { console.log("FAIL mutant not applicable:", name); failed++; continue; }
  const f = path.join(tmp, `m-${MUTANTS.findIndex(m => m[0] === name)}.mjs`); fs.writeFileSync(f, src.split(from).join(to));
  let caught = false;
  try { caught = (await suite(await import(pathToFileURL(f)))).some(r => !r.pass); } catch { caught = true; }
  console.log(caught ? "PASS" : "FAIL", `mutation caught: ${name}`); if (!caught) failed++;
}
console.log(`${count - failed}/${count} passed`);
process.exit(failed ? 1 : 0);
