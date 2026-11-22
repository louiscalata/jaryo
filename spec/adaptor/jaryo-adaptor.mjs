// Jaryo adaptor v0.1 (read-only). Reads what a pipeline declares (manifest) and what it recorded (JSONL run record)
// and emits a view document. Rule: every status in the view is copied from a record. Nothing is inferred,
// with one named exception: RUNNING, which needs an open run, a heartbeat the manifest declares, and a recent, valid
// timestamp from that step (see ADAPTOR-V0.md).
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url";
import { redactTail } from "./redact.mjs";

export const KNOWN_ACTIONS = ["run", "pause", "retry", "cancel", "logs", "deploy", "delete", "overwrite"];
// retry can re-execute consequential steps, so it is reviewed too.
export const REVIEW_ACTIONS = ["run", "retry", "deploy", "delete", "overwrite"];
export const SKEW_MS = 60000, TAIL_LINES = 6, TAIL_CHARS = 500;
// Accepted bounds for a declared heartbeat (declares.heartbeat = { intervalMs, staleAfterMs }).
export const HEARTBEAT_MIN_INTERVAL_MS = 100, HEARTBEAT_MAX_INTERVAL_MS = 600000, HEARTBEAT_MAX_STALE_MS = 3600000;
const RECOGNISED = { ok: "OK", failed: "FAILED", blocked: "BLOCKED", review: "REVIEW" };

function readHeartbeat(decl, warnings) {
  const hb = decl.heartbeat;
  if (hb === undefined) return null;
  const int = x => typeof x === "number" && Number.isInteger(x);
  if (!hb || typeof hb !== "object" || Array.isArray(hb) || !int(hb.intervalMs) || !int(hb.staleAfterMs)
    || hb.intervalMs < HEARTBEAT_MIN_INTERVAL_MS || hb.intervalMs > HEARTBEAT_MAX_INTERVAL_MS
    || hb.staleAfterMs <= hb.intervalMs || hb.staleAfterMs > HEARTBEAT_MAX_STALE_MS) {
    warnings.push(`manifest: declares.heartbeat must be { intervalMs, staleAfterMs } with integer intervalMs from ${HEARTBEAT_MIN_INTERVAL_MS} to ${HEARTBEAT_MAX_INTERVAL_MS} and staleAfterMs above it, at most ${HEARTBEAT_MAX_STALE_MS}; no heartbeat declared`);
    return null;
  }
  return { intervalMs: hb.intervalMs, staleAfterMs: hb.staleAfterMs };
}

export function readRecord(text) {
  const events = [], warnings = [], invalidAt = [];
  const body = String(text || "").replace(/^﻿/, "");
  body.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    try { const o = JSON.parse(line); if (o && typeof o === "object" && !Array.isArray(o)) events.push(o); else { invalidAt.push(events.length); warnings.push(`line ${i + 1}: not an object; earlier step evidence is untrusted`); } }
    catch { invalidAt.push(events.length); warnings.push(`line ${i + 1}: not valid JSON; earlier step evidence is untrusted`); }
  });
  return { events, warnings, invalidAt };
}

// redactTail (adaptor/redact.mjs) removes common credential forms before lines are selected or text is truncated.
// It joins the tail first, so multiline private keys cannot escape the tail window.

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
    events: decl.events === true ? true : decl.events === false ? false : null, heartbeat: readHeartbeat(decl, warnings) };
}

export function buildView(manifest, recordText, now = Date.now()) {
  if (typeof now !== "number" || !Number.isFinite(now) || Math.abs(now) > 8640000000000000)
    throw new TypeError("now must be a finite number within the JavaScript Date range");
  const warnings = [];
  const man = normalise(manifest, warnings);
  const rec = readRecord(recordText);
  for (const warning of rec.warnings) warnings.push(warning);
  const all = rec.events;

  let at = -1;
  let runStarts = 0;
  all.forEach((event, index) => {
    if (event.event === "run-start") {
      at = index;
      runStarts++;
    }
  });
  if (runStarts > 1) warnings.push(`record holds ${runStarts} runs; only the last is shown`);
  const started = at >= 0 ? all[at] : null;
  const start = Math.max(0, at);
  const byStep = new Map();
  let accepted = 0;
  let ended = null;
  let hasStep = false;
  let lastTs = null;
  for (let index = start; index < all.length; index++) {
    const event = all[index];
    if (started !== null && event.run !== undefined && started.run !== undefined && event.run !== started.run) continue;
    accepted++;
    if (ended === null && event.event === "run-end") ended = event;
    if (event.step) hasStep = true;
    const parsed = typeof event.ts === "string" ? Date.parse(event.ts) : NaN;
    const stamp = Number.isFinite(parsed) ? parsed : null;
    if (stamp !== null && (lastTs === null || stamp > lastTs)) lastTs = stamp;
    if (typeof event.step !== "string") continue;

    let evidence = byStep.get(event.step);
    if (evidence === undefined) {
      evidence = { fi: -1, si: -1, final: null, beat: null };
      byStep.set(event.step, evidence);
    }
    if (event.status !== undefined && event.status !== null && event.status !== "") {
      evidence.fi = index;
      evidence.final = event;
    }
    if (event.event === "step-start") {
      evidence.si = index;
      evidence.beat = stamp;
    } else if (event.event === "heartbeat" && evidence.si >= 0 && stamp !== null && (evidence.beat === null || stamp > evidence.beat)) {
      evidence.beat = stamp;
    }
  }
  if (accepted !== all.length - start) warnings.push("events in the record belong to a different run and were ignored");
  if (!started && hasStep) warnings.push("record has step events but no run-start; the run state is unknown");
  const lastInvalid = rec.invalidAt.at(-1) ?? -1;
  const invalidAt = lastInvalid > at ? lastInvalid : -1;

  if (lastTs !== null && lastTs > now + SKEW_MS) { warnings.push("record has a timestamp in the future; liveness cannot be judged"); lastTs = null; }
  const runOpen = !!started && !ended;
  const hb = man.heartbeat;
  const fresh = ts => hb !== null && ts !== null && now - ts <= hb.staleAfterMs;
  const live = runOpen && lastTs !== null && fresh(lastTs);

  const dup = new Set(); const seen = new Set();
  for (const s of man.steps) { if (seen.has(s.id)) dup.add(s.id); seen.add(s.id); }
  if (dup.size) warnings.push(`manifest declares ${[...dup].join(", ")} more than once`);

  const steps = man.steps.map(s => {
    const { fi = -1, si = -1, final = null, beat = null } = byStep.get(s.id) || {};
    let state, reason = null, record = null;
    if (dup.has(s.id)) { state = "UNKNOWN"; reason = "manifest declares this id more than once"; }
    else if (Math.max(fi, si) < invalidAt) { state = "UNKNOWN"; reason = "an invalid record line may hide a later step event"; }
    else if (final && si < fi) {
      const key = typeof final.status === "string" ? final.status : null;
      if (key && Object.prototype.hasOwnProperty.call(RECOGNISED, key)) {
        const exit = typeof final.exit === "number" ? final.exit : null;
        if ((key === "ok" && exit !== null && exit !== 0) || (key === "failed" && exit === 0)) { state = "UNKNOWN"; reason = `record contradicts itself: status ${key} with exit ${exit}`; }
        else {
          state = RECOGNISED[key]; reason = typeof final.reason === "string" ? final.reason : null;
          if (state === "FAILED" && (!reason || !reason.trim()))
            reason = `This step ran and failed${Number.isFinite(exit) ? `: exit ${exit}` : ""}. See its last output.`;
        }
        record = final;
      } else { state = "UNKNOWN"; reason = `record has an unrecognised status "${String(final.status).slice(0, 24)}"`; record = final; }
    } else if (si >= 0) {
      if (live && fresh(beat)) { state = "RUNNING"; reason = fi >= 0 ? "started again after an earlier result" : null; }
      else {
        state = "UNKNOWN";
        reason = (ended ? "step started; the run ended with no result recorded for it"
          : !runOpen ? "step started, but the run state is unknown"
          : hb === null ? "step started, but the manifest declares no heartbeat, so liveness cannot be judged"
          : `step started, but the run record has no end and no heartbeat from this step within ${hb.staleAfterMs / 1000} s`) + (fi >= 0 ? " (an earlier result was superseded)" : "");
      }
    } else {
      state = "UNKNOWN"; reason = started ? "no record for this step in the latest run" : "no run record";
    }
    let lastRun = null;
    if (record) {
      let tail = [];
      if (Array.isArray(record.tail)) tail = redactTail(record.tail).slice(-TAIL_LINES).map(x => String(x).slice(0, TAIL_CHARS));
      else if (record.tail !== undefined) warnings.push(`step ${s.id}: tail is not a list, ignored`);
      lastRun = {
        ms: Number.isFinite(record.ms) ? record.ms : null,
        exit: Number.isFinite(record.exit) ? record.exit : null,
        tail,
      };
    }
    return { id: s.id, name: s.name, needs: s.needs, next: [], state, reason, consequential: s.consequential, lastRun };
  });
  const declared = new Map();
  for (const s of steps) {
    if (!declared.has(s.id)) declared.set(s.id, s);
  }
  for (const s of steps) {
    for (const d of s.needs) {
      const p = declared.get(d);
      if (p) p.next.push(s.id);
    }
  }

  const undeclared = [...byStep.keys()].filter(k => !declared.has(k)).map(k => ({
    logId: k, name: null, state: "UNKNOWN", reason: "not declared by the pipeline's manifest; the run record mentions it" }));

  const actions = KNOWN_ACTIONS.map(a => man.actions.includes(a)
    ? { id: a, available: true, review: REVIEW_ACTIONS.includes(a) }
    : { id: a, available: false, reason: `n/a: manifest does not declare ${a}` });

  const counts = { total: steps.length, blocked: steps.filter(s => s.state === "BLOCKED").length, failed: steps.filter(s => s.state === "FAILED").length,
    unknown: steps.filter(s => s.state === "UNKNOWN").length + undeclared.length, review: steps.filter(s => s.state === "REVIEW").length };
  const run = started ? { id: started.run ?? null, startedAt: typeof started.ts === "string" ? started.ts : null, endedAt: ended && typeof ended.ts === "string" ? ended.ts : null, state: ended ? "ended" : live ? "running" : "unknown" }
    : (hasStep ? { id: null, startedAt: null, endedAt: null, state: "unknown" } : null);
  return {
    schema: "jaryo-view/0", generatedAt: new Date(now).toISOString(), lastEventAt: lastTs !== null ? new Date(lastTs).toISOString() : null,
    pipeline: { id: man.id, name: man.name }, run,
    capabilities: { declared: man.actions, eventStream: man.events, heartbeat: man.heartbeat }, actions, steps, undeclared,
    review: { consequentialSteps: steps.filter(s => s.consequential).map(s => s.id), counts }, warnings,
  };
}

const RECORD_FILE = /^run-(\d+)\.jsonl$/;

function recordNumber(file) {
  const match = RECORD_FILE.exec(file);
  return match === null ? null : BigInt(match[1]);
}

export function latestRecordFile(files) {
  let latest = null;
  let number = -1n;
  files.forEach(file => {
    const value = recordNumber(file);
    if (value === null) return;
    if (value >= number) {
      latest = file;
      number = value;
    }
  });
  return latest;
}

export function loadRecord(manifest, target, now) {
  const records = [];
  for (const file of fs.readdirSync(target)) {
    const number = recordNumber(file);
    if (number !== null) records.push({ file, number });
  }
  records.sort((left, right) => {
    if (left.number < right.number) return -1;
    if (left.number > right.number) return 1;
    return 0;
  });
  for (let index = records.length - 1; index >= 0; index--) {
    const recordPath = path.join(target, records[index].file);
    if (!fs.statSync(recordPath).isFile()) continue;
    const text = fs.readFileSync(recordPath, "utf8");
    return { view: buildView(manifest, text, now), inputPaths: [recordPath] };
  }
  return { view: buildView(manifest, "", now), inputPaths: [] };
}

// Run as a CLI only when this file is the main module. Compare file URLs of the real path, so a path with a space,
// a symlinked directory (macOS /tmp, /var) or a Windows drive path still matches.
const isMain = () => { try { return !!process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href; } catch { return false; } };
if (isMain()) {
  const [manifestPath, runsDir] = process.argv.slice(2);
  if (!manifestPath) { console.error("usage: jaryo-adaptor.mjs <manifest.json> [runs-dir]"); process.exit(2); }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const view = runsDir && fs.existsSync(runsDir) ? loadRecord(manifest, runsDir).view : buildView(manifest, "");
  process.stdout.write(JSON.stringify(view, null, 2) + "\n");
}
