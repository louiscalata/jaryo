// Jaryo adaptor for a Nisi run journal (read-only). Reads a pipeline manifest and a nisi-run-journal-v1 JSONL file
// (a header line, entry lines, a footer line) and emits the same jaryo-view/0 document as buildView in
// jaryo-adaptor.mjs, so the existing page and its checks apply unchanged.
// Rule: a step's state is copied from its latest journal entry. The footer, the header's clock and the journal being
// well formed never make a step OK. RUNNING is the one named exception: it needs a heartbeat the manifest declares,
// an entry that has not expired and a fresh heartbeatAt on that entry, judged against Jaryo's clock. It is never
// shown where Nisi's own reader would report the entry EXPIRED or UNKNOWN (see ADAPTOR-V0.md).
// The hash chain is not checked: Nisi is a separate repository and its code is not imported here. The view is
// therefore labelled unauthenticated; even a checked chain is unkeyed and shows only that the file is intact.
import fs from "node:fs"; import { pathToFileURL } from "node:url";
import { buildView, SKEW_MS } from "./jaryo-adaptor.mjs";

export const JOURNAL_SCHEMA = "nisi-run-journal-v1";
// Input is refused above this many bytes, before it is decoded or parsed.
export const MAX_JOURNAL_BYTES = 4 * 1024 * 1024;
export const UNAUTHENTICATED = "the Nisi journal is unauthenticated: Jaryo did not check its hash chain, and a well-formed journal shows what its writer wrote, not that it happened";
const COPIED = { SUCCEEDED: "OK", FAILED: "FAILED" };
const DUP_REASON = "manifest declares this id more than once";

const isObj = x => x !== null && typeof x === "object" && !Array.isArray(x);
const isId = x => typeof x === "string" && x.length > 0 && x.length <= 128;
const stamp = x => (Number.isSafeInteger(x) && x >= 0 ? x : null);
const quote = x => JSON.stringify(String(x).slice(0, 64));

// Whether an entry has the shape Nisi's own writer and reader require (history/run-journal-v1.mjs: entryOf and copy).
// Nisi refuses any other entry, and its reopen rejects a file that holds one, so RUNNING is never shown for it.
// Only RUNNING is judged this way: every other state is copied from the record, which stays unauthenticated.
const NISI_KEYS = ["id", "projectId", "runId", "attempt", "candidateId", "stage", "receiptId", "createdAt", "ttlMs", "state", "heartbeatAt", "retryOf", "revokes", "payload"];
const NISI_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const NISI_STATES = new Set(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED", "REVOKED"]);
const NISI_FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const nisiId = x => typeof x === "string" && NISI_ID.test(x);
const nisiTime = x => Number.isSafeInteger(x) && x >= 0 && !Object.is(x, -0);
// Nisi copies an entry as a tree of null, booleans, well-formed strings and safe integers: no floats, no -0, no forbidden
// keys, nesting to 64 levels, at most 1,000,000 values.
function nisiTree(x, depth, budget) {
  if (depth > 64 || ++budget.values > 1000000) return false;
  if (x === null || typeof x === "boolean") return true;
  if (typeof x === "string") return x.isWellFormed();
  if (typeof x === "number") return Number.isSafeInteger(x) && !Object.is(x, -0);
  if (typeof x !== "object") return false;
  if (Array.isArray(x)) return x.every(v => nisiTree(v, depth + 1, budget));
  return Object.keys(x).every(k => !NISI_FORBIDDEN_KEYS.has(k) && k.isWellFormed() && nisiTree(x[k], depth + 1, budget));
}
function nisiEntry(e) {
  const keys = Object.keys(e);
  return keys.length === NISI_KEYS.length && NISI_KEYS.every(k => Object.prototype.hasOwnProperty.call(e, k)) && nisiTree(e, 0, { values: 0 })
    && [e.id, e.projectId, e.runId, e.candidateId, e.stage].every(nisiId) && Number.isSafeInteger(e.attempt) && e.attempt >= 0
    && nisiTime(e.createdAt) && Number.isSafeInteger(e.ttlMs) && e.ttlMs >= 1 && Number.isSafeInteger(e.createdAt + e.ttlMs) && NISI_STATES.has(e.state)
    && (e.heartbeatAt === null || nisiTime(e.heartbeatAt))  // heartbeatAt <= createdAt is checked by the caller
    && [e.receiptId, e.retryOf, e.revokes].every(x => x === null || nisiId(x))
    && (e.state === "REVOKED" ? e.revokes !== null && e.retryOf === null : e.revokes === null) && (e.retryOf === null || e.state === "QUEUED");
}

export function buildJournalView(manifest, input, now = Date.now(), { maxBytes = MAX_JOURNAL_BYTES } = {}) {
  const base = buildView(manifest, "", now);
  const warnings = [UNAUTHENTICATED, ...base.warnings];
  const hb = base.capabilities.heartbeat;
  const source = { format: JOURNAL_SCHEMA, authenticated: false, chainChecked: false, projectId: null };
  const keep = s => (s.reason === DUP_REASON ? s.reason : null);
  const finish = (steps, undeclared, run, lastTs) => {
    const counts = { total: steps.length, blocked: steps.filter(s => s.state === "BLOCKED").length, failed: steps.filter(s => s.state === "FAILED").length,
      unknown: steps.filter(s => s.state === "UNKNOWN").length + undeclared.length, review: steps.filter(s => s.state === "REVIEW").length };
    return { schema: base.schema, generatedAt: base.generatedAt, lastEventAt: lastTs !== null ? new Date(lastTs).toISOString() : null,
      pipeline: base.pipeline, run, capabilities: base.capabilities, actions: base.actions, steps, undeclared,
      review: { consequentialSteps: base.review.consequentialSteps, counts }, warnings, source };
  };
  const refuse = (warning, reason) => {
    if (warning) warnings.push(warning);
    return finish(base.steps.map(s => ({ ...s, state: "UNKNOWN", reason: keep(s) || reason, lastRun: null })), [], null, null);
  };

  // Bound the input before decoding or parsing it.
  if (input === undefined || input === null || input === "") return refuse(null, "no journal");
  let text;
  if (typeof input === "string") {
    const bytes = input.length > maxBytes ? input.length : Buffer.byteLength(input, "utf8");
    if (bytes > maxBytes) return refuse(`journal is over the ${maxBytes}-byte limit and was not read`, "journal not read: over the size limit");
    text = input;
  } else if (input instanceof Uint8Array) {
    const bytes = input.byteLength;
    if (bytes > maxBytes) return refuse(`journal is over the ${maxBytes}-byte limit and was not read`, "journal not read: over the size limit");
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(input); }
    catch { return refuse("journal is not valid UTF-8 and was not read", "journal not readable"); }
  } else return refuse("journal input is not text and was not read", "journal not readable");

  const lines = text.replace(/^﻿/, "").split("\n");
  let first = 0; while (first < lines.length && !lines[first].trim()) first++;
  let header = null; try { header = JSON.parse(lines[first] ?? ""); } catch {}
  if (!isObj(header) || header.type !== "header" || header.schema !== JOURNAL_SCHEMA || !isObj(header.config) || !isId(header.config.projectId))
    return refuse(`journal header is missing or is not a ${JOURNAL_SCHEMA} header`, "journal header not readable");
  const projectId = header.config.projectId; source.projectId = projectId;
  // Nisi's own heartbeat limit. Nisi refuses a header without a valid one, so without it nothing is RUNNING.
  const beatTtl = Number.isSafeInteger(header.config.heartbeatTtlMs) && header.config.heartbeatTtlMs >= 1 ? header.config.heartbeatTtlMs : null;
  // The header carries its own project and clock. Jaryo checks the project against its manifest and uses its own clock.
  if (projectId !== base.pipeline.id) {
    return refuse(`journal projectId ${quote(projectId)} is not the manifest id ${quote(base.pipeline.id)}; every step is UNKNOWN`, "journal belongs to a different project");
  }

  const entries = [], ids = new Set();
  let footer = null, entryLines = 0, bad = 0, firstBad = null, other = 0, repeated = 0, afterFooter = 0;
  for (let n = first + 1; n < lines.length; n++) {
    const raw = lines[n]; if (!raw.trim()) continue;
    if (footer) { afterFooter++; continue; }
    let o = null; try { o = JSON.parse(raw); } catch {}
    if (isObj(o) && o.type === "footer") { footer = o; continue; }
    entryLines++;
    const e = isObj(o) && o.type === "entry" && isObj(o.record) && isObj(o.record.entry) ? o.record.entry : null;
    if (!e || !isId(e.id) || !isId(e.runId) || !isId(e.stage)) { bad++; if (firstBad === null) firstBad = n + 1; continue; }
    if (e.projectId !== projectId) { other++; continue; }
    if (ids.has(e.id)) { repeated++; continue; }
    ids.add(e.id); entries.push(e);
  }
  if (bad) warnings.push(`${bad} line${bad === 1 ? " is" : "s are"} not ${bad === 1 ? "a readable journal entry" : "readable journal entries"} and ${bad === 1 ? "was" : "were"} ignored (first: line ${firstBad})`);
  if (other) warnings.push(`${other} entr${other === 1 ? "y is" : "ies are"} for another project and ${other === 1 ? "was" : "were"} ignored`);
  if (repeated) warnings.push(`${repeated} entr${repeated === 1 ? "y repeats an id" : "ies repeat an id"} used more than once and ${repeated === 1 ? "was" : "were"} ignored`);
  if (afterFooter) warnings.push(`journal has data after the footer; ${afterFooter} line${afterFooter === 1 ? " was" : "s were"} ignored`);
  if (!footer) warnings.push("journal has no footer: it may be incomplete or still being written");
  else if (footer.count !== entryLines) warnings.push(`journal footer count ${quote(footer.count)} does not match its ${entryLines} entry lines`);

  // Scope to the run of the last entry.
  const runs = [...new Set(entries.map(e => e.runId))];
  const runId = entries.length ? entries[entries.length - 1].runId : null;
  if (runs.length > 1) warnings.push(`journal holds ${runs.length} runs; only the last (${quote(runId)}) is shown`);
  const revokedBy = new Map(), latest = new Map(), stages = [];
  let future = false; const created = [], times = [];
  for (const e of entries) {
    if (e.runId !== runId) continue;
    for (const x of [e.createdAt, e.heartbeatAt]) { const s = stamp(x); if (s !== null) { if (s > now + SKEW_MS) future = true; times.push(s); } }
    if (stamp(e.createdAt) !== null) created.push(e.createdAt);
    if (e.state === "REVOKED") { if (isId(e.revokes)) revokedBy.set(e.revokes, e.id); }
    if (e.state === "REVOKED") continue;
    if (!latest.has(e.stage)) stages.push(e.stage);
    latest.set(e.stage, e);
  }
  if (future) warnings.push("journal has a timestamp in the future; liveness cannot be judged");
  const lastTs = !future && times.length ? Math.max(...times) : null;

  const steps = base.steps.map(s => {
    let state = "UNKNOWN", reason;
    const e = latest.get(s.id);
    if (keep(s)) reason = keep(s);
    else if (!e) { state = "UNKNOWN"; reason = "no journal entry for this step in the latest run"; }
    else if (revokedBy.has(e.id)) { state = "UNKNOWN"; reason = `journal entry ${e.id} was revoked by ${revokedBy.get(e.id)}`; }
    else if (Object.prototype.hasOwnProperty.call(COPIED, e.state)) { state = COPIED[e.state]; reason = null; }
    else if (e.state === "RUNNING") {
      const beat = stamp(e.heartbeatAt), made = stamp(e.createdAt);
      if (hb === null) { state = "UNKNOWN"; reason = "journal says RUNNING, but the manifest declares no heartbeat, so liveness cannot be judged"; }
      else if (future) { state = "UNKNOWN"; reason = "journal says RUNNING, but a journal timestamp is in the future"; }
      else if (beat === null || made === null || beat > made || !Number.isSafeInteger(e.ttlMs) || e.ttlMs < 1 || !Number.isSafeInteger(made + e.ttlMs)) { state = "UNKNOWN"; reason = "journal says RUNNING, but the entry has no valid createdAt, heartbeatAt and ttlMs"; }
      else if (beatTtl === null) { state = "UNKNOWN"; reason = "journal says RUNNING, but the journal header has no valid heartbeatTtlMs"; }
      // Nisi: an entry expires ttlMs after its createdAt, whatever its heartbeat says.
      else if (now >= made + e.ttlMs) { state = "UNKNOWN"; reason = `journal says RUNNING, but the entry expired ${e.ttlMs / 1000} s after it was created`; }
      else if (!nisiEntry(e)) { state = "UNKNOWN"; reason = "journal says RUNNING, but the entry is not a valid Nisi journal entry"; }
      else {
        // Fresh only inside both heartbeat windows, by Jaryo's clock: the manifest's staleAfterMs and the journal's
        // own heartbeatTtlMs. The header can only shorten the window, so it can only turn RUNNING into UNKNOWN.
        const windowMs = Math.min(hb.staleAfterMs, beatTtl);
        const age = now - beat;
        if (age <= windowMs) { state = "RUNNING"; reason = null; }
        else { state = "UNKNOWN"; reason = `journal says RUNNING, but its heartbeatAt is older than ${windowMs / 1000} s`; }
      }
    } else if (e.state === "QUEUED" || e.state === "CANCELLED") { state = "UNKNOWN"; reason = `journal says ${e.state}; the view has no state for it`; }
    else { state = "UNKNOWN"; reason = `journal has an unrecognised state ${quote(e.state).slice(0, 26)}`; }
    return { ...s, state, reason, lastRun: null };
  });

  const declared = new Set(base.steps.map(s => s.id));
  const undeclared = stages.filter(k => !declared.has(k)).map(k => ({
    logId: k, name: null, state: "UNKNOWN", reason: "not declared by the pipeline's manifest; the journal mentions it" }));
  const startedAt = !future && created.length ? new Date(Math.min(...created)).toISOString() : null;
  const run = runId === null ? null : { id: runId, startedAt, endedAt: null, state: steps.some(s => s.state === "RUNNING") ? "running" : "unknown" };
  return finish(steps, undeclared, run, lastTs);
}

// Reads at most maxBytes + 1 bytes from one descriptor, so an over-limit file is refused by buildJournalView
// without being read whole.
export function readJournalFile(file, maxBytes = MAX_JOURNAL_BYTES) {
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const buf = Buffer.alloc(Math.min(size, maxBytes) + 1);
    let got = 0, n;
    while (got < buf.length && (n = fs.readSync(fd, buf, got, buf.length - got, null)) > 0) got += n;
    return buf.subarray(0, got);
  } finally { fs.closeSync(fd); }
}

const isMain = () => { try { return !!process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href; } catch { return false; } };
if (isMain()) {
  const [manifestPath, journalPath] = process.argv.slice(2);
  if (!manifestPath || !journalPath) { console.error("usage: nisi-journal-adaptor.mjs <manifest.json> <journal.jsonl>"); process.exit(2); }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  process.stdout.write(JSON.stringify(buildJournalView(manifest, readJournalFile(journalPath)), null, 2) + "\n");
}
