// Jaryo adaptor v0.1 (read-only). Reads what a pipeline declares (manifest) and what it recorded (JSONL run record)
// and emits a view document. Rule: every status in the view is copied from a record. Nothing is inferred,
// with one named exception: RUNNING, which needs a recent, valid timestamp and an open run (see ADAPTOR-V0.md).
import fs from "node:fs"; import path from "node:path";

export const KNOWN_ACTIONS = ["run", "pause", "retry", "cancel", "logs", "deploy", "delete", "overwrite"];
// retry can re-execute consequential steps, so it is reviewed too.
export const REVIEW_ACTIONS = ["run", "retry", "deploy", "delete", "overwrite"];
export const STALE_MS = 120000, SKEW_MS = 60000, TAIL_LINES = 6, TAIL_CHARS = 500;
const RECOGNISED = { ok: "OK", failed: "FAILED", blocked: "BLOCKED", review: "REVIEW" };

export function readRecord(text) {
  const events = [], warnings = [];
  const body = String(text || "").replace(/^﻿/, "");
  body.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    try { const o = JSON.parse(line); if (o && typeof o === "object" && !Array.isArray(o)) events.push(o); else warnings.push(`line ${i + 1}: not an object, ignored`); }
    catch { warnings.push(`line ${i + 1}: not valid JSON, ignored`); }
  });
  return { events, warnings };
}

function normalise(manifest, warnings) {
  const m = manifest && typeof manifest === "object" ? manifest : {};
  if (!Array.isArray(m.steps)) { if (m.steps !== undefined) warnings.push("manifest: steps is not a list; no steps declared"); }
  const steps = (Array.isArray(m.steps) ? m.steps : []).filter(s => {
    const good = s && typeof s === "object" && typeof s.id === "string" && s.id;
    if (!good) warnings.push("manifest: a step without a string id was ignored");
    return good;
  }).map(s => ({ id: s.id, name: typeof s.name === "string" && s.name ? s.name : s.id,
    needs: Array.isArray(s.needs) ? s.needs.filter(x => typeof x === "string") : [], consequential: s.consequential === true }));
  const decl = m.declares && typeof m.declares === "object" ? m.declares : {};
  let actions = decl.actions;
  if (!Array.isArray(actions)) { if (actions !== undefined) warnings.push("manifest: declares.actions is not a list; no actions declared"); actions = []; }
  return { id: String(m.id ?? ""), name: String(m.name ?? m.id ?? ""), steps, actions: actions.filter(a => typeof a === "string"),
    events: decl.events === true ? true : decl.events === false ? false : null };
}

export function buildView(manifest, recordText, now = Date.now()) {
  const warnings = [];
  const man = normalise(manifest, warnings);
  const rec = readRecord(recordText); warnings.push(...rec.warnings);
  const all = rec.events;

  // Scope to the last run in the file.
  let at = -1; all.forEach((e, i) => { if (e.event === "run-start") at = i; });
  const runStarts = all.filter(e => e.event === "run-start").length;
  if (runStarts > 1) warnings.push(`record holds ${runStarts} runs; only the last is shown`);
  const events = at >= 0 ? all.slice(at) : all;
  const started = at >= 0 ? all[at] : null;
  const ended = events.find(e => e.event === "run-end" && (started === null || e.run === undefined || started.run === undefined || e.run === started.run)) || null;
  if (!started && events.some(e => e.step)) warnings.push("record has step events but no run-start; the run state is unknown");
  if (started && events.some(e => e.event === "run-end") && !ended) warnings.push("a run-end in the record belongs to a different run and was ignored");

  // Timestamps: valid strings only; a timestamp ahead of now is not trusted.
  const stamps = events.map(e => (typeof e.ts === "string" ? Date.parse(e.ts) : NaN)).filter(Number.isFinite);
  let lastTs = stamps.length ? Math.max(...stamps) : null;
  if (lastTs !== null && lastTs > now + SKEW_MS) { warnings.push("record has a timestamp in the future; liveness cannot be judged"); lastTs = null; }
  const runOpen = !!started && !ended;
  const live = runOpen && lastTs !== null && now - lastTs <= STALE_MS;

  const dup = new Set(); const seen = new Set();
  for (const s of man.steps) { if (seen.has(s.id)) dup.add(s.id); seen.add(s.id); }
  if (dup.size) warnings.push(`manifest declares ${[...dup].join(", ")} more than once`);

  const byStep = new Map();
  events.forEach((e, i) => { if (typeof e.step === "string") { const a = byStep.get(e.step) || []; a.push([i, e]); byStep.set(e.step, a); } });

  const steps = man.steps.map(s => {
    const evs = byStep.get(s.id) || [];
    let fi = -1, si = -1, final = null;
    for (const [i, e] of evs) { if (e.status !== undefined && e.status !== null && e.status !== "") { fi = i; final = e; } if (e.event === "step-start") si = i; }
    let state, reason = null, record = null;
    if (dup.has(s.id)) { state = "UNKNOWN"; reason = "manifest declares this id more than once"; }
    else if (final && si < fi) {
      const key = typeof final.status === "string" ? final.status : null;
      if (key && Object.prototype.hasOwnProperty.call(RECOGNISED, key)) {
        const exit = typeof final.exit === "number" ? final.exit : null;
        if ((key === "ok" && exit !== null && exit !== 0) || (key === "failed" && exit === 0)) { state = "UNKNOWN"; reason = `record contradicts itself: status ${key} with exit ${exit}`; }
        else { state = RECOGNISED[key]; reason = typeof final.reason === "string" ? final.reason : null; }
        record = final;
      } else { state = "UNKNOWN"; reason = `record has an unrecognised status "${String(final.status).slice(0, 24)}"`; record = final; }
    } else if (si >= 0) {
      if (live) { state = "RUNNING"; reason = fi >= 0 ? "started again after an earlier result" : null; }
      else { state = "UNKNOWN"; reason = (ended ? "step started; the run ended with no result recorded for it" : "step started, but the run record has no end and is stale") + (fi >= 0 ? " (an earlier result was superseded)" : ""); }
    } else {
      state = "UNKNOWN"; reason = started ? "no record for this step in the latest run" : "no run record";
    }
    let lastRun = null;
    if (record) {
      let tail = [];
      if (Array.isArray(record.tail)) tail = record.tail.slice(-TAIL_LINES).map(x => String(x).slice(0, TAIL_CHARS));
      else if (record.tail !== undefined) warnings.push(`step ${s.id}: tail is not a list, ignored`);
      lastRun = { ms: typeof record.ms === "number" ? record.ms : null, exit: typeof record.exit === "number" ? record.exit : null, tail };
    }
    return { id: s.id, name: s.name, needs: s.needs, next: [], state, reason, consequential: s.consequential, lastRun };
  });
  for (const s of steps) for (const d of s.needs) { const p = steps.find(x => x.id === d); if (p) p.next.push(s.id); }

  const declaredIds = new Set(man.steps.map(s => s.id));
  const undeclared = [...byStep.keys()].filter(k => !declaredIds.has(k)).map(k => ({
    logId: k, name: null, state: "UNKNOWN", reason: "not declared by the pipeline's manifest; the run record mentions it" }));

  const actions = KNOWN_ACTIONS.map(a => man.actions.includes(a)
    ? { id: a, available: true, review: REVIEW_ACTIONS.includes(a) }
    : { id: a, available: false, reason: `n/a: manifest does not declare ${a}` });

  const counts = { total: steps.length, blocked: steps.filter(s => s.state === "BLOCKED").length, failed: steps.filter(s => s.state === "FAILED").length,
    unknown: steps.filter(s => s.state === "UNKNOWN").length + undeclared.length, review: steps.filter(s => s.state === "REVIEW").length };
  const run = started ? { id: started.run ?? null, startedAt: typeof started.ts === "string" ? started.ts : null, endedAt: ended && typeof ended.ts === "string" ? ended.ts : null, state: ended ? "ended" : live ? "running" : "unknown" }
    : (events.some(e => e.step) ? { id: null, startedAt: null, endedAt: null, state: "unknown" } : null);
  return {
    schema: "jaryo-view/0", generatedAt: new Date(now).toISOString(), lastEventAt: lastTs !== null ? new Date(lastTs).toISOString() : null,
    pipeline: { id: man.id, name: man.name }, run,
    capabilities: { declared: man.actions, eventStream: man.events }, actions, steps, undeclared,
    review: { consequentialSteps: steps.filter(s => s.consequential).map(s => s.id), counts }, warnings,
  };
}

export function latestRecordFile(files) {
  const re = /^run-(\d+)\.jsonl$/;
  const list = files.map(f => [f, re.exec(f)]).filter(([, m]) => m).map(([f, m]) => [f, parseInt(m[1], 10)]).sort((a, b) => a[1] - b[1]);
  return list.length ? list[list.length - 1][0] : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [manifestPath, runsDir] = process.argv.slice(2);
  if (!manifestPath) { console.error("usage: jaryo-adaptor.mjs <manifest.json> [runs-dir]"); process.exit(2); }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  let text = "";
  if (runsDir && fs.existsSync(runsDir)) { const f = latestRecordFile(fs.readdirSync(runsDir)); if (f) text = fs.readFileSync(path.join(runsDir, f), "utf8"); }
  process.stdout.write(JSON.stringify(buildView(manifest, text), null, 2) + "\n");
}
