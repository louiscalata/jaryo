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
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";

export const CORPUS_SCHEMA = "jaryo-nisi-differential-corpus-v1";
export const GENERATOR = "spec/adaptor/differential-nisi.mjs";
export const SEED = 20261116;
export const T0 = Date.UTC(2026, 10, 7, 20, 0, 0);
const Z = "0".repeat(64);
const STEPS = ["a", "b", "c"];
// The entry every case starts from, in Nisi's shape. A corpus case stores only what differs from it.
export const BASE = { attempt: 0, candidateId: "c1", createdAt: T0, heartbeatAt: null, id: "e1", payload: null, projectId: "p", receiptId: null,
  retryOf: null, revokes: null, runId: "r1", stage: "a", state: "RUNNING", ttlMs: 3600000 };

export const expand = raw => { const e = { ...BASE, ...(raw.set || {}) }; for (const k of raw.del || []) delete e[k]; return e; };
export const manifestFor = c => ({ id: "p", name: "P", declares: { actions: ["run", "logs", "retry"], events: false,
  ...(c.staleAfterMs === null ? {} : { heartbeat: { intervalMs: 100, staleAfterMs: c.staleAfterMs } }) },
  steps: [{ id: "a", name: "Step A", needs: [] }, { id: "b", name: "Step B", needs: ["a"] }, { id: "c", name: "Step C", needs: ["b"] }] });

// Journal text with placeholder hashes (the adaptor does not check the chain). The generator proves, for every case
// Nisi can hold, that this text and Nisi's own serialization give the adaptor the same view.
export function journalText(c) {
  const config = { heartbeatTtlMs: c.hbTtl, maxEntries: 10000, projectId: "p", redactPaths: [] };
  if (c.hbDel) delete config.heartbeatTtlMs;
  const lines = [JSON.stringify({ config, now: c.now, schema: "nisi-run-journal-v1", type: "header" })];
  c.entries.forEach((raw, i) => lines.push(JSON.stringify({ hash: Z, previousHash: Z, record: { entry: expand(raw), fingerprint: Z, retained: true }, seq: i + 1, type: "entry" })));
  lines.push(JSON.stringify({ count: c.entries.length, lastHash: Z, type: "footer" }));
  return lines.join("\n") + "\n";
}

// ---- the judge -------------------------------------------------------------------------------------------------
const HELD = new Set(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED", "REVOKED", "EXPIRED", "UNKNOWN"]);
export const isClean = v => v.cfg === "OK" && v.time === "OK" && v.entries.every(x => HELD.has(x));

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
  const es = c.entries.map(expand), out = {};
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

// Disagreements for one case ([] = the adaptor agreed with Nisi), each with a class.
//   Hard classes, which the test never allows:
//     clean              Nisi held every entry: a declared stage must show exactly the expected state.
//     config             Nisi refused the header: no stage may be RUNNING.
//     clock-beyond-skew  Jaryo's clock is more than the skew allowance behind the journal: no stage may be RUNNING.
//   Known classes, documented in ADAPTOR-V0.md and pinned by count in the test:
//     clock-within-skew  Jaryo's clock is behind the journal's by at most the allowance: Nisi's reader refuses to
//                        list (TIME); the adaptor tolerates the skew on purpose.
//     entry-not-held     Nisi refused the entry the adaptor shows as RUNNING (shape, retry or revocation rules).
//     not-running        Nisi held the entry and does not call it RUNNING, yet the adaptor does.
export function judge(c, verdict, view) {
  const got = Object.fromEntries(view.steps.map(s => [s.id, s.state])), found = [], es = c.entries.map(expand);
  const add = (cls, s, expected, nisi) => found.push({ class: cls, stage: s, adaptor: got[s], expected, nisi });
  if (isClean(verdict)) {
    const want = expectedStates(c, verdict);
    for (const s of STEPS) if (got[s] !== want[s].state) add("clean", s, want[s].state, want[s].L);
    return found;
  }
  const run = es.length ? es[es.length - 1].runId : null;
  const stamps = es.filter(e => e.runId === run).flatMap(e => [e.createdAt, e.heartbeatAt]).filter(x => Number.isSafeInteger(x) && x >= 0);
  const beyond = stamps.some(x => x > c.now + SKEW_ALLOWANCE_MS);
  for (const s of STEPS) {
    if (got[s] !== "RUNNING") continue;
    if (verdict.cfg !== "OK") { add("config", s, "UNKNOWN", `config:${verdict.cfg}`); continue; }
    if (verdict.time !== "OK") { add(beyond ? "clock-beyond-skew" : "clock-within-skew", s, "UNKNOWN", `clock:${verdict.time}`); continue; }
    const at = selected(es, s), L = at < 0 ? null : verdict.entries[at];
    if (L === null || !HELD.has(L)) add("entry-not-held", s, "UNKNOWN", L === null ? "no entry" : L);
    else if (L !== "RUNNING") add("not-running", s, "UNKNOWN", L);
  }
  return found;
}

// ---- the cases -------------------------------------------------------------------------------------------------
function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mk = (kind, fields, entries) => ({ kind, staleAfterMs: 120000, hbTtl: 3600000, now: T0 + 5000, ...fields, entries });
const run = (fields = {}, extra = {}) => ({ set: { state: "RUNNING", ...fields }, ...extra });

export function generateCases() {
  const cases = [], seen = new Set(), rnd = prng(SEED);
  const add = c => { const k = JSON.stringify([c.staleAfterMs, c.hbTtl, c.hbDel, c.now, c.entries]); if (!seen.has(k)) { seen.add(k); cases.push({ id: `c${String(cases.length + 1).padStart(4, "0")}`, ...c }); } };
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
  return cases;
}

export const header = (nisiCommit, count) => ({ type: "header", schema: CORPUS_SCHEMA, generator: GENERATOR, seed: SEED, nisiCommit, count,
  nisiFiles: ["history/run-journal-v1.mjs"], base: BASE, t0: T0,
  note: "case = {id, kind, staleAfterMs, hbTtl, hbDel, now, entries:[{set,del}]}; verdict = {cfg, time, entries}; entries are Nisi liveness, or x:<code> when Nisi did not hold the entry" });

// ---- generate (needs Nisi) -------------------------------------------------------------------------------------
async function nisiVerdict(nisi, c) {
  const cfg = { projectId: "p", maxEntries: 10000, heartbeatTtlMs: c.hbTtl, redactPaths: [] };
  if (c.hbDel) delete cfg.heartbeatTtlMs;
  let j; try { j = nisi.createRunJournal(cfg); } catch (e) { return { v: { cfg: e.code || "ERR", time: null, entries: c.entries.map(() => "x:CONFIG") }, journal: null }; }
  let mark = 0; const status = [];
  for (const raw of c.entries) {
    const e = expand(raw), at = Number.isSafeInteger(e.createdAt) && e.createdAt > mark ? e.createdAt : mark;
    try { const r = j.append(e, at); status.push(r.status === "APPENDED" ? "ok" : `x:${r.status}${r.reason ? "/" + r.reason : ""}`); if (r.status === "APPENDED") mark = at; }
    catch (err) { status.push(`x:${err.code || "ERR"}`); }
  }
  let list = null, time = "OK";
  try { list = j.list(c.now); } catch (err) { time = err.code || "ERR"; }
  const held = list ? list.map(r => r.liveness) : null; let k = 0;
  const entries = status.map(s => (s !== "ok" ? s : held ? held[k++] : "x:TIME"));
  return { v: { cfg: "OK", time, entries }, journal: j };
}

async function generate(nisiDir, commit) {
  const nisi = await import(pathToFileURL(path.join(nisiDir, "history/run-journal-v1.mjs")));
  const { buildJournalView } = await import(pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "nisi-journal-adaptor.mjs")));
  const cases = generateCases(), lines = [], problems = [], tally = { clean: 0, refused: 0 }, byKind = {};
  for (const c of cases) {
    const { v, journal } = await nisiVerdict(nisi, c);
    // Cross-checks that make the recorded verdict trustworthy and the placeholder-hash text a faithful stand-in.
    if (journal && v.time === "OK") {
      const text = journal.serialize(c.now), re = nisi.reopen(text);
      if (isClean(v)) {
        if (re.report.status !== "COMPLETE") problems.push(`${c.id}: Nisi's own serialization reopens as ${re.report.status}`);
        else if (JSON.stringify(re.journal.list(c.now).map(r => r.liveness)) !== JSON.stringify(v.entries)) problems.push(`${c.id}: reopened journal gives other liveness`);
        const m = manifestFor(c), a = JSON.stringify(buildJournalView(m, text, c.now)), b = JSON.stringify(buildJournalView(m, journalText(c), c.now));
        if (a !== b) problems.push(`${c.id}: adaptor view differs between Nisi's serialization and the placeholder text`);
      }
    }
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
