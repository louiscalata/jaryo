// Differential check: the Jaryo Nisi-journal adaptor against Nisi's own journal reader (ADAPTOR-V0 finding 6).
// Jaryo does not import Nisi, so this file has two halves.
//   Shared (imported by tests/nisi-differential.test.mjs, no Nisi needed): the case generator, the journal builder
//   and the judge that says what the adaptor must show given what Nisi said.
//   Generate (needs an export of Nisi, see usage): runs every case through Nisi's reader and records the verdicts in
//   pipeline/fixtures/nisi-differential-corpus.jsonl, with this script and the Nisi commit named in the corpus header.
// The test replays the recorded corpus against the adaptor. It needs neither Nisi nor a network.
//
// usage: node adaptor/differential-nisi.mjs --nisi <export dir> --commit <40-hex> [--out <corpus path>] [--check]
//   <export dir> is `git archive <commit>` of Nisi extracted into a folder outside this repository.
//   --check regenerates in memory and exits 1 unless the file at --out is byte-identical.
import { createHash } from "node:crypto";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";

export const CORPUS_SCHEMA = "jaryo-nisi-differential-corpus-v1";
export const GENERATOR = "spec/adaptor/differential-nisi.mjs";
export const SEED = 20261116;
export const T0 = Date.UTC(2026, 10, 7, 20, 0, 0);
const STEPS = ["a", "b", "c"];
// The entry every case starts from, in Nisi's shape. A corpus case stores only what differs from it.
export const BASE = { attempt: 0, candidateId: "c1", createdAt: T0, heartbeatAt: null, id: "e1", payload: null, projectId: "p", receiptId: null,
  retryOf: null, revokes: null, runId: "r1", stage: "a", state: "RUNNING", ttlMs: 3600000 };

export const expand = raw => { const e = { ...BASE, ...(raw.set || {}) }; for (const k of raw.del || []) delete e[k]; return e; };
export const manifestFor = c => ({ id: "p", name: "P", declares: { actions: ["run", "logs", "retry"], events: false,
  ...(c.staleAfterMs === null ? {} : { heartbeat: { intervalMs: 100, staleAfterMs: c.staleAfterMs } }) },
  steps: [{ id: "a", name: "Step A", needs: [] }, { id: "b", name: "Step B", needs: ["a"] }, { id: "c", name: "Step C", needs: ["b"] }] });

// Construct a real chain before wire-only changes. Forged journals can have valid hashes yet fail reader rules.
const canonical = x => Array.isArray(x) ? "[" + x.map(canonical).join(",") + "]" : x && typeof x === "object"
  ? "{" + Object.keys(x).sort().map(k => JSON.stringify(k) + ":" + canonical(x[k])).join(",") + "}" : JSON.stringify(x);
const hash = x => createHash("sha256").update(x).digest("hex");
const changes = (x, set = {}, del = []) => { const out = { ...x, ...set }; for (const k of del) delete out[k]; return out; };
export const journalNow = c => c.headerNow ?? Math.max(c.now, 0, ...c.entries.map(expand).map(e => Number.isSafeInteger(e.createdAt) && e.createdAt >= 0 ? e.createdAt : 0));
export function journalText(c) {
  let config = { heartbeatTtlMs: c.hbTtl, maxEntries: 10000, projectId: "p", redactPaths: [] };
  config = changes(config, c.configSet, [...(c.hbDel ? ["heartbeatTtlMs"] : []), ...(c.configDel || [])]);
  const header = changes({ config, now: journalNow(c), schema: "nisi-run-journal-v1", type: "header" }, c.headerSet, c.headerDel);
  let previousHash = hash("nisi-run-journal/header/v1\n" + canonical(header));
  const lines = [canonical(header)];
  c.entries.forEach((raw, i) => {
    const entry = expand(raw), retained = !(Number.isSafeInteger(entry.createdAt + entry.ttlMs) && journalNow(c) >= entry.createdAt + entry.ttlMs);
    if (!retained && !raw.recordSet) entry.payload = null;
    const record = changes({ entry, fingerprint: hash("nisi-run-journal/input/v1\n" + canonical(entry)), retained }, raw.recordSet, raw.recordDel);
    let env = { type: "entry", seq: i + 1, previousHash, record };
    env.hash = hash("nisi-run-journal/record/v1\n" + canonical({ seq: env.seq, previousHash, record }));
    env = changes(env, raw.envelopeSet, raw.envelopeDel);
    lines.push(raw.wire ?? canonical(env)); previousHash = env.hash;
  });
  if (!c.noFooter) lines.push(canonical(changes({ count: c.entries.length, lastHash: previousHash, type: "footer" }, c.footerSet, c.footerDel)));
  for (const edit of c.lex || []) {
    const at = edit.line === "footer" ? lines.length - 1 : edit.line;
    if (edit.reverse) { const v = JSON.parse(lines[at]); lines[at] = "{" + Object.keys(v).reverse().map(k => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}"; }
    else if (edit.space) lines[at] = lines[at].replace(/:/g, ": ");
    else lines[at] = lines[at].replace(edit.from, edit.to);
  }
  let text = lines.join("\n") + (c.noFinalNewline ? "" : "\n");
  if (c.crlf) text = text.replaceAll("\n", "\r\n");
  return (c.prefix || "") + text;
}

// ---- the judge -------------------------------------------------------------------------------------------------
const HELD = new Set(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED", "REVOKED", "EXPIRED", "UNKNOWN"]);
export const isClean = v => v.status === "COMPLETE" && v.cfg === "OK" && v.time === "OK" && v.entries.every(x => HELD.has(x));

// The 60 s clock-skew allowance ADAPTOR-V0.md documents: Jaryo's clock may be this far behind the journal's.
export const SKEW_ALLOWANCE_MS = 60000;

// The entry the adaptor shows for a stage: the latest non-revocation entry of the run of the last entry.
function selected(es, s) {
  const run = es.length ? es[es.length - 1].runId : null; let at = -1;
  es.forEach((e, i) => { if (e.runId === run && e.stage === s && e.state !== "REVOKED") at = i; });
  return at;
}

// What Nisi said about each stage's selected entry, and the state the adaptor may show. The only rule that is not
// Nisi's: the manifest's own staleAfterMs window, which can only turn RUNNING into UNKNOWN.
export function expectedStates(c, verdict) {
  const es = c.entries.slice(0, verdict.held).map(expand), out = {};
  for (const s of STEPS) {
    const at = selected(es, s);
    if (at < 0) { out[s] = { state: "UNKNOWN", L: "no entry" }; continue; }
    const L = verdict.entries[at], e = es[at];
    if (L === "SUCCEEDED") out[s] = { state: "OK", L };
    else if (L === "FAILED") out[s] = { state: "FAILED", L };
    else if (L === "RUNNING") out[s] = { state: c.staleAfterMs !== null && c.now - e.heartbeatAt <= c.staleAfterMs ? "RUNNING" : "UNKNOWN", L };
    else out[s] = { state: "UNKNOWN", L };
  }
  return out;
}

// The display still copies unauthenticated terminal states and skips unreadable lines. Locate the entry it
// actually selects, retaining its source index: a held RUNNING entry on the same stage must not excuse a later
// rejected RUNNING entry. This mirrors only display selection, independently of the strict RUNNING gate.
function displaySelected(c) {
  const lines = journalText(c).replace(/^\ufeff/, "").split("\n"), rows = [], ids = new Set();
  let first = 0; while (first < lines.length && !lines[first].trim()) first++;
  let header; try { header = JSON.parse(lines[first]); } catch { return {}; }
  const object = x => x !== null && typeof x === "object" && !Array.isArray(x);
  const id = x => typeof x === "string" && x.length > 0 && x.length <= 128;
  if (!object(header) || header.type !== "header" || header.schema !== "nisi-run-journal-v1" || !object(header.config) || !id(header.config.projectId)) return {};
  for (let n = first + 1; n < lines.length; n++) {
    if (!lines[n].trim()) continue;
    let v; try { v = JSON.parse(lines[n]); } catch { continue; }
    if (object(v) && v.type === "footer") break;
    const e = object(v) && v.type === "entry" && object(v.record) && object(v.record.entry) ? v.record.entry : null;
    if (!e || !id(e.id) || !id(e.runId) || !id(e.stage) || e.projectId !== header.config.projectId || ids.has(e.id)) continue;
    ids.add(e.id); rows.push({ entry: e, index: n - first - 1 });
  }
  const runId = rows.length ? rows[rows.length - 1].entry.runId : null, latest = Object.create(null);
  for (const row of rows) if (row.entry.runId === runId && row.entry.state !== "REVOKED") latest[row.entry.stage] = row;
  return latest;
}

// Complete journals require exact state agreement. Rejected journals may still supply copied terminal states,
// but RUNNING must name an entry in the held prefix. Only the documented clock allowance is tolerated.
export function judge(c, verdict, view) {
  const got = Object.fromEntries(view.steps.map(s => [s.id, s.state])), found = [];
  const selectedRows = displaySelected(c);
  const add = (cls, s, expected, nisi) => found.push({ class: cls, stage: s, adaptor: got[s], expected, nisi });
  if (isClean(verdict)) {
    const want = expectedStates(c, verdict);
    for (const s of STEPS) if (got[s] !== want[s].state) add("clean", s, want[s].state, want[s].L);
    return found;
  }
  for (const s of STEPS) {
    if (got[s] !== "RUNNING") continue;
    if (verdict.cfg !== "OK") { add("config", s, "UNKNOWN", "config:" + verdict.cfg); continue; }
    const at = selectedRows[s]?.index;
    if (at === undefined || at >= verdict.held) { add("entry-not-held", s, "UNKNOWN", "selected entry is not held"); continue; }
    if (verdict.time !== "OK") {
      add(journalNow(c) > c.now + SKEW_ALLOWANCE_MS ? "clock-beyond-skew" : "clock-within-skew", s, "UNKNOWN", "clock:" + verdict.time); continue;
    }
    const L = verdict.entries[at];
    if (L !== "RUNNING") add("not-running", s, "UNKNOWN", L);
  }
  return found;
}

// ---- the cases -------------------------------------------------------------------------------------------------
function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mk = (kind, fields, entries) => ({ kind, staleAfterMs: 120000, hbTtl: 3600000, now: T0 + 5000, ...fields, entries });
const run = (fields = {}, extra = {}) => ({ set: { state: "RUNNING", ...fields }, ...extra });

export function generateCases() {
  const cases = [], seen = new Set(), rnd = prng(SEED);
  const add = c => { const k = JSON.stringify(c); if (!seen.has(k)) { seen.add(k); cases.push({ id: `c${String(cases.length + 1).padStart(4, "0")}`, ...c }); } };
  const pick = a => a[Math.floor(rnd() * a.length)];

  // A. RUNNING on every liveness boundary: the entry's ttl, the header's heartbeatTtlMs, the manifest's window.
  for (const ttl of [1, 2, 1000, 60000, 3600000]) for (const hbTtl of [1, 2, 1000, 30000, 3600000]) for (const W of [null, 1000, 120000]) {
    for (const dn of [-2, -1, 0, 1]) {
      const created = T0, now = created + ttl + dn;
      const beats = new Set([null, created, created - 1, created + 1]);
      for (const age of [hbTtl - 1, hbTtl, hbTtl + 1, ...(W === null ? [] : [W - 1, W, W + 1])]) if (age >= 0) beats.add(now - age);
      for (const beat of beats) add(mk("running-boundary", { staleAfterMs: W, hbTtl, now }, [run({ ttlMs: ttl, heartbeatAt: beat })]));
    }
  }
  // B. Every other state, before, at and after its expiry, with and without a heartbeat.
  for (const state of ["QUEUED", "SUCCEEDED", "FAILED", "CANCELLED"]) for (const dn of [-1, 0, 1]) for (const beat of [null, T0]) for (const ttl of [1, 1000])
    add(mk("state-expiry", { now: T0 + ttl + dn }, [{ set: { state, ttlMs: ttl, heartbeatAt: beat } }]));
  // C. Revocations, in the order Nisi writes them and reversed, and a stage re-run after a revocation.
  for (const target of ["RUNNING", "SUCCEEDED", "FAILED"]) {
    const t = { set: { id: "e1", state: target, heartbeatAt: target === "RUNNING" ? T0 : null } };
    const r = { set: { id: "e2", state: "REVOKED", revokes: "e1", createdAt: T0 + 1, heartbeatAt: null } };
    add(mk("revocation", {}, [t, r]));
    add(mk("revocation-reversed", {}, [r, t]));
    add(mk("revocation-stage-filed", {}, [t, { set: { ...r.set, stage: "b" } }]));
    add(mk("revocation-then-rerun", {}, [t, r, { set: { id: "e3", state: "RUNNING", attempt: 1, createdAt: T0 + 2, heartbeatAt: T0 + 2 } }]));
    add(mk("revocation-wrong-run", {}, [t, { set: { ...r.set, runId: "r2" } }]));
    add(mk("revocation-wrong-attempt", {}, [t, { set: { ...r.set, attempt: 1 } }]));
  }
  // D. Several stages, several runs, repeated ids, retries, undeclared stages, other projects.
  add(mk("stages", {}, [{ set: { id: "e1", stage: "a", state: "SUCCEEDED" } }, { set: { id: "e2", stage: "b", state: "RUNNING", heartbeatAt: T0 } }, { set: { id: "e3", stage: "c", state: "QUEUED" } }]));
  add(mk("two-runs", {}, [{ set: { id: "e1", stage: "a", state: "SUCCEEDED" } }, { set: { id: "e2", stage: "a", state: "RUNNING", runId: "r2", heartbeatAt: T0 } }]));
  add(mk("two-runs", {}, [{ set: { id: "e1", stage: "a", state: "RUNNING", heartbeatAt: T0 } }, { set: { id: "e2", stage: "b", state: "SUCCEEDED", runId: "r2" } }]));
  add(mk("repeated-id", {}, [{ set: { id: "e1", state: "SUCCEEDED" } }, { set: { id: "e1", state: "RUNNING", heartbeatAt: T0 } }]));
  add(mk("repeated-id", {}, [{ set: { id: "e1", state: "RUNNING", heartbeatAt: T0 } }, { set: { id: "e1", state: "RUNNING", heartbeatAt: T0 } }]));
  add(mk("retry", {}, [{ set: { id: "e1", state: "FAILED" } }, { set: { id: "e2", state: "QUEUED", attempt: 1, retryOf: "e1", createdAt: T0 + 1 } }]));
  add(mk("retry-running", {}, [{ set: { id: "e1", state: "FAILED" } }, { set: { id: "e2", state: "RUNNING", attempt: 1, retryOf: "e1", createdAt: T0 + 1, heartbeatAt: T0 + 1 } }]));
  add(mk("undeclared-stage", {}, [{ set: { id: "e1", stage: "zz", state: "RUNNING", heartbeatAt: T0 } }]));
  add(mk("other-project", {}, [{ set: { id: "e1", projectId: "other", state: "RUNNING", heartbeatAt: T0 } }]));
  add(mk("no-entries", {}, []));
  // E. Odd types and missing fields, on a live RUNNING entry and on a SUCCEEDED one.
  const odd = [null, "", "0", "123", " ", "a b", "x".repeat(129), -1, 0, 1.5, 2 ** 53, -(2 ** 53), 1e21, true, false, [], {}, [1], { a: 1 }, "RUNNING ", "running"];
  for (const k of Object.keys(BASE)) for (const v of odd) for (const base of [{ state: "RUNNING", heartbeatAt: T0 }, { state: "SUCCEEDED" }])
    add(mk("odd-field", {}, [{ set: { ...base, [k]: v } }]));
  for (const k of Object.keys(BASE)) for (const base of [{ state: "RUNNING", heartbeatAt: T0 }, { state: "SUCCEEDED" }])
    add(mk("missing-field", {}, [{ set: base, del: [k] }]));
  add(mk("extra-key", {}, [{ set: { state: "RUNNING", heartbeatAt: T0, extra: 1 } }]));
  for (const id of ["e 1", "é", "-e1", "e1/x", "e1\n"]) add(mk("odd-id", {}, [{ set: { id, state: "RUNNING", heartbeatAt: T0 } }]));
  for (const stage of ["a ", "A", "é", "a\n"]) add(mk("odd-stage", {}, [{ set: { stage, state: "RUNNING", heartbeatAt: T0 } }]));
  for (const state of ["REVOKED", "DONE", "succeeded", 7, null]) add(mk("odd-state", {}, [{ set: { state, heartbeatAt: T0 } }]));
  add(mk("revoked-without-target", {}, [{ set: { state: "REVOKED", revokes: null } }]));
  add(mk("revokes-on-running", {}, [{ set: { id: "e1", state: "SUCCEEDED" } }, { set: { id: "e2", state: "RUNNING", heartbeatAt: T0, revokes: "e1", createdAt: T0 + 1 } }]));
  // F. The header's heartbeatTtlMs and the manifest's declaration.
  for (const hbTtl of [0, -1, 1.5, "1000", null, true, 2 ** 53, 1, 3600000]) for (const now of [T0, T0 + 1, T0 + 5000]) add(mk("header-ttl", { hbTtl, now }, [run({ heartbeatAt: T0 })]));
  for (const now of [T0, T0 + 5000]) add(mk("header-ttl-missing", { hbDel: true, now }, [run({ heartbeatAt: T0 })]));
  for (const W of [null, 1000, 120000]) add(mk("no-manifest-heartbeat", { staleAfterMs: W }, [run({ heartbeatAt: T0 })]));
  // G. The clock: Jaryo's clock before the writer's, inside and beyond the 60 s skew allowance.
  for (const ahead of [1, 1000, 59999, 60000, 60001, 3600000]) for (const hb of [null, "created"]) add(mk("clock-behind-writer", { now: T0 - ahead }, [run({ heartbeatAt: hb === null ? null : T0 })]));
  for (const ahead of [1, 59999, 60000, 60001]) add(mk("clock-behind-writer", { now: T0 - ahead }, [{ set: { id: "e1", state: "SUCCEEDED" } }, run({ id: "e2", stage: "b", heartbeatAt: T0 + 1, createdAt: T0 + 1 })]));
  // H. Seeded fuzz over the same space: random stages, states, times, revocations, clocks.
  const times = () => pick([T0 - 1, T0, T0 + 1, T0 + 1000, T0 + 59999, T0 + 120000, T0 + 3600000, T0 + 3600001]);
  for (let i = 0; i < 1400; i++) {
    const n = 1 + Math.floor(rnd() * 4), es = [];
    for (let j = 0; j < n; j++) {
      const created = pick([T0, T0 + 1, T0 + 500, T0 + 100000]), st = pick(["RUNNING", "RUNNING", "RUNNING", "SUCCEEDED", "FAILED", "QUEUED", "CANCELLED", "REVOKED"]);
      const e = { id: `e${j + 1}`, stage: pick(STEPS), state: st, createdAt: created, ttlMs: pick([1, 1000, 100000, 3600000]), runId: pick(["r1", "r1", "r1", "r2"]),
        heartbeatAt: pick([null, created, created, created - 1, created - 60000, created - 3600000]), attempt: j };
      if (st === "REVOKED") { e.revokes = es.length ? pick(es).set.id : "e1"; e.heartbeatAt = null; }
      es.push({ set: e });
    }
    add(mk("fuzz", { staleAfterMs: pick([null, 1000, 120000, 3600000]), hbTtl: pick([1, 1000, 30000, 3600000]), now: times() }, es));
  }
  // I. Reader-only states: independently chosen clocks, forged chains and hostile wire forms.
  for (const ahead of [0, 1, 59999, 60000, 60001, 300000]) for (const offset of [0, 1000, 100000])
    add(mk("reader-header-clock", { headerNow: T0 + offset + ahead, now: T0 + offset, staleAfterMs: 3600000 }, [run({ heartbeatAt: T0 })]));
  for (const value of [null, "0", 1.5, -1, 2 ** 53]) add(mk("reader-header-now", { headerSet: { now: value } }, [run({ heartbeatAt: T0 })]));
  add(mk("reader-header-now", { headerDel: ["now"] }, [run({ heartbeatAt: T0 })]));
  for (const value of [0, 10001, "5", null, 1.5, -1, 2 ** 53]) add(mk("reader-header-config", { configSet: { maxEntries: value } }, [run({ heartbeatAt: T0 })]));
  for (const value of [null, {}, "payload.x", ["payload"], ["payload.x", "payload.x"], ["payload.x", "payload.x.y"], ["payload.__proto__"], ["payload.01"], ["payload.x", "payload.y"]])
    add(mk("reader-redact-paths", { configSet: { redactPaths: value } }, [run({ heartbeatAt: T0 })]));
  for (const key of ["maxEntries", "redactPaths", "projectId"]) add(mk("reader-header-config", { configDel: [key] }, [run({ heartbeatAt: T0 })]));
  add(mk("reader-header-extra", { headerSet: { extra: true } }, [run({ heartbeatAt: T0 })]));
  add(mk("reader-header-extra", { configSet: { extra: true } }, [run({ heartbeatAt: T0 })]));
  for (const fields of [{ prefix: "\ufeff" }, { prefix: "\n" }, { crlf: true }, { lex: [{ line: 0, reverse: true }] }, { lex: [{ line: 0, space: true }] }])
    add(mk("reader-header-wire", fields, [run({ heartbeatAt: T0 })]));
  // A fresh RUNNING entry in another run follows each rejected-line family, to catch skip-and-continue readers.
  const rejected = [
    { wire: "{}" }, { wire: "not json" }, { wire: "" },
    { set: { attempt: 1.5, state: "SUCCEEDED" } }, { set: { projectId: "other", state: "SUCCEEDED" } },
    { set: { state: "REVOKED", revokes: "missing" } }, { recordSet: { retained: "true" } },
    { recordDel: ["retained"] }, { recordSet: { extra: 1 } }, { envelopeSet: { extra: 1 } },
    { set: { createdAt: T0 + 5001, heartbeatAt: T0 + 5001 } },
  ];
  for (const bad of rejected) add(mk("reader-after-rejected", { headerNow: T0 + 5000 }, [bad, run({ id: "e2", stage: "b", runId: "r2", heartbeatAt: T0 })]));
  add(mk("reader-after-duplicate", {}, [run({ heartbeatAt: T0 }), run({ heartbeatAt: T0 }), run({ id: "e2", stage: "b", runId: "r2", heartbeatAt: T0 })]));
  add(mk("reader-created-after-header", { headerNow: T0 - 1 }, [run({ heartbeatAt: T0 })]));
  // These lexical edits leave parsed values and hashes intact, but violate Nisi's canonical JSON requirement.
  const numeric = [["ttlMs", 3600000, "3600000.0"], ["ttlMs", 3600000, "36e5"], ["attempt", 0, "0.0"], ["attempt", 0, "-0"],
    ["createdAt", T0, String(T0) + ".0"], ["heartbeatAt", T0, String(T0) + ".0"]];
  for (const [key, value, token] of numeric) for (const followed of [false, true])
    add(mk("reader-numeric-form", { lex: [{ line: 1, from: JSON.stringify(key) + ":" + value, to: JSON.stringify(key) + ":" + token }] },
      [run({ heartbeatAt: T0 }), ...(followed ? [run({ id: "e2", stage: "b", runId: "r2", heartbeatAt: T0 })] : [])]));
  for (const followed of [false, true]) for (const fields of [
    { lex: [{ line: 1, from: '"state":"RUNNING"', to: '"state":"SUCCEEDED","state":"RUNNING"' }] },
    { lex: [{ line: 1, reverse: true }] }, { lex: [{ line: 1, space: true }] },
  ]) add(mk("reader-entry-wire", fields, [run({ heartbeatAt: T0 }), ...(followed ? [run({ id: "e2", stage: "b", runId: "r2", heartbeatAt: T0 })] : [])]));
  for (const raw of [{ recordSet: { retained: "true" } }, { recordDel: ["retained"] }, { recordSet: { retained: false }, set: { payload: { x: 1 } } },
    { recordSet: { extra: 1 } }, { envelopeSet: { extra: 1 } }, { envelopeDel: ["seq"] }]) add(mk("reader-record-shape", {}, [{ ...raw, set: { heartbeatAt: T0, ...raw.set } }]));
  for (const fields of [{ noFooter: true }, { noFooter: true, noFinalNewline: true }, { noFinalNewline: true },
    { footerSet: { count: 0 } }, { footerSet: { extra: 1 } }, { lex: [{ line: "footer", space: true }] }])
    add(mk("reader-footer", fields, [run({ heartbeatAt: T0 })]));
  // The stage already has held RUNNING evidence. A later rejected entry must be judged by its own source
  // position, not excused by any RUNNING entry Nisi holds on that stage, in either the same or another run.
  for (const runId of ["r1", "r2"]) {
    add(mk("reader-rejected-same-stage", { lex: [{ line: 2, from: '"ttlMs":3600000', to: '"ttlMs":36e5' }] },
      [run({ heartbeatAt: T0 }), run({ id: "e2", runId, heartbeatAt: T0 })]));
    add(mk("reader-rejected-same-stage", {}, [run({ heartbeatAt: T0 }), { set: { id: "e2", runId, heartbeatAt: T0 }, recordSet: { retained: "true" } }]));
  }
  // J. Seeded reader fuzz jointly varies the four defect families, with real hashes for parsed values.
  for (let i = 0; i < 2200; i++) {
    const offset = Math.floor(rnd() * 100000), now = T0 + offset;
    const es = [run({ id: "e1", heartbeatAt: T0, ttlMs: 3600000 })];
    const fields = { now, headerNow: now + pick([0, 1, 60000, 60001, 300000]), staleAfterMs: 3600000 };
    switch (i % 8) {
      case 0: fields.configSet = { maxEntries: pick([0, 1, 10001, "5"]) }; break;
      case 1: fields.headerDel = ["now"]; break;
      case 2: fields.lex = [{ line: 1, from: '"ttlMs":3600000', to: pick(['"ttlMs":3600000.0', '"ttlMs":36e5']) }]; break;
      case 3: fields.lex = [{ line: 1, from: '"state":"RUNNING"', to: '"state":"FAILED","state":"RUNNING"' }]; break;
      case 4: es[0].recordSet = { retained: pick([null, "true", false]) }; break;
      case 5: es[0].wire = pick(["{}", "", "not json"]); break;
      case 6: fields.noFooter = true; fields.noFinalNewline = pick([true, false]); break;
      case 7: fields.lex = [{ line: pick([0, 1]), space: true }]; break;
    }
    if (i % 3 === 0) es.push(run({ id: "e2", stage: "b", runId: "r2", heartbeatAt: T0 }));
    add(mk("reader-fuzz", fields, es));
  }
  return cases;
}

export const header = (nisiCommit, count) => ({ type: "header", schema: CORPUS_SCHEMA, generator: GENERATOR, seed: SEED, nisiCommit, count,
  nisiFiles: ["history/run-journal-v1.mjs"], base: BASE, t0: T0,
  note: "case carries entry changes and optional header, record, envelope or lexical changes; verdict comes from reopen(text), then list(now), including held-prefix length and rejection report" });

// ---- generate (needs Nisi) -------------------------------------------------------------------------------------
export function nisiVerdict(nisi, c) {
  const reopened = nisi.reopen(journalText(c)), report = reopened.report;
  let list = null, time = "OK";
  if (reopened.journal) { try { list = reopened.journal.list(c.now); } catch (err) { time = err.code || "ERR"; } }
  else time = null;
  const held = report.recoveredIds.length;
  return { cfg: reopened.journal ? "OK" : report.reason, time, status: report.status, reason: report.reason,
    rejectedLine: report.rejectedLine, held,
    entries: c.entries.map((_, i) => i < held ? list ? list[i].liveness : "x:TIME" : "x:" + report.reason) };
}

async function generate(nisiDir, commit) {
  const nisi = await import(pathToFileURL(path.join(nisiDir, "history/run-journal-v1.mjs")));
  const cases = generateCases(), lines = [], problems = [], tally = { clean: 0, refused: 0 }, byKind = {};
  for (const c of cases) {
    const v = nisiVerdict(nisi, c);
    // These checks never ask the adaptor which result is correct.
    if (JSON.stringify(v) !== JSON.stringify(nisiVerdict(nisi, c))) problems.push(c.id + ": reader verdict is not deterministic");
    if (v.held > c.entries.length || v.status === "COMPLETE" && v.held !== c.entries.length) problems.push(c.id + ": inconsistent held prefix");
    tally[isClean(v) ? "clean" : "refused"]++; byKind[c.kind] = (byKind[c.kind] || 0) + 1;
    lines.push(JSON.stringify({ ...c, verdict: v }));
  }
  return { text: [JSON.stringify(header(commit, cases.length)), ...lines].join("\n") + "\n", problems, tally, byKind, count: cases.length };
}

const isMain = () => { try { return !!process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href; } catch { return false; } };
if (isMain()) {
  const arg = n => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null; };
  const nisiDir = arg("nisi"), commit = arg("commit"), here = path.dirname(fileURLToPath(import.meta.url));
  const out = arg("out") || path.join(here, "../pipeline/fixtures/nisi-differential-corpus.jsonl");
  if (!nisiDir || !/^[0-9a-f]{40}$/.test(commit || "")) { console.error("usage: differential-nisi.mjs --nisi <export dir> --commit <40-hex> [--out <path>] [--check]"); process.exit(2); }
  const r = await generate(path.resolve(nisiDir), commit);
  console.log(`cases ${r.count}; Nisi held everything in ${r.tally.clean}, refused something in ${r.tally.refused}`);
  console.log(JSON.stringify(r.byKind));
  if (r.problems.length) { for (const p of r.problems.slice(0, 20)) console.error("PROBLEM", p); console.error(`${r.problems.length} cross-check problem(s)`); process.exit(1); }
  if (process.argv.includes("--check")) {
    const same = fs.existsSync(out) && fs.readFileSync(out, "utf8") === r.text;
    console.log(same ? "corpus is current" : "corpus differs from a fresh generation"); process.exit(same ? 0 : 1);
  }
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, r.text); console.log(`wrote ${out} (${r.text.length} bytes)`);
}
