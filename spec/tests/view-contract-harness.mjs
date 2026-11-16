// Explicit, bounded mutation and generated-input checks; not part of the ordinary suites.
// JSDOM names an existing package. TMPDIR owns every scratch copy. No pipeline is run.
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import assert from "node:assert/strict"; import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { root, DATE_LIMIT, manifest, record, boot, fixture, step } from "./view-contract.test.mjs";

const args = process.argv.slice(2), arg = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const mode = args[0] || "differential", specRoot = arg("--root") || root;
const output = arg("--output");
const testFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "view-contract.test.mjs");
const report = { mode };
const writeReport = () => { if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n"); };

if (mode === "mutations") {
  const adaptor = fs.readFileSync(path.join(specRoot, "adaptor/jaryo-adaptor.mjs"), "utf8");
  const template = fs.readFileSync(path.join(specRoot, "adaptor/view-template.html"), "utf8");
  const mutations = [], add = (family, label, from, to) => mutations.push({ family, label, from, to });
  const guard = 'typeof now !== "number" || !Number.isFinite(now) || Math.abs(now) > 8640000000000000';
  const guardPolicies = [
    ["accept all clocks", "false"],
    ["permit NaN", 'typeof now !== "number" || Math.abs(now) > 8640000000000000'],
    ["reject positive endpoint", 'typeof now !== "number" || !Number.isFinite(now) || now >= 8640000000000000 || now < -8640000000000000'],
    ["reject negative endpoint", 'typeof now !== "number" || !Number.isFinite(now) || now > 8640000000000000 || now <= -8640000000000000'],
    ["reject both endpoints", 'typeof now !== "number" || !Number.isFinite(now) || Math.abs(now) >= 8640000000000000'],
    ["omit lower bound", 'typeof now !== "number" || !Number.isFinite(now) || now > 8640000000000000'],
    ["omit upper bound", 'typeof now !== "number" || !Number.isFinite(now) || now < -8640000000000000'],
    ["safe integer rather than Date bound", 'typeof now !== "number" || !Number.isFinite(now) || Math.abs(now) > Number.MAX_SAFE_INTEGER'],
    ["require integer clocks", 'typeof now !== "number" || !Number.isInteger(now) || Math.abs(now) > 8640000000000000'],
    ["require nonnegative clocks", 'typeof now !== "number" || !Number.isFinite(now) || now < 0 || now > 8640000000000000'],
    ["reject epoch", 'typeof now !== "number" || !Number.isFinite(now) || now === 0 || Math.abs(now) > 8640000000000000'],
    ["reject negative zero", 'typeof now !== "number" || !Number.isFinite(now) || Object.is(now, -0) || Math.abs(now) > 8640000000000000'],
    ["coerce caller clocks", '!isFinite(now) || Math.abs(now) > 8640000000000000'],
    ["bound at signed 32 bit", 'typeof now !== "number" || !Number.isFinite(now) || Math.abs(now) > 2147483647'],
    ["bound at seconds range", 'typeof now !== "number" || !Number.isFinite(now) || Math.abs(now) > 8640000000000'],
  ];
  for (const [name, policy] of guardPolicies) add("adaptor", "clock: " + name, guard, policy);
  add("adaptor", "clock: wrong error class", 'throw new TypeError("now must be a finite number within the JavaScript Date range")', 'throw new RangeError("now must be a finite number within the JavaScript Date range")');
  add("adaptor", "clock: wrong error field", 'throw new TypeError("now must be a finite number within the JavaScript Date range")', 'throw new TypeError("record must be within range")');
  const failedGuard = 'state === "FAILED" && (!reason || !reason.trim())';
  for (const state of ["BLOCKED", "OK", "REVIEW", "UNKNOWN"]) add("adaptor", "reason: default only for " + state, failedGuard, `state === "${state}" && (!reason || !reason.trim())`);
  for (const [name, condition] of [["omit whitespace", '!reason'], ["only null", 'reason === null'], ["only empty", 'reason === ""'],
    ["overwrite explicit", "true"], ["never default", "false"], ["skip null", 'reason !== null && !reason.trim()']]) {
    add("adaptor", "reason: " + name, failedGuard, `state === "FAILED" && (${condition})`);
  }
  const finite = 'Number.isFinite(exit) ? `: exit ${exit}` : ""';
  for (const [name, expression] of [["include null and overflow", '` : exit ${exit}`'],
    ["include overflow", 'exit !== null ? `: exit ${exit}` : ""'],
    ["omit negative codes", 'Number.isFinite(exit) && exit > 0 ? `: exit ${exit}` : ""'],
    ["omit fractional codes", 'Number.isInteger(exit) ? `: exit ${exit}` : ""'],
    ["omit code", '""'], ["absolute code", 'Number.isFinite(exit) ? `: exit ${Math.abs(exit)}` : ""'],
    ["rounded code", 'Number.isFinite(exit) ? `: exit ${Math.round(exit)}` : ""'],
    ["wrong code", 'Number.isFinite(exit) ? `: exit ${exit + 1}` : ""'],
    ["wrong label", 'Number.isFinite(exit) ? `: status ${exit}` : ""']]) {
    add("adaptor", "reason: " + name, finite, expression);
  }
  for (const [name, replacement] of [["blocked word", "This step ran and was blocked"], ["omit ran", "This step failed"],
    ["omit failed", "This step ran"], ["omit last output", "This step ran and failed"]]) {
    if (name === "omit last output") add("adaptor", "reason: " + name, '. See its last output.`;', '.`;');
    else add("adaptor", "reason: " + name, '`This step ran and failed${', '`' + replacement + '${');
  }

  const tailGuard = "if (cur.step.lastRun.tail.length) {";
  for (const [name, condition] of [["always create output", "true"], ["never create output", "false"],
    ["require multiple lines", "cur.step.lastRun.tail.length > 1"], ["single line only", "cur.step.lastRun.tail.length === 1"],
    ["only failed output", 'cur.step.lastRun.tail.length && cur.state === "FAILED"'],
    ["skip failed output", 'cur.step.lastRun.tail.length && cur.state !== "FAILED"']]) {
    add("template", "output: " + name, tailGuard, `if (${condition}) {`);
  }
  add("template", "output: skip recorded run", "if (cur.step.lastRun) {", "if (false) {");
  add("template", "output: omit run metadata", '"Last recorded: exit " + cur.step.lastRun.exit', '"Last result: code " + cur.step.lastRun.exit');
  add("template", "output: wrong duration", 'cur.step.lastRun.ms + " ms"', '(cur.step.lastRun.ms + 1) + " ms"');
  add("template", "output: join lines with space", 'cur.step.lastRun.tail.join("\\n")', 'cur.step.lastRun.tail.join(" ")');
  add("template", "output: lose first line", 'cur.step.lastRun.tail.join("\\n")', 'cur.step.lastRun.tail.slice(1).join("\\n")');
  add("template", "output: lose last line", 'cur.step.lastRun.tail.join("\\n")', 'cur.step.lastRun.tail.slice(0, -1).join("\\n")');
  add("template", "output: wrong region role", 'pre.setAttribute("role", "region")', 'pre.setAttribute("role", "log")');
  add("template", "output: remove region role", 'pre.setAttribute("role", "region")', 'pre.removeAttribute("role")');
  add("template", "output: remove keyboard access", 'pre.setAttribute("tabindex", "0")', 'pre.setAttribute("tabindex", "-1")');
  add("template", "output: lose step in region name", '"Last recorded output of " + cur.name', '"Last recorded output"');
  add("template", "output: wrong region name", '"Last recorded output of " + cur.name', '"Last recorded output of " + cur.id');
  add("template", "inspector: omit action area", 'p.appendChild(actions());\n    };', '\n    };');
  add("template", "inspector: wrong heading", 'el("h2", "", cur.name)', 'el("h2", "", cur.id)');
  add("template", "inspector: omit reason", 'if (cur.reason) p.appendChild(el("p", "", cur.reason));', 'if (false) p.appendChild(el("p", "", cur.reason));');
  add("template", "inspector: swap dependencies", 'cur.step.needs.join(", ")', 'cur.step.next.join(", ")');
  add("template", "inspector: lose downstream", 'cur.step.next.join(", ")', 'cur.step.needs.join(", ")');
  add("template", "selection: wrong pressed state", 'k === id ? "true" : "false"', 'k === id ? "false" : "true"');
  add("template", "selection: announce id", '"Selected " + buttons[id].it.name', '"Selected " + buttons[id].it.id');
  add("template", "selection: announce blocked for failed", 'buttons[id].it.state.toLowerCase() + "."', '(buttons[id].it.state === "FAILED" ? "blocked" : buttons[id].it.state.toLowerCase()) + "."');
  add("template", "selection: lose status", 'buttons[id].it.state.toLowerCase() + "."', '"selected."');
  add("template", "row: blocked name for failed", 'it.state.toLowerCase() + (it.step', '(it.state === "FAILED" ? "blocked" : it.state.toLowerCase()) + (it.step');
  add("template", "row: omit status name", 'it.state.toLowerCase() + (it.step', '"" + (it.step');
  add("template", "row: omit reason in name", '(it.reason ? ", " + it.reason : "")', '""');
  add("template", "row: omit consequential name", '(it.step && it.step.consequential ? ", consequential" : "")', '""');
  add("template", "row: lose button semantics", 'b = el("button", "step "', 'b = el("div", "step "');
  add("template", "row: failed uses blocked class", 'FAILED: "fail"', 'FAILED: "bad"');
  add("template", "row: failed uses unknown class", 'FAILED: "fail"', 'FAILED: "unk"');
  add("template", "row: failed loses cross", 'FAILED: "✕"', 'FAILED: "?"');
  add("template", "row: blocked loses cross", 'BLOCKED: "✕"', 'BLOCKED: "?"');
  add("template", "row: failed word becomes blocked", '" [" + it.state + "]"', '" [" + (it.state === "FAILED" ? "BLOCKED" : it.state) + "]"');
  add("template", "actions: hide declared logs words", 'a.id + " (declared; not wired in this page)"', 'a.id');
  add("template", "actions: lose unavailable words", 'a.id + ", not available. " + a.reason', 'a.id + ", available"');
  add("template", "actions: mark unavailable enabled", 'n.setAttribute("aria-disabled", "true")', 'n.setAttribute("aria-disabled", "false")');
  const reviewFailed = 'c.failed + " failed, "';
  for (const field of ["blocked", "total", "review", "unknown"]) add("template", "review: failed uses " + field + " count", reviewFailed, `c.${field} + " failed, "`);
  add("template", "review: omit failed count", ' + c.failed + " failed, "', ' + ""');
  add("template", "review: blocked uses failed count", 'c.blocked + " blocked, "', 'c.failed + " blocked, "');
  add("template", "review: omit unknown count", 'c.unknown + " unknown or undiscovered."', '"unknown or undiscovered."');
  add("template", "review: omit consequential names", 'gated.join(", ")', '""');
  add("template", "review: do not open dialog", 'd.showModal();', 'd.removeAttribute("open");');
  add("template", "review: do not close dialog", 'd.close();', 'd.setAttribute("open", "");');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "view-contract-mutants-"));
  const results = [];
  for (const [i, m] of mutations.entries()) {
    const source = m.family === "adaptor" ? adaptor : template;
    if (!source.includes(m.from)) throw new Error("mutation anchor not found: " + m.label);
    const copy = path.join(tmp, String(i + 1)); fs.mkdirSync(copy);
    fs.cpSync(path.join(specRoot, "adaptor"), path.join(copy, "adaptor"), { recursive: true });
    fs.writeFileSync(path.join(copy, "adaptor", m.family === "adaptor" ? "jaryo-adaptor.mjs" : "view-template.html"), source.replace(m.from, m.to));
    const child = spawnSync(process.execPath, [testFile, "--root", copy, "--kind", m.family, "--quiet"], { encoding: "utf8", timeout: 15000 });
    const evidence = (child.stdout || "") + (child.stderr || "");
    const killed = child.status === 1 && /FAIL CONTRACT/.test(evidence) && !/SyntaxError|ERR_MODULE_NOT_FOUND/.test(evidence);
    results.push({ family: m.family, label: m.label, status: child.status, killed,
      assertionFailures: (evidence.match(/FAIL CONTRACT/g) || []).length });
    fs.writeFileSync(path.join(copy, "result.log"), evidence);
    console.log(killed ? "KILLED" : "SURVIVED_OR_INVALID", m.family, m.label);
  }
  report.mutants = results;
  report.summary = ["adaptor", "template"].map(family => ({ family, total: results.filter(x => x.family === family).length,
    killed: results.filter(x => x.family === family && x.killed).length }));
  report.scratch = tmp;
  writeReport(); console.log(JSON.stringify(report.summary));
  assert(report.summary.every(x => x.total >= 40 && x.killed === x.total), "all behavioral mutants must be assertion-killed");
} else if (mode === "differential") {
  const { buildView } = await import(pathToFileURL(path.join(specRoot, "adaptor/jaryo-adaptor.mjs")).href);
  const { buildJournalView } = await import(pathToFileURL(path.join(specRoot, "adaptor/nisi-journal-adaptor.mjs")).href);
  const baselineRoot = arg("--baseline-root");
  const baseline = baselineRoot ? await import(pathToFileURL(path.join(baselineRoot, "adaptor/jaryo-adaptor.mjs")).href) : null;
  let seed = 0x8a6f21c9;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  const choose = xs => xs[random() % xs.length];
  const clocks = [0, -0, 0.5, -0.5, DATE_LIMIT, DATE_LIMIT - 1, -DATE_LIMIT, -DATE_LIMIT + 1, 1800000000000,
    NaN, Infinity, -Infinity, DATE_LIMIT + 1, -DATE_LIMIT - 1, Number.MAX_VALUE, "0", null, false];
  let adaptorInputs = 0, baselineComparisons = 0, journalClocks = 0, refusedClocks = 0;
  for (let i = 0; i < 8192; i++) {
    const status = choose(["failed", "ok", "blocked", "review", "other"]), exit = choose([-7, 0, 1, 2, 126, 255, 0.5, undefined, null]);
    const reason = choose([undefined, null, "", " \t", "explicit explanation", "  preserved whitespace  ", "<reason> & \u00e9"]);
    const tail = Array.from({ length: random() % 4 }, (_, j) => `line ${i}:${j}`);
    const now = choose(clocks), text = record(status, exit, reason, tail);
    const inputManifest = { ...manifest, name: "Pipeline " + i, steps: [{ ...manifest.steps[0], name: "Step " + i }] };
    let iso = null; if (typeof now === "number") { try { iso = new Date(now).toISOString(); } catch {} }
    adaptorInputs++;
    if (iso === null) {
      assert.throws(() => buildView(inputManifest, text, now), TypeError); assert.throws(() => buildJournalView(inputManifest, "", now), TypeError);
      refusedClocks++; journalClocks++; continue;
    }
    const value = buildView(inputManifest, text, now), s = value.steps[0];
    assert.equal(value.generatedAt, iso); assert.equal(buildJournalView(inputManifest, "", now).generatedAt, iso); journalClocks++;
    const state = status === "failed" && exit === 0 || status === "ok" && typeof exit === "number" && exit !== 0 ? "UNKNOWN"
      : ({ failed: "FAILED", ok: "OK", blocked: "BLOCKED", review: "REVIEW" }[status] || "UNKNOWN");
    assert.equal(s.state, state);
    if (state === "FAILED") assert.equal(s.reason, typeof reason === "string" && reason.trim() ? reason
      : "This step ran and failed" + (typeof exit === "number" && Number.isFinite(exit) ? `: exit ${exit}` : "") + ". See its last output.");
    if (baseline) {
      const old = baseline.buildView(inputManifest, text, now);
      if (state === "FAILED") old.steps[0].reason = s.reason;
      assert.deepEqual(value, old); baselineComparisons++;
    }
  }
  const template = fs.readFileSync(path.join(specRoot, "adaptor/view-template.html"), "utf8");
  let templateInputs = 0, templatePages = 0;
  for (let batch = 0; batch < 64; batch++) {
    const rows = Array.from({ length: 64 }, (_, i) => {
      const state = choose(["FAILED", "BLOCKED", "OK", "UNKNOWN", "REVIEW", "RUNNING"]);
      const s = step(i, state, Array.from({ length: random() % 4 }, (_, j) => `<output ${batch}:${i}:${j}> & \u00e9`), choose([null, "reason", "<reason> & \u00e9"]));
      s.name = "Step " + batch + ":" + i;
      if (random() % 8 === 0) s.lastRun = null;
      return s;
    });
    const view = fixture(rows), { dom, d, errors } = boot(template, view), buttons = [...d.querySelectorAll(".step")]; templatePages++;
    assert.equal(buttons.length, rows.length);
    for (const [i, s] of rows.entries()) {
      buttons[i].click(); templateInputs++;
      assert.equal(errors.length, 0); assert.equal(buttons[i].getAttribute("aria-label"), `${s.name}, step id ${s.id}, ${s.state.toLowerCase()}${s.consequential ? ", consequential" : ""}${s.reason ? ", " + s.reason : ""}`);
      assert.equal(d.getElementById("live").textContent, `Selected ${s.name}, ${s.state.toLowerCase()}.`);
      const inspector = d.getElementById("insp"), pre = inspector.querySelector("pre");
      assert(inspector.querySelector(".acts"));
      if (s.lastRun?.tail.length) { assert.equal(pre?.textContent, s.lastRun.tail.join("\n")); assert.equal(pre?.getAttribute("aria-label"), "Last recorded output of " + s.name); }
      else assert.equal(pre, null);
    }
    [...d.querySelectorAll("button")].find(b => b.textContent === "Preview the run review (does nothing)").click();
    assert(d.getElementById("rev-body").textContent.includes(`${view.review.counts.blocked} blocked, ${view.review.counts.failed} failed,`));
    dom.window.close();
  }
  report.summary = { adaptorInputs, journalClocks, refusedClocks, baselineComparisons, templateInputs, templatePages, mismatches: 0 };
  writeReport(); console.log(JSON.stringify(report.summary));
} else throw new Error("usage: view-contract-harness.mjs mutations|differential [--baseline-root <spec>] [--output <json>]");
