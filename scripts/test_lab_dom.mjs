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
  console.error("dom-tests: FAIL (jsdom is not installed)");
  process.exit(1);
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
  window.sessionStorage.setItem("jaryo-adaptive-lab-choices-v1", foreignRaw);
  window.dispatchEvent(new window.StorageEvent("storage", {
    key: "jaryo-adaptive-lab-choices-v1",
    newValue: foreignRaw,
    storageArea: window.sessionStorage,
  }));
  assert.equal(window.localStorage.getItem("jaryo-adaptive-lab-choices-v1"), JSON.stringify(before), "sessionStorage must not change saved choices");
  showFam("F02");
  assert.equal(document.querySelector('.opt-card[data-id="F02.03"]').classList.contains("chosen"), false, "sessionStorage must not change displayed choices");
  showFam("F01");
  assert.ok(document.querySelector('.opt-card[data-id="F01.01"]').classList.contains("chosen"));

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

  const unreadableWrites = [
    "{", "[]", "null", "   ",
    JSON.stringify({ schemaVersion: 1, writerId: "lab-other" }),
    JSON.stringify({ schemaVersion: 1, choices: [] }),
  ];
  for (const unreadable of unreadableWrites) {
    window.localStorage.setItem("jaryo-adaptive-lab-choices-v1", unreadable);
    window.dispatchEvent(new window.StorageEvent("storage", {
      key: "jaryo-adaptive-lab-choices-v1",
      newValue: unreadable,
      storageArea: window.localStorage,
    }));
    assert.match(document.getElementById("storage-banner").textContent, /could not read/);
    assert.equal(window.localStorage.getItem("jaryo-adaptive-lab-choices-v1"), unreadable, "unreadable write must not be overwritten");
    assert.ok(document.querySelector('.opt-card[data-id="F01.02"]').classList.contains("chosen"), "unreadable write must preserve displayed choices");
  }

  window.localStorage.clear();
  window.dispatchEvent(new window.StorageEvent("storage", {
    key: null,
    newValue: null,
    storageArea: window.localStorage,
  }));
  assert.match(document.getElementById("storage-banner").textContent, /Another tab cleared/);
  assert.equal(document.querySelectorAll('.opt-card.chosen').length, 0);
  assert.equal(window.localStorage.getItem("jaryo-adaptive-lab-choices-v1"), null, "clear event must not write back");
  pick("F01.03");
  await new Promise((r) => setTimeout(r, 10));
  const afterClear = JSON.parse(window.localStorage.getItem("jaryo-adaptive-lab-choices-v1"));
  assert.equal(afterClear.choices.F01, "F01.03");
  assert.equal(afterClear.choices.F02, undefined, "a later save must not restore cleared foreign choices");
  console.log("dom-foreign-storage: PASS");
}

// Execute the real closure with a test-only observation point, never a production API.
// No resource loader, network, browser engine, or application test double is used.
const storageKey = "jaryo-adaptive-lab-choices-v1";
const defaultBanner = "Selections save in this browser only (localStorage). A saved choice is a preference, not a product change.";
async function persistenceDom({ raw = null, readFails = false, catalogFails = false, stages = false } = {}) {
  const dom = new JSDOM(html, { url: "https://jaryo.test/", runScripts: "outside-only" });
  const { window } = dom;
  if (raw !== null) window.localStorage.setItem(storageKey, raw);
  const proto = window.Storage.prototype;
  const getItem = proto.getItem;
  const setItem = proto.setItem;
  const writes = [];
  let saveFails = false;
  proto.getItem = function (key) {
    if (readFails && key === storageKey) throw new Error("read blocked");
    return getItem.call(this, key);
  };
  proto.setItem = function (key, value) {
    if (saveFails && key === storageKey) throw new Error("quota");
    writes.push(key);
    return setItem.call(this, key, value);
  };
  window.fetch = async () => { throw new Error("offline fixture"); };
  if (!catalogFails) window.JARYO_LAB_DATA = stages
    ? JSON.parse(fs.readFileSync(path.join(LAB, "data/curated-extended.json"), "utf8"))
    : curated;
  window.setTimeout = () => 0;
  if (stages) window.eval(fs.readFileSync(path.join(LAB, "lab-stages.js"), "utf8"));
  window.eval(labJs.replace('document.addEventListener("DOMContentLoaded", boot);', `
    window.__persistenceTest = { boot, saveChoices, resetChoices, importPayloadText, exportPayload,
      snapshot: () => ({ status: persistenceStatus, storageOk, recoveryRaw,
        choices, rejects: persistenceRejects, envelopeCatalogVersion }) };
  `));
  const api = window.__persistenceTest;
  await api.boot();
  return {
    window, document: window.document, api, writes,
    failSaves: () => { saveFails = true; },
    allowSaves: () => { saveFails = false; },
    foreign: (value, area = window.localStorage, key = storageKey) => {
      window.dispatchEvent(new window.StorageEvent("storage", { key, newValue: value, storageArea: area }));
    },
    state: () => JSON.parse(JSON.stringify({ ...api.snapshot(),
      exportStatus: api.exportPayload().persistenceStatus,
      banner: window.document.getElementById("storage-banner").textContent,
      bannerClass: window.document.getElementById("storage-banner").className,
    })),
    close: () => window.close(),
  };
}

let persistencePassed = 0;
let persistenceFailed = 0;
async function persistenceCase(name, options, run) {
  const c = await persistenceDom(options);
  try {
    await run(c);
    persistencePassed++;
    console.log("PASS persistence", name);
  } catch (error) {
    persistenceFailed++;
    console.error("FAIL persistence", name, error.message);
  } finally { c.close(); }
}
function stateIs(c, status, { storageOk = status !== "unavailable", bannerClass = storageOk && status !== "malformed" ? "banner warn" : "banner err", ...rest } = {}) {
  const actual = c.state();
  for (const [key, value] of Object.entries({ status, exportStatus: status, storageOk, bannerClass, ...rest })) {
    assert.deepEqual(actual[key], value, key);
  }
}
const envelope = (choices, catalogVersion = curated.version) => JSON.stringify({ schemaVersion: 1, catalogVersion, revision: 1, writerId: "lab-other", choices });

await persistenceCase("card background selects without hijacking controls", { stages: true }, (c) => {
  const { document, window } = c;
  const go = (family) => document.querySelector(`[data-fam="${family}"]`).click();
  const card = (id) => document.querySelector(`.opt-card[data-id="${id}"]`);
  const saved = (family) => JSON.parse(window.localStorage.getItem(storageKey)).choices[family];
  const assertSelected = (id) => {
    const selected = card(id);
    assert.equal(saved(id.slice(0, 3)), id);
    assert.ok(selected.classList.contains("chosen"));
    assert.equal(selected.querySelector("input[type=radio]").checked, true);
    assert.equal(selected.querySelector("input[type=radio]").tabIndex, 0);
    assert.equal(document.querySelectorAll("#cards input[type=radio]:checked").length, 1);
    assert.equal(selected.querySelector(".chosen-marker").textContent, "CHOSEN");
  };
  for (const id of ["F07.03", "F15.02"]) {
    go(id.slice(0, 3));
    card(id).querySelector(".body").click();
    assertSelected(id);
  }
  go("F01");
  card("F01.01").click();
  assertSelected("F01.01");
  card("F01.02").querySelector(".preview-stage svg").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assertSelected("F01.02");
  const label = card("F01.03").querySelector(".choose-label");
  const before = c.writes.length;
  label.querySelector(".choose-text").click();
  assertSelected("F01.03");
  assert.equal(c.writes.length - before, 1, "label activation saves only once");
  card("F01.04").querySelector("input[type=radio]").click();
  assertSelected("F01.04");
  const expand = card("F01.01").querySelector(".expand-btn");
  expand.click();
  assert.equal(expand.getAttribute("aria-expanded"), "true");
  assertSelected("F01.04");
  go("F19");
  const previewButton = card("F19.04").querySelectorAll("[data-pick]")[1];
  assert.ok(previewButton);
  assert.equal(previewButton.getAttribute("aria-pressed"), "false");
  previewButton.querySelector("span").click();
  assert.equal(previewButton.getAttribute("aria-pressed"), "true");
  assert.equal(c.api.exportPayload().choices.F19, undefined, "preview control must not choose its card");
});

// Characterization: these cases pass on untouched main as well as the explicit machine.
for (const [name, raw, status, choices, reasons] of [
  ["missing", null, "missing", {}, []],
  ["empty storage", "", "missing", {}, []],
  ["empty map", "{}", "missing", {}, []],
  ["legacy map", '{"F01":"F01.01"}', "valid", { F01: "F01.01" }, []],
  ["envelope", envelope({ F02: "F02.01" }), "valid", { F02: "F02.01" }, []],
  ["partial", envelope({ F01: "F01.01", F99: "x" }), "partial", { F01: "F01.01" }, ["unknown-family"]],
  ["rejected only", '{"F01":"F02.01","F02":"F02.99","F03":3}', "malformed", {}, ["cross-family-or-retired", "retired-or-unknown-option", "non-string-option"]],
  ["JSON parse failure", "{", "malformed", {}, ["json-parse-failed"]],
  ["non-object", "[]", "malformed", {}, ["expected-object-map"]],
  ["catalog mismatch", envelope({ F01: "F01.01" }, "old"), "catalog-mismatch", { F01: "F01.01" }, ["catalog-mismatch"]],
]) {
  await persistenceCase("load/normalize " + name, { raw }, (c) => {
    stateIs(c, status, { choices });
    assert.deepEqual(c.state().rejects.map((r) => r.reason), reasons);
    if (!reasons.length) assert.equal(c.state().banner, defaultBanner);
    else {
      const diagnosis = name === "JSON parse failure" ? "Stored selections were malformed and were not applied. Raw bytes retained — use Download recovery raw."
        : name === "non-object" ? "Stored selections were not an object map and were not applied. Raw bytes retained — use Download recovery raw."
        : name === "catalog mismatch" ? `Catalog version in stored/imported envelope differs from this lab (old ≠ ${curated.version}). Valid entries kept; confirm before treating as authoritative.`
        : "Selections save in this browser only (localStorage).";
      assert.equal(c.state().banner, `${diagnosis} Rejected ${reasons.length} invalid stored entr${reasons.length === 1 ? "y" : "ies"} (status=${status}). A saved choice is a preference, not a product change.`);
    }
    if (reasons.length) assert.equal(c.state().recoveryRaw, raw);
    assert.equal(c.writes.length, 0, "loading never writes storage");
  });
}
await persistenceCase("load storage unavailable", { readFails: true }, (c) => {
  stateIs(c, "unavailable", { recoveryRaw: null, choices: {}, banner: "Storage unavailable or blocked — choices will not persist: read blocked A saved choice is a preference, not a product change." });
});
await persistenceCase("pending catalog stays internal if boot fails", { raw: envelope({ F01: "F01.01" }), catalogFails: true }, (c) => {
  assert.equal(c.api.snapshot().status, "pending-catalog");
  assert.match(c.document.getElementById("main").textContent, /Failed to load/);
  assert.equal(c.document.getElementById("btn-reset"), null);
  assert.equal(c.document.getElementById("btn-download"), null);
  assert.equal(c.writes.length, 0, "failed boot cannot save or export");
});
await persistenceCase("save format, keys, JSON export shape and stable revision", {}, (c) => {
  const radio = c.document.querySelector('input[value="F01.01"]');
  radio.checked = true;
  radio.dispatchEvent(new c.window.Event("change", { bubbles: true }));
  stateIs(c, "valid", { recoveryRaw: null, banner: defaultBanner });
  const stored = JSON.parse(c.window.localStorage.getItem(storageKey));
  assert.deepEqual(Object.keys(stored), ["schemaVersion", "catalogVersion", "revision", "writerId", "choices"]);
  assert.equal(stored.schemaVersion, 1);
  assert.equal(stored.catalogVersion, curated.version);
  assert.equal(stored.revision, 1);
  assert.match(stored.writerId, /^lab-/);
  assert.deepEqual(stored.choices, { F01: "F01.01" });
  c.api.saveChoices();
  assert.equal(JSON.parse(c.window.localStorage.getItem(storageKey)).revision, 1);
  const exported = JSON.parse(JSON.stringify(c.api.exportPayload()));
  assert.deepEqual(Object.keys(exported), ["artifact", "schemaVersion", "catalogVersion", "writerId", "notice", "exported_at_utc", "persistenceStatus", "acceptedCount", "copper_note", "choices", "rejects", "by_family"]);
  assert.equal(exported.artifact, "jaryo-adaptive-lab-choices");
  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.writerId, stored.writerId);
  assert.equal(exported.catalogVersion, stored.catalogVersion);
  assert.equal(exported.notice, "A saved choice is a preference, not a product change. Demo data is fictional.");
  assert.equal(exported.copper_note, "Copper is an example palette in the color set, not the default.");
  assert.equal(new Date(exported.exported_at_utc).toISOString(), exported.exported_at_utc);
  assert.equal(exported.acceptedCount, 1);
  assert.deepEqual(exported.choices, stored.choices);
  assert.deepEqual(exported.rejects, []);
  assert.equal(exported.by_family.length, 17);
  assert.deepEqual(exported.by_family[0], { family: "F01", title: curated.families[0].title, choice: "F01.01", name: curated.families[0].options[0].name });
  assert.deepEqual(Object.keys(exported.by_family[1]), ["family", "title", "choice", "name"]);
  assert.equal(exported.by_family[1].choice, null);
  assert.equal(exported.by_family[1].name, null);
  assert.deepEqual(c.writes, [storageKey, storageKey]);
});
await persistenceCase("save failure and retry", {}, (c) => {
  c.failSaves();
  assert.equal(c.api.saveChoices(), false);
  stateIs(c, "unavailable", { banner: "Could not save selections (kept in memory only): quota" });
  c.allowSaves();
  assert.equal(c.api.saveChoices(), true);
  stateIs(c, "missing", { banner: defaultBanner });
});
await persistenceCase("reset success", { raw: envelope({ F01: "F01.01" }) }, (c) => {
  c.api.resetChoices();
  stateIs(c, "missing", { choices: {}, rejects: [], recoveryRaw: null, envelopeCatalogVersion: null, banner: defaultBanner });
  assert.deepEqual(JSON.parse(c.window.localStorage.getItem(storageKey)).choices, {});
  assert.equal(c.document.getElementById("toast").textContent, "Selections reset and cleared from storage.");
});
await persistenceCase("imports reject without mutation and merge valid families", { raw: envelope({ F02: "F02.01" }) }, (c) => {
  const prior = c.state();
  for (const [raw, message] of [["", "Import rejected: empty payload. Existing selections unchanged."], ["{", "Import JSON parse failed. Existing selections unchanged."], ["null", "Import must be an object map or envelope with choices. Existing selections unchanged."], ["{}", "Empty import rejected; existing selections unchanged. Use Reset to clear intentionally."], ['{"F99":"x"}', "Import rejected: 1 entry none matched the curated catalog. Existing selections unchanged."]]) {
    assert.deepEqual(JSON.parse(JSON.stringify(c.api.importPayloadText(raw))), { ok: false, message });
    assert.deepEqual(c.state(), prior);
  }
  const result = c.api.importPayloadText(envelope({ F01: "F01.02", F99: "x" }));
  assert.equal(result.ok, true);
  assert.equal(result.message, "Merged 1 validated choice(s) (1 changed, 0 already same); 1 rejected. Prior families not in import kept. Saved.");
  stateIs(c, "partial", { choices: { F02: "F02.01", F01: "F01.02" }, recoveryRaw: null, banner: defaultBanner });
});
await persistenceCase("import mismatch survives successful save", {}, (c) => {
  c.api.importPayloadText(envelope({ F01: "F01.01" }, "old"));
  stateIs(c, "catalog-mismatch", { banner: "Imported envelope catalogVersion differs from this lab. Valid entries merged; not treated as authoritative without review. A saved choice is a preference, not a product change." });
});
await persistenceCase("ordinary save keeps rejected raw; successful import clears recovery", { raw: "{" }, (c) => {
  const radio = c.document.querySelector('input[value="F01.01"]');
  radio.checked = true;
  radio.dispatchEvent(new c.window.Event("change", { bubbles: true }));
  stateIs(c, "partial", { recoveryRaw: "{", choices: { F01: "F01.01" }, banner: defaultBanner });
  c.api.importPayloadText(envelope({ F02: "F02.01" }));
  stateIs(c, "valid", { recoveryRaw: null, choices: { F01: "F01.01", F02: "F02.01" } });
});
await persistenceCase("failed import save intentionally keeps merge and mismatch reject", { raw: envelope({ F02: "F02.01" }) }, (c) => {
  c.failSaves();
  const result = c.api.importPayloadText(envelope({ F01: "F01.01" }, "old"));
  assert.equal(result.ok, true);
  assert.equal(result.message, "Merged 1 validated choice(s) (1 changed, 0 already same); 1 rejected. Prior families not in import kept. Kept in memory only (save failed).");
  stateIs(c, "unavailable", { choices: { F02: "F02.01", F01: "F01.01" }, banner: "Could not save selections (kept in memory only): quota" });
  assert.equal(c.state().rejects[0].reason, "catalog-mismatch");
  assert.deepEqual(JSON.parse(c.window.localStorage.getItem(storageKey)).choices, { F02: "F02.01" });
});
await persistenceCase("foreign adopt, warn content, clear and event filters", { raw: envelope({ F01: "F01.01" }) }, (c) => {
  const saved = envelope({ F02: "F02.01" });
  const prior = c.state();
  c.foreign(saved, c.window.sessionStorage);
  c.foreign(saved, c.window.localStorage, "jaryo-adaptive-lab-theme");
  c.foreign(JSON.stringify({ writerId: c.api.exportPayload().writerId, choices: {} }));
  assert.deepEqual(c.state(), prior);
  c.foreign(saved);
  stateIs(c, "valid", { choices: { F02: "F02.01" }, recoveryRaw: null, banner: "Another tab saved selections. This tab loaded them so a later save does not overwrite that tab. A saved choice is a preference, not a product change." });
  c.foreign("{");
  assert.deepEqual(c.state().choices, { F02: "F02.01" });
  assert.equal(c.state().banner, "Another tab wrote selections this tab could not read. They were not applied. A save here would overwrite that tab. A saved choice is a preference, not a product change.");
  c.foreign(null, c.window.localStorage, null);
  stateIs(c, "missing", { choices: {}, rejects: [], recoveryRaw: null, banner: "Another tab cleared saved selections. This tab dropped them so a later save does not write them back. A saved choice is a preference, not a product change." });
  assert.equal(c.writes.length, 0, "foreign events never write back");
});
await persistenceCase("radio and tab keyboard contracts", {}, (c) => {
  const radios = [...c.document.querySelectorAll('#cards input[type="radio"]')];
  for (const [key, from, to] of [["ArrowRight", 4, 0], ["ArrowDown", 0, 1], ["ArrowLeft", 0, 4], ["ArrowUp", 1, 0], ["End", 0, 4], ["Home", 4, 0], [" ", 2, 2], ["Spacebar", 3, 3]]) {
    radios[from].focus();
    const event = new c.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    radios[from].dispatchEvent(event);
    assert.equal(event.defaultPrevented, true, key);
    assert.equal(c.document.activeElement, radios[to], key);
    assert.equal(c.api.exportPayload().choices.F01, radios[to].value, key);
  }
  const before = c.window.localStorage.getItem(storageKey);
  radios[0].dispatchEvent(new c.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(c.window.localStorage.getItem(storageKey), before);
  const tabs = [...c.document.querySelectorAll(".tab")];
  for (const [key, from, to] of [["ArrowRight", 3, 0], ["ArrowLeft", 0, 3], ["Home", 3, 0], ["End", 0, 3]]) {
    tabs[from].focus();
    const event = new c.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    tabs[from].dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(c.document.activeElement, tabs[to]);
    assert.equal(tabs[to].getAttribute("aria-selected"), "true");
    assert.equal(tabs[to].tabIndex, 0);
  }
});

// Regression expectations: each must fail against untouched main before implementation.
await persistenceCase("regression: failed reset exports unavailable while preserving choices", { raw: envelope({ F01: "F01.01" }) }, (c) => {
  c.failSaves();
  c.api.resetChoices();
  stateIs(c, "unavailable", { choices: { F01: "F01.01" }, banner: "Could not save selections (kept in memory only): quota" });
  assert.equal(c.document.getElementById("toast").textContent, "Persistent reset failed; existing selections preserved in memory.");
});
await persistenceCase("regression: healthy load has no recovery download", { raw: envelope({ F01: "F01.01" }) }, (c) => {
  stateIs(c, "valid", { recoveryRaw: null });
  assert.equal(c.document.getElementById("btn-recovery").hidden, true);
});
await persistenceCase("regression: foreign unreadable storage exports malformed", { raw: envelope({ F01: "F01.01" }) }, (c) => {
  c.foreign("{");
  stateIs(c, "malformed", { choices: { F01: "F01.01" }, recoveryRaw: "{" });
  assert.equal(JSON.parse(c.document.getElementById("export-box").textContent).persistenceStatus, "malformed");
  assert.match(c.state().banner, /could not read/);
  assert.equal(c.writes.length, 0);
});
for (const [raw, status, choices] of [[null, "missing", {}], [envelope({ F02: "F02.01" }), "valid", { F02: "F02.01" }]]) {
  await persistenceCase("regression: foreign " + status + " clears stale unavailable flag", {}, (c) => {
    c.failSaves();
    c.api.saveChoices();
    c.foreign(raw);
    stateIs(c, status, { choices });
    assert.equal(c.writes.length, 0);
  });
}
console.log(`TOTAL ${persistencePassed} / ${persistencePassed + persistenceFailed} persistence DOM cases`);
if (persistenceFailed) process.exitCode = 1;
console.log(`test_lab_dom: ${persistenceFailed ? "FAIL" : "PASS"}`);

// Keep preview-state regressions in the existing Node DOM check.
await import("./test_preview_state.mjs");
