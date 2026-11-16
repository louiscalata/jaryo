// Replay of the Nisi differential corpus against adaptor/nisi-journal-adaptor.mjs (ADAPTOR-V0 finding 6).
// pipeline/fixtures/nisi-differential-corpus.jsonl holds generated journal states and what Nisi's own reader
// (history/run-journal-v1.mjs, the commit named in the corpus header) said about each. This test needs neither Nisi
// nor a network: it feeds every state to the adaptor and judges the view with adaptor/differential-nisi.mjs.
// tests/adaptor.test.mjs imports this file, so CI's `node tests/adaptor.test.mjs` runs it. It also runs on its own.
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adaptorPath = path.join(root, "adaptor/nisi-journal-adaptor.mjs");
const corpusPath = path.join(root, "pipeline/fixtures/nisi-differential-corpus.jsonl");
const D = await import(pathToFileURL(path.join(root, "adaptor/differential-nisi.mjs")));

// Disagreements that are documented rather than fixed (ADAPTOR-V0.md, "Differential check against Nisi"), pinned by
// class and count so a new one fails this test.
//   clock-within-skew: Jaryo's clock is up to 60 s behind the journal's. Nisi's reader refuses to list (TIME); the
//     adaptor tolerates the skew on purpose.
export const KNOWN = { "clock-within-skew": 185 };

const rows = fs.readFileSync(corpusPath, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
export const corpusHeader = rows[0], cases = rows.slice(1);

export function replay(mod) {
  const hard = [], known = {}, shown = { RUNNING: 0, nisiRunningButUnknown: 0, ok: 0, failed: 0 }; let clean = 0;
  for (const c of cases) {
    const view = mod.buildJournalView(D.manifestFor(c), D.journalText(c), c.now);
    if (D.isClean(c.verdict)) {
      clean++;
      const want = D.expectedStates(c, c.verdict);
      for (const s of view.steps) {
        if (s.state === "RUNNING") shown.RUNNING++; else if (s.state === "OK") shown.ok++; else if (s.state === "FAILED") shown.failed++;
        if (want[s.id].L === "RUNNING" && s.state === "UNKNOWN") shown.nisiRunningButUnknown++;
      }
    }
    for (const d of D.judge(c, c.verdict, view)) {
      if (d.class === "clock-within-skew") known[d.class] = (known[d.class] || 0) + 1;
      else hard.push({ case: c.id, kind: c.kind, ...d });
    }
  }
  return { hard, known, clean, shown };
}

export async function suite(mod, verbose = false) {
  const out = [], t = (name, cond) => out.push({ name, pass: !!cond });
  const r = replay(mod);
  t(`nisi differential: no disagreement with Nisi's reader in ${r.clean} cases Nisi held in full or in any case where Nisi refused the header or Jaryo's clock is beyond the skew allowance`, r.hard.length === 0);
  if (verbose && r.hard.length) for (const d of r.hard.slice(0, 5)) console.log("  disagreement", JSON.stringify(d));
  t("nisi differential: the documented disagreements are exactly the pinned ones", JSON.stringify(Object.fromEntries(Object.entries(r.known).sort())) === JSON.stringify(Object.fromEntries(Object.entries(KNOWN).sort())));
  return out;
}

export let count = 0, failed = 0;
const real = await import(pathToFileURL(adaptorPath));
const hdr = corpusHeader;

// The corpus is what its header says it is, and it is the corpus the recorded generator would write.
{
  const regenerated = D.generateCases(), same = regenerated.length === cases.length && regenerated.every((c, i) => JSON.stringify(c) === JSON.stringify((({ verdict, ...rest }) => rest)(cases[i])));
  const checks = [
    ["corpus header names the schema, this generator and a 40-hex Nisi commit", hdr.type === "header" && hdr.schema === D.CORPUS_SCHEMA && hdr.generator === D.GENERATOR && /^[0-9a-f]{40}$/.test(hdr.nisiCommit) && fs.existsSync(path.join(root, "..", hdr.generator))],
    ["corpus header count matches its case lines", hdr.count === cases.length && cases.length >= 4000],
    ["corpus base entry and clock are the generator's", JSON.stringify(hdr.base) === JSON.stringify(D.BASE) && hdr.t0 === D.T0 && hdr.seed === D.SEED],
    ["every corpus case is what the generator produces from its seed, in order", same],
    ["every case has a verdict with one entry result per journal entry", cases.every(c => c.verdict && c.verdict.entries.length === c.entries.length)],
  ];
  for (const [name, ok] of checks) { count++; console.log(ok ? "PASS" : "FAIL", `nisi differential: ${name}`); if (!ok) failed++; }
}

// The corpus has to reach the boundaries it claims to, or a pass proves little.
{
  const r = replay(real), clean = cases.filter(c => D.isClean(c.verdict)), runningLive = clean.filter(c => D.expectedStates(c, c.verdict).a.state === "RUNNING");
  const kinds = new Set(cases.map(c => c.kind));
  const checks = [
    ["at least 2000 cases are ones Nisi held in full", clean.length >= 2000],
    ["the adaptor showed RUNNING in at least 150 of them and agreed with Nisi every time", r.shown.RUNNING >= 150 && runningLive.length >= 150],
    ["Nisi called a step RUNNING and the adaptor, by the manifest's own window, showed UNKNOWN in at least 100", r.shown.nisiRunningButUnknown >= 100],
    ["Nisi said EXPIRED, UNKNOWN, REVOKED, QUEUED and CANCELLED somewhere", ["EXPIRED", "UNKNOWN", "REVOKED", "QUEUED", "CANCELLED"].every(L => cases.some(c => c.verdict.entries.includes(L)))],
    ["Nisi refused entries, headers and clocks somewhere", cases.some(c => c.verdict.entries.some(x => x === "x:RECORD")) && cases.some(c => c.verdict.cfg !== "OK") && cases.some(c => c.verdict.time !== "OK")],
    ["reader-only states use a separate header clock, including both skew boundaries", [60000, 60001].every(d => cases.some(c => c.kind === "reader-header-clock" && c.headerNow - c.now === d))],
    ["reader rejects a line and holds no later entry in each prefix regression", cases.filter(c => ["reader-after-rejected", "reader-after-duplicate"].includes(c.kind)).every(c => c.verdict.held < c.entries.length - 1)],
    ["numeric, duplicate-key and canonical-text regressions are refused by the reader", cases.filter(c => ["reader-numeric-form", "reader-entry-wire"].includes(c.kind)).every(c => c.verdict.status === "INVALID" && c.verdict.held === 0)],
    ["the reader's missing-newline rule drops the last unterminated entry", cases.some(c => c.kind === "reader-footer" && c.noFooter && c.noFinalNewline && c.verdict.held === 0 && c.verdict.reason === "TRUNCATED")],
    ["a rejected replacement cannot borrow a held RUNNING entry on the same stage", cases.filter(c => c.kind === "reader-rejected-same-stage").every(c => c.verdict.held === 1 && c.verdict.entries[0] === "RUNNING" && D.judge(c, c.verdict, { steps: [{ id: "a", state: "RUNNING" }, { id: "b", state: "UNKNOWN" }, { id: "c", state: "UNKNOWN" }] }).some(d => d.class === "entry-not-held" && d.stage === "a"))],
    ["forged journals include rejected records whose hash chain matches parsed values", cases.some(c => c.kind === "reader-numeric-form" && D.journalText(c).includes('"ttlMs":36e5')) && cases.some(c => c.kind === "reader-entry-wire" && D.journalText(c).includes('"state":"SUCCEEDED","state":"RUNNING"'))],
    ["every kind of state is in the corpus", ["running-boundary", "state-expiry", "revocation", "odd-field", "missing-field", "header-ttl", "clock-behind-writer", "fuzz", "reader-header-clock", "reader-header-now", "reader-header-config", "reader-redact-paths", "reader-header-extra", "reader-header-wire", "reader-after-rejected", "reader-after-duplicate", "reader-created-after-header", "reader-numeric-form", "reader-entry-wire", "reader-record-shape", "reader-footer", "reader-rejected-same-stage", "reader-fuzz"].every(k => kinds.has(k))],
  ];
  for (const [name, ok] of checks) { count++; console.log(ok ? "PASS" : "FAIL", `nisi differential: ${name}`); if (!ok) failed++; }
}

// A negative zero is not a JSON value the corpus can carry (JSON.stringify writes it as 0), so it is checked here.
// Nisi's reader refuses it: append throws ENTRY for heartbeatAt -0 and accepts heartbeatAt 0 (Nisi 3bfc602).
{
  const c = { staleAfterMs: 120000, hbTtl: 3600000, now: 1000, entries: [{ set: { createdAt: 0, heartbeatAt: 0 } }] };
  const view = text => real.buildJournalView(D.manifestFor(c), text, c.now).steps.find(s => s.id === "a");
  const plain = D.journalText(c), negative = plain.replace('"heartbeatAt":0', '"heartbeatAt":-0');
  const checks = [
    ["heartbeatAt 0 is RUNNING", negative !== plain && view(plain).state === "RUNNING"],
    ["heartbeatAt -0 is UNKNOWN: Nisi refuses the entry", view(negative).state === "UNKNOWN" && /not a valid Nisi journal entry/.test(view(negative).reason)],
  ];
  for (const [name, ok] of checks) { count++; console.log(ok ? "PASS" : "FAIL", `nisi differential: ${name}`); if (!ok) failed++; }
}

for (const r of await suite(real, true)) { count++; console.log(r.pass ? "PASS" : "FAIL", r.name); if (!r.pass) failed++; }

// Mutation checks: each broken adaptor must be caught by the replay.
{
  const src = fs.readFileSync(adaptorPath, "utf8");
  const mtmp = fs.mkdtempSync(path.join(os.tmpdir(), "jaryo-nd-mut-"));
  fs.copyFileSync(path.join(root, "adaptor/jaryo-adaptor.mjs"), path.join(mtmp, "jaryo-adaptor.mjs"));
  const MUTANTS = [
    ["expire an entry one millisecond late", `else if (now >= made + e.ttlMs) {`, `else if (now > made + e.ttlMs) {`],
    ["never expire an entry", `else if (now >= made + e.ttlMs) {`, `else if (false) {`],
    ["ignore the header's heartbeatTtlMs", `const windowMs = Math.min(hb.staleAfterMs, beatTtl);`, `const windowMs = hb.staleAfterMs;`],
    ["ignore the manifest's window", `const windowMs = Math.min(hb.staleAfterMs, beatTtl);`, `const windowMs = beatTtl;`],
    ["go stale one millisecond late", `if (age <= windowMs) {`, `if (age <= windowMs + 1) {`],
    ["go stale one millisecond early", `if (age <= windowMs) {`, `if (age < windowMs) {`],
    ["trust a future header clock", `let future = nisiTime(header.now) && header.now > now + SKEW_MS;`, `let future = false;`],
    ["show RUNNING without a declared heartbeat", `if (hb === null) { state = "UNKNOWN";`, `if (false) { state = "UNKNOWN";`],
    ["ignore revocations", `else if (revokedBy.has(e.id)) {`, `else if (false) {`],
    ["trust a future timestamp", `else if (future) { state = "UNKNOWN"; reason = "journal says RUNNING, but a journal timestamp is in the future"; }`, ``],
    ["let a QUEUED entry be RUNNING", `else if (e.state === "RUNNING") {`, `else if (e.state === "RUNNING" || e.state === "QUEUED") {`],
    ["show RUNNING for an entry that is not a valid Nisi entry", `else if (!nisiEntry(e) || !held.has(e.id)) {`, `else if (false) {`],
  ];
  for (const [name, from, to] of MUTANTS) {
    count++;
    if (!src.includes(from)) { console.log("FAIL mutant not applicable:", name); failed++; continue; }
    const f = path.join(mtmp, `m-${MUTANTS.findIndex(m => m[0] === name)}.mjs`); fs.writeFileSync(f, src.split(from).join(to));
    let caught = false;
    try { caught = (await suite(await import(pathToFileURL(f)))).some(r => !r.pass); } catch { caught = true; }
    console.log(caught ? "PASS" : "FAIL", `nisi differential: mutation caught: ${name}`); if (!caught) failed++;
  }
}

const isMain = () => { try { return !!process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href; } catch { return false; } };
if (isMain()) { console.log(`${count - failed}/${count} passed`); process.exit(failed ? 1 : 0); }
