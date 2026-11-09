// Tests for adaptor/view-template.html and build-view-page.mjs. Needs JSDOM=<path to jsdom>.
// The view document is untrusted data: it must never become markup or script.
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { createRequire } from "node:module"; import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { JSDOM } = require(process.env.JSDOM);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const { buildView } = await import(path.join(root, "adaptor/jaryo-adaptor.mjs"));
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
function boot(html) {
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "http://127.0.0.1/",
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

// failure modes
const w2 = boot(page({ schema: "something-else", steps: [] })).document;
ok(/Could not display this record/.test(w2.getElementById("warn").textContent) && w2.querySelectorAll(".step").length === 0, "a document with the wrong schema is refused, not half-rendered");
const bad = JSON.parse(JSON.stringify(view)); delete bad.actions;
const w3 = boot(page(bad)).document;
ok(/Could not display this record/.test(w3.getElementById("warn").textContent), "a document missing required fields is refused");
const stale = buildView({ ...man, steps: [{ id: "s1", name: "S1", needs: [] }] }, [{ event: "run-start", run: 1, ts: new Date().toISOString() }, { step: "s1", event: "step-start", ts: new Date().toISOString() }].map(x => JSON.stringify(x)).join("\n"), Date.now());
ok(stale.steps[0].state === "RUNNING", "(setup) a fresh record shows RUNNING");
stale.generatedAt = new Date(Date.now() - 10 * 60000).toISOString();
const w4 = boot(page(stale)).document;
ok(/UNKNOWN/.test(w4.querySelector(".step .chip").textContent) && /older than 2 minutes/.test(w4.querySelector(".step").getAttribute("aria-label")), "an old snapshot never shows RUNNING");
const warned = buildView(man, rec + "\n{broken", Date.now());
ok(/Record problem/.test(boot(page(warned)).document.getElementById("warn").textContent), "record warnings are shown prominently");

// source hygiene
const tpl = fs.readFileSync(path.join(root, "adaptor/view-template.html"), "utf8");
ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(tpl), "the template never builds markup from data");
console.log(`${n - failed}/${n} passed`);
process.exit(failed ? 1 : 0);
