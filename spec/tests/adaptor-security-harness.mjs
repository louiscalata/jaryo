// Bounded, deterministic witnesses for corruption, run isolation and redaction.
// Scratch modules stay under TMPDIR. Import/syntax failures are never mutation kills.
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import assert from "node:assert/strict";
import { createHash } from "node:crypto"; import { fileURLToPath, pathToFileURL } from "node:url";
import { suite, NOW, HB, manifest, start, result, stamp, lines } from "./adaptor-security.test.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const mode = process.argv[2], adaptorPath = path.join(root, "adaptor/jaryo-adaptor.mjs");
const real = await import(pathToFileURL(adaptorPath).href), report = { mode };
const output = arg("--output"), save = () => { if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n"); };

if (mode === "mutations") {
  assert.ok(suite(real).every(r => r.pass), "unmodified adaptor must pass before mutation");
  const source = fs.readFileSync(adaptorPath, "utf8"), mutants = [];
  const add = (name, from, to) => mutants.push({ name, from, to });
  add("lose every corrupt boundary", "invalidAt.push(events.length);", "");
  add("lose malformed JSON boundary", "catch { invalidAt.push(events.length);", "catch {");
  add("lose non-object boundary", "else { invalidAt.push(events.length);", "else {");
  add("return no corrupt boundaries", "return { events, warnings, invalidAt };", "return { events, warnings, invalidAt: [] };");
  add("move corrupt boundary forward", "invalidAt.push(events.length);", "invalidAt.push(events.length + 1);");
  add("move corrupt boundary backward", "invalidAt.push(events.length);", "invalidAt.push(events.length - 1);");
  add("disable corrupt authority barrier", "const invalidAt = rec.invalidAt.reduce((last, i) => i > at ? Math.max(last, i) : last, -1);", "const invalidAt = -1;");
  add("keep earliest instead of latest barrier", "i > at ? Math.max(last, i) : last", "i > at ? (last < 0 ? i : Math.min(last, i)) : last");
  add("apply old corruption to missing step in new run", "i > at ? Math.max(last, i) : last", "Math.max(last, i)");
  add("invalidate immediate recovery", "Math.max(fi, si) < invalidAt", "Math.max(fi, si) <= invalidAt");
  add("trust superseded corrupt evidence", "Math.max(fi, si) < invalidAt", "false");
  add("require both a result and start to recover", "Math.max(fi, si) < invalidAt", "Math.min(fi, si) < invalidAt");
  add("preserve output from invalid evidence", 'reason = "an invalid record line may hide a later step event";', 'reason = "an invalid record line may hide a later step event"; record = final;');
  add("compress event coordinates after filtering", "a.push([positions.get(e), e]);", "a.push([current.indexOf(e), e]);");
  add("apply all foreign events", "const current = events.filter(belongsToRun);", "const current = events;");
  add("reject every current event", "const current = events.filter(belongsToRun);", "const current = [];");
  add("coerce run ID types", "e.run === started.run", "String(e.run) === String(started.run)");
  add("reject legacy event IDs", "e.run === undefined || ", "");
  add("reject legacy start IDs", "started.run === undefined || ", "");
  add("bind results to the wrong run", "e.run === started.run", "e.run === 1");
  add("let foreign timestamps refresh run", "const stamps = current.map(stampOf)", "const stamps = events.map(stampOf)");
  add("let foreign results enter step index", "current.forEach(e =>", "events.forEach(e =>");
  add("let foreign end close run", 'const ended = current.find(e => e.event === "run-end")', 'const ended = events.find(e => e.event === "run-end")');
  add("filter only run-end events", "const current = events.filter(belongsToRun);", 'const current = events.filter(e => e.event !== "run-end" || belongsToRun(e));');
  add("borrow another step's heartbeat", "if (live && fresh(beat))", "if (live)");
  add("borrow previous attempt's heartbeat", 'i >= si && (e.event === "step-start" || e.event === "heartbeat")', '(e.event === "step-start" || e.event === "heartbeat")');
  add("invent undeclared heartbeat", "hb !== null && ts !== null && now - ts <= hb.staleAfterMs", "ts !== null && now - ts <= (hb ? hb.staleAfterMs : 120000)");
  add("trust future timestamps", "lastTs !== null && lastTs > now + SKEW_MS", "false");
  add("reject exact stale boundary", "now - ts <= hb.staleAfterMs", "now - ts < hb.staleAfterMs");
  add("reject exact future boundary", "lastTs > now + SKEW_MS", "lastTs >= now + SKEW_MS");
  add("turn empty output into blank output", "if (!tail.length) return [];", "");
  add("emit raw credentials", "redactTail(record.tail)", "record.tail");
  add("select lines before redaction", "redactTail(record.tail)", "redactTail(record.tail.slice(-TAIL_LINES))");
  const replacements = source.split("\n").filter(line => line.trimStart().startsWith(".replace(") && line.includes("REDACTED"));
  assert.equal(replacements.length, 5);
  for (const [i, line] of replacements.entries()) add(`omit redaction family ${i + 1}`, line, "");
  const key = replacements[0], auth = replacements[1], assignments = replacements[3], providers = replacements[4];
  add("private keys only match one line", key, key.replace("[\\s\\S]*?", ".*?"));
  add("require private key end marker", key, key.replace("|$)", ")"));
  add("ignore typed private keys", key, key.replaceAll("[A-Z0-9 ]*", ""));
  add("redact Basic only", auth, auth.replace("Bearer|Basic", "Basic"));
  add("redact Bearer only", auth, auth.replace("Bearer|Basic", "Bearer"));
  add("case-sensitive credential names", assignments, assignments.replace("/gi,", "/g,"));
  add("treat filenames as credential names", assignments, assignments.replaceAll("[\\w-]*", "[\\w.-]*"));
  add("omit API-key assignments", assignments, assignments.replace("|api[_-]?key", ""));
  add("omit provider sk credentials", providers, providers.replace("sk-[A-Za-z0-9_-]{16,}|", ""));
  add("omit provider github credentials", providers, providers.replace("github_pat_[A-Za-z0-9_]{16,}|", ""));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "adaptor-security-mutants-")), hashes = new Set(), results = [];
  for (const [i, m] of mutants.entries()) {
    assert.ok(source.includes(m.from), `mutation anchor: ${m.name}`);
    const changed = source.split(m.from).join(m.to), hash = createHash("sha256").update(changed).digest("hex");
    assert.ok(!hashes.has(hash), `distinct mutation: ${m.name}`); hashes.add(hash);
    const file = path.join(scratch, `${i + 1}.mjs`); fs.writeFileSync(file, changed);
    let failures = [], invalid = null;
    try {
      const checks = suite(await import(pathToFileURL(file).href));
      failures = checks.filter(r => !r.pass); if (failures.some(r => !r.assertion)) invalid = "non-assertion failure";
    } catch (error) { invalid = error.message; }
    const killed = !invalid && failures.length > 0;
    results.push({ name: m.name, sha256: hash, killed, invalid, assertions: failures.map(r => r.name) });
    console.log(killed ? "KILLED" : "SURVIVED_OR_INVALID", m.name);
  }
  report.mutants = results; report.summary = { total: results.length, killed: results.filter(r => r.killed).length, invalid: results.filter(r => r.invalid).length };
  save(); console.log(JSON.stringify(report.summary));
  assert.ok(results.length >= 40 && results.every(r => r.killed), "every distinct behavioral mutant must fail a named assertion");
} else if (mode === "differential") {
  const baselinePath = arg("--baseline"); assert.ok(baselinePath, "a saved baseline module is required");
  const baseline = await import(pathToFileURL(path.resolve(baselinePath)).href);
  let seed = 0x56a75961, generated = 0, comparisons = 0, redactions = 0;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  const choose = xs => xs[random() % xs.length];
  // An independent stream model discards each step's evidence at a corrupt token.
  // It does not call readRecord, use adaptor indices, or infer states from output.
  function oracle(tokens) {
    let selected = -1; tokens.forEach((e, i) => { if (e && e.event === "run-start") selected = i; });
    const opened = selected >= 0 ? tokens[selected] : null;
    const current = tokens.slice(Math.max(0, selected)).filter(e => e === null || !opened || opened.run === undefined || e.run === undefined || e.run === opened.run);
    const byStep = new Map(), ghosts = new Set(); let ended = false, last = null;
    for (const e of current) {
      if (e === null) { byStep.clear(); continue; }
      const time = typeof e.ts === "string" ? Date.parse(e.ts) : NaN;
      if (Number.isFinite(time)) last = last === null ? time : Math.max(last, time);
      if (e.event === "run-end") ended = true;
      if (typeof e.step !== "string") continue;
      if (!manifest.steps.some(s => s.id === e.step)) ghosts.add(e.step);
      let state = byStep.get(e.step) || { open: false, record: null, beat: null };
      if (e.status !== undefined && e.status !== null && e.status !== "") state = { open: false, record: e, beat: null };
      if (e.event === "step-start") state = { open: true, record: null, beat: Number.isFinite(time) ? time : null };
      else if (e.event === "heartbeat" && state.open && Number.isFinite(time)) state.beat = state.beat === null ? time : Math.max(state.beat, time);
      byStep.set(e.step, state);
    }
    if (last !== null && last > NOW + 60000) last = null;
    const runLive = !!opened && !ended && last !== null && NOW - last <= HB.staleAfterMs;
    const states = manifest.steps.map(s => {
      const e = byStep.get(s.id);
      if (!e) return "UNKNOWN";
      if (e.open) return runLive && e.beat !== null && NOW - e.beat <= HB.staleAfterMs ? "RUNNING" : "UNKNOWN";
      if (!e.record) return "UNKNOWN";
      const { status, exit } = e.record;
      if (status === "ok" && typeof exit === "number" && exit !== 0 || status === "failed" && exit === 0) return "UNKNOWN";
      return { ok: "OK", failed: "FAILED", blocked: "BLOCKED", review: "REVIEW" }[status] || "UNKNOWN";
    });
    return { states, ghosts: [...ghosts].sort(), runState: opened ? ended ? "ended" : runLive ? "running" : "unknown" : null, last };
  }
  for (let i = 0; i < 8192; i++) {
    const tokens = [{ ...start, ts: stamp(choose([-250000, -1000, 60000, 60001])) }];
    for (let j = 0, length = 4 + random() % 18; j < length; j++) {
      if (random() % 9 === 0) { tokens.push(null); continue; }
      const event = choose(["step-start", "heartbeat", "result", "result", "run-end"]), e = { event, run: choose([2, 2, 2, 1, "2", undefined]), ts: choose([stamp(-250000), stamp(-120000), stamp(-1000), stamp(60000), stamp(60001), "bad", undefined]) };
      if (event !== "run-end") e.step = choose(["a", "b", "ghost"]);
      if (event === "result") { delete e.event; e.status = choose(["ok", "failed", "blocked", "review", "other", null, ""]); e.exit = choose([0, 1, null]); e.tail = [`ordinary ${i}:${j}`]; }
      tokens.push(e);
    }
    const text = tokens.map(e => e === null ? choose(["{broken", "[]", "null"]) : JSON.stringify(e)).join("\n");
    const actual = real.buildView(manifest, text, NOW), expected = oracle(tokens);
    assert.deepEqual(actual.steps.map(s => s.state), expected.states, `states of generated input ${i}`);
    assert.deepEqual(actual.undeclared.map(s => s.logId).sort(), expected.ghosts, `undeclared IDs of input ${i}`);
    assert.equal(actual.run?.state ?? null, expected.runState, `run state of input ${i}`);
    assert.equal(actual.lastEventAt, expected.last === null ? null : new Date(expected.last).toISOString()); generated++;
    // Compatible records retain the whole pre-change view, including empty tails.
    const status = choose(["ok", "failed", "blocked", "review", "other"]), exit = choose([0, 1, null]);
    const clean = lines(start, { ...result, status, exit, reason: choose([undefined, "explicit cause", " "]), tail: choose([[], [""], ["pipeline/check-tokens.mjs: OK"], [`ordinary ${i}`]]) }, { ...start, event: "run-end" });
    assert.deepEqual(real.buildView(manifest, clean, NOW), baseline.buildView(manifest, clean, NOW)); comparisons++;
    const secret = `fixture-${i}-${random()}`, tail = real.buildView(manifest, lines(start, { ...result, tail: [`PASSWORD="${secret}"`, "ordinary output"] }), NOW).steps[0].lastRun.tail;
    assert.deepEqual(tail, ["PASSWORD=[REDACTED]", "ordinary output"]); redactions++;
  }
  report.summary = { generated, baselineComparisons: comparisons, credentialComparisons: redactions, mismatches: 0 };
  save(); console.log(JSON.stringify(report.summary));
} else throw new Error("usage: adaptor-security-harness.mjs mutations|differential [--baseline <module>] [--output <json>]");
