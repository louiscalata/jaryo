/**
 * Pure DOM unit checks (jsdom) — no Shell GUI / no browser automation.
 * Covers Import Tab-order markup, reset surface clear, recovery download binding.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAB = path.join(__dirname, "..");
const require = createRequire(import.meta.url);
function loadJsdom() {
  const candidates = [
    process.env.JARYO_JSDOM_PATH,
    "/tmp/jsdom-install/node_modules/jsdom",
    path.join(LAB, ".test-deps/node_modules/jsdom"),
    "jsdom",
  ].filter(Boolean);
  for (const c of candidates) {
    try { return require(c); } catch (_) {}
  }
  return null;
}
const jsdomMod = loadJsdom();
const JSDOM = jsdomMod ? jsdomMod.JSDOM : null;

const html = fs.readFileSync(path.join(LAB, "index.html"), "utf8");
const labJs = fs.readFileSync(path.join(LAB, "lab.js"), "utf8");
const curated = JSON.parse(fs.readFileSync(path.join(LAB, "data/curated-85.json"), "utf8"));

// Static HTML: Import is a real button in toolbar; file input not a focusable label-only control
{
  assert.match(html, /id="btn-import"/);
  assert.match(html, /aria-controls="import-file"/);
  assert.doesNotMatch(html, /<label class="btn" for="import-file">/);
  assert.match(html, /id="import-file"[^>]*class="sr-only"/);
  assert.match(html, /id="import-file"[^>]*tabindex="-1"/);
  // toolbar button order includes import among peers
  const toolbar = html.slice(html.indexOf('class="toolbar"'), html.indexOf("</div>", html.indexOf('class="toolbar"')));
  const order = ["btn-copy", "btn-download", "btn-import", "btn-recovery", "btn-reset"];
  let pos = -1;
  for (const id of order) {
    const i = toolbar.indexOf(`id="${id}"`);
    assert.ok(i > pos, id);
    pos = i;
  }
  console.log("html-import-taborder: PASS");
}

// Source contracts
{
  assert.match(labJs, /getElementById\("btn-import"\)|\$\("#btn-import"\)/);
  assert.match(labJs, /importBtn\.addEventListener\("click"/);
  assert.match(labJs, /importInput\.click\(\)/);
  assert.match(labJs, /function refreshChoiceSurfaces/);
  assert.match(labJs, /No selections/);
  assert.match(labJs, /addEventListener\("click", downloadRecoveryRaw\)/);
  assert.match(labJs, /jaryo-lab-recovery-raw\.json/);
  console.log("source-a11y-reset-recovery: PASS");
}

if (!JSDOM) {
  console.log("dom-tests: SKIP (jsdom not installed on this host; HTML/source asserts above still PASS)");
  console.log("test_lab_dom: PASS (static)");
  process.exit(0);
}

function bootDom() {
  const dom = new JSDOM(html, {
    url: "http://127.0.0.1:8765/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const { document } = window;
  // jsdom built-in localStorage (lab closes over global localStorage)
  window.localStorage.clear();
  const store = window.localStorage;
  // fetch → fail so embedded path used
  window.fetch = async () => { throw new Error("no-network"); };
  window.JARYO_LAB_DATA = curated;
  // capture downloads
  const downloads = [];
  window.URL.createObjectURL = (blob) => {
    downloads.push(blob);
    return "blob:test";
  };
  window.URL.revokeObjectURL = () => {};
  // click() on <a download> records intent
  const origCreate = document.createElement.bind(document);
  document.createElement = function (tag) {
    const el = origCreate(tag);
    if (tag.toLowerCase() === "a") {
      el.click = function () {
        downloads.push({ href: el.href, download: el.download, tag: "a" });
      };
    }
    return el;
  };
  window.alert = () => {};
  // run lab
  window.eval(labJs);
  // DOMContentLoaded
  document.dispatchEvent(new window.Event("DOMContentLoaded"));
  return { window, document, store, downloads };
}

// Allow microtasks/boot
await new Promise((r) => setTimeout(r, 20));
const ctx = bootDom();
await new Promise((r) => setTimeout(r, 50));

{
  const { document } = ctx;
  const importBtn = document.getElementById("btn-import");
  const importInput = document.getElementById("import-file");
  assert.ok(importBtn);
  assert.equal(importBtn.tagName, "BUTTON");
  assert.equal(importBtn.getAttribute("type"), "button");
  // button is not disabled / not aria-hidden
  assert.notEqual(importBtn.getAttribute("aria-hidden"), "true");
  assert.equal(importBtn.tabIndex, 0); // default button tabIndex resolves to 0 in jsdom often as 0 or -1; check not -1 if default
  // file input is programmatically hidden from a11y tree intent
  assert.ok(importInput.classList.contains("sr-only"));
  assert.equal(importInput.getAttribute("tabindex"), "-1");
  assert.equal(importInput.getAttribute("aria-hidden"), "true");
  // keyboard-equivalent: button click opens file input (spy)
  let clicked = false;
  importInput.click = () => { clicked = true; };
  importBtn.dispatchEvent(new ctx.window.MouseEvent("click", { bubbles: true }));
  assert.equal(clicked, true);
  console.log("dom-import-button-activation: PASS");
}

{
  const { document, window } = ctx;
  // Choose F01.01 via radio
  const radio = document.querySelector('input[type="radio"][value="F01.01"]');
  assert.ok(radio, "F01.01 radio present after boot");
  radio.checked = true;
  radio.dispatchEvent(new window.Event("change", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 10));
  const card = document.querySelector('.opt-card[data-id="F01.01"]');
  assert.ok(card.classList.contains("chosen"));
  assert.match(card.querySelector(".chosen-marker").textContent, /CHOSEN/);
  const live = document.getElementById("choice-live");
  assert.match(live.textContent, /F01\.01/);

  // Reset
  document.getElementById("btn-reset").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 10));

  // User-visible selection surfaces must not keep CHOSEN / checked after successful reset
  const chosenCards = [...document.querySelectorAll(".opt-card.chosen")];
  assert.equal(chosenCards.length, 0, "no .chosen cards after reset");
  const markers = [...document.querySelectorAll(".chosen-marker")].map((m) => m.textContent.trim()).filter(Boolean);
  assert.deepEqual(markers, [], `stale CHOSEN markers: ${JSON.stringify(markers)}`);
  const checked = [...document.querySelectorAll('input[type="radio"]:checked')];
  assert.equal(checked.length, 0, "no checked radios after reset");
  assert.equal(live.textContent, "No selections");
  // Journey frames must not still list the prior option id as a retained choice bit
  const journeys = document.getElementById("journeys");
  if (journeys) {
    assert.doesNotMatch(journeys.textContent, /F01\.01/);
  }
  console.log("dom-reset-clears-chosen: PASS");
}

{
  const { document, window, store, downloads } = ctx;
  // Seed malformed recovery raw via localStorage then reboot is heavy; call download path by setting recovery via malformed load.
  // Simulate: expose recovery by putting bad storage and reloading script is hard.
  // Instead: invoke Download recovery after forcing button visible with retained raw through choose+corrupt path.
  // Direct: set storage malformed, recreate boot.
}
// Fresh boot with malformed storage → recovery button + download content
{
  const dom = new JSDOM(html, {
    url: "http://127.0.0.1:8765/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const { document } = window;
  // Use jsdom's real localStorage (lab closes over that global, not a replaced property).
  window.localStorage.clear();
  window.localStorage.setItem("jaryo-adaptive-lab-choices-v1", "{not-json");
  window.fetch = async () => { throw new Error("no-network"); };
  window.JARYO_LAB_DATA = curated;
  const downloaded = [];
  const OrigBlob = window.Blob;
  window.Blob = function (parts, opts) {
    const blob = new OrigBlob(parts, opts);
    blob.__parts = parts;
    downloaded.push({ kind: "blob-parts", parts, opts });
    return blob;
  };
  window.URL.createObjectURL = (blob) => {
    downloaded.push({ kind: "object-url", blob });
    return "blob:rec";
  };
  window.URL.revokeObjectURL = () => {};
  const origCreate = document.createElement.bind(document);
  document.createElement = function (tag) {
    const el = origCreate(tag);
    if (tag.toLowerCase() === "a") {
      el.click = function () {
        downloaded.push({ kind: "a", download: el.download, href: el.href });
      };
    }
    return el;
  };
  window.eval(labJs);
  document.dispatchEvent(new window.Event("DOMContentLoaded"));
  await new Promise((r) => setTimeout(r, 50));
  const btn = document.getElementById("btn-recovery");
  assert.equal(btn.hidden, false, "recovery button visible when raw retained");
  btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 10));
  const partsEntry = downloaded.find((d) => d.kind === "blob-parts");
  assert.ok(partsEntry, "recovery Blob constructed");
  assert.equal(String(partsEntry.parts[0]), "{not-json");
  assert.equal(partsEntry.opts && partsEntry.opts.type, "application/json");
  const aMeta = downloaded.find((d) => d.kind === "a");
  assert.ok(aMeta, "anchor click fired");
  assert.equal(aMeta.download, "jaryo-lab-recovery-raw.json");
  console.log("dom-recovery-download: PASS");
}

// Another tab's storage event: adopt a foreign writerId, ignore our own, warn on garbage.
{
  const { window, document } = bootDom();
  await new Promise((r) => setTimeout(r, 50));
  const pick = (id) => {
    const radio = document.querySelector(`input[type="radio"][value="${id}"]`);
    assert.ok(radio, id);
    radio.checked = true;
    radio.dispatchEvent(new window.Event("change", { bubbles: true }));
  };
  const showFam = (id) => {
    document.querySelector(`[data-fam="${id}"]`).dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  };
  pick("F01.01");
  await new Promise((r) => setTimeout(r, 10));
  const before = JSON.parse(window.localStorage.getItem("jaryo-adaptive-lab-choices-v1"));
  const selfId = before.writerId;
  assert.equal(before.choices.F01, "F01.01");
  assert.equal(typeof selfId, "string");

  const foreignRaw = JSON.stringify({
    schemaVersion: 1,
    catalogVersion: curated.version,
    revision: 1,
    writerId: "lab-other",
    choices: { F02: "F02.03" },
  });
  window.localStorage.setItem("jaryo-adaptive-lab-choices-v1", foreignRaw);
  window.dispatchEvent(new window.StorageEvent("storage", {
    key: "jaryo-adaptive-lab-choices-v1",
    newValue: foreignRaw,
    storageArea: window.localStorage,
  }));
  assert.equal(window.localStorage.getItem("jaryo-adaptive-lab-choices-v1"), foreignRaw, "adopt must not write back");
  assert.match(document.getElementById("storage-banner").textContent, /Another tab saved selections/);
  showFam("F02");
  assert.ok(document.querySelector('.opt-card[data-id="F02.03"]').classList.contains("chosen"));

  showFam("F01");
  pick("F01.02");
  await new Promise((r) => setTimeout(r, 10));
  const merged = JSON.parse(window.localStorage.getItem("jaryo-adaptive-lab-choices-v1"));
  assert.equal(merged.writerId, selfId);
  assert.equal(merged.choices.F01, "F01.02");
  assert.equal(merged.choices.F02, "F02.03", "local save must keep the other tab's family");

  window.localStorage.setItem("jaryo-adaptive-lab-theme", "dark");
  window.dispatchEvent(new window.StorageEvent("storage", {
    key: "jaryo-adaptive-lab-theme",
    newValue: "dark",
  }));
  assert.doesNotMatch(document.getElementById("storage-banner").textContent, /could not read/);
  assert.equal(JSON.parse(window.localStorage.getItem("jaryo-adaptive-lab-choices-v1")).choices.F02, "F02.03");

  const echoRaw = JSON.stringify({ schemaVersion: 1, writerId: selfId, choices: { F03: "F03.01" } });
  window.localStorage.setItem("jaryo-adaptive-lab-choices-v1", echoRaw);
  window.dispatchEvent(new window.StorageEvent("storage", {
    key: "jaryo-adaptive-lab-choices-v1",
    newValue: echoRaw,
  }));
  showFam("F01");
  assert.ok(document.querySelector('.opt-card[data-id="F01.02"]').classList.contains("chosen"), "own writerId is ignored");

  window.localStorage.setItem("jaryo-adaptive-lab-choices-v1", "{");
  window.dispatchEvent(new window.StorageEvent("storage", {
    key: "jaryo-adaptive-lab-choices-v1",
    newValue: "{",
  }));
  assert.match(document.getElementById("storage-banner").textContent, /could not read/);
  assert.equal(window.localStorage.getItem("jaryo-adaptive-lab-choices-v1"), "{");
  assert.ok(document.querySelector('.opt-card[data-id="F01.02"]').classList.contains("chosen"));
  console.log("dom-foreign-storage: PASS");
}

console.log("test_lab_dom: PASS");
