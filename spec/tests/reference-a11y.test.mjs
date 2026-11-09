// Accessibility structure checks for the two reference screens. Needs JSDOM=<path to jsdom>.
// These check markup, not what a screen reader says.
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { JSDOM } = require(process.env.JSDOM);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
let failed = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { failed++; console.log("FAIL", m); } else console.log("PASS", m); };
const boot = f => new JSDOM(fs.readFileSync(path.join(root, f), "utf8"), { runScripts: "dangerously", pretendToBeVisual: true, url: "http://127.0.0.1/",
  beforeParse(w) { w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); w.HTMLDialogElement.prototype.showModal = function () { this.open = true; }; w.HTMLDialogElement.prototype.close = function () { this.open = false; }; w.HTMLElement.prototype.scrollIntoView = () => {}; w.alert = () => {}; } }).window;
const unnamedRole = d => [...d.querySelectorAll("span[aria-label],pre[aria-label],div[aria-label],p[aria-label]")].filter(e => !e.getAttribute("role")).map(e => e.tagName + "[" + e.getAttribute("aria-label") + "]");

{ // app reference
  const w = boot("reference/index.html"), d = w.document;
  ok(d.querySelectorAll("main").length === 1 && d.querySelector("main #spine") && d.querySelector("main #inspector"), "app: one main landmark holds the spine and the inspector");
  ok(d.querySelectorAll("h1").length === 1 && /Nightly orders/.test(d.querySelector("h1").textContent), "app: one h1 names the pipeline");
  ok(unnamedRole(d).length === 0, "app: no aria-label on an element without a role: " + unnamedRole(d).join(","));
  const names = [...d.querySelectorAll(".step")].map(s => s.getAttribute("aria-label"));
  ok(names.length > 5 && names.every(x => !/[●▶✕?◆\[\]]/.test(x)), "app: step names have words, not glyphs or brackets: " + names.slice(0, 2).join(" | "));
  ok(/step id fetch_orders, ok/.test(names[0]) && names.some(x => /not declared by adaptor, unknown/.test(x)) && names.some(x => /blocked/.test(x)), "app: names still carry id, state word and the undeclared marker");
  const scoring = d.querySelector('.step[data-id="score_risk"]');
  ok(/events in run #\d+/.test(scoring.getAttribute("aria-label")) && !scoring.querySelector(".tick[aria-label]"), "app: the event count is in the step's name, not on a label-only span");
  d.querySelector('.step[data-id="dedupe_v2"]').click();
  ok(!/[●▶✕◆\[\]]/.test(d.getElementById("live").textContent) && /selected\. ok\./.test(d.getElementById("live").textContent), "app: the selection announcement says the state word: " + d.getElementById("live").textContent.trim());
  const ids = [...d.querySelectorAll("[id]")].map(e => e.id); ok(new Set(ids).size === ids.length, "app: no duplicate ids");
  ok([...d.querySelectorAll("[aria-labelledby]")].every(e => e.getAttribute("aria-labelledby").split(" ").every(i => d.getElementById(i))), "app: every aria-labelledby target exists");
}
{ // website reference
  const w = boot("reference/hero.html"), d = w.document;
  const hrefs = [...d.querySelectorAll("a[href^='#']")].map(a => a.getAttribute("href").slice(1));
  ok(hrefs.length >= 2 && hrefs.every(h => d.getElementById(h)), "hero: every in-page link has a target: " + hrefs.join(","));
  ok(d.getElementById("connect").tagName === "BUTTON", "hero: 'Open connect UI' is a button, not a link");
  ok(unnamedRole(d).length === 0, "hero: no aria-label on an element without a role: " + unnamedRole(d).join(","));
  const labels = [...d.querySelectorAll(".result .lbl")].map(e => e.textContent);
  ok(labels.length === 2 && /Before/.test(labels[0]) && /After/.test(labels[1]), "hero: Before and After are visible labels");
  ok(d.querySelectorAll("main").length === 1 && d.querySelectorAll("h1").length === 1, "hero: one main and one h1");
  const css = fs.readFileSync(path.join(root, "reference/hero.html"), "utf8");
  ok(/\.result \.row \{[^}]*minmax\(0, 1fr\) 24px minmax\(0, 1fr\)/.test(css) && /\.result \.row > div \{ min-width: 0; \}/.test(css), "hero: the Before/After grid items may shrink, so large text scrolls inside the pre instead of widening the page");
  ok(d.getElementById("copied").getAttribute("aria-live") === "polite", "hero: the copy confirmation is a live region");
}
console.log(`${n - failed}/${n} passed`);
process.exit(failed ? 1 : 0);
