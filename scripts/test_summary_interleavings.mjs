/** Browser-free summary investigation. Run directly; never starts a server. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = process.env.JARYO_SUMMARY_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const candidates = [process.env.JARYO_JSDOM_PATH, path.join(root, ".test-deps/node_modules/jsdom"), "jsdom"].filter(Boolean);
let JSDOM, VirtualConsole;
for (const candidate of candidates) {
  try { ({ JSDOM, VirtualConsole } = require(candidate)); break; } catch (_) {}
}
if (!JSDOM) throw new Error("jsdom is not installed; set JARYO_JSDOM_PATH to an existing package");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const lab = fs.readFileSync(process.env.JARYO_SUMMARY_LAB_SOURCE || path.join(root, "lab.js"), "utf8");
const stages = fs.readFileSync(path.join(root, "lab-stages.js"), "utf8");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data/curated-extended.json"), "utf8"));
const key = "jaryo-adaptive-lab-choices-v1";
const families = catalog.families.map((f) => f.id);
const first = Object.fromEntries(catalog.families.map((f) => [f.id, f.options[0].id]));
const copy = (value) => JSON.parse(JSON.stringify(value));
const envelope = (choices, writerId = "lab-foreign") => JSON.stringify({ schemaVersion: 1, catalogVersion: catalog.version, revision: 1, writerId, choices });
const report = { cases: [], checkpoints: 0, acceptedClicks: 0, attemptedClicks: 0 };
const expectedCategories = {
  "single-page": 12, "foreign-current": 20, "storage-contract": 10,
  "storage-failure": 3, reset: 1, catalog: 4, CAS: 2,
  "cross-tab-control": 2, "nonstandard-fault": 2,
  "storage-load": 2, "storage-save": 1, import: 1,
};
// A historical source replay can select the unchanged single-page matrix.
// Fixed category counts still fail if a selected case silently disappears.
const selectedCategories = process.env.JARYO_SUMMARY_CATEGORIES
  ? new Set(process.env.JARYO_SUMMARY_CATEGORIES.split(",")) : null;
if (selectedCategories) {
  for (const category of selectedCategories) assert.ok(Object.hasOwn(expectedCategories, category), `unknown category: ${category}`);
}
const expectedTotals = Object.fromEntries(Object.entries(expectedCategories).filter(([category]) => !selectedCategories || selectedCategories.has(category)));
const expectedCount = Object.values(expectedTotals).reduce((sum, count) => sum + count, 0);

// Only the lab's timers are replaced. No wall-clock sleeps or asynchronous
// same-document storage events are inserted inside a synchronous click handler.
function fakeClock(window) {
  let now = 0, nextId = 1;
  const pending = new Map();
  window.setTimeout = (fn, delay = 0) => {
    const id = nextId++;
    pending.set(id, { at: now + Number(delay), fn });
    return id;
  };
  window.clearTimeout = (id) => pending.delete(id);
  window.setInterval = () => { throw new Error("unexpected lab interval; investigate before extending the model"); };
  return {
    tick(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...pending].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
  };
}

async function boot({ width = 1280, embedded = false, beforeCatalog = null, raw = null } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => errors.push(error.message));
  const dom = new JSDOM(html, { url: "https://jaryo.invalid/index.html", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  const { document, localStorage } = window;
  const clock = fakeClock(window);
  window.matchMedia = (query) => ({ matches: query === "(max-width: 480px)" && width <= 480, media: query });
  Object.defineProperty(window, "innerWidth", { value: width });
  if (raw !== null) localStorage.setItem(key, raw);
  let release;
  const response = new Promise((resolve) => { release = resolve; });
  window.fetch = async () => {
    await response;
    if (embedded) throw new Error("embedded fixture; no network");
    return { ok: true, json: async () => copy(catalog) };
  };
  window.JARYO_LAB_DATA = copy(catalog);
  const ready = new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
  // These are the real, unmodified scripts; outside-only prevents URL fetches.
  window.eval(stages);
  window.eval(lab);
  await ready;
  const c = {
    window, document, clock, errors, attempted: 0, accepted: 0, checks: 0,
    raw: () => localStorage.getItem(key),
    stored: () => JSON.parse(localStorage.getItem(key) || "null")?.choices || {},
    exported: () => JSON.parse(document.querySelector("#export-box").textContent),
    foreign(rawValue, { eventKey = key, area = localStorage, oldValue = null } = {}) {
      window.dispatchEvent(new window.StorageEvent("storage", { key: eventKey, oldValue, newValue: rawValue, storageArea: area, url: "https://jaryo.invalid/other.html" }));
    },
    close: () => window.close(),
  };
  try {
    if (beforeCatalog) beforeCatalog(c);
    release();
    // Drain the fetch/json/boot continuations, without advancing the fake clock.
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.ok(document.querySelector("#cards .opt-card"), "catalog boot completed");
    assert.deepEqual(errors, [], "no uncaught page errors during boot");
    return c;
  } catch (error) { c.close(); throw error; }
}

function surface(c) {
  const exported = c.exported();
  const rows = Object.fromEntries([...c.document.querySelectorAll("#summary-body tr")].map((tr) => {
    const cells = tr.querySelectorAll("td");
    return [cells[0].textContent, cells[2].textContent];
  }));
  return {
    choices: exported.choices, count: exported.acceptedCount,
    summary: c.document.querySelector("#summary-count").textContent,
    status: exported.persistenceStatus, rows, stored: c.stored(),
  };
}

function stateIs(c, memory, stored = memory) {
  const actual = surface(c);
  const count = Object.keys(memory).length;
  assert.deepEqual(c.errors, [], "no uncaught page errors");
  assert.deepEqual(actual.choices, memory, "all exported family choices");
  assert.equal(actual.count, count, "export accepted count");
  assert.match(actual.summary, new RegExp(`^${count} / ${families.length} families chosen`), "summary count");
  assert.deepEqual(actual.rows, Object.fromEntries(families.map((id) => [id, memory[id] || "—"])), "all summary rows");
  assert.deepEqual(actual.stored, stored, "all stored family choices");
  c.checks++;
  return actual;
}

function click(c, selector) {
  const element = c.document.querySelector(selector);
  assert.ok(element, selector);
  element.click();
}

function pick(c, id) {
  const family = id.slice(0, 3);
  if (c.document.querySelector('#family-nav [aria-current="true"]').dataset.fam !== family) click(c, `[data-fam="${family}"]`);
  click(c, `.opt-card[data-id="${id}"] .choose-label`);
  c.attempted++;
  const card = c.document.querySelector(`.opt-card[data-id="${id}"]`);
  const accepted = card.classList.contains("chosen") && card.querySelector("input").checked && /CHOSEN/.test(card.querySelector(".chosen-marker").textContent)
    && c.stored()[family] === id && c.document.querySelectorAll("#cards .opt-card.chosen").length === 1;
  if (accepted) c.accepted++;
  return accepted;
}

async function sequence(c, { allOptions = false, order = families, after = async () => {} } = {}) {
  const expected = {};
  for (const family of order) {
    const ids = allOptions ? catalog.families.find((f) => f.id === family).options.map((o) => o.id) : [first[family]];
    for (const id of ids) {
      assert.equal(pick(c, id), true, `smoke-equivalent acceptance: ${id}`);
      expected[family] = id;
      stateIs(c, expected);
      await after(c, copy(expected));
      stateIs(c, expected);
    }
    if (allOptions) {
      click(c, "#cards .expand-btn");
      assert.equal(c.document.querySelector("#cards .expand-btn").getAttribute("aria-expanded"), "true");
      click(c, "#cards .expand-btn");
      assert.equal(c.document.querySelector("#cards .expand-btn").getAttribute("aria-expanded"), "false");
      stateIs(c, expected);
    }
  }
  click(c, '.tab[data-tab="summary"]');
  c.clock.tick(5000);
  stateIs(c, expected);
  return expected;
}

async function run(name, category, options, exercise) {
  if (selectedCategories && !selectedCategories.has(category)) return;
  const c = await boot(options);
  try {
    await exercise(c);
    report.cases.push({ name, category, accepted: c.accepted, attempted: c.attempted, checkpoints: c.checks, final: surface(c) });
    report.acceptedClicks += c.accepted;
    report.attemptedClicks += c.attempted;
    report.checkpoints += c.checks;
    console.log("PASS summary", name);
  } finally { c.close(); }
}

for (const width of [1280, 375, 260]) {
  for (const schedule of ["never", "microtask", "deadline"]) {
    await run(`all options / width ${width} / ${schedule}`, "single-page", { width, embedded: schedule === "never" }, async (c) => {
      await sequence(c, { allOptions: true, after: async () => {
        if (schedule === "microtask") await Promise.resolve();
        if (schedule === "deadline") {
          c.clock.tick(3199);
          assert.ok(c.document.querySelector("#toast").classList.contains("show"));
          c.clock.tick(1);
          assert.equal(c.document.querySelector("#toast").classList.contains("show"), false);
        }
      } });
      assert.equal(c.accepted, 97);
    });
  }
}
for (const order of [families, [...families].reverse(), [...families.slice(9), ...families.slice(0, 9)]]) {
  await run(`first options / ${order[0]} first`, "single-page", {}, async (c) => {
    await sequence(c, { order });
    for (const family of order) assert.equal(pick(c, first[family]), true, "duplicate choice remains accepted");
    stateIs(c, first);
  });
}

// Exhaust every family boundary for an immediately delivered foreign snapshot.
// Its current storage and event.newValue agree; no stale-event hypothesis here.
for (let boundary = 0; boundary <= families.length; boundary++) {
  await run(`foreign snapshot at boundary ${boundary}`, "foreign-current", {}, async (c) => {
    let index = 0;
    const deliver = (expected) => {
      const raw = envelope(expected);
      const oldValue = c.raw();
      c.window.localStorage.setItem(key, raw);
      c.foreign(raw, { oldValue });
      assert.equal(c.raw(), raw, "foreign adoption does not write back");
      stateIs(c, expected);
    };
    if (boundary === 0) deliver({});
    await sequence(c, { after: async (_, expected) => { if (++index === boundary) deliver(expected); } });
  });
}

for (const kind of ["own", "wrong-key", "session", "malformed", "clear", "clear-all", "invalid-entry"]) {
  await run(`storage event / ${kind}`, "storage-contract", {}, async (c) => {
    await sequence(c);
    const summaryBefore = c.document.querySelector("#panel-summary").textContent;
    const before = c.raw();
    const short = { ...first }; delete short.F01;
    let raw = envelope(short);
    if (kind === "own") raw = envelope(short, c.exported().writerId);
    if (kind === "malformed") raw = "{";
    if (kind === "invalid-entry") raw = envelope({ ...first, F01: "F02.01", F99: "F99.01" });
    if (kind === "wrong-key") c.foreign(raw, { eventKey: "unrelated" });
    else if (kind === "session") c.foreign(raw, { area: c.window.sessionStorage });
    else {
      if (kind === "clear-all") c.window.localStorage.clear();
      else if (kind === "clear") c.window.localStorage.removeItem(key);
      else c.window.localStorage.setItem(key, raw);
      c.foreign(kind.startsWith("clear") ? null : raw, { eventKey: kind === "clear-all" ? null : key });
    }
    if (["wrong-key", "session"].includes(kind)) { assert.equal(c.raw(), before); stateIs(c, first); }
    else if (kind === "own") {
      stateIs(c, first, short);
      assert.equal(pick(c, "F01.02"), true, "self-writer storage text does not create a CAS conflict");
      stateIs(c, { ...first, F01: "F01.02" });
    }
    else if (kind === "malformed") {
      assert.notEqual(c.document.querySelector("#panel-summary").textContent, summaryBefore, "foreign warning re-renders summary status");
      assert.equal(c.raw(), "{");
      assert.deepEqual(c.exported().choices, first);
      assert.match(c.document.querySelector("#storage-banner").textContent, /could not read/);
      // surface() parses storage intentionally; restore only the test fixture
      // after verifying the malformed bytes, so the final report is JSON-safe.
      c.window.localStorage.setItem(key, before);
      stateIs(c, first);
    } else if (kind === "invalid-entry") {
      stateIs(c, short, { ...first, F01: "F02.01", F99: "F99.01" });
      assert.equal(c.exported().rejects.length, 2);
    } else stateIs(c, {}, {});
  });
}

for (const operation of ["save", "read", "reset"]) {
  await run(`storage failure / ${operation}`, "storage-failure", {}, async (c) => {
    await sequence(c);
    const proto = Object.getPrototypeOf(c.window.localStorage);
    const method = operation === "save" ? "setItem" : operation === "read" ? "getItem" : "removeItem";
    const original = proto[method];
    const before = c.raw();
    proto[method] = function (k, ...args) { if (k === key) throw new Error("injected storage failure"); return original.call(this, k, ...args); };
    try {
      if (operation === "reset") click(c, "#btn-reset");
      else {
        // Check the event handler directly while getItem is throwing; pick()'s
        // independent storage observation must run only after restoring reads.
        click(c, '[data-fam="F01"]');
        click(c, '.opt-card[data-id="F01.02"] .choose-label');
      }
    } finally { proto[method] = original; }
    assert.equal(c.raw(), before);
    assert.equal(c.exported().persistenceStatus, "unavailable");
    stateIs(c, operation === "reset" ? first : { ...first, F01: "F01.02" }, first);
  });
}
await run("reset then next save", "reset", {}, async (c) => {
  await sequence(c);
  click(c, "#btn-reset");
  stateIs(c, {});
  assert.equal(pick(c, "F02.01"), true);
  stateIs(c, { F02: "F02.01" });
});

for (const timing of ["before-catalog", "after-catalog"]) {
  const raw = envelope({ F01: "F01.01", F02: "F01.01" });
  await run(`normalization / ${timing}`, "catalog", {
    raw: timing === "after-catalog" ? raw : null,
    beforeCatalog: timing === "before-catalog" ? (c) => { c.window.localStorage.setItem(key, raw); c.foreign(raw); } : null,
  }, async (c) => {
    stateIs(c, { F01: "F01.01" }, { F01: "F01.01", F02: "F01.01" });
    assert.equal(c.exported().rejects.length, 1);
  });
}

await run("CAS keeps pending pick and skips its matching late event", "CAS", {}, async (c) => {
  assert.equal(pick(c, "F01.01"), true);
  const raw = envelope({ F02: "F02.01" });
  c.window.localStorage.setItem(key, raw); // another tab commits; event is queued
  assert.equal(pick(c, "F03.01"), false, "conflict is screen-only, not a verified smoke click");
  assert.match(c.document.querySelector("#toast").textContent, /another tab saved first/, "conflict toast explains why save failed");
  const kept = { F02: "F02.01", F03: "F03.01" };
  stateIs(c, kept, { F02: "F02.01" });
  c.foreign(raw);
  stateIs(c, kept, { F02: "F02.01" });
  assert.equal(c.raw(), raw);
  assert.equal(pick(c, "F03.01"), true, "checked-radio retry saves the kept pick");
  stateIs(c, kept);
  const proto = Object.getPrototypeOf(c.window.localStorage);
  const original = proto.setItem;
  let writes = 0;
  proto.setItem = function (k, ...args) {
    if (k === key) writes++;
    return original.call(this, k, ...args);
  };
  try { assert.equal(pick(c, "F03.01"), true); }
  finally { proto.setItem = original; }
  assert.equal(writes, 0, "successful retry clears unsavedChoices; duplicate pick does not write");
  stateIs(c, kept);
});

// Load/save state must distinguish an absent item from unreadable stored text.
await run("loaded foreign envelope remains the next save baseline", "storage-load", { raw: envelope({ F01: "F01.01" }) }, async (c) => {
  stateIs(c, { F01: "F01.01" });
  assert.equal(pick(c, "F02.01"), true);
  stateIs(c, { F01: "F01.01", F02: "F02.01" });
});
await run("empty stored text loads as missing", "storage-load", { raw: "" }, async (c) => {
  assert.equal(c.exported().persistenceStatus, "missing");
  assert.equal(c.raw(), "", "load does not rewrite empty stored text");
  stateIs(c, {});
});
await run("empty stored text permits save with this writer identity", "storage-save", {}, async (c) => {
  c.window.localStorage.setItem(key, "");
  assert.equal(pick(c, "F01.01"), true);
  stateIs(c, { F01: "F01.01" });
  assert.equal(JSON.parse(c.raw()).writerId, c.exported().writerId, "saved envelope identifies this tab");
});
await run("catalog mismatch records its reject reason", "catalog", {
  raw: JSON.stringify({ schemaVersion: 1, catalogVersion: "old-version", revision: 1, writerId: "lab-foreign", choices: { F01: "F01.01" } }),
}, async (c) => {
  stateIs(c, { F01: "F01.01" });
  assert.equal(c.exported().persistenceStatus, "catalog-mismatch");
  assert.ok(c.exported().rejects.some((r) => r.reason === "catalog-mismatch"));
});
await run("non-string stored option is rejected before option lookup", "catalog", { raw: envelope({ F01: 5, F02: "F02.01" }) }, async (c) => {
  stateIs(c, { F02: "F02.01" }, { F01: 5, F02: "F02.01" });
  assert.ok(c.exported().rejects.some((r) => r.key === "F01" && r.reason === "non-string-option"));
});
for (const change of ["missing-key", "changed-value"]) {
  await run(`foreign adoption toast / ${change}`, "storage-contract", {}, async (c) => {
    await sequence(c);
    c.clock.tick(5000);
    assert.equal(c.document.querySelector("#toast").classList.contains("show"), false);
    const next = { ...first };
    if (change === "missing-key") delete next.F01;
    else next.F01 = "F01.02";
    const raw = envelope(next);
    c.window.localStorage.setItem(key, raw);
    c.foreign(raw);
    stateIs(c, next);
    assert.ok(c.document.querySelector("#toast").classList.contains("show"), "changed foreign choices announce adoption");
    assert.match(c.document.querySelector("#toast").textContent, /Another tab saved selections/);
  });
}
await run("null-key event clears memory even with non-null newValue", "storage-contract", {}, async (c) => {
  await sequence(c);
  c.foreign(envelope({ F01: "F01.02" }), { eventKey: null });
  stateIs(c, {}, first);
  assert.equal(c.exported().persistenceStatus, "missing");
});
await run("matching conflict event is skipped only once", "CAS", {}, async (c) => {
  assert.equal(pick(c, "F01.01"), true);
  const next = { F02: "F02.01" };
  const raw = envelope(next);
  c.window.localStorage.setItem(key, raw);
  assert.equal(pick(c, "F03.01"), false);
  c.foreign(raw);
  stateIs(c, { ...next, F03: "F03.01" }, next);
  c.foreign(raw);
  stateIs(c, next);
});
await run("file import applies and saves incoming choices", "import", {}, async (c) => {
  assert.equal(pick(c, "F02.01"), true);
  const input = c.document.querySelector("#import-file");
  const payload = JSON.stringify({ schemaVersion: 1, catalogVersion: catalog.version, choices: { F01: "F01.02" } });
  Object.defineProperty(input, "files", { value: [{ text: async () => payload }], configurable: true });
  input.dispatchEvent(new c.window.Event("change"));
  for (let i = 0; i < 10; i++) await Promise.resolve();
  stateIs(c, { F01: "F01.02", F02: "F02.01" });
  assert.equal(JSON.parse(c.raw()).writerId, c.exported().writerId);
  assert.match(c.document.querySelector("#toast").textContent, /Saved/);
});

// Positive controls, NOT a reproduction of the fresh single-page hosted smoke.
// An external writer lands between save's read and write; its queued event
// arrives after our newer save. No event is dispatched reentrantly in setItem.
for (const missing of [1, 2]) {
  await run(`late foreign event drops ${missing} families`, "cross-tab-control", {}, async (c) => {
    const short = Object.fromEntries(Object.entries(first).slice(missing));
    const stale = envelope(short);
    const proto = Object.getPrototypeOf(c.window.localStorage);
    const original = proto.setItem;
    let queued = false;
    let oldValue;
    proto.setItem = function (k, value) {
      if (k === key && !queued && JSON.parse(value).choices.F19) {
        queued = true;
        oldValue = c.raw();
        original.call(this, k, stale); // virtual external writer in the CAS gap
      }
      return original.call(this, k, value);
    };
    try { await sequence(c); } finally { proto.setItem = original; }
    assert.equal(queued, true);
    const full = c.raw();
    assert.equal(c.accepted, 19);
    c.foreign(stale, { oldValue });
    c.clock.tick(5000);
    stateIs(c, short, first);
    assert.equal(c.raw(), full, "late event changed memory, not current storage");
    assert.match(c.document.querySelector("#storage-banner").textContent, /Another tab saved/);
  });
}

// Delayed setItem visibility is deliberately outside synchronous Storage's
// contract. It is fault injection, never counted as a hosted reproduction.
for (const flush of ["before-next-click", "after-next-click"]) {
  await run(`delayed write visibility / ${flush}`, "nonstandard-fault", {}, async (c) => {
    const proto = Object.getPrototypeOf(c.window.localStorage);
    const original = proto.setItem;
    let delayed;
    proto.setItem = function (k, value) { if (k === key && delayed === undefined) { delayed = String(value); return; } return original.call(this, k, value); };
    try { assert.equal(pick(c, "F01.01"), false, "invisible write fails smoke's storage verification"); }
    finally { proto.setItem = original; }
    stateIs(c, { F01: "F01.01" }, {});
    if (flush === "before-next-click") original.call(c.window.localStorage, key, delayed);
    const accepted = pick(c, "F02.01");
    if (flush === "after-next-click") original.call(c.window.localStorage, key, delayed);
    assert.equal(accepted, flush === "before-next-click");
    stateIs(c, flush === "before-next-click" ? { F01: "F01.01", F02: "F02.01" } : { F02: "F02.01" }, flush === "before-next-click" ? { F01: "F01.01", F02: "F02.01" } : { F01: "F01.01" });
  });
}

report.totals = Object.fromEntries([...new Set(report.cases.map((c) => c.category))].map((category) => [category, report.cases.filter((c) => c.category === category).length]));
assert.deepEqual(report.totals, expectedTotals, "fixed per-category case counts");
assert.equal(report.cases.length, expectedCount, "fixed total case count");
const reportIndex = process.argv.indexOf("--report");
if (reportIndex !== -1) {
  assert.ok(process.argv[reportIndex + 1], "--report requires a path");
  fs.writeFileSync(process.argv[reportIndex + 1], JSON.stringify(report, null, 2) + "\n");
}
console.log(`TOTAL ${report.cases.length} / ${expectedCount} summary interleaving cases; ${report.acceptedClicks} accepted / ${report.attemptedClicks} observed clicks; ${report.checkpoints} full-map checkpoints`);
console.log("CATEGORIES", JSON.stringify(report.totals));
