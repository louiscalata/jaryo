// Reader-boundary regressions. Journals have genuine SHA-256 chains, including malformed records: a
// content rejection must be exercised independently of chain rejection. No Nisi installation is needed.
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { createHash } from "node:crypto"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adaptorPath = path.join(root, "adaptor/nisi-journal-adaptor.mjs");
const T = 1800000000000;
const M = { id: "p", name: "P", declares: { actions: ["logs"], heartbeat: { intervalMs: 100, staleAfterMs: 3600000 } },
  steps: ["a", "b", "c"].map(id => ({ id, name: id.toUpperCase(), needs: [] })) };
const C = x => Array.isArray(x) ? `[${x.map(C).join(",")}]` : x && typeof x === "object" ?
  `{${Object.keys(x).sort().map(k => `${JSON.stringify(k)}:${C(x[k])}`).join(",")}}` : JSON.stringify(x);
const H = x => createHash("sha256").update(x).digest("hex");
const E = (set = {}) => ({ id: "e1", projectId: "p", runId: "r1", attempt: 0, candidateId: "c1", stage: "a", receiptId: null,
  createdAt: T, ttlMs: 3600000, state: "RUNNING", heartbeatAt: T, retryOf: null, revokes: null, payload: null, ...set });
const header = (set = {}, config = {}) => ({ type: "header", schema: "nisi-run-journal-v1", now: T,
  config: { projectId: "p", maxEntries: 100, heartbeatTtlMs: 3600000, redactPaths: [], ...config }, ...set });

function journal(entries = [E()], options = {}) {
  const h = options.header || header();
  let prev = H(`nisi-run-journal/header/v1\n${C(h)}`);
  const lines = [options.headerText === undefined ? C(h) : options.headerText];
  entries.forEach((e, i) => {
    const record = { entry: e, fingerprint: H(`nisi-run-journal/input/v1\n${C(e)}`), retained: true, ...options.records?.[i] };
    const env = { seq: i + 1, previousHash: prev, record, type: "entry", ...options.envelopes?.[i] };
    env.hash = options.envelopes?.[i]?.hash ?? H(`nisi-run-journal/record/v1\n${C({ seq: env.seq, previousHash: env.previousHash, record: env.record })}`);
    let raw = C(env);
    if (options.lines?.[i]) raw = options.lines[i](raw, env);
    lines.push(raw); prev = env.hash;
  });
  if (options.footer !== false) lines.push(C({ type: "footer", count: entries.length, lastHash: prev, ...options.footerSet }));
  if (options.after) lines.push(...options.after);
  return lines.join("\n") + (options.newline === false ? "" : "\n");
}

export function suite(mod) {
  const out = [], check = (name, text, expected = "UNKNOWN", now = T + 1000, stage = "a", manifest = M) => {
    const view = mod.buildJournalView(manifest, text, now);
    out.push({ name: `reader agreement: ${name}`, pass: view.steps.find(s => s.id === stage)?.state === expected });
  };
  const valid = journal();
  check("canonical live entry", valid, "RUNNING");
  for (const behind of [1, 59999, 60000]) check(`header clock within skew ${behind}`, journal([E()], { header: header({ now: T + 300000 }) }), "RUNNING", T + 300000 - behind);
  for (const behind of [60001, 100000, 299999]) check(`header clock beyond skew ${behind}`, journal([E()], { header: header({ now: T + 300000 }) }), "UNKNOWN", T + 300000 - behind);
  check("retired by writer clock beyond skew", journal([E({ ttlMs: 250000 })], { header: header({ now: T + 300000 }), records: [{ retained: false }] }), "UNKNOWN", T + 200000);
  check("entry created after header clock", journal([E()], { header: header({ now: T - 1 }) }));
  check("entry created at header clock", journal([E()], { header: header({ now: T }) }), "RUNNING");

  for (const key of ["type", "schema", "now", "config"]) {
    const h = header(); delete h[key]; check(`missing header ${key}`, journal([E()], { header: h }));
  }
  for (const now of [null, "1800000000000", 1.5, -1, Number.MAX_SAFE_INTEGER + 1]) check(`invalid header now ${JSON.stringify(now)}`, journal([E()], { header: header({ now }) }));
  check("extra header key", journal([E()], { header: header({ extra: 1 }) }));
  check("extra config key", journal([E()], { header: header({}, { extra: 1 }) }));
  for (const key of ["projectId", "maxEntries", "heartbeatTtlMs", "redactPaths"]) {
    const h = header(); delete h.config[key]; check(`missing config ${key}`, journal([E()], { header: h }));
  }
  for (const maxEntries of [0, 10001, -1, 1.5, "100", null]) check(`invalid maxEntries ${JSON.stringify(maxEntries)}`, journal([E()], { header: header({}, { maxEntries }) }));
  for (const heartbeatTtlMs of [0, -1, 1.5, "3600000", null, Number.MAX_SAFE_INTEGER + 1]) check(`invalid heartbeatTtlMs ${JSON.stringify(heartbeatTtlMs)}`, journal([E()], { header: header({}, { heartbeatTtlMs }) }));
  for (const projectId of ["p ", "p/x", "-p", "é", 1]) check(`invalid project id ${JSON.stringify(projectId)}`, journal([E({ projectId })], { header: header({}, { projectId }) }));
  for (const redactPaths of [null, {}, "payload.x", ["payload"], ["payload."], ["garbage.x"], ["payload.01"], ["payload.__proto__"], ["payload.constructor"], ["payload.prototype"], ["payload.x", "payload.x"], ["payload.x", "payload.x.y"], ["payload.x.y", "payload.x"]])
    check(`invalid redaction paths ${JSON.stringify(redactPaths)}`, journal([E()], { header: header({}, { redactPaths }) }));
  for (const redactPaths of [[], ["payload.x"], ["payload.0"], ["payload.x_y", "payload.x.y"]]) check(`valid redaction paths ${JSON.stringify(redactPaths)}`, journal([E()], { header: header({}, { redactPaths }) }), "RUNNING");
  for (const [name, transform] of [
    ["BOM", x => `\ufeff${x}`], ["leading blank", x => `\n${x}`], ["CRLF", x => x.replaceAll("\n", "\r\n")],
    ["header whitespace", x => x.replace('"config":', '"config": ')],
    ["header decimal heartbeat", x => x.replace('"heartbeatTtlMs":3600000', '"heartbeatTtlMs":3600000.0')],
    ["header exponent now", x => x.replace('"now":1800000000000', '"now":18e11')],
    ["duplicate header now", x => x.replace('"now":1800000000000', '"now":0,"now":1800000000000')],
    ["noncanonical header order", x => x.replace(C(header()), JSON.stringify(header()))],
  ]) check(name, transform(valid));
  check("UTF-8 buffer BOM", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(valid)]));
  check("valid UTF-8 buffer", Buffer.from(valid), "RUNNING");
  check("zero maxEntries with no retained rows still refuses header", journal([E()], { header: header({}, { maxEntries: 0 }), records: [{ retained: false }] }));

  const running = E(), done = E({ id: "e0", stage: "b", state: "SUCCEEDED", heartbeatAt: null });
  const after = (name, entries, options = {}) => check(`stop before later live entry: ${name}`, journal(entries, options));
  after("unreadable line", [done, running], { lines: [() => "not json"] });
  after("empty line", [done, running], { lines: [() => ""] });
  after("wrong envelope", [done, running], { lines: [() => "{}"] });
  after("noninteger attempt", [{ ...done, attempt: 1.5 }, running]);
  after("other project", [{ ...done, projectId: "other" }, running]);
  after("duplicate id", [done, done, running]);
  after("invalid revocation", [done, E({ id: "rev", stage: "b", state: "REVOKED", heartbeatAt: null, attempt: 1, revokes: "e0" }), running]);
  after("invalid retry", [done, E({ id: "retry", stage: "b", state: "QUEUED", retryOf: "e0", heartbeatAt: null }), running]);
  for (const [key, value] of [["id", "-bad"], ["runId", "-bad"], ["candidateId", "-bad"], ["stage", "-bad"], ["receiptId", "-bad"],
    ["attempt", -1], ["attempt", "0"], ["createdAt", -1], ["createdAt", T + 1], ["ttlMs", 0], ["ttlMs", Number.MAX_SAFE_INTEGER],
    ["state", "DONE"], ["heartbeatAt", T + 1], ["retryOf", "-bad"], ["revokes", "-bad"], ["payload", 1.5], ["payload", "\ud800"],
    ["payload", { constructor: 1 }], ["payload", JSON.parse('{"__proto__":1}')]])
    after(`invalid precursor ${key} ${JSON.stringify(value)}`, [{ ...done, [key]: value }, running]);
  for (const key of Object.keys(done)) { const bad = { ...done }; delete bad[key]; after(`missing precursor entry key ${key}`, [bad, running]); }
  after("extra precursor entry key", [{ ...done, extra: 1 }, running]);
  after("payload negative zero", [done, running], { lines: [raw => raw.replace('"payload":null', '"payload":-0')] });
  for (const [key, value] of [["runId", "r2"], ["attempt", 1], ["candidateId", "c2"], ["createdAt", T - 1], ["revokes", "missing"]])
    after(`revocation mismatch ${key}`, [done, E({ id: "rev", stage: "b", state: "REVOKED", heartbeatAt: null, revokes: "e0", [key]: value }), running]);
  for (const [key, value] of [["runId", "r2"], ["attempt", 0], ["createdAt", T - 1], ["retryOf", "missing"], ["state", "SUCCEEDED"]])
    after(`retry mismatch ${key}`, [done, E({ id: "retry", stage: "b", state: "QUEUED", attempt: 1, heartbeatAt: null, retryOf: "e0", [key]: value }), running]);
  after("retry target still active", [E({ id: "e0", stage: "b" }), E({ id: "retry", stage: "b", state: "QUEUED", attempt: 1, heartbeatAt: null, retryOf: "e0" }), running]);
  after("duplicate retry target and attempt", [done, E({ id: "retry1", stage: "b", state: "QUEUED", attempt: 1, heartbeatAt: null, retryOf: "e0" }),
    E({ id: "retry2", stage: "b", state: "QUEUED", attempt: 1, heartbeatAt: null, retryOf: "e0" }), running]);
  check("retry of revoked active target is accepted", journal([E({ id: "e0", stage: "b" }), E({ id: "rev", stage: "b", state: "REVOKED", heartbeatAt: null, revokes: "e0" }),
    E({ id: "retry", stage: "b", state: "QUEUED", attempt: 1, heartbeatAt: null, retryOf: "e0" }), running]), "RUNNING");
  check("accepted prefix stays live after later rejection", journal([running, { ...done, attempt: 1.5 }]), "RUNNING");
  check("first held repeated id stays live", journal([running, running]), "RUNNING");
  check("data after footer is never held", journal([], { newline: true }) + journal().split("\n")[1] + "\n");

  for (const [key, replacement] of [["ttlMs", "3600000.0"], ["ttlMs", "36e5"], ["attempt", "0.0"], ["attempt", "0e0"], ["createdAt", "1800000000000.0"], ["createdAt", "18e11"], ["heartbeatAt", "1800000000000.0"], ["heartbeatAt", "18e11"]])
    check(`noncanonical number ${key} ${replacement}`, journal([E()], { lines: [raw => raw.replace(new RegExp(`"${key}":[0-9]+`), `"${key}":${replacement}`)] }));
  for (const [name, transform] of [
    ["duplicate state", raw => raw.replace('"state":"RUNNING"', '"state":"SUCCEEDED","state":"RUNNING"')],
    ["duplicate record retained", raw => raw.replace('"retained":true', '"retained":false,"retained":true')],
    ["entry whitespace", raw => raw.replace('"entry":{', '"entry": {')],
    ["entry key order", (raw, env) => JSON.stringify(env)],
    ["escaped key spelling", raw => raw.replace('"state":', '"st\\u0061te":')],
    ["decimal sequence", raw => raw.replace('"seq":1', '"seq":1.0')],
  ]) check(name, journal([E()], { lines: [transform] }));
  for (const retained of [null, "true", 1, [], {}]) check(`retained ${JSON.stringify(retained)}`, journal([E()], { records: [{ retained }] }));
  check("missing retained", journal([E()], { lines: [raw => raw.replace(',"retained":true', "")] }));
  check("extra record key", journal([E()], { records: [{ extra: 1 }] }));
  check("extra envelope key", journal([E()], { envelopes: [{ extra: 1 }] }));
  after("invalid envelope type", [done, running], { envelopes: [{ type: "other" }] });
  check("invalid envelope sequence with valid digest", journal([E()], { envelopes: [{ seq: 2 }] }));
  check("wrong previous hash with valid digest", journal([E()], { envelopes: [{ previousHash: "0".repeat(64) }] }));
  check("invalid record digest", journal([E()], { envelopes: [{ hash: "0".repeat(64) }] }));
  check("invalid retained fingerprint", journal([E()], { records: [{ fingerprint: "0".repeat(64) }] }));
  check("invalid retained fingerprint in incomplete file", journal([E()], { records: [{ fingerprint: "0".repeat(64) }], footer: false }));
  check("invalid retired fingerprint syntax in incomplete file", journal([E()], { records: [{ retained: false, fingerprint: "x" }], footer: false }));
  const legacy = { records: [{ retained: false, fingerprint: "0".repeat(64) }] };
  check("complete legacy retired fingerprint trims later entries", journal([done, running], legacy));
  check("incomplete legacy fingerprint keeps recovered prefix", journal([done, running], { ...legacy, footer: false }), "RUNNING");
  for (const footerSet of [{ count: 0 }, { lastHash: "0".repeat(64) }, { extra: 1 }])
    check(`invalid footer preserves legacy recovered prefix ${JSON.stringify(footerSet)}`, journal([done, running], { ...legacy, footerSet }), "RUNNING");
  check("trailing data preserves legacy recovered prefix", journal([done, running], { ...legacy, after: ["{}"] }), "RUNNING");
  check("unterminated data after footer preserves legacy prefix", journal([done, running], { ...legacy, after: ["{}"], newline: false }), "RUNNING");
  check("unretained entry with payload", journal([E({ payload: { value: 1 } })], { records: [{ retained: false }] }));
  check("retained entry expired at header clock", journal([E({ ttlMs: 1000 })], { header: header({ now: T + 1000 }) }), "UNKNOWN", T + 500);
  check("retained count over maxEntries", journal([done, running], { header: header({}, { maxEntries: 1 }) }));
  check("unredacted retained payload", journal([E({ payload: { secret: "visible" } })], { header: header({}, { redactPaths: ["payload.secret"] }) }));
  check("redacted retained payload", journal([E({ payload: { secret: "[REDACTED]" } })], { header: header({}, { redactPaths: ["payload.secret"] }) }), "RUNNING");
  check("missing footer with newline holds complete entry", journal([E()], { footer: false }), "RUNNING");
  check("missing footer without newline drops truncated entry", journal([E()], { footer: false, newline: false }));
  check("missing final newline drops footer only", journal([E()], { newline: false }), "RUNNING");
  check("truncated second entry preserves accepted first", journal([running, done], { footer: false, newline: false }), "RUNNING");
  return out;
}

export let count = 0, failed = 0;
const real = await import(pathToFileURL(adaptorPath));
for (const r of suite(real)) { count++; console.log(r.pass ? "PASS" : "FAIL", r.name); if (!r.pass) failed++; }

// Mutate the new reader boundary one rule at a time. A kill requires an assertion failure after a successful
// module import; syntax errors, import errors and thrown test runs are harness failures, never kills.
const MUTANTS = [
  ["accept noncanonical JSON", `return canonical(x) === raw ? x : null;`, `return x;`],
  ["ignore the exact header keys", `!exact(h, ["type", "schema", "config", "now"])`, `(!isObj(h) || !Object.hasOwn(h, "config"))`],
  ["ignore header time type", `!nisiTime(h.now)`, `false`],
  ["ignore exact config keys", `!exact(c, ["projectId", "maxEntries", "heartbeatTtlMs", "redactPaths"])`, `false`],
  ["accept a fractional maxEntries", `!Number.isSafeInteger(c.maxEntries)`, `false`],
  ["accept zero maxEntries", `c.maxEntries < 1`, `c.maxEntries < 0`],
  ["accept excessive maxEntries", `c.maxEntries > 10000`, `false`],
  ["accept nonarray redaction paths", `if (!Array.isArray(list)) return null;`, `if (!Array.isArray(list)) return [];`],
  ["accept paths outside payload", `!p.startsWith("payload.")`, `false`],
  ["accept invalid redaction segments", `!/^(?:[A-Za-z_][A-Za-z0-9_]*|0|[1-9][0-9]*)$/.test(k)`, `false`],
  ["accept forbidden redaction segments", `|| NISI_FORBIDDEN_KEYS.has(k))) return null;`, `)) return null;`],
  ["accept overlapping redaction paths", `if (paths.some(b => a.slice(0, Math.min(a.length, b.length)).every((k, i) => k === b[i]))) return null;`, ``],
  ["retain an unterminated final entry", `lines.pop(); // Nisi drops an unterminated final line.`, `if (!trailing) lines.pop();`],
  ["ignore exact envelope keys", `!exact(v, ["type", "seq", "previousHash", "record", "hash"])`, `false`],
  ["ignore envelope type", `v.type !== "entry"`, `false`],
  ["ignore sequence number", `v.seq !== n`, `false`],
  ["ignore previous hash", `v.previousHash !== prev`, `false`],
  ["ignore record hash", `canonical({ seq: v.seq, previousHash: v.previousHash, record: v.record })) !== v.hash`, `canonical({ seq: v.seq, previousHash: v.previousHash, record: v.record })) !== v.hash && false`],
  ["ignore exact record keys", `!exact(v.record, ["entry", "fingerprint", "retained"])`, `false`],
  ["ignore fingerprint syntax", `!hashText(v.record.fingerprint)`, `false`],
  ["ignore retained type", `typeof v.record.retained !== "boolean"`, `false`],
  ["accept malformed entry in the held prefix", `!isObj(e) || !nisiEntry(e) || e.createdAt > h.now`, `!isObj(e) || e.createdAt > h.now`],
  ["ignore creation after header clock", `e.createdAt > h.now`, `false`],
  ["ignore heartbeat after creation in a precursor", `e.heartbeatAt !== null && e.heartbeatAt > e.createdAt) break;`, `false) break;`],
  ["ignore another project in the held prefix", `e.projectId !== c.projectId`, `false`],
  ["accept a duplicate id in the held prefix", `held.has(e.id) ||`, `false ||`],
  ["accept unretained payload", `!v.record.retained && e.payload !== null`, `false`],
  ["ignore fingerprint equality", `if (v.record.fingerprint !== fingerprint(e)) {`, `if (false) {`],
  ["treat retained fingerprint mismatch as legacy", `if (v.record.retained) break;`, `if (false) break;`],
  ["ignore payload redaction", `!alreadyRedacted(e, paths)`, `false`],
  ["ignore writer-clock expiry", `h.now >= e.createdAt + e.ttlMs`, `false`],
  ["writer-clock expiry one millisecond late", `h.now >= e.createdAt + e.ttlMs`, `h.now > e.createdAt + e.ttlMs`],
  ["ignore retained row cap", `if (++retained > c.maxEntries) break;`, `retained++;`],
  ["accept duplicate retry target and attempt", `retries.has(retry) ||`, `false ||`],
  ["ignore retry run match", `t.runId !== e.runId || e.attempt <= t.attempt`, `false || e.attempt <= t.attempt`],
  ["ignore retry attempt ordering", `e.attempt <= t.attempt`, `false`],
  ["ignore retry creation ordering", `e.createdAt < t.createdAt`, `false`],
  ["allow a retry of an active target", `!["SUCCEEDED", "FAILED", "CANCELLED", "REVOKED"].includes(t.state) && h.now < t.createdAt + t.ttlMs && !revoked.has(t.id)`, `false`],
  ["ignore revocation run match", `!t || t.runId !== e.runId || t.attempt !== e.attempt`, `!t || t.attempt !== e.attempt`],
  ["ignore revocation attempt match", `t.attempt !== e.attempt`, `false`],
  ["ignore revocation candidate match", `t.candidateId !== e.candidateId`, `false`],
  ["ignore revocation creation ordering", `t.createdAt > e.createdAt`, `false`],
  ["forget recorded retries", `if (e.retryOf !== null) retries.add(retry);`, ``],
  ["forget recorded revocations", `if (e.revokes !== null) revoked.add(e.revokes);`, ``],
  ["keep complete legacy tail", `if (complete && legacy !== null) return new Map([...held].slice(0, legacy));`, ``],
  ["accept a malformed legacy footer count", `v.count === held.size &&`, ``],
  ["accept a malformed legacy footer hash", `v.lastHash === prev &&`, ``],
  ["accept extra legacy footer keys", `exact(v, ["type", "count", "lastHash"]) &&`, ``],
  ["trim a legacy prefix despite trailing lines", `n + 1 === lines.length && !trailing`, `!trailing`],
  ["trim a legacy prefix despite unterminated trailing text", `&& !trailing;`, `;`],
  ["ignore header clock skew", `let future = nisiTime(header.now) && header.now > now + SKEW_MS;`, `let future = false;`],
  ["ignore the reader-held entry gate", `!nisiEntry(e) || !(held ??= readerEntries(text)).has(e.id)`, `!nisiEntry(e)`],
];
if (!failed) {
  const src = fs.readFileSync(adaptorPath, "utf8"), dir = fs.mkdtempSync(path.join(os.tmpdir(), "jaryo-reader-mut-"));
  fs.copyFileSync(path.join(root, "adaptor/jaryo-adaptor.mjs"), path.join(dir, "jaryo-adaptor.mjs"));
  fs.copyFileSync(path.join(root, "adaptor/redact.mjs"), path.join(dir, "redact.mjs"));
  let killed = 0;
  for (const [i, [name, from, to]] of MUTANTS.entries()) {
    count++; let ok = false, detail = "";
    if (!src.includes(from)) detail = "anchor missing";
    else {
      const file = path.join(dir, `mutant-${i}.mjs`); fs.writeFileSync(file, src.replace(from, to));
      try { const results = suite(await import(pathToFileURL(file))); ok = results.some(r => !r.pass); if (!ok) detail = "survived"; }
      catch (err) { detail = `harness error: ${err.name}`; }
    }
    console.log(ok ? "PASS" : "FAIL", `reader mutation: ${name}${detail ? ` (${detail})` : ""}`);
    if (ok) killed++; else failed++;
  }
  console.log(`reader mutations: ${killed}/${MUTANTS.length} killed by assertions`);
}
const isMain = () => { try { return !!process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href; } catch { return false; } };
if (isMain()) { console.log(`${count - failed}/${count} passed`); process.exit(failed ? 1 : 0); }
