// Focused contracts for recorded output, spoken status and caller-supplied clocks.
// Run separately from the ordinary suites; JSDOM must name an existing jsdom package.
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATE_LIMIT = 8640000000000000;
export const manifest = { id: "p", name: "Pipeline", declares: { actions: ["run", "logs"], events: false },
  steps: [{ id: "s", name: "Step", needs: [] }] };
export const record = (status, exit, reason, tail = []) => [
  { event: "run-start", run: 1, ts: "2026-01-01T00:00:00.000Z" },
  { step: "s", status, exit, reason, ms: 3, tail, ts: "2026-01-01T00:00:00.000Z" },
  { event: "run-end", run: 1, ts: "2026-01-01T00:00:00.000Z" },
].map(x => JSON.stringify(x)).join("\n");

export function boot(template, view) {
  const require = createRequire(import.meta.url), { JSDOM, VirtualConsole } = require(process.env.JSDOM);
  const errors = [], console = new VirtualConsole(); console.on("jsdomError", e => errors.push(e.message));
  const safe = JSON.stringify(view).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  const dom = new JSDOM(template.replace("@@VIEW@@", () => safe), { runScripts: "dangerously", virtualConsole: console,
    beforeParse(w) {
      w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
      w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event("close")); };
    } });
  return { dom, d: dom.window.document, errors };
}

export function fixture(steps) {
  return { schema: "jaryo-view/0", generatedAt: new Date().toISOString(), lastEventAt: null,
    pipeline: { id: "p", name: "Pipeline" }, run: { id: 1, state: "ended", startedAt: null },
    capabilities: { declared: ["run", "logs"], eventStream: false },
    actions: [{ id: "run", available: true, review: true }, { id: "logs", available: true },
      { id: "retry", available: false, reason: "n/a: manifest does not declare retry" }],
    steps, undeclared: [], warnings: [], review: { consequentialSteps: steps.filter(s => s.consequential).map(s => s.id),
      counts: { total: steps.length, blocked: steps.filter(s => s.state === "BLOCKED").length,
        failed: steps.filter(s => s.state === "FAILED").length, review: steps.filter(s => s.state === "REVIEW").length,
        unknown: steps.filter(s => s.state === "UNKNOWN").length } } };
}

export function step(i, state, tail = [], reason = null) {
  return { id: "s" + i, name: "Step " + i, state, reason, needs: ["before" + i], next: ["after" + i],
    consequential: i % 2 === 1, lastRun: { exit: state === "FAILED" ? i + 1 : 0, ms: i + 3, tail } };
}

export async function contracts(specRoot = root, kind = "all", quiet = false) {
  let n = 0, failed = 0;
  const ok = (condition, label) => { n++; if (!condition) { failed++; console.log("FAIL CONTRACT", label); } else if (!quiet) console.log("PASS", label); };
  if (kind !== "template") {
    const { buildView } = await import(pathToFileURL(path.join(specRoot, "adaptor/jaryo-adaptor.mjs")).href);
    const { buildJournalView } = await import(pathToFileURL(path.join(specRoot, "adaptor/nisi-journal-adaptor.mjs")).href);
    const invalid = [NaN, Infinity, -Infinity, DATE_LIMIT + 1, -DATE_LIMIT - 1, Number.MAX_VALUE, -Number.MAX_VALUE,
      "0", null, true, false, {}, [], 1n];
    for (const [label, build] of [["record", n => buildView(manifest, "", n)], ["journal", n => buildJournalView(manifest, "", n)]]) {
      for (const now of invalid) {
        let error; try { build(now); } catch (e) { error = e; }
        ok(error instanceof TypeError && /now.*finite.*Date range/.test(error.message), `${label} refuses invalid clock ${String(now)}`);
      }
      for (const now of [0, -0, 0.5, -0.5, 1, -1, DATE_LIMIT, DATE_LIMIT - 1, -DATE_LIMIT, -DATE_LIMIT + 1, 1800000000000]) {
        let value, error; try { value = build(now); } catch (e) { error = e; }
        ok(!error && value.generatedAt === new Date(now).toISOString(), `${label} keeps valid clock ${now}`);
      }
    }
    for (const exit of [-7, 1, 2, 126, 255, 0.5, 1000000000]) {
      for (const reason of [undefined, null, "", "  \t\n", 0, false, {}]) {
        const s = buildView(manifest, record("failed", exit, reason), 1800000000000).steps[0];
        ok(s.state === "FAILED" && s.reason === `This step ran and failed: exit ${exit}. See its last output.`, `FAILED exit ${exit} has a reason for ${JSON.stringify(reason)}`);
      }
    }
    for (const exit of [undefined, null, Infinity, -Infinity, NaN, "1"]) {
      const s = buildView(manifest, record("failed", exit), 1800000000000).steps[0];
      ok(s.state === "FAILED" && s.reason === "This step ran and failed. See its last output.", `FAILED unknown exit ${String(exit)} does not invent a code`);
    }
    for (const token of ["1e400", "-1e400"]) {
      const text = record("failed", 1).replace('"exit":1', '"exit":' + token);
      ok(buildView(manifest, text, 1800000000000).steps[0].reason === "This step ran and failed. See its last output.", "overflowed JSON exit " + token + " does not invent a code");
    }
    for (const reason of ["compiler stopped", "  specific reason  ", "<failed> & output", "\u00e9chec"]) {
      ok(buildView(manifest, record("failed", 1, reason), 1800000000000).steps[0].reason === reason, "explicit FAILED reason is preserved " + JSON.stringify(reason));
    }
    const contradictory = buildView(manifest, record("failed", 0), 1800000000000).steps[0];
    ok(contradictory.state === "UNKNOWN" && /contradicts/.test(contradictory.reason), "failed exit zero remains contradictory");
    for (const status of ["ok", "blocked", "review"]) {
      ok(buildView(manifest, record(status, status === "ok" ? 0 : undefined), 1800000000000).steps[0].reason === null, status + " does not acquire a FAILED reason");
    }
  }
  if (kind !== "adaptor") {
    const template = fs.readFileSync(path.join(specRoot, "adaptor/view-template.html"), "utf8");
    const states = ["FAILED", "FAILED", "BLOCKED", "OK", "UNKNOWN", "REVIEW", "RUNNING"];
    const rows = states.map((s, i) => step(i, s, i === 1 ? ["single line"] : i % 2 ? ["line one", "line two"] : [], "reason " + i));
    const view = fixture(rows), { dom, d, errors } = boot(template, view);
    const buttons = [...d.querySelectorAll(".step")];
    ok(buttons.length === rows.length, "every declared row exists");
    for (const [i, s] of rows.entries()) {
      const button = buttons[i]; if (!button) continue;
      const glyph = { FAILED: "✕", BLOCKED: "✕", OK: "●", UNKNOWN: "?", REVIEW: "◆", RUNNING: "▶" }[s.state];
      const style = { FAILED: "fail", BLOCKED: "bad", OK: "ok", UNKNOWN: "unk", REVIEW: "rev", RUNNING: "run" }[s.state];
      ok(button.tagName === "BUTTON" && button.querySelector(".chip")?.textContent === `${glyph} [${s.state}]`
        && button.querySelector(".chip")?.classList.contains(style), `row ${i} uses its status symbol, class and button semantics`);
      const expected = `${s.name}, step id ${s.id}, ${s.state.toLowerCase()}${s.consequential ? ", consequential" : ""}, ${s.reason}`;
      ok(button.getAttribute("aria-label") === expected, `row ${i} exposes its exact accessible name`);
      button.click();
      ok(errors.length === 0, `row ${i} selection does not throw`);
      ok(button.getAttribute("aria-pressed") === "true" && buttons.filter(b => b.getAttribute("aria-pressed") === "true").length === 1, `row ${i} is the only selected row`);
      ok(d.getElementById("live").textContent === `Selected ${s.name}, ${s.state.toLowerCase()}.`, `row ${i} announces exact status`);
      const inspector = d.getElementById("insp"), pre = inspector.querySelector("pre");
      ok(inspector.querySelector("h2")?.textContent === s.name, `row ${i} inspector names the step`);
      ok(inspector.querySelector(".chip")?.textContent.endsWith(`[${s.state}]`), `row ${i} inspector retains the status word`);
      ok(inspector.textContent.includes(s.reason), `row ${i} inspector includes its reason`);
      ok(inspector.textContent.includes(`needs: before${i} | feeds: after${i}`), `row ${i} inspector has dependencies`);
      ok(inspector.textContent.includes(`Last recorded: exit ${s.lastRun.exit}, ${s.lastRun.ms} ms`), `row ${i} inspector has run metadata`);
      ok(!!inspector.querySelector(".acts") && inspector.querySelectorAll(".acts button").length === 2, `row ${i} inspector has its action area`);
      ok(inspector.textContent.includes("logs (declared; not wired in this page)")
        && inspector.querySelector('.acts [aria-disabled="true"]')?.getAttribute("aria-label") === "retry, not available. n/a: manifest does not declare retry", `row ${i} actions retain availability words`);
      ok(s.lastRun.tail.length ? !!pre && pre.textContent === s.lastRun.tail.join("\n") && pre.getAttribute("role") === "region"
        && pre.getAttribute("tabindex") === "0" && pre.getAttribute("aria-label") === "Last recorded output of " + s.name : pre === null,
      `row ${i} output region follows its recorded tail`);
    }
    [...d.querySelectorAll("button")].find(b => b.textContent === "Preview the run review (does nothing)")?.click();
    ok(d.getElementById("rev").open, "review preview opens");
    ok(d.getElementById("rev-body").textContent === "From the last recorded run: 7 declared steps; 1 blocked, 2 failed, 1 waiting for a go-ahead, 1 unknown or undiscovered.", "review pins failed and blocked counts in readable text");
    ok(d.getElementById("rev-gated").textContent === "Consequential steps: Step 1, Step 3, Step 5.", "review lists consequential steps");
    d.getElementById("rev-close").click(); ok(!d.getElementById("rev").open, "review closes");
    dom.window.close();
  }
  if (!quiet || failed) console.log(`${n - failed}/${n} view contracts passed`);
  return { passed: n - failed, total: n, failed };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const arg = flag => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };
  const result = await contracts(arg("--root") || root, arg("--kind") || "all", process.argv.includes("--quiet"));
  process.exitCode = result.failed ? 1 : 0;
}
