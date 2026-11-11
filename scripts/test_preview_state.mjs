/** Node/jsdom checks for the interactive preview widgets. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const candidates = [process.env.JARYO_JSDOM_PATH, "/tmp/jsdom-install/node_modules/jsdom", path.join(root, ".test-deps/node_modules/jsdom"), "jsdom"].filter(Boolean);
let JSDOM;
for (const candidate of candidates) {
  try { ({ JSDOM } = require(candidate)); break; } catch (_) {}
}
if (!JSDOM) throw new Error("jsdom is not installed");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const lab = fs.readFileSync(path.join(root, "lab.js"), "utf8");
const stages = fs.readFileSync(path.join(root, "lab-stages.js"), "utf8");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data/curated-extended.json"), "utf8"));

async function boot() {
  const dom = new JSDOM(html, { url: "http://127.0.0.1:8765/", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  window.fetch = async () => { throw new Error("no-network"); };
  window.JARYO_LAB_DATA = catalog;
  window.alert = () => {};
  window.eval(stages);
  window.eval(lab);
  await new Promise((resolve) => setTimeout(resolve, 30));
  return dom;
}
function click(document, selector) {
  const element = document.querySelector(selector);
  assert.ok(element, selector);
  element.click();
}
function card(document, id) { return document.querySelector(`.opt-card[data-id="${id}"]`); }
function family(document, id) { click(document, `[data-fam="${id}"]`); }

test("widget labels, defaults, controls and choice envelope retain their public behavior", async () => {
  const dom = await boot();
  try {
    const { document, localStorage, Event } = dom.window;
    family(document, "F19");
    let c = card(document, "F19.01");
    assert.deepEqual([...c.querySelectorAll("[data-frame-set]")].map((b) => [b.textContent, b.getAttribute("data-frame-set"), b.getAttribute("aria-pressed")]), [["Phone", "phone", "true"], ["Fold", "fold", "false"], ["Tablet", "tablet", "false"], ["Desk", "desk", "false"]]);
    assert.deepEqual([...c.querySelectorAll("[data-tone-set]")].map((b) => [b.textContent, b.getAttribute("data-tone-set"), b.getAttribute("aria-pressed")]), [["Paper", "light", "true"], ["Ink", "dark", "false"]]);
    assert.equal(c.querySelector(".jstage-view").getAttribute("data-frame"), "phone");
    assert.equal(c.querySelector(".red").getAttribute("data-tone"), "light");
    assert.equal(c.querySelector(".red").getAttribute("data-align"), "left");
    assert.equal(c.querySelector(".expand-btn").getAttribute("aria-expanded"), "false");
    assert.match(c.querySelector(".expand-btn").textContent, /^Expand preview/);
    c.querySelector('[data-frame-set="desk"]').click();
    c.querySelector('[data-tone-set="dark"]').click();
    c.querySelector('[data-align="center"]').click();
    c.querySelector(".expand-btn").click();
    assert.equal(c.querySelector(".jstage-view").getAttribute("data-frame"), "desk");
    assert.equal(c.querySelector('[data-frame-set="desk"]').getAttribute("aria-pressed"), "true");
    assert.equal(c.querySelector(".red").getAttribute("data-tone"), "dark");
    assert.equal(c.querySelector(".red").getAttribute("data-align"), "center");
    assert.equal(c.querySelector("[data-live]").textContent, "Centered");
    assert.equal(c.querySelector(".expand-btn").getAttribute("aria-expanded"), "true");
    assert.equal(c.querySelector(".expand-btn").textContent, "Collapse preview");
    const radio = c.querySelector('[data-choice="F19.01"]');
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    const saved = JSON.parse(localStorage.getItem("jaryo-adaptive-lab-choices-v1"));
    assert.deepEqual(Object.keys(saved), ["schemaVersion", "catalogVersion", "revision", "writerId", "choices"]);
    assert.equal(saved.schemaVersion, 1);
    assert.equal(saved.catalogVersion, catalog.version);
    assert.equal(saved.revision, 1);
    assert.match(saved.writerId, /^lab-/);
    assert.deepEqual(saved.choices, { F19: "F19.01" });
    const exported = JSON.parse(document.querySelector("#export-box").textContent);
    assert.deepEqual(Object.keys(exported), ["artifact", "schemaVersion", "catalogVersion", "writerId", "notice", "exported_at_utc", "persistenceStatus", "acceptedCount", "copper_note", "choices", "rejects", "by_family"]);
    assert.equal(exported.artifact, "jaryo-adaptive-lab-choices");
    assert.equal(exported.schemaVersion, 1);
    assert.equal(exported.catalogVersion, catalog.version);
    assert.equal(exported.writerId, saved.writerId);
    assert.equal(exported.notice, "A saved choice is a preference, not a product change. Demo data is fictional.");
    assert.equal(exported.persistenceStatus, "valid");
    assert.equal(exported.acceptedCount, 1);
    assert.equal(exported.copper_note, "Copper is an example palette in the color set, not the default.");
    assert.deepEqual(exported.choices, { F19: "F19.01" });
    assert.deepEqual(exported.rejects, []);
    assert.equal(exported.by_family.length, 19);
    assert.equal(card(document, "F19.01"), c, "selecting a choice keeps the mounted widget");
    c = card(document, "F19.03");
    c.querySelector("[data-cycle]").click();
    assert.equal(c.querySelector(".jstage-ui").getAttribute("data-i"), "1");
    assert.equal(c.querySelector(".wm-full").textContent, "AGIW");
    assert.equal(c.querySelector(".wm-short").textContent, "AGW");
    family(document, "F18");
    c = card(document, "F18.02");
    c.querySelector("[data-disclose]").click();
    assert.equal(c.querySelector("[data-disclose]").getAttribute("aria-expanded"), "false");
    assert.equal(c.querySelector("[data-panel]").hidden, true);
    c = card(document, "F18.04");
    c.querySelector("[data-advance]").click();
    assert.equal(c.querySelector("[data-line]").textContent, "The source is still below the streets.");
    c = card(document, "F18.06");
    c.querySelector('[data-step="1"]').click();
    assert.equal(c.querySelector("[data-person]").textContent, "Partner");
    assert.equal(c.querySelector("[data-tag]").textContent, "P2");
  } finally { dom.window.close(); }
});

test("family rebuild restores independent F19 widget and expanded states", async () => {
  const dom = await boot();
  try {
    const { document } = dom.window;
    family(document, "F19");
    let c = card(document, "F19.01");
    c.querySelector('[data-frame-set="desk"]').click();
    c.querySelector('[data-tone-set="dark"]').click();
    c.querySelector('[data-align="center"]').click();
    c.querySelector(".expand-btn").click();
    card(document, "F19.03").querySelector("[data-cycle]").click();
    card(document, "F19.04").querySelector('[data-label="Grid selected"]').click();
    family(document, "F18");
    family(document, "F19");
    c = card(document, "F19.01");
    assert.equal(c.querySelector(".expand-btn").getAttribute("aria-expanded"), "true");
    assert.equal(c.querySelector(".jstage-view").getAttribute("data-frame"), "desk");
    assert.equal(c.querySelector('[data-frame-set="desk"]').getAttribute("aria-pressed"), "true");
    assert.equal(c.querySelector('[data-frame-set="phone"]').getAttribute("aria-pressed"), "false");
    assert.equal(c.querySelector(".red").getAttribute("data-tone"), "dark");
    assert.equal(c.querySelector('[data-tone-set="dark"]').getAttribute("aria-pressed"), "true");
    assert.equal(c.querySelector(".red").getAttribute("data-align"), "center");
    assert.equal(c.querySelector('button[data-align="center"]').getAttribute("aria-pressed"), "true");
    assert.equal(c.querySelector("[data-live]").textContent, "Centered");
    assert.equal(card(document, "F19.03").querySelector(".wm-full").textContent, "AGIW");
    assert.equal(card(document, "F19.04").querySelector('[data-label="Grid selected"]').getAttribute("aria-pressed"), "true");
    assert.equal(card(document, "F19.04").querySelector("[data-live]").textContent, "Grid selected");
    card(document, "F19.03").querySelector("[data-cycle]").click();
    assert.equal(card(document, "F19.03").querySelector(".wm-full").textContent, "OPOS");
  } finally { dom.window.close(); }
});

test("family rebuild restores F18 disclosure, advance, step, and separate pick groups", async () => {
  const dom = await boot();
  try {
    const { document } = dom.window;
    family(document, "F18");
    card(document, "F18.02").querySelector("[data-disclose]").click();
    card(document, "F18.04").querySelector("[data-advance]").click();
    card(document, "F18.06").querySelector('[data-step="1"]').click();
    card(document, "F18.07").querySelector('[data-label="Back"]').click();
    card(document, "F18.07").querySelector('[data-label="Settings"]').click();
    family(document, "F19");
    family(document, "F18");
    assert.equal(card(document, "F18.02").querySelector("[data-disclose]").getAttribute("aria-expanded"), "false");
    assert.equal(card(document, "F18.02").querySelector("[data-panel]").hidden, true);
    assert.equal(card(document, "F18.04").querySelector("[data-line]").textContent, "The source is still below the streets.");
    assert.equal(card(document, "F18.06").querySelector("[data-person]").textContent, "Partner");
    assert.equal(card(document, "F18.07").querySelector('[data-label="Back"]').getAttribute("aria-pressed"), "true");
    assert.equal(card(document, "F18.07").querySelector('[data-label="Settings"]').getAttribute("aria-pressed"), "true");
    assert.equal(card(document, "F18.07").querySelector("[data-live]").textContent, "Settings");
    card(document, "F18.04").querySelector("[data-advance]").click();
    assert.equal(card(document, "F18.04").querySelector("[data-line]").textContent, "Keep the objective on screen.");
  } finally { dom.window.close(); }
});

for (const rebuild of ["reset", "foreign", "import"]) {
  test(`${rebuild} rebuild retains the preview without storing widget state`, async () => {
    const dom = await boot();
    try {
      const { document, localStorage, Event, StorageEvent } = dom.window;
      family(document, "F19");
      let c = card(document, "F19.01");
      c.querySelector('[data-frame-set="desk"]').click();
      c.querySelector('[data-tone-set="dark"]').click();
      c.querySelector(".expand-btn").click();
      const raw = JSON.stringify({ schemaVersion: 1, catalogVersion: catalog.version, revision: 1, writerId: "lab-other", choices: { F01: "F01.01" } });
      if (rebuild === "reset") click(document, "#btn-reset");
      if (rebuild === "foreign") {
        localStorage.setItem("jaryo-adaptive-lab-choices-v1", raw);
        dom.window.dispatchEvent(new StorageEvent("storage", { key: "jaryo-adaptive-lab-choices-v1", newValue: raw, storageArea: localStorage }));
        assert.equal(localStorage.getItem("jaryo-adaptive-lab-choices-v1"), raw);
      }
      if (rebuild === "import") {
        const input = document.querySelector("#import-file");
        Object.defineProperty(input, "files", { configurable: true, value: [{ text: async () => raw }] });
        input.dispatchEvent(new Event("change", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(JSON.parse(localStorage.getItem("jaryo-adaptive-lab-choices-v1")).choices.F01, "F01.01");
      }
      c = card(document, "F19.01");
      assert.equal(c.querySelector(".expand-btn").getAttribute("aria-expanded"), "true");
      assert.equal(c.querySelector(".jstage-view").getAttribute("data-frame"), "desk");
      assert.equal(c.querySelector('[data-frame-set="desk"]').getAttribute("aria-pressed"), "true");
      assert.equal(c.querySelector(".red").getAttribute("data-tone"), "dark");
      const saved = JSON.parse(localStorage.getItem("jaryo-adaptive-lab-choices-v1"));
      assert.deepEqual(Object.keys(saved), ["schemaVersion", "catalogVersion", "revision", "writerId", "choices"]);
    } finally { dom.window.close(); }
  });
}


test("keyboard changes and wrapped indices survive rebuild but not a fresh lab", async () => {
  const dom = await boot();
  try {
    const { document, KeyboardEvent } = dom.window;
    family(document, "F19");
    const phone = card(document, "F19.01").querySelector('[data-frame-set="phone"]');
    phone.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    const wordmark = card(document, "F19.03");
    for (let i = 0; i < 4; i += 1) wordmark.querySelector("[data-cycle]").click();
    assert.equal(wordmark.querySelector(".jstage-ui").getAttribute("data-i"), "0");
    family(document, "F18");
    family(document, "F19");
    assert.equal(card(document, "F19.01").querySelector(".jstage-view").getAttribute("data-frame"), "desk");
    assert.equal(card(document, "F19.03").querySelector(".jstage-ui").getAttribute("data-i"), "0");
    assert.equal(card(document, "F19.03").querySelector(".wm-full").textContent, "JARYO");
    assert.equal(card(document, "F19.02").querySelector(".jstage-view").getAttribute("data-frame"), "phone");
    assert.equal(dom.window.localStorage.getItem("jaryo-adaptive-lab-choices-v1"), null);
  } finally { dom.window.close(); }
  const fresh = await boot();
  try {
    family(fresh.window.document, "F19");
    assert.equal(card(fresh.window.document, "F19.01").querySelector(".jstage-view").getAttribute("data-frame"), "phone");
  } finally { fresh.window.close(); }
});
