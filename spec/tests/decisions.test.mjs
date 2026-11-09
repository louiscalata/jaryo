import fs from "node:fs"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { JSDOM } = require(process.env.JSDOM);
const src = fs.readFileSync(process.argv[2], "utf8");
function boot(mut, { narrow = false } = {}) {
  const html = mut ? mut(src) : src;
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "http://127.0.0.1/" ,
    beforeParse(w) { w.__narrow = narrow; w.matchMedia = q => ({ get matches() { return w.__narrow; }, addEventListener() {}, removeEventListener() {} }); w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(v){ this.open = false; if (v!==undefined) this.returnValue=v; this.dispatchEvent(new w.Event("close")); }; w.CSS = { escape: s => s.replace(/[^\w-]/g, c => "\\" + c) }; w.HTMLElement.prototype.scrollIntoView = () => {}; } });
  return dom.window;
}
const ok = (c, m) => { if (!c) { console.log("FAIL", m); process.exitCode = 1; } else console.log("PASS", m); };
// 1. F12: optional group with a BLOCKED step opens itself and cannot hide
{
  const w = boot(s => s.replace('h: "Add region from address", state: "ok"', 'h: "Add region from address", state: "blocked", reason: "needs: geo key"'));
  const d = w.document, ug = d.getElementById("ug");
  ok(!d.getElementById("opt-list").hidden, "F12 blocked inside → group open");
  ok(/opened: 1 inside needs attention/.test(ug.textContent) && ug.getAttribute("aria-disabled") === "true", "F12 says why and cannot hide: " + ug.textContent.trim());
  ug.click(); ok(!d.getElementById("opt-list").hidden, "F12 click does not hide");
}
// 1b. unchanged default
{ const w = boot(); ok(w.document.getElementById("opt-list").hidden && /\[\+2 optional\]/.test(w.document.getElementById("ug").textContent), "F12 clean group stays collapsed"); }
// 2. Fork chooser on Next
{
  const w = boot(), d = w.document;
  d.querySelector('.step[data-id="score_risk"]').click();
  const n = d.getElementById("t-next");
  ok(/choose \(2\)/.test(n.textContent) && n.getAttribute("aria-haspopup") === "dialog", "fork: Next says choose (2): " + n.textContent.trim());
  n.click();
  const br = d.getElementById("branches");
  ok(br.open && d.querySelectorAll("#br-list [data-branch]").length === 2, "fork: chooser lists 2 branches");
  d.querySelector('#br-list [data-branch="audit_log"]').click();
  ok(!br.open && d.querySelector('.step[aria-pressed="true"]').dataset.id === "audit_log", "fork: picking a branch selects it");
  d.querySelector('.step[data-id="dedupe_v2"]').click();
  ok(!/choose/.test(n.textContent) && n.dataset.go === "score_risk", "non-fork: Next goes straight on");
}
// 4. Event tick resets per run
{
  const w = boot(), d = w.document;
  d.querySelector('.step[data-id="score_risk"]').click();
  for (let i = 0; i < 9; i++) d.getElementById("sim-event").click();
  const t1 = d.querySelector('.step[data-id="score_risk"] .tick').textContent;
  ok(/12 this run/.test(t1) && /========>/.test(t1), "tick fills and counts this run: " + t1.trim());
  d.getElementById("sim-run").click();
  const t2 = d.querySelector('.step[data-id="score_risk"] .tick');
  ok(/0 this run/.test(t2.textContent) && /0 events in run #43/.test(d.querySelector('.step[data-id="score_risk"]').getAttribute("aria-label")), "new run resets to 0: " + t2.textContent.trim());
}

// 1c. F12: UNKNOWN and review steps also force the group open
for (const [label, mut] of [
  ["unknown", s => s.replace('h: "Keep a 1% sample", state: "ok"', 'h: "Keep a 1% sample", state: "unknown"')],
  ["review", s => s.replace('h: "Keep a 1% sample", state: "ok"', 'h: "Keep a 1% sample", state: "ok", review: true')],
]) {
  const w = boot(mut), d = w.document;
  ok(!d.getElementById("opt-list").hidden && d.getElementById("ug").getAttribute("aria-disabled") === "true", `F12 ${label} inside → open and cannot hide`);
}
// 2b. Phone: Escape with the chooser open closes only the chooser; ⌘K is ignored; the sheet keeps focus rules
{
  const w = boot(null, { narrow: true }), d = w.document;
  // jsdom has no layout (offsetParent is always null); on a phone the thumb bar IS laid out, so declare it visible
  for (const id of ["t-next", "t-prev", "t-primary", "t-more"]) Object.defineProperty(d.getElementById(id), "offsetParent", { get: () => d.body });
  d.querySelector('.step[data-id="score_risk"]').click();
  ok(d.getElementById("inspector").classList.contains("sheet-open"), "phone: sheet opens");
  d.getElementById("t-next").click();
  const br = d.getElementById("branches");
  ok(br.open, "phone: chooser open");
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
  ok(!d.getElementById("palette-bg").classList.contains("open"), "⌘K ignored while chooser open");
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  ok(d.getElementById("inspector").classList.contains("sheet-open"), "Escape with chooser open does not close the sheet");
  br.close();
  ok(d.activeElement && d.activeElement.id === "t-next", "chooser cancel returns focus to Next");
}
// 2c. Branch chosen after the thumb bar became hidden → focus lands on a visible control, not the hidden Next
{
  const w = boot(), d = w.document;
  d.querySelector('.step[data-id="score_risk"]').click();
  const t = d.getElementById("t-next");
  Object.defineProperty(t, "offsetParent", { get: () => null }); // thumb bar hidden (wide layout)
  t.click();
  d.querySelector('#br-list [data-branch="?u1"]').click();
  const a = d.activeElement;
  ok(a && a.id !== "t-next" && (a.id === "insp-h" || a.closest("#insp")), "after widening, chosen branch focuses inside the inspector: " + (a && (a.id || a.textContent.trim().slice(0, 30))));
}

// 2d. Narrow → wide while the chooser is open: closeSheet clears inert but must NOT pull focus out of the open chooser
{
  const w = boot(null, { narrow: true }), d = w.document;
  for (const id of ["t-next", "t-prev", "t-primary", "t-more"]) Object.defineProperty(d.getElementById(id), "offsetParent", { get: () => d.body });
  d.querySelector('.step[data-id="score_risk"]').click();
  d.getElementById("t-next").click();
  const br = d.getElementById("branches");
  const inChooser = () => d.activeElement && d.activeElement.closest("#branches");
  ok(br.open && inChooser() && d.querySelector(".spine-wrap").inert, "narrow: chooser open, focus inside, spine inert");
  w.__narrow = false; w.dispatchEvent(new w.Event("resize"));
  ok(!d.getElementById("inspector").classList.contains("sheet-open") && !d.querySelector(".spine-wrap").inert, "widen: sheet closed, inert cleared");
  ok(br.open && inChooser(), "widen: focus stays in the open chooser");
}
