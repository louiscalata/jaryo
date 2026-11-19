// Hostile sample-record checks. Importable by the bounded mutation harness.
import fs from "node:fs"; import path from "node:path"; import assert from "node:assert/strict"; import { fileURLToPath, pathToFileURL } from "node:url";
export const NOW = Date.parse("2026-11-16T20:00:00Z");
export const HB = { intervalMs: 10000, staleAfterMs: 120000 };
export const manifest = { id: "p", declares: { actions: ["run", "retry", "logs"], heartbeat: HB }, steps: [{ id: "a" }, { id: "b" }] };
export const stamp = offset => new Date(NOW + offset).toISOString();
export const start = { event: "run-start", run: 2, ts: stamp(-1000) };
export const result = { step: "a", status: "ok", exit: 0, run: 2, ts: stamp(-1000), tail: ["ordinary output"] };
export const lines = (...events) => events.map(e => JSON.stringify(e)).join("\n");

export function suite({ buildView, readRecord }) {
  const results = [], test = (name, fn) => {
    try { fn(); results.push({ name, pass: true }); }
    catch (error) { results.push({ name, pass: false, error: error.message, assertion: error instanceof assert.AssertionError }); }
  };
  const view = text => buildView(manifest, text, NOW);
  const tailView = tail => { const lastRun = view(lines(start, { ...result, tail })).steps[0].lastRun; assert.ok(lastRun, "current result retains its output record"); return lastRun.tail; };
  for (const bad of ['{"event":"step-start","step":"a"', "{broken", "[]", "null", "7", '"text"']) {
    test(`corrupt suffix invalidates earlier result: ${bad}`, () => {
      const v = view(lines(start, result) + "\n" + bad);
      assert.equal(v.steps[0].state, "UNKNOWN"); assert.equal(v.steps[0].lastRun, null);
      assert.match(v.steps[0].reason, /invalid record line/); assert.match(v.warnings.join("\n"), /line 3/);
    });
  }
  test("parser records corrupt boundaries in event coordinates", () => {
    assert.deepEqual(readRecord("{bad\n" + lines(start) + "\n[]\n" + lines(result) + "\n{bad").invalidAt, [0, 1, 2]);
  });
  for (const status of ["ok", "failed", "blocked", "review"]) test(`corruption invalidates ${status} and its output`, () => {
    const v = view(lines(start, { ...result, status, exit: status === "failed" ? 1 : null }) + "\n{bad");
    assert.equal(v.steps[0].state, "UNKNOWN"); assert.equal(v.steps[0].lastRun, null);
    assert.equal(v.review.counts.unknown, 2);
  });
  test("later result restores only its own step", () => {
    const v = view(lines(start, result) + "\n{bad\n" + lines({ ...result, step: "b" }));
    assert.equal(v.steps[0].state, "UNKNOWN"); assert.equal(v.steps[1].state, "OK");
  });
  test("result immediately after corruption restores its own step", () => {
    assert.equal(view(lines(start, result) + "\n{bad\n" + lines(result)).steps[0].state, "OK");
  });
  test("later start restores its own liveness", () => {
    assert.equal(view(lines(start, result) + "\n{bad\n" + lines({ ...start, event: "step-start", step: "a" })).steps[0].state, "RUNNING");
  });
  test("heartbeat cannot restore a start hidden by corruption", () => {
    const v = view(lines(start, { ...start, event: "step-start", step: "a" }) + "\n{bad\n" + lines({ ...start, event: "heartbeat", step: "a" }));
    assert.equal(v.steps[0].state, "UNKNOWN");
  });
  test("a second corrupt boundary invalidates recovered evidence", () => {
    assert.equal(view(lines(start) + "\n{bad\n" + lines(result) + "\n[]").steps[0].state, "UNKNOWN");
  });
  test("corruption before the selected run does not invalidate it", () => {
    const v = view(lines(result) + "\n{bad\n" + lines(start, result));
    assert.equal(v.steps[0].state, "OK"); assert.equal(v.steps[1].reason, "no record for this step in the latest run");
  });
  test("blank lines and BOM preserve a healthy result", () => {
    assert.equal(view("\ufeff\n  \n" + lines(start, result) + "\n\n").steps[0].state, "OK");
  });
  test("foreign events do not shift a corrupt boundary", () => {
    const v = view(lines(start, { ...result, run: 1 }, result) + "\n{bad\n" + lines({ ...result, run: 1 }, { ...result, step: "b" }));
    assert.equal(v.steps[0].state, "UNKNOWN"); assert.equal(v.steps[1].state, "OK");
  });
  for (const run of [1, "2", null, false, {}, []]) test(`foreign result ignored: ${JSON.stringify(run)}`, () => {
    const v = view(lines(start, { ...result, run }));
    assert.equal(v.steps[0].state, "UNKNOWN"); assert.equal(v.steps[0].lastRun, null);
    assert.match(v.warnings.join("\n"), /different run/);
  });
  test("foreign restart cannot supersede current result", () => {
    assert.equal(view(lines(start, result, { ...start, event: "step-start", step: "a", run: 1 })).steps[0].state, "OK");
  });
  test("foreign result cannot supersede current failure", () => {
    const s = view(lines(start, { ...result, status: "failed", exit: 7, reason: "explicit cause" }, { ...result, run: 1 })).steps[0];
    assert.equal(s.state, "FAILED"); assert.equal(s.reason, "explicit cause");
  });
  test("foreign end cannot end the current run", () => {
    assert.equal(view(lines(start, { ...start, event: "step-start", step: "a" }, { ...start, event: "run-end", run: 1 })).run.state, "running");
  });
  test("foreign undeclared step does not appear", () => {
    assert.deepEqual(view(lines(start, { ...result, step: "ghost", run: 1 })).undeclared, []);
  });
  test("foreign recent heartbeat cannot refresh a stale step or run", () => {
    const v = view(lines({ ...start, ts: stamp(-200000) }, { ...start, event: "step-start", step: "a", ts: stamp(-200000) }, { ...start, event: "heartbeat", step: "a", run: 1 }));
    assert.equal(v.steps[0].state, "UNKNOWN"); assert.equal(v.run.state, "unknown"); assert.equal(v.lastEventAt, stamp(-200000));
  });
  test("foreign future timestamp cannot poison current liveness", () => {
    const v = view(lines(start, { ...start, event: "step-start", step: "a" }, { ...start, event: "heartbeat", step: "a", run: 1, ts: stamp(61000) }));
    assert.equal(v.steps[0].state, "RUNNING"); assert.equal(v.lastEventAt, start.ts);
  });
  test("legacy events without run IDs remain supported", () => {
    const { run, ...legacy } = result; assert.equal(view(lines(start, legacy)).steps[0].state, "OK");
  });
  test("legacy start without run ID remains supported", () => {
    const { run, ...legacy } = start; assert.equal(view(lines(legacy, result)).steps[0].state, "OK");
  });
  test("latest run wins and prior corrupt boundary stays behind it", () => {
    const v = view(lines(start, result) + "\n{bad\n" + lines({ ...start, run: 3 }, { ...result, run: 3, step: "b" }));
    assert.equal(v.run.id, 3); assert.equal(v.steps[0].state, "UNKNOWN"); assert.equal(v.steps[1].state, "OK");
  });
  test("another step cannot refresh an unfinished stale step", () => {
    const v = view(lines(start, { ...start, event: "step-start", step: "a", ts: stamp(-200000) }, { ...start, event: "step-start", step: "b" }));
    assert.equal(v.steps[0].state, "UNKNOWN"); assert.equal(v.steps[1].state, "RUNNING");
  });
  test("a long step's own heartbeat keeps it running", () => {
    assert.equal(view(lines(start, { ...start, event: "step-start", step: "a", ts: stamp(-200000) }, { ...start, event: "heartbeat", step: "a" })).steps[0].state, "RUNNING");
  });
  test("restart cannot borrow an earlier attempt heartbeat", () => {
    assert.equal(view(lines(start, { ...start, event: "step-start", step: "a" }, { ...start, event: "heartbeat", step: "a" }, { event: "step-start", step: "a", run: 2 })).steps[0].state, "UNKNOWN");
  });
  test("heartbeat declaration remains mandatory", () => {
    assert.equal(buildView({ ...manifest, declares: { actions: [] } }, lines(start, { ...start, event: "step-start", step: "a" }), NOW).steps[0].state, "UNKNOWN");
  });
  for (const offset of [-120001, -120000, 60000, 60001]) test(`own heartbeat clock boundary ${offset}`, () => {
    const v = view(lines({ ...start, ts: stamp(offset) }, { ...start, event: "step-start", step: "a", ts: stamp(offset) }));
    assert.equal(v.steps[0].state, offset >= -120000 && offset <= 60000 ? "RUNNING" : "UNKNOWN");
  });
  const credentials = [
    ["Bearer", "Authorization: Bearer fixture-bearer", "fixture-bearer"],
    ["Basic", "Basic Zml4dHVyZTpwYXNz", "Zml4dHVyZTpwYXNz"],
    ["password", "PASSWORD=fixture-password", "fixture-password"],
    ["passwd", "passwd='fixture passwd'", "fixture passwd"],
    ["API key JSON", '{"api_key":"fixture-key"}', "fixture-key"],
    ["escaped JSON", '{"password":"fixture\\\"escaped-secret"}', "escaped-secret"],
    ["token", "access_token: fixture-token", "fixture-token"],
    ["secret", "client_secret=fixture-secret", "fixture-secret"],
    ["credential", "credential=fixture-credential", "fixture-credential"],
    ["private key assignment", "private_key=fixture-private", "fixture-private"],
    ["access key assignment", "access-key=fixture-access", "fixture-access"],
    ["URL", "https://user:fixture-url@example.test/path", "fixture-url"],
    ["provider sk", "sk-" + "A".repeat(24), "A".repeat(24)],
    ["provider gh", "ghp_" + "B".repeat(24), "B".repeat(24)],
    ["provider github", "github_pat_" + "C".repeat(24), "C".repeat(24)],
    ["provider cloud", "AKIA" + "D".repeat(16), "D".repeat(16)],
    ["provider chat", "xoxb-" + "E".repeat(24), "E".repeat(24)],
  ];
  for (const [name, text, secret] of credentials) test(`redacts ${name} before emitting view`, () => {
    const tail = tailView(["ordinary output", text]);
    assert.equal(tail[0], "ordinary output"); assert.ok(!tail.join("\n").includes(secret)); assert.match(tail.join("\n"), /REDACTED/);
  });
  test("redaction precedes character truncation", () => {
    const tail = tailView(["x".repeat(480) + " API_TOKEN=" + "s".repeat(1000)]);
    assert.ok(!tail[0].includes("ssss")); assert.ok(tail[0].length <= 500); assert.match(tail[0], /REDACTED/);
  });
  for (const kind of ["", "RSA ", "OPENSSH ", "EC "]) test(`redacts multiline ${kind}private key before line selection`, () => {
    const tail = tailView([`-----BEGIN ${kind}PRIVATE KEY-----`, ...Array(8).fill("fixture-private-material"), `-----END ${kind}PRIVATE KEY-----`, "done"]);
    assert.ok(!tail.join("\n").includes("fixture-private-material")); assert.match(tail.join("\n"), /REDACTED/); assert.equal(tail.at(-1), "done");
  });
  test("unterminated private key is redacted through the tail end", () => {
    const tail = tailView(["before", "-----BEGIN PRIVATE KEY-----", "fixture-unclosed-material"]);
    assert.ok(!tail.join("\n").includes("fixture-unclosed-material")); assert.equal(tail[0], "before"); assert.match(tail.join("\n"), /REDACTED/);
  });
  test("embedded newlines do not bypass key redaction", () => {
    assert.ok(!tailView(["-----BEGIN PRIVATE KEY-----\nfixture-nested-material\n-----END PRIVATE KEY-----"]).join("\n").includes("fixture-nested-material"));
  });
  test("PGP private key block is redacted", () => {
    const tail = tailView(["-----BEGIN PGP PRIVATE KEY BLOCK-----", "fixturePgpMaterial", "-----END PGP PRIVATE KEY BLOCK-----", "done"]);
    assert.deepEqual(tail, ["[REDACTED PRIVATE KEY]", "done"]);
  });
  test("orphan private key end marker redacts the key lines before it", () => {
    const tail = tailView(["ordinary output", "Zml4dHVyZU9ycGhhbjE=", "Zml4dHVyZU9ycGhhbjI=", "-----END OPENSSH PRIVATE KEY-----", "done"]);
    assert.deepEqual(tail, ["ordinary output", "[REDACTED PRIVATE KEY]", "done"]);
  });
  test("ordinary output keeps final line and character bounds", () => {
    assert.deepEqual(tailView(Array.from({ length: 10 }, (_, i) => "x".repeat(600) + i)), Array(6).fill("x".repeat(500)));
  });
  // LOU-89: the old nested-star credential-name rule and the unanchored END-marker check were cubic/quadratic here
  // (an 8 KB run took tens of seconds); the bound is ~1000x the current cost, so it is not timing-sensitive on CI.
  const bounded = (tail, ms = 2000) => { const t0 = performance.now(), out = tailView(tail), took = performance.now() - t0; assert.ok(took < ms, `redaction took ${took.toFixed(0)} ms`); return out; };
  test("long credential-name near-match without an assignment redacts in bounded time", () => {
    const tail = bounded(["token-".repeat(1400) + "token"]); assert.equal(tail[0], ("token-".repeat(1400)).slice(0, 500)); assert.doesNotMatch(tail[0], /REDACTED/);
  });
  test("long blank run without an END marker redacts in bounded time", () => {
    const tail = bounded(["token" + " ".repeat(131072), "done"]); assert.deepEqual(tail, [("token" + " ".repeat(495)), "done"]);
  });
  test("credential name after a long hyphenated run is still redacted", () => {
    const tail = bounded(["x-".repeat(100) + "token=fixture-hidden-value", "a=api-key=fixture-second"]);
    assert.ok(!tail.join("\n").includes("fixture-hidden-value")); assert.ok(!tail.join("\n").includes("fixture-second")); assert.match(tail[0], /token=\[REDACTED\]$/);
  });
  test("ordinary token-check filenames are not credential assignments", () => {
    assert.deepEqual(tailView(["pipeline/check-tokens.mjs: OK"]), ["pipeline/check-tokens.mjs: OK"]);
  });
  test("empty output remains empty instead of becoming a blank line", () => {
    assert.deepEqual(tailView([]), []); assert.deepEqual(tailView([""]), [""]);
  });
  test("redaction does not rewrite the input record", () => {
    const text = lines(start, { ...result, tail: ["PASSWORD=fixture-raw"] }), before = text;
    view(text); assert.equal(text, before); assert.ok(text.includes("fixture-raw"));
  });
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const i = process.argv.indexOf("--adaptor"), target = i >= 0 ? process.argv[i + 1] : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../adaptor/jaryo-adaptor.mjs");
  const results = suite(await import(pathToFileURL(target).href));
  for (const r of results) console.log(r.pass ? "PASS" : "FAIL", r.name, r.pass ? "" : r.error);
  const passed = results.filter(r => r.pass).length;
  console.log(`${passed}/${results.length} passed`); process.exitCode = passed === results.length ? 0 : 1;
}
