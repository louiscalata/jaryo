// Tests for adaptor/view-template.html and build-view-page.mjs. Needs JSDOM=<path to jsdom>.
// The view document is untrusted data: it must never become markup or script.
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { createRequire } from "node:module"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require(process.env.JSDOM);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { buildView } = await import(pathToFileURL(path.join(root, "adaptor/jaryo-adaptor.mjs")).href);
let failed = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { failed++; console.log("FAIL", m); } else console.log("PASS", m); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jaryo-render-"));
const LS = String.fromCharCode(0x2028);

function page(view) {
  const vp = path.join(tmp, "v.json"), out = path.join(tmp, "p.html");
  fs.writeFileSync(vp, JSON.stringify(view));
  const r = spawnSync("node", [path.join(root, "adaptor/build-view-page.mjs"), vp, out], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return fs.readFileSync(out, "utf8");
}
function boot(html, errors) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", err => { if (errors) errors.push(err); else console.error(err); });
  const dom = new JSDOM(html, { virtualConsole, runScripts: "dangerously", pretendToBeVisual: true, url: "http://127.0.0.1/",
    beforeParse(w) { w.HTMLDialogElement.prototype.showModal = function () { this.open = true; }; w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event("close")); }; } });
  return dom.window;
}

const HOSTILE = `</script><img src=x onerror=alert(1)><b>bold</b>"'\`${LS}<!--`;
const man = { id: "h" + HOSTILE, name: "N" + HOSTILE, declares: { actions: ["run", "logs"], events: true }, steps: [
  { id: "s1", name: "S1 " + HOSTILE, needs: [] }, { id: "s2", name: "S2", needs: ["s1"], consequential: true } ] };
const rec = [{ event: "run-start", run: 1, ts: new Date().toISOString() }, { step: "s1", status: "ok", exit: 0, ts: new Date().toISOString(), tail: [HOSTILE] },
  { step: "ghost" + HOSTILE, status: "ok", ts: new Date().toISOString() }, { event: "run-end", ts: new Date().toISOString() }].map(x => JSON.stringify(x)).join("\n");
const view = buildView(man, rec, Date.now());
const html = page(view);

ok((html.match(/<script/g) || []).length === 2, "hostile text cannot add or close a script element");
ok(!html.includes("<img src=x"), "the hostile img tag is not present as markup in the built page");
const w = boot(html), d = w.document;
ok(d.querySelectorAll("img,b,iframe,svg,object").length === 0, "no element is created from hostile text");
ok(d.body.textContent.includes("onerror=alert(1)"), "the hostile text is displayed as plain text");
ok(d.querySelectorAll(".step").length === 3, "two declared steps and one undiscovered step are rendered");
ok(/Read-only snapshot/.test(d.getElementById("ro").textContent) && /cannot run or change anything/.test(d.getElementById("ro").textContent), "the page says it is a read-only snapshot");
ok(/event stream: declared/.test(d.getElementById("caps").textContent) && /not declared: pause/.test(d.getElementById("caps").textContent), "capabilities say 'not declared' for missing actions");

// selection, in place
const btns = [...d.querySelectorAll(".step")];
btns[0].click();
ok(btns[0].getAttribute("aria-pressed") === "true" && btns[1].getAttribute("aria-pressed") === "false" && d.querySelectorAll(".step")[0] === btns[0], "selecting updates the same button in place");
ok(/Selected/.test(d.getElementById("live").textContent) && d.getElementById("insp").querySelector("h2").textContent.startsWith("S1"), "selection is announced and shown");
ok(btns[2].getAttribute("aria-label").startsWith("Undiscovered step, record id ghost") && /unknown/.test(btns[2].getAttribute("aria-label")), "an undiscovered step is named as such, with its record id");
ok(btns[1].classList.contains("gated") && /consequential/.test(btns[1].getAttribute("aria-label")), "a consequential step is marked in text and in its name");

// review preview
const run = [...d.querySelectorAll("button")].find(b => /Preview the run review/.test(b.textContent));
ok(!!run, "the run action is labelled as a preview that does nothing");
run.click();
ok(d.getElementById("rev").open && /S2/.test(d.getElementById("rev-gated").textContent), "the review names the consequential step");
ok(!/will not run/.test(d.getElementById("rev-body").textContent), "the review makes no prediction beyond the record");
d.getElementById("rev-close").click();
ok(!d.getElementById("rev").open, "the review closes");

// FAILED is its own state (spec v0.6, section 5): same words as the record, a shape that is not BLOCKED's
const fm = { id: "f", name: "F", declares: { actions: ["run"], events: false }, steps: [
  { id: "a", name: "A", needs: [] }, { id: "b", name: "B", needs: ["a"] }, { id: "c", name: "C", needs: ["b"] } ] };
const fr = [{ event: "run-start", run: 1, ts: new Date().toISOString() }, { step: "a", status: "failed", exit: 1, ts: new Date().toISOString() },
  { step: "b", status: "blocked", reason: "needs a (failed)", ts: new Date().toISOString() }, { step: "c", status: "ok", exit: 0, ts: new Date().toISOString() }, { event: "run-end", ts: new Date().toISOString() }].map(x => JSON.stringify(x)).join("\n");
const fd = boot(page(buildView(fm, fr, Date.now()))).document, fb = [...fd.querySelectorAll(".step")];
const chipOf = b => b.querySelector(".chip");
ok(/\[FAILED\]/.test(chipOf(fb[0]).textContent) && /\[BLOCKED\]/.test(chipOf(fb[1]).textContent) && /\[OK\]/.test(chipOf(fb[2]).textContent), "a failed step says FAILED and a blocked step says BLOCKED, each in its own word");
ok(fb[0].classList.contains("fail") && !fb[0].classList.contains("bad") && fb[1].classList.contains("bad") && !fb[1].classList.contains("fail"), "a failed row and a blocked row get different shape classes");
ok(chipOf(fb[0]).classList.contains("fail") && !chipOf(fb[0]).classList.contains("bad") && chipOf(fb[1]).classList.contains("bad"), "the FAILED chip and the BLOCKED chip are styled separately");
ok(/^A, step id a, failed(?:,|$)/.test(fb[0].getAttribute("aria-label")) && !/^A, step id a, blocked(?:,|$)/.test(fb[0].getAttribute("aria-label")), "the FAILED row accessible name identifies it as failed, never blocked");
ok(/^B, step id b, blocked, needs a \(failed\)$/.test(fb[1].getAttribute("aria-label")), "the BLOCKED row accessible name identifies its own state before the failed dependency reason");
[...fd.querySelectorAll("button")].find(b => /Preview the run review/.test(b.textContent)).click();
ok(fd.getElementById("rev").open && fd.getElementById("rev-body").textContent === "From the last recorded run: 3 declared steps; 1 blocked, 1 failed, 0 waiting for a go-ahead, 0 unknown or undiscovered.", "the review dialog names and separately counts blocked and failed steps");
const css = fd.querySelector("style").textContent;
const rule = sel => (css.match(new RegExp("(?:^|[}\\s])" + sel.replace(/[.\[\]"=()]/g, "\\$&") + "\\s*\\{([^}]*)\\}")) || [])[1] || "";
ok(/border-left:\s*6px solid/.test(rule(".step.fail")) && !/background/.test(rule(".step.fail")) && /double/.test(rule(".step.bad")), "FAILED is an unfilled row with a solid 6px rule; BLOCKED keeps its fill and double rule");
ok(rule(".chip.fail") !== "" && !/background/.test(rule(".chip.fail")) && /background/.test(rule(".chip.bad")), "the FAILED chip is an outline; the BLOCKED chip is filled");
ok(/border[^;]*blocked-sel/.test(rule('.step.fail[aria-pressed="true"]')), "a selected FAILED row keeps its rule, drawn in the selected-state ink");

// A recorded result may have no output, including a failure that printed nothing.
for (const [status, exit] of [["failed", 1], ["ok", 0], ["blocked", null], ["review", null]]) {
  const errors = [], stamp = new Date().toISOString();
  const emptyRecord = [{ event: "run-start", run: 1, ts: stamp }, { step: "s1", status, exit, ms: 3, ts: stamp, tail: [] }, { event: "run-end", ts: stamp }].map(x => JSON.stringify(x)).join("\n");
  const ew = boot(page(buildView({ id: "empty", name: "Empty", declares: { actions: ["run"] }, steps: [{ id: "s1", name: "S1", needs: [] }] }, emptyRecord)), errors), ed = ew.document;
  ed.querySelector(".step").click();
  ok(errors.length === 0, `selecting a ${status} step with an empty output tail raises no exception`);
  ok(!!ed.querySelector("#insp .acts button") && /Preview the run review/.test(ed.querySelector("#insp .acts").textContent), `the ${status} empty-tail inspector keeps its action area`);
  ok(ed.getElementById("live").textContent === `Selected S1, ${status}.`, `the ${status} empty-tail selection is announced exactly`);
  ok(ed.querySelector("#insp pre") === null && /Last recorded: exit/.test(ed.getElementById("insp").textContent), `the ${status} empty-tail inspector shows the recorded result without an empty output region`);
  ew.close();
}
const output = d.querySelector("#insp pre");
ok(output && output.getAttribute("role") === "region" && output.getAttribute("tabindex") === "0" && output.getAttribute("aria-label") === "Last recorded output of " + view.steps[0].name && output.textContent === HOSTILE, "a nonempty output tail remains a named focusable region with literal output");

// failure modes
const w2 = boot(page({ schema: "something-else", steps: [] })).document;
ok(/Could not display this record/.test(w2.getElementById("warn").textContent) && w2.querySelectorAll(".step").length === 0, "a document with the wrong schema is refused, not half-rendered");
const bad = JSON.parse(JSON.stringify(view)); delete bad.actions;
const w3 = boot(page(bad)).document;
ok(/Could not display this record/.test(w3.getElementById("warn").textContent), "a document missing required fields is refused");
const stale = buildView({ ...man, declares: { ...man.declares, heartbeat: { intervalMs: 5000, staleAfterMs: 30000 } }, steps: [{ id: "s1", name: "S1", needs: [] }] },[{ event: "run-start", run: 1, ts: new Date().toISOString() }, { step: "s1", event: "step-start", ts: new Date().toISOString() }].map(x => JSON.stringify(x)).join("\n"), Date.now());
ok(stale.steps[0].state === "RUNNING", "(setup) a fresh record shows RUNNING");
stale.generatedAt = new Date(Date.now() - 10 * 60000).toISOString();
const w4 = boot(page(stale)).document;
ok(/UNKNOWN/.test(w4.querySelector(".step .chip").textContent) && /older than 2 minutes/.test(w4.querySelector(".step").getAttribute("aria-label")), "an old snapshot never shows RUNNING");
const warned = buildView(man, rec + "\n{broken", Date.now());
ok(/Record problem/.test(boot(page(warned)).document.getElementById("warn").textContent), "record warnings are shown prominently");

// source hygiene
const tpl = fs.readFileSync(path.join(root, "adaptor/view-template.html"), "utf8");
ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(tpl), "the template never builds markup from data");
// The child runs the same checks from the copied spec without copying recursively.
if (!process.argv.includes("--path-copy-child")) {
  const copy = path.join(tmp, "sp ace %41 é#q");
  fs.cpSync(root, copy, { recursive: true });
  const child = spawnSync(process.execPath, [path.join(copy, "tests/render.test.mjs"), "--path-copy-child"], { encoding: "utf8", timeout: 30000 });
  ok(child.status === 0 && /\d+\/\d+ passed/.test(child.stdout) && !/^FAIL /m.test(child.stdout), "the render checks pass when spec is copied to a path with spaces, a percent escape, Unicode and a hash");
  if (child.status !== 0) console.error(child.stdout, child.stderr);
}
console.log(`${n - failed}/${n} passed`);
process.exit(failed ? 1 : 0);
