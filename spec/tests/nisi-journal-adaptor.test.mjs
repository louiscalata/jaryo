// Tests for adaptor/nisi-journal-adaptor.mjs: a Nisi run journal (nisi-run-journal-v1) read as a jaryo-view/0 document.
// The rule under test: a step's state is copied from a journal entry, never from the footer, the header's clock or
// the journal being well formed. RUNNING is the one named exception, judged against Jaryo's own clock.
// tests/adaptor.test.mjs imports this file, so CI's `node tests/adaptor.test.mjs` runs it. It also runs on its own.
import { createHash } from "node:crypto";
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adaptorPath = path.join(root, "adaptor/nisi-journal-adaptor.mjs");
const samplePath = path.join(root, "pipeline/fixtures/nisi-journal-sample.jsonl");
const { buildView } = await import(pathToFileURL(path.join(root, "adaptor/jaryo-adaptor.mjs")));

const HB = { intervalMs: 10000, staleAfterMs: 120000 };
const M = { id: "p", name: "P", declares: { actions: ["run", "logs", "retry"], events: false, heartbeat: HB }, steps: [
  { id: "a", name: "Step A", needs: [] }, { id: "b", name: "Step B", needs: ["a"] }, { id: "c", name: "Step C", needs: ["b"], consequential: true } ] };
const NOHB = { ...M, declares: { actions: M.declares.actions, events: false } };
const T0 = Date.parse("2026-11-07T20:00:00Z");
const Z = "0".repeat(64);
// Raw lines support malformed-input tests. J below makes canonical journals with real chains for liveness tests.
const hdr = (projectId = "p", now = T0, schema = "nisi-run-journal-v1", heartbeatTtlMs = 3600000) => JSON.stringify({ config: { heartbeatTtlMs, maxEntries: 8, projectId, redactPaths: [] }, now, schema, type: "header" });
const ent = (seq, e) => JSON.stringify({ hash: Z, previousHash: Z, record: { entry: { attempt: 0, candidateId: "c1", createdAt: T0, heartbeatAt: null, id: `e${seq}`,
  payload: null, projectId: "p", receiptId: null, retryOf: null, revokes: null, runId: "r1", stage: "a", state: "SUCCEEDED", ttlMs: 3600000, ...e }, fingerprint: Z, retained: true }, seq, type: "entry" });
const foot = n => JSON.stringify({ count: n, lastHash: Z, type: "footer" });
const C = x => Array.isArray(x) ? "[" + x.map(C).join(",") + "]" : x && typeof x === "object"
  ? "{" + Object.keys(x).sort().map(k => JSON.stringify(k) + ":" + C(x[k])).join(",") + "}" : JSON.stringify(x);
const H = x => createHash("sha256").update(x).digest("hex");
const J = (entries, { header = hdr("p", Math.max(T0, ...entries.map(e => Number.isSafeInteger(e.createdAt) ? e.createdAt : T0))), footer = true, after = [] } = {}) => {
  let h; try { h = JSON.parse(header); } catch { h = {}; }
  let prev = H("nisi-run-journal/header/v1\n" + C(h));
  const lines = [header];
  entries.forEach((raw, i) => {
    const entry = JSON.parse(ent(i + 1, raw)).record.entry;
    const retained = !(h.now >= entry.createdAt + entry.ttlMs); if (!retained) entry.payload = null;
    const record = { entry, fingerprint: H("nisi-run-journal/input/v1\n" + C(entry)), retained };
    const body = { seq: i + 1, previousHash: prev, record }, hash = H("nisi-run-journal/record/v1\n" + C(body));
    lines.push(C({ ...body, hash, type: "entry" })); prev = hash;
  });
  return [...lines, ...(footer ? [C({ count: entries.length, lastHash: prev, type: "footer" })] : []), ...after].join("\n") + "\n";
};
const SAMPLE_M = { id: "sample-smoke", name: "Nisi sample", declares: { actions: ["logs"], heartbeat: HB }, steps: [{ id: "test", name: "Test", needs: [] }] };

export async function suite(mod) {
  const { buildJournalView, readJournalFile, MAX_JOURNAL_BYTES } = mod; const out = [];
  const t = (name, cond) => out.push({ name, pass: !!cond });
  const st = (v, id) => v.steps.find(s => s.id === id).state;
  const why = (v, id) => v.steps.find(s => s.id === id).reason || "";
  const now = T0 + 5000;
  let v;
  // The shared view clock contract applies even when there is no journal to parse.
  for (const bad of [NaN, Infinity, -Infinity, 8640000000000001, -8640000000000001, 1e100, "0", null, true]) {
    let err = null; try { buildJournalView(M, "", bad); } catch (e) { err = e; }
    t(`journal: an invalid now (${String(bad)}) is refused with a deliberate clock error`, err instanceof TypeError && err.message === "now must be a finite number within the JavaScript Date range");
  }
  for (const valid of [-8640000000000000, -8640000000000000 + 1, -0.5, 0, 0.5, 8640000000000000 - 1, 8640000000000000]) {
    let result = null; try { result = buildJournalView(M, "", valid); } catch {}
    t(`journal: a valid now (${valid}) keeps its Date representation`, result?.generatedAt === new Date(valid).toISOString());
  }
  // copied statuses
  v = buildJournalView(M, J([{ stage: "a", state: "SUCCEEDED" }, { stage: "b", state: "FAILED" }]), now);
  t("journal: SUCCEEDED is OK and FAILED is FAILED", st(v, "a") === "OK" && st(v, "b") === "FAILED");
  t("journal: a declared step with no entry is UNKNOWN, not inferred", st(v, "c") === "UNKNOWN" && /no journal entry/.test(why(v, "c")));
  t("journal: counts match the rows", v.review.counts.failed === 1 && v.review.counts.unknown === 1 && v.review.counts.total === 3 && v.review.consequentialSteps.join() === "c");
  // the synthetic Nisi sample (a copy of nisi fixtures/sample-data/journal.jsonl)
  const sample = fs.readFileSync(samplePath, "utf8");
  v = buildJournalView(SAMPLE_M, sample, now);
  t("journal: the Nisi sample's SUCCEEDED entry is OK", st(v, "test") === "OK" && v.run && v.run?.id === "run-smoke" && v.undeclared.length === 0);
  t("journal: a complete journal does not end the run: no run-end exists in the format", v.run?.state === "unknown" && v.run?.endedAt === null);
  // footer and authentication
  v = buildJournalView(M, J([]), now);
  t("journal: a footer alone shows nothing as OK and there is no run", v.steps.every(s => s.state === "UNKNOWN") && v.run === null);
  v = buildJournalView(M, J([{ stage: "a" }]), now);
  t("journal: the footer never makes a step without an entry OK", st(v, "b") === "UNKNOWN" && st(v, "c") === "UNKNOWN");
  t("journal: the view is labelled unauthenticated, chain unchecked", v.source && v.source.format === "nisi-run-journal-v1" && v.source.authenticated === false && v.source.chainChecked === false);
  t("journal: the unauthenticated label is the first warning, so the page shows it", /unauthenticated/.test(v.warnings[0] || ""));
  t("journal: an empty input is still labelled unauthenticated", /unauthenticated/.test(buildJournalView(M, "", now).warnings[0] || ""));
  // RUNNING: needs a declared heartbeat, an entry that has not expired and a fresh heartbeatAt, by Jaryo's clock
  v = buildJournalView(M, J([{ stage: "a", state: "RUNNING", heartbeatAt: T0 }]), T0 + 5000);
  t("journal: RUNNING with a fresh heartbeatAt and a declared heartbeat is RUNNING", st(v, "a") === "RUNNING" && v.run?.state === "running");
  v = buildJournalView(M, J([{ stage: "a", state: "RUNNING", heartbeatAt: T0 }]), T0 + 120001);
  t("journal: a heartbeatAt older than staleAfterMs is UNKNOWN", st(v, "a") === "UNKNOWN" && /120 s/.test(why(v, "a")) && v.run?.state === "unknown");
  // Nisi's rules (history/run-journal-v1.mjs): an entry expires at createdAt + ttlMs (now >= that), and a RUNNING
  // entry is live only while now - heartbeatAt <= the header's config.heartbeatTtlMs. Jaryo must not show RUNNING
  // where Nisi's own reader reports EXPIRED or UNKNOWN.
  const short = { header: hdr("p", T0, "nisi-run-journal-v1", 1000) };
  v = buildJournalView(M, J([{ stage: "a", state: "RUNNING", heartbeatAt: T0 }], short), T0 + 5000);
  t("journal: a heartbeatAt older than the header's heartbeatTtlMs is UNKNOWN, inside staleAfterMs and ttlMs", st(v, "a") === "UNKNOWN" && /older than 1 s/.test(why(v, "a")));
  v = buildJournalView(M, J([{ stage: "a", state: "RUNNING", heartbeatAt: T0 }], short), T0 + 1001);
  t("journal: one millisecond past the header's heartbeatTtlMs is UNKNOWN", st(v, "a") === "UNKNOWN");
  v = buildJournalView(M, J([{ stage: "a", state: "RUNNING", heartbeatAt: T0 }], short), T0 + 1000);
  t("journal: a heartbeatAt exactly heartbeatTtlMs old is still RUNNING, as in Nisi", st(v, "a") === "RUNNING");
  for (const bad of [undefined, 0, -5, 1.5, "1000", null]) {
    const h = JSON.stringify({ config: { heartbeatTtlMs: bad, maxEntries: 8, projectId: "p", redactPaths: [] }, now: 0, schema: "nisi-run-journal-v1", type: "header" });
    v = buildJournalView(M, J([{ stage: "a", state: "RUNNING", heartbeatAt: T0 }, { stage: "b", state: "SUCCEEDED" }], { header: h }), T0 + 500);
    t(`journal: a header heartbeatTtlMs of ${JSON.stringify(bad)} is never RUNNING; copied results stay`, st(v, "a") === "UNKNOWN" && /heartbeatTtlMs/.test(why(v, "a")) && st(v, "b") === "OK");
  }
  v = buildJournalView(M, J([{ stage: "a", state: "RUNNING", heartbeatAt: T0, ttlMs: 10000 }], { header: hdr("p", T0, "nisi-run-journal-v1", 600000) }), T0 + 10000);
  t("journal: an entry is expired at createdAt + ttlMs exactly: UNKNOWN, with a fresh heartbeatAt", st(v, "a") === "UNKNOWN" && /expired/.test(why(v, "a")) && v.run?.state === "unknown");
  v = buildJournalView(M, J([{ stage: "a", state: "RUNNING", heartbeatAt: T0, ttlMs: 10000 }]), T0 + 9999);
  t("journal: one millisecond before createdAt + ttlMs it is RUNNING", st(v, "a") === "RUNNING");
  v = buildJournalView(M, J([{ stage: "a", state: "RUNNING", heartbeatAt: T0, ttlMs: 30000 }]), T0 + 60000);
  t("journal: an entry past createdAt + ttlMs is UNKNOWN, inside staleAfterMs", st(v, "a") === "UNKNOWN" && /expired 30 s/.test(why(v, "a")));
  v = buildJournalView(M, J([{ stage: "a", state: "RUNNING", createdAt: T0, heartbeatAt: T0 - 20000, ttlMs: 30000 }]), T0 + 25000);
  t("journal: ttlMs is not a heartbeat tolerance: a heartbeatAt older than ttlMs is RUNNING before the entry expires", st(v, "a") === "RUNNING");
  v = buildJournalView(M, J([{ stage: "a", state: "RUNNING", createdAt: T0 - 20000, heartbeatAt: T0 - 20000, ttlMs: 30000 }]), T0 + 10000);
  t("journal: expiry counts from createdAt, not from Jaryo reading the journal", st(v, "a") === "UNKNOWN" && /expired/.test(why(v, "a")));
  v = buildJournalView(M, J([{ stage: "a", state: "RUNNING", createdAt: T0, heartbeatAt: T0 + 1000 }]), T0 + 2000);
  t("journal: a heartbeatAt after createdAt is not a valid Nisi entry and is never RUNNING", st(v, "a") === "UNKNOWN");
  for (const bad of [null, "soon", -1, 1.5]) {
    v = buildJournalView(M, J([{ stage: "a", state: "RUNNING", heartbeatAt: T0, createdAt: bad }]), T0 + 1000);
    t(`journal: RUNNING with a createdAt of ${JSON.stringify(bad)} is UNKNOWN: expiry cannot be judged`, st(v, "a") === "UNKNOWN");
  }
  for (const bad of [undefined, 0, -1, 1.5, "3600000", Number.MAX_SAFE_INTEGER]) {
    v = buildJournalView(M, J([{ stage: "a", state: "RUNNING", heartbeatAt: T0, ttlMs: bad }]), T0 + 1000);
    t(`journal: RUNNING with a ttlMs of ${JSON.stringify(bad)} is UNKNOWN`, st(v, "a") === "UNKNOWN");
  }
  v = buildJournalView(NOHB, J([{ stage: "a", state: "RUNNING", heartbeatAt: T0 }]), T0 + 1000);
  t("journal: no declared heartbeat: RUNNING is UNKNOWN and says why", st(v, "a") === "UNKNOWN" && /declares no heartbeat/.test(why(v, "a")) && v.capabilities.heartbeat === null);
  v = buildJournalView({ ...M, declares: { ...M.declares, heartbeat: { intervalMs: 5000, staleAfterMs: 5000 } } }, J([{ stage: "a", state: "RUNNING", heartbeatAt: T0 }]), T0 + 1000);
  t("journal: a malformed heartbeat declaration is warned about and never RUNNING", st(v, "a") === "UNKNOWN" && v.warnings.some(w => /declares.heartbeat/.test(w)));
  v = buildJournalView(M, J([{ stage: "a", state: "RUNNING", heartbeatAt: null }]), T0 + 1000);
  t("journal: RUNNING with no heartbeatAt is UNKNOWN", st(v, "a") === "UNKNOWN" && /heartbeatAt/.test(why(v, "a")));
  for (const bad of ["soon", -1, 1.5, T0 + 0.5]) {
    v = buildJournalView(M, J([{ stage: "a", state: "RUNNING", heartbeatAt: bad }]), T0 + 1000);
    t(`journal: RUNNING with a heartbeatAt of ${JSON.stringify(bad)} is UNKNOWN`, st(v, "a") === "UNKNOWN");
  }
  v = buildJournalView(M, J([{ stage: "a", state: "RUNNING", heartbeatAt: T0 }], { header: hdr("p", T0 + 1000) }), T0 + 200000);
  t("journal: the header's now is not Jaryo's clock: a fresh-by-header heartbeat is UNKNOWN when it is stale now", st(v, "a") === "UNKNOWN");
  v = buildJournalView(M, J([{ stage: "a", state: "RUNNING", heartbeatAt: T0 }], { header: hdr("p", T0 + 10 * 86400000) }), T0 + 1000);
  t("journal: a header now beyond the skew allowance prevents RUNNING", st(v, "a") === "UNKNOWN" && /future/.test(why(v, "a")));
  v = buildJournalView(M, J([{ stage: "a", state: "RUNNING", heartbeatAt: T0 + 3600000, createdAt: T0 + 3600000 }]), T0);
  t("journal: a heartbeatAt in the future is never RUNNING and is warned about", st(v, "a") === "UNKNOWN" && v.warnings.some(w => /future/.test(w)));
  v = buildJournalView(M, J([{ stage: "a", state: "RUNNING", heartbeatAt: T0 + 30000, createdAt: T0 + 30000 }]), T0);
  t("journal: a heartbeatAt up to the 60 s skew ahead still counts as fresh", st(v, "a") === "RUNNING");
  v = buildJournalView(M, J([{ stage: "a", state: "SUCCEEDED", createdAt: T0 + 3600000 }, { stage: "b", state: "RUNNING", heartbeatAt: T0 }]), T0 + 1000);
  t("journal: another entry's future timestamp stops liveness being judged", st(v, "b") === "UNKNOWN" && st(v, "a") === "OK");
  // other states
  for (const s of ["QUEUED", "CANCELLED"]) {
    v = buildJournalView(M, J([{ stage: "a", state: s, heartbeatAt: T0 }]), now);
    t(`journal: ${s} is UNKNOWN with a reason that names it, even with a fresh heartbeatAt`, st(v, "a") === "UNKNOWN" && why(v, "a").includes(`journal says ${s}`) && v.run?.state === "unknown");
  }
  for (const s of ["DONE", "succeeded", 7, null]) {
    v = buildJournalView(M, J([{ stage: "a", state: s }]), now);
    t(`journal: an unrecognised state ${JSON.stringify(s)} is UNKNOWN`, st(v, "a") === "UNKNOWN" && /unrecognised/.test(why(v, "a")));
  }
  v = buildJournalView(M, J([{ stage: "a", state: "SUCCEEDED" }, { stage: "a", state: "REVOKED", revokes: "e1" }]), now);
  t("journal: a revoked entry is UNKNOWN and names the revocation", st(v, "a") === "UNKNOWN" && /revoked by e2/.test(why(v, "a")));
  v = buildJournalView(M, J([{ stage: "a", state: "REVOKED", revokes: "e2" }, { stage: "a", state: "SUCCEEDED" }]), now);
  t("journal: a revocation revokes the entry it names wherever it is in the journal", st(v, "a") === "UNKNOWN" && /revoked by e1/.test(why(v, "a")));
  v = buildJournalView(M, J([{ stage: "a", state: "SUCCEEDED" }, { stage: "b", state: "SUCCEEDED" }, { stage: "b", state: "REVOKED", revokes: "e1" }]), now);
  t("journal: a revocation is not the result of the stage it is filed under", st(v, "a") === "UNKNOWN" && st(v, "b") === "OK");
  v = buildJournalView(M, J([{ stage: "a", state: "FAILED" }, { stage: "a", state: "SUCCEEDED", attempt: 1 }]), now);
  t("journal: the latest entry for a stage wins", st(v, "a") === "OK");
  v = buildJournalView(M, J([{ stage: "a", state: "SUCCEEDED" }, { stage: "a", state: "RUNNING", heartbeatAt: T0, attempt: 1 }]), T0 + 10 * 60000);
  t("journal: a stale retry does not fall back to the earlier result", st(v, "a") === "UNKNOWN");
  // project check
  v = buildJournalView(M, J([{ stage: "a", state: "SUCCEEDED", projectId: "other" }], { header: hdr("other") }), now);
  t("journal: a header projectId that is not the manifest id makes every step UNKNOWN and warns", v.steps.every(s => s.state === "UNKNOWN") && v.warnings.some(w => /projectId/.test(w)) && v.run === null);
  v = buildJournalView(M, J([{ stage: "a", state: "SUCCEEDED", projectId: "other" }, { stage: "b", state: "SUCCEEDED" }]), now);
  t("journal: an entry for another project is ignored and warned about", st(v, "a") === "UNKNOWN" && st(v, "b") === "OK" && v.warnings.some(w => /another project/.test(w)));
  // bounds and shape
  const big = J([{ stage: "a", state: "SUCCEEDED" }]);
  v = buildJournalView(M, big, now, { maxBytes: big.length - 1 });
  t("journal: input over the byte limit is not read: every step UNKNOWN, warned", v.steps.every(s => s.state === "UNKNOWN") && v.warnings.some(w => /limit/.test(w)));
  v = buildJournalView(M, big, now, { maxBytes: big.length });
  t("journal: input at the byte limit is read", st(v, "a") === "OK");
  v = buildJournalView(M, Buffer.from(big), now, { maxBytes: big.length - 1 });
  t("journal: the byte limit applies to a buffer too", st(v, "a") === "UNKNOWN");
  const multi = J([{ stage: "a", state: "SUCCEEDED", payload: { note: "é".repeat(50) } }]);
  v = buildJournalView(M, multi, now, { maxBytes: multi.length });
  t("journal: the limit counts UTF-8 bytes, not characters", st(v, "a") === "UNKNOWN");
  t("journal: the default limit is set and bounded", Number.isSafeInteger(MAX_JOURNAL_BYTES) && MAX_JOURNAL_BYTES >= 65536 && MAX_JOURNAL_BYTES <= 16 * 1024 * 1024);
  v = buildJournalView(M, Buffer.from([0x7b, 0xff, 0xfe, 0x0a]), now);
  t("journal: invalid UTF-8 is refused, not half-read", v.steps.every(s => s.state === "UNKNOWN") && v.warnings.some(w => /UTF-8/.test(w)));
  v = buildJournalView(M, { not: "text" }, now);
  t("journal: a non-text input is refused and does not throw", v.steps.every(s => s.state === "UNKNOWN") && v.warnings.length >= 2);
  for (const h of [hdr("p", 0, "nisi-run-journal-v2"), "{not json", JSON.stringify({ type: "header", schema: "nisi-run-journal-v1" }), ent(1, {})]) {
    v = buildJournalView(M, J([{ stage: "a" }], { header: h }), now);
    t(`journal: an unreadable header ${h.slice(0, 40)} makes every step UNKNOWN`, v.steps.every(s => s.state === "UNKNOWN") && v.warnings.some(w => /header/.test(w)));
  }
  v = buildJournalView(M, "﻿" + J([{ stage: "a" }]), now);
  t("journal: a byte-order mark does not break the header", st(v, "a") === "OK");
  v = buildJournalView(M, J([{ stage: "a" }]).replace(/\n$/, "\n{not json\n[1]\n" + JSON.stringify({ type: "entry", seq: 9, record: { entry: "x" } }) + "\n"), now);
  t("journal: corrupt and shapeless lines are warned about and never change a status", st(v, "a") === "OK" && v.warnings.some(w => /data after the footer/.test(w)));
  v = buildJournalView(M, [hdr(), "{not json", "[1]", ent(1, { stage: "a" }), foot(1)].join("\n"), now);
  t("journal: unreadable entry lines are counted in one warning and skipped", st(v, "a") === "OK" && v.warnings.some(w => /2 lines are not readable journal entries and were ignored/.test(w)));
  v = buildJournalView(M, [hdr(), "{not json", ent(1, { stage: "a" }), foot(2)].join("\n"), now);
  t("journal: one unreadable line is named in the singular", v.warnings.some(w => /1 line is not a readable journal entry and was ignored/.test(w)));
  v = buildJournalView(M, J([{ stage: "a" }], { after: [ent(2, { stage: "b" })] }), now);
  t("journal: an entry after the footer is ignored", st(v, "b") === "UNKNOWN" && v.warnings.some(w => /after the footer/.test(w)));
  v = buildJournalView(M, J([{ stage: "a" }], { footer: false }), now);
  t("journal: no footer is warned about; recorded results stay", st(v, "a") === "OK" && v.warnings.some(w => /no footer/.test(w)));
  v = buildJournalView(M, [hdr(), ent(1, { stage: "a" }), foot(5)].join("\n"), now);
  t("journal: a footer count that does not match is warned about", v.warnings.some(w => /footer count/.test(w)));
  v = buildJournalView(M, J([{ stage: "a" }, { stage: "a", id: "e1" }]), now);
  t("journal: a repeated entry id is ignored and warned about", v.warnings.some(w => /more than once/.test(w)));
  // runs, undeclared, manifest
  v = buildJournalView(M, J([{ stage: "a", state: "FAILED", runId: "r1" }, { stage: "b", state: "SUCCEEDED", runId: "r2" }]), now);
  t("journal: two runs show only the last, and say so", v.run?.id === "r2" && st(v, "a") === "UNKNOWN" && st(v, "b") === "OK" && v.warnings.some(w => /2 runs/.test(w)));
  v = buildJournalView(M, J([{ stage: "a" }, { stage: "ghost" }, { stage: "__proto__" }]), now);
  t("journal: an undeclared stage is listed, UNKNOWN and unnamed", v.undeclared.length === 2 && v.undeclared.every(u => u.state === "UNKNOWN" && u.name === null) && v.review.counts.unknown === 4);
  v = buildJournalView({ id: "p", steps: [{ id: "a" }, { id: "a" }] }, J([{ stage: "a" }]), now);
  t("journal: a duplicate manifest id stays UNKNOWN", v.steps.every(s => s.state === "UNKNOWN" && /more than once/.test(s.reason)));
  // the same document as buildView, so the page and render.test apply unchanged
  const base = buildView(M, "", now); v = buildJournalView(M, J([{ stage: "a" }]), now);
  t("journal: the view has buildView's keys plus source", JSON.stringify(Object.keys(v).filter(k => k !== "source")) === JSON.stringify(Object.keys(base)) && v.schema === "jaryo-view/0");
  t("journal: actions and capabilities come from the manifest as buildView reads it", JSON.stringify(v.actions) === JSON.stringify(base.actions) && JSON.stringify(v.capabilities) === JSON.stringify(base.capabilities));
  t("journal: step rows have buildView's fields, with no last output", v.steps.every((s, i) => JSON.stringify(Object.keys(s)) === JSON.stringify(Object.keys(base.steps[i])) && s.lastRun === null) && v.steps[0].next[0] === "b");
  t("journal: the view says when it was generated and when the journal last moved", v.generatedAt === new Date(now).toISOString() && v.lastEventAt === new Date(T0).toISOString());
  // bounded file read
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jaryo-nj-"));
  const fbig = path.join(tmp, "big.jsonl"); fs.writeFileSync(fbig, big);
  const rd = readJournalFile(fbig, 64);
  t("journal: the file reader stops one byte past the limit", Buffer.isBuffer(rd) && rd.length === 65);
  t("journal: a file over the limit is refused by the view", buildJournalView(M, rd, now, { maxBytes: 64 }).steps.every(s => s.state === "UNKNOWN"));
  t("journal: a file inside the limit is read whole", readJournalFile(samplePath).toString("utf8") === sample);
  return out;
}

export let count = 0, failed = 0;
const real = await import(pathToFileURL(adaptorPath));
for (const r of await suite(real)) { count++; console.log(r.pass ? "PASS" : "FAIL", r.name); if (!r.pass) failed++; }

// The CLI prints the view for a manifest and a journal.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jaryo-nj-cli-"));
  const mf = path.join(tmp, "m.json"); fs.writeFileSync(mf, JSON.stringify(SAMPLE_M));
  const r = spawnSync("node", [adaptorPath, mf, samplePath], { encoding: "utf8" });
  let cv = null; try { cv = JSON.parse(r.stdout); } catch {}
  count++; const ok = r.status === 0 && cv && cv.schema === "jaryo-view/0" && cv.steps[0].state === "OK" && cv.source?.authenticated === false;
  console.log(ok ? "PASS" : "FAIL", "journal CLI: prints the view for the Nisi sample"); if (!ok) failed++;
}

// Mutation checks: each broken adaptor must be caught by at least one test.
const src = fs.readFileSync(adaptorPath, "utf8");
// Mutants are written to a temporary directory with a copy of jaryo-adaptor.mjs, so their relative import resolves.
const mtmp = fs.mkdtempSync(path.join(os.tmpdir(), "jaryo-nj-mut-"));
fs.copyFileSync(path.join(root, "adaptor/jaryo-adaptor.mjs"), path.join(mtmp, "jaryo-adaptor.mjs"));
const MUTANTS = [
  ["show OK because the footer is present", `state = "UNKNOWN"; reason = "no journal entry for this step in the latest run";`, `state = footer ? "OK" : "UNKNOWN"; reason = null;`],
  ["copy every Nisi state", `if (Object.prototype.hasOwnProperty.call(COPIED, e.state)) {`, `if (typeof e.state === "string" && e.state !== "RUNNING") {`],
  ["treat QUEUED as RUNNING", `else if (e.state === "RUNNING") {`, `else if (e.state === "RUNNING" || e.state === "QUEUED") {`],
  ["show RUNNING without a declared heartbeat", `if (hb === null) { state = "UNKNOWN"; reason = "journal says RUNNING, but`, `if (false) { state = "UNKNOWN"; reason = "journal says RUNNING, but`],
  ["never expire an entry", `else if (now >= made + e.ttlMs) {`, `else if (false) {`],
  ["expire an entry one millisecond late", `else if (now >= made + e.ttlMs) {`, `else if (now > made + e.ttlMs) {`],
  ["use ttlMs as a heartbeat tolerance", `else if (now >= made + e.ttlMs) {`, `else if (now - beat > e.ttlMs) {`],
  ["count expiry from the heartbeat", `else if (now >= made + e.ttlMs) {`, `else if (now >= beat + e.ttlMs) {`],
  ["ignore the header's heartbeatTtlMs", `const windowMs = Math.min(hb.staleAfterMs, beatTtl);`, `const windowMs = hb.staleAfterMs;`],
  ["ignore the declared window", `const windowMs = Math.min(hb.staleAfterMs, beatTtl);`, `const windowMs = beatTtl;`],
  ["accept a header without a heartbeatTtlMs", `else if (beatTtl === null) {`, `else if (false) {`],
  ["stale one millisecond late", `if (age <= windowMs) {`, `if (age <= windowMs + 1) {`],
  ["use the header's now", `const age = now - beat;`, `const age = (Number.isSafeInteger(header.now) ? header.now : now) - beat;`],
  ["trust a future timestamp", `if (future) warnings.push(`, `future = false; if (future) warnings.push(`],
  ["ignore revocations", `if (revokedBy.has(e.id)) {`, `if (false) {`],
  ["let a revocation be a stage's result", `if (e.state === "REVOKED") continue;`, ``],
  ["skip the project check", `if (projectId !== base.pipeline.id) {`, `if (false) {`],
  ["accept entries for another project", `if (e.projectId !== projectId) { other++; continue; }`, ``],
  ["no byte limit", `if (bytes > maxBytes) return refuse(`, `if (false) return refuse(`],
  ["count characters, not bytes", `Buffer.byteLength(input, "utf8")`, `input.length`],
  ["read past the footer", `if (footer) { afterFooter++; continue; }`, ``],
  ["merge every run", `if (e.runId !== runId) continue;`, ``],
  ["drop the unauthenticated label", `const warnings = [UNAUTHENTICATED, ...base.warnings];`, `const warnings = [...base.warnings];`],
  ["call the journal authenticated", `authenticated: false, chainChecked: false`, `authenticated: true, chainChecked: false`],
  ["unbounded file read", `const buf = Buffer.alloc(Math.min(size, maxBytes) + 1);`, `const buf = Buffer.alloc(size + 1);`],
  ["first entry for a stage wins", `latest.set(e.stage, e);`, `if (!latest.has(e.stage)) latest.set(e.stage, e);`],
];
for (const [name, from, to] of MUTANTS) {
  count++;
  if (!src.includes(from)) { console.log("FAIL mutant not applicable:", name); failed++; continue; }
  const f = path.join(mtmp, `m-${MUTANTS.findIndex(m => m[0] === name)}.mjs`); fs.writeFileSync(f, src.split(from).join(to));
  let caught = false;
  try { caught = (await suite(await import(pathToFileURL(f)))).some(r => !r.pass); } catch { caught = true; }
  console.log(caught ? "PASS" : "FAIL", `journal mutation caught: ${name}`); if (!caught) failed++;
}

const isMain = () => { try { return !!process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href; } catch { return false; } };
// Reader-boundary regressions and assertion-killed mutants also run through the existing CI entry point.
const reader = await import(pathToFileURL(path.join(root, "tests/nisi-reader-agreement.test.mjs")));
count += reader.count; failed += reader.failed;
if (isMain()) { console.log(`${count - failed}/${count} passed`); process.exit(failed ? 1 : 0); }
