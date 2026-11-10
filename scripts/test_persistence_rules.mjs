/**
 * Non-browser persistence/import contract checks for lab.js behavior.
 * Mirrors normalize / import merge / empty / erase-guard rules without DOM.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAB = path.join(__dirname, "..");
function resolveFixtures() {
  const candidates = [
    process.env.JARYO_LAB_FIXTURES,
    path.join(LAB, "lab-import-fixtures"),
    path.join(LAB, "..", "lab-import-fixtures"),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "01-valid-partial-sample.json"))) return c;
  }
  const sib = path.join(LAB, "..", "lab-import-fixtures");
  if (fs.existsSync(path.join(sib, "01-valid-partial-sample.json"))) return sib;
  return candidates[0] || sib;
}
const FIX = resolveFixtures();
const curated = JSON.parse(fs.readFileSync(path.join(LAB, "data/curated-85.json"), "utf8"));
const famIds = new Set(curated.families.map((f) => f.id));
const optByFam = Object.fromEntries(curated.families.map((f) => [f.id, new Set(f.options.map((o) => o.id))]));
const js = fs.readFileSync(path.join(LAB, "lab.js"), "utf8");
const html = fs.readFileSync(path.join(LAB, "index.html"), "utf8");

function normalize(map) {
  const accepted = {};
  const rejects = [];
  for (const key of Object.keys(map || {})) {
    if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
    const val = map[key];
    if (!famIds.has(key)) { rejects.push({ key, reason: "unknown-family" }); continue; }
    if (typeof val !== "string") { rejects.push({ key, reason: "non-string-option" }); continue; }
    if (!optByFam[key].has(val)) { rejects.push({ key, reason: "retired-or-unknown-option" }); continue; }
    accepted[key] = val;
  }
  return { accepted, rejects };
}

/** Mirror importPayloadText merge policy (no DOM / no storage). */
function importMerge(prior, incomingMap, incomingCatalog) {
  const keys = Object.keys(incomingMap || {}).filter((k) => Object.prototype.hasOwnProperty.call(incomingMap, k));
  if (keys.length === 0) {
    return { ok: false, choices: prior, reason: "empty" };
  }
  const { accepted, rejects } = normalize(incomingMap);
  if (incomingCatalog && incomingCatalog !== curated.version) {
    rejects.push({ key: "(catalogVersion)", reason: "catalog-mismatch" });
  }
  if (Object.keys(accepted).length === 0) {
    return { ok: false, choices: prior, reason: "all-invalid", rejects };
  }
  const next = Object.assign({}, prior);
  let changed = 0;
  let unchanged = 0;
  for (const k of Object.keys(accepted)) {
    if (prior[k] === accepted[k]) unchanged += 1;
    else changed += 1;
    next[k] = accepted[k];
  }
  return { ok: true, choices: next, changed, unchanged, rejects, accepted };
}

// catalog shape
{
  const ids = curated.families.map((f) => f.id);
  assert.deepEqual(ids, Array.from({ length: 17 }, (_, i) => `F${String(i + 1).padStart(2, "0")}`));
  assert.equal(curated.source_catalog.curated_count, 85);
  assert.equal(curated.source_catalog.full_catalog_option_count, 170);
  let opts = 0;
  curated.families.forEach((f) => { opts += f.options.length; });
  assert.equal(opts, 85);
}

// normalize valid sibling + invalids
{
  const good = curated.families[0].options[0].id;
  const { accepted, rejects } = normalize({
    F01: good,
    F99: "F99.01",
    F02: 12,
    F03: "F01.01",
  });
  assert.equal(accepted.F01, good);
  assert.equal(Object.keys(accepted).length, 1);
  assert.equal(rejects.length, 3);
}

// source contract strings
{
  assert.match(js, /exported_at_utc/);
  assert.doesNotMatch(js, /saved_at_local/);
  assert.match(js, /importPayloadText/);
  assert.match(js, /Empty import rejected/);
  assert.match(js, /Existing selections unchanged/);
  assert.match(js, /Merged /);
  assert.match(js, /Persistent reset failed; existing selections preserved/);
  assert.match(js, /Download recovery raw/);
  assert.match(js, /catalog-mismatch/);
  assert.match(js, /recoveryRaw/);
  assert.match(js, /addEventListener\("click", downloadRecoveryRaw\)/);
  assert.match(js, /btn\.hidden = !recoveryRaw/);
  // 2026-11-09: radio accessible name now comes from its <label> (visible "Choose · ID" + sr-only option name),
  // replacing aria-label so the visible label text is part of the accessible name (WCAG 2.5.3 label-in-name).
  assert.ok(js.includes('<span class="choose-text">${chosen ? "Selected" : "Choose"} · ${esc(opt.id)}</span><span class="sr-only"> ${esc(opt.name)}</span>'));
  assert.match(html, /btn-recovery/);
  assert.match(html, /id="btn-import"/);
  assert.doesNotMatch(html, /<label class="btn" for="import-file">/);
  assert.match(js, /refreshChoiceSurfaces/);
  assert.match(js, /schemaVersion:\s*1/);
  assert.ok(js.includes(".replace(/'/g, \"&#39;\")"));
}

// esc() is used in attributes and text. A single quote must not survive raw.
{
  const start = js.indexOf("function esc(s) {");
  assert.ok(start >= 0);
  const end = js.indexOf("\n  }", start);
  assert.ok(end > start);
  const esc = new Function(`${js.slice(start, end + 4)}\nreturn esc;`)();
  assert.equal(esc(null), "");
  assert.equal(esc(undefined), "");
  assert.equal(esc("a'b"), "a&#39;b");
  assert.equal(esc("a&b<c>d\"e'f"), "a&amp;b&lt;c&gt;d&quot;e&#39;f");
  assert.equal(esc("it's"), "it&#39;s");
  console.log("esc-quotes: PASS");
}

// empty import must not wipe
{
  const prior = { F01: curated.families[0].options[0].id, F02: curated.families[1].options[0].id };
  const r = importMerge(prior, {});
  assert.equal(r.ok, false);
  assert.equal(r.reason, "empty");
  assert.deepEqual(r.choices, prior);
}

// all-invalid nonempty must not wipe
{
  const prior = { F01: curated.families[0].options[0].id };
  const r = importMerge(prior, { F99: "nope", bad: true });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "all-invalid");
  assert.deepEqual(r.choices, prior);
}

// partial valid merges; does not erase prior families absent from import
{
  const prior = {
    F01: curated.families[0].options[0].id,
    F02: curated.families[1].options[0].id,
  };
  const incoming = {
    F01: curated.families[0].options[1].id, // change F01
    F03: curated.families[2].options[0].id, // add F03
    F99: "x",
  };
  const r = importMerge(prior, incoming);
  assert.equal(r.ok, true);
  assert.equal(r.choices.F01, curated.families[0].options[1].id);
  assert.equal(r.choices.F02, prior.F02, "F02 must survive merge");
  assert.equal(r.choices.F03, curated.families[2].options[0].id);
  assert.equal(r.changed, 2); // F01 changed + F03 new
  assert.ok(r.rejects.some((x) => x.key === "F99"));
}

// mismatched IDs: one valid sibling merges; invalids rejected; prior kept for untouched
{
  const prior = { F05: curated.families[4].options[0].id };
  const r = importMerge(prior, {
    F01: "F02.01",
    F02: "F02.99",
    F03: curated.families[2].options[0].id,
  });
  assert.equal(r.ok, true);
  assert.equal(r.choices.F05, prior.F05);
  assert.equal(r.choices.F03, curated.families[2].options[0].id);
  assert.equal(r.choices.F01, undefined);
  assert.ok(r.rejects.length >= 2);
}

// duplicate / same-as-prior: unchanged count, no erase
{
  const id = curated.families[0].options[0].id;
  const prior = { F01: id, F02: curated.families[1].options[0].id };
  const r = importMerge(prior, { F01: id });
  assert.equal(r.ok, true);
  assert.equal(r.unchanged, 1);
  assert.equal(r.changed, 0);
  assert.equal(r.choices.F02, prior.F02);
}

// catalog mismatch flagged but valid merge kept
{
  const prior = {};
  const r = importMerge(prior, { F01: curated.families[0].options[0].id }, "lab-v0-NOT-CURRENT");
  assert.equal(r.ok, true);
  assert.ok(r.rejects.some((x) => x.reason === "catalog-mismatch"));
  assert.equal(r.choices.F01, curated.families[0].options[0].id);
}

// fixtures exist and validate purpose fields (fictional)
{
  const names = [
    "01-valid-partial-sample.json",
    "02-all-invalid.json",
    "03-empty-object.json",
    "04-mismatched-ids.json",
    "05-catalog-mismatch.json",
    "06-duplicate-same-as-sample.json",
    "07-bare-map-valid.json",
    "08-malformed.txt",
  ];
  for (const n of names) {
    assert.ok(fs.existsSync(path.join(FIX, n)), n);
  }
  const sample = JSON.parse(fs.readFileSync(path.join(FIX, "01-valid-partial-sample.json"), "utf8"));
  assert.match(sample.notice, /FICTIONAL|SAMPLE/i);
  assert.equal(sample.choices.F17, undefined, "fixture must not select Copper EXAMPLE as preference");
  const empty = JSON.parse(fs.readFileSync(path.join(FIX, "03-empty-object.json"), "utf8"));
  assert.deepEqual(empty.choices, {});
  const inv = JSON.parse(fs.readFileSync(path.join(FIX, "02-all-invalid.json"), "utf8"));
  const rInv = importMerge({ F01: curated.families[0].options[0].id }, inv.choices);
  assert.equal(rInv.ok, false);
  const bare = JSON.parse(fs.readFileSync(path.join(FIX, "07-bare-map-valid.json"), "utf8"));
  const rBare = importMerge({}, bare);
  assert.equal(rBare.ok, true);
  assert.equal(Object.keys(rBare.choices).length, 3);
  // Simulate empty-object import reject
  const rEmpty = importMerge({ F01: curated.families[0].options[0].id }, empty.choices);
  assert.equal(rEmpty.ok, false);
  const mis = JSON.parse(fs.readFileSync(path.join(FIX, "04-mismatched-ids.json"), "utf8"));
  const rMis = importMerge({ F05: curated.families[4].options[0].id }, mis.choices);
  assert.equal(rMis.ok, true);
  assert.equal(rMis.choices.F05, curated.families[4].options[0].id);
  assert.equal(rMis.choices.F03, mis.choices.F03);
  const cat = JSON.parse(fs.readFileSync(path.join(FIX, "05-catalog-mismatch.json"), "utf8"));
  const rCat = importMerge({}, cat.choices, cat.catalogVersion);
  assert.ok(rCat.rejects.some((x) => x.reason === "catalog-mismatch"));
}

console.log("test_persistence_rules: PASS");
console.log("import-erase/empty/merge/mismatch/duplicate/catalog/fixtures: PASS");
