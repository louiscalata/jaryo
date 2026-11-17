/** Mutation sensitivity of the browser-free summary tests; no server or browser. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const test = path.join(root, "scripts/test_summary_interleavings.mjs");
const source = fs.readFileSync(path.join(root, "lab.js"), "utf8");
const sourceFiles = ["lab.js", "scripts/test_summary_interleavings.mjs", "scripts/check_summary_interleavings_mutations.mjs"];
const hash = (text) => createHash("sha256").update(text).digest("hex");
const sourceHashes = Object.fromEntries(sourceFiles.map((name) => [name, hash(fs.readFileSync(path.join(root, name)))]));

// The first 56 entries preserve the initial mutation inventory. The final 24
// exercise additional exports, summary rows, choices, retries and storage paths.
// Context around normalization distinguishes load checks from import checks.
const mutations = [
  [
    "load-map-empty",
    "choices = map;",
    "choices = {};"
  ],
  [
    "load-lastSeen-null",
    "lastSeenRaw = raw === \"\" ? null : raw;\n      if (raw == null",
    "lastSeenRaw = null;\n      if (raw == null"
  ],
  [
    "load-empty-string-check",
    "if (raw == null || raw === \"\") {",
    "if (raw == null) {"
  ],
  [
    "norm-drop-F19",
    "accepted[key] = val;",
    "if (key !== \"F19\") accepted[key] = val;"
  ],
  [
    "norm-keep-src",
    "choices = accepted;",
    "choices = src;"
  ],
  [
    "norm-catalog-mismatch-off",
    "envelopeCatalogVersion !== DATA.version",
    "false"
  ],
  [
    "save-cas-off",
    "if (current !== lastSeenRaw && foreignStorageDecision(writerId, current) !== \"ignore\") {",
    "if (false) {"
  ],
  [
    "save-cas-no-self-filter",
    "if (current !== lastSeenRaw && foreignStorageDecision(writerId, current) !== \"ignore\") {",
    "if (current !== lastSeenRaw) {"
  ],
  [
    "save-cas-ignore-inverted",
    "foreignStorageDecision(writerId, current) !== \"ignore\") {",
    "foreignStorageDecision(writerId, current) === \"ignore\") {"
  ],
  [
    "save-empty-as-null-off",
    "const current = stored === \"\" ? null : stored;",
    "const current = stored;"
  ],
  [
    "save-lastSeen-not-updated",
    "lastSeenRaw = text;\n      unsavedChoices = {};",
    "unsavedChoices = {};"
  ],
  [
    "save-unsaved-not-cleared",
    "lastSeenRaw = text;\n      unsavedChoices = {};",
    "lastSeenRaw = text;"
  ],
  [
    "save-drop-last-family",
    "        choices,\n      };",
    "        choices: Object.fromEntries(Object.entries(choices).slice(0, 18)),\n      };"
  ],
  [
    "save-envelope-writer-wrong",
    "        revision: 1,\n        writerId,",
    "        revision: 1,\n        writerId: writerId + \"x\","
  ],
  [
    "conflict-no-keep",
    "choices[famId] = kept[famId];\n      unsavedChoices",
    "unsavedChoices"
  ],
  [
    "conflict-no-unsaved",
    "unsavedChoices[famId] = kept[famId];",
    ""
  ],
  [
    "conflict-not-quiet",
    "applyForeignStorage(current, true);",
    "applyForeignStorage(current, false);"
  ],
  [
    "conflict-flag-off",
    "lastSaveConflict = true;",
    "lastSaveConflict = false;"
  ],
  [
    "conflict-raw-unset",
    "conflictRaw = current;",
    ""
  ],
  [
    "conflict-no-refresh",
    "if (DATA && $(\"#cards\")) refreshChoiceSurfaces();\n  }\n\n  function esc",
    "\n  }\n\n  function esc"
  ],
  [
    "choose-no-assign",
    "choices[famId] = optId;\n    const ok",
    "const ok"
  ],
  [
    "choose-no-pending",
    "const ok = saveChoices(false, { [famId]: optId });",
    "const ok = saveChoices(false, null);"
  ],
  [
    "choose-no-summary-render",
    "syncChoiceUI(famId);\n    renderSummary();\n    toast(ok",
    "syncChoiceUI(famId);\n    toast(ok"
  ],
  [
    "choose-no-sync",
    "syncChoiceUI(famId);\n    renderSummary();\n    toast(ok",
    "renderSummary();\n    toast(ok"
  ],
  [
    "count-skip-F19",
    "n + (choices[f.id] ? 1 : 0)",
    "n + (choices[f.id] && f.id !== \"F19\" ? 1 : 0)"
  ],
  [
    "count-double",
    "n + (choices[f.id] ? 1 : 0)",
    "n + (choices[f.id] ? 2 : 0)"
  ],
  [
    "summary-row-skip-F01",
    "const id = choices[f.id] || \"\";\n      const opt",
    "const id = f.id === \"F01\" ? \"\" : (choices[f.id] || \"\");\n      const opt"
  ],
  [
    "sync-chosen-inverted",
    "const chosen = choices[famId] === id;",
    "const chosen = choices[famId] !== id;"
  ],
  [
    "sync-no-radio",
    "radio.checked = chosen;",
    ""
  ],
  [
    "reset-no-rollback",
    "choices = previous;\n      setPersistence(\"unavailable\"",
    "setPersistence(\"unavailable\""
  ],
  [
    "reset-lastSeen-kept",
    "lastSeenRaw = null;\n      unsavedChoices = {};\n      setPersistence(\"missing\"",
    "unsavedChoices = {};\n      setPersistence(\"missing\""
  ],
  [
    "reset-no-clear",
    "const previousEnvelopeCatalog = envelopeCatalogVersion;\n    choices = {};",
    "const previousEnvelopeCatalog = envelopeCatalogVersion;"
  ],
  [
    "reset-no-refresh-on-ok",
    "refreshChoiceSurfaces();\n    toast(\"Selections reset and cleared",
    "toast(\"Selections reset and cleared"
  ],
  [
    "foreign-ignore-off",
    "if (action === \"ignore\") return;",
    "if (false) return;"
  ],
  [
    "foreign-lastSeen-not-updated",
    "lastSeenRaw = raw === \"\" ? null : raw;\n    unsavedChoices = {};\n    if (action === \"warn\")",
    "unsavedChoices = {};\n    if (action === \"warn\")"
  ],
  [
    "foreign-clear-keeps",
    "choices = {};\n      setPersistence(\"missing\", { rejects: [], raw: null, catalogVersion: null, source: \"foreign-clear\" });",
    "setPersistence(\"missing\", { rejects: [], raw: null, catalogVersion: null, source: \"foreign-clear\" });"
  ],
  [
    "foreign-merge-not-replace",
    "choices = envelope ? parsed.choices : parsed;",
    "choices = Object.assign({}, choices, envelope ? parsed.choices : parsed);"
  ],
  [
    "foreign-no-normalize",
    "if (DATA) normalizeAfterCatalog();\n      setPersistence(persistenceStatus, { source: \"foreign-adopt\" });",
    "setPersistence(persistenceStatus, { source: \"foreign-adopt\" });"
  ],
  [
    "foreign-no-refresh",
    "if (DATA && $(\"#cards\") && !quiet) refreshChoiceSurfaces();",
    "if (false) refreshChoiceSurfaces();"
  ],
  [
    "foreign-no-toast",
    "if (!quiet && !mapsEqual(prior, choices) && $(\"#toast\")) toast(storageMsg);",
    ""
  ],
  [
    "foreign-warn-no-render",
    "if (DATA) renderSummary();\n      if (!quiet",
    "if (!quiet"
  ],
  [
    "mapsEqual-ignores-values",
    "if (a[aKeys[i]] !== b[bKeys[i]]) return false;",
    ""
  ],
  [
    "listener-key-filter-off",
    "if (!e || (e.key !== STORAGE_KEY && e.key !== null)) return;",
    "if (!e) return;"
  ],
  [
    "listener-null-key-ignored",
    "(e.key !== STORAGE_KEY && e.key !== null)",
    "(e.key !== STORAGE_KEY)"
  ],
  [
    "listener-area-filter-off",
    "if (e.storageArea && e.storageArea !== localStorage) return;",
    ""
  ],
  [
    "listener-raw-ignores-null-key",
    "const raw = e.key === null ? null : e.newValue;",
    "const raw = e.newValue;"
  ],
  [
    "listener-already-off",
    "const already = conflictRaw !== undefined && raw === conflictRaw;",
    "const already = false;"
  ],
  [
    "listener-conflict-not-cleared",
    "conflictRaw = undefined;\n    if (already) return;",
    "if (already) return;"
  ],
  [
    "listener-skip-always",
    "if (already) return;",
    "if (already || true) return;"
  ],
  [
    "toast-3199",
    "setTimeout(hideToast, 3200)",
    "setTimeout(hideToast, 3199)"
  ],
  [
    "toast-3201",
    "setTimeout(hideToast, 3200)",
    "setTimeout(hideToast, 3201)"
  ],
  [
    "import-skip-assign",
    "choices[k] = incomingAccepted[k];",
    ""
  ],
  [
    "import-no-save",
    "const ok = saveChoices(true, incomingAccepted);",
    "const ok = true;"
  ],
  [
    "norm2-skip-family-check",
    "const val = src[key];\n      if (!famIds.has(key)) {",
    "const val = src[key];\n      if (false) {"
  ],
  [
    "norm2-skip-string-check",
    "      if (typeof val !== \"string\") {\n        rejects.push({ key, value: val, reason: \"non-string-option\" });",
    "      if (false) {\n        rejects.push({ key, value: val, reason: \"non-string-option\" });"
  ],
  [
    "norm2-skip-option-check",
    "      if (!optByFam[key].has(val)) {\n        rejects.push({",
    "      if (false) {\n        rejects.push({"
  ],
  [
    "export-count-zero",
    "acceptedCount: acceptedChoiceCount(),",
    "acceptedCount: 0,"
  ],
  [
    "export-count-plus-one",
    "acceptedCount: acceptedChoiceCount(),",
    "acceptedCount: acceptedChoiceCount() + 1,"
  ],
  [
    "export-empty-choices",
    "      copper_note: \"Copper is an example palette in the color set, not the default.\",\n      choices,",
    "      copper_note: \"Copper is an example palette in the color set, not the default.\",\n      choices: {},"
  ],
  [
    "export-status-always-missing",
    "persistenceStatus: persistenceView[persistenceStatus].value,",
    "persistenceStatus: \"missing\","
  ],
  [
    "summary-denominator-minus-one",
    "${n} / ${DATA.families.length} families chosen",
    "${n} / ${DATA.families.length - 1} families chosen"
  ],
  [
    "summary-count-zero",
    "const n = acceptedChoiceCount();\n    let extra",
    "const n = 0;\n    let extra"
  ],
  [
    "summary-count-one-less",
    "const n = acceptedChoiceCount();\n    let extra",
    "const n = acceptedChoiceCount() - 1;\n    let extra"
  ],
  [
    "summary-no-rows",
    "$(\"#summary-body\").innerHTML = rows;",
    "$(\"#summary-body\").innerHTML = \"\";"
  ],
  [
    "summary-row-skip-F19",
    "const id = choices[f.id] || \"\";\n      const opt",
    "const id = f.id === \"F19\" ? \"\" : (choices[f.id] || \"\");\n      const opt"
  ],
  [
    "summary-row-wrong-option",
    "const id = choices[f.id] || \"\";\n      const opt",
    "const id = choices[f.id] ? f.options[0].id : \"\";\n      const opt"
  ],
  [
    "summary-export-not-rendered",
    "$(\"#export-box\").textContent = JSON.stringify(payload, null, 2);",
    "$(\"#export-box\").textContent = \"{}\";"
  ],
  [
    "choose-truncated-family",
    "const famId = optId.slice(0, 3);",
    "const famId = optId.slice(0, 2);"
  ],
  [
    "choose-reject-valid-options",
    "!familyById(famId).options.some((o) => o.id === optId)",
    "familyById(famId).options.some((o) => o.id === optId)"
  ],
  [
    "choose-empty-pending",
    "const ok = saveChoices(false, { [famId]: optId });",
    "const ok = saveChoices(false, {});"
  ],
  [
    "choose-conflict-toast-wrong",
    "on screen only: another tab saved first. Choose it again to save.",
    "on screen only: try a different choice."
  ],
  [
    "sync-never-chosen",
    "card.classList.toggle(\"chosen\", chosen);",
    "card.classList.toggle(\"chosen\", false);"
  ],
  [
    "sync-marker-empty",
    "if (marker) marker.textContent = chosen ? \"CHOSEN\" : \"\";",
    "if (marker) marker.textContent = \"\";"
  ],
  [
    "retry-never-unsaved",
    "return !!radio && radio.checked && unsavedChoices[radio.value.slice(0, 3)] === radio.value;",
    "return false;"
  ],
  [
    "reset-wrong-storage-key",
    "localStorage.removeItem(STORAGE_KEY);",
    "localStorage.removeItem(STORAGE_KEY + \"-wrong\");"
  ],
  [
    "reset-preserve-F19",
    "const previousEnvelopeCatalog = envelopeCatalogVersion;\n    choices = {};",
    "const previousEnvelopeCatalog = envelopeCatalogVersion;\n    choices = previous.F19 ? { F19: previous.F19 } : {};"
  ],
  [
    "foreign-adopt-empty-map",
    "choices = envelope ? parsed.choices : parsed;",
    "choices = {};"
  ],
  [
    "foreign-listener-uses-old-value",
    "const raw = e.key === null ? null : e.newValue;",
    "const raw = e.key === null ? null : e.oldValue;"
  ],
  [
    "foreign-difference-always-equal",
    "if (!quiet && !mapsEqual(prior, choices) && $(\"#toast\")) toast(storageMsg);",
    "if (!quiet && false && $(\"#toast\")) toast(storageMsg);"
  ],
  [
    "toast-no-show",
    "el.classList.add(\"show\");",
    "el.classList.remove(\"show\");"
  ]
];
assert.equal(mutations.length, 80, "fixed mutation inventory");
assert.equal(new Set(mutations.map(([name]) => name)).size, mutations.length, "unique mutation names");
const generated = mutations.map(([name, find, replacement]) => {
  assert.equal(source.split(find).length - 1, 1, `unique source context for ${name}`);
  assert.notEqual(find, replacement, `nonempty mutation for ${name}`);
  return source.replace(find, () => replacement);
});
assert.equal(new Set(generated.map(hash)).size, mutations.length, "distinct mutated source contents");

// These changes have the same observed outcome in the tested single-document
// click flows. This is a bound on the observer, not universal equivalence.
const equivalentReasons = {
  "conflict-not-quiet": "The extra foreign-adoption toast is overwritten by choose() before the click returns; choose() also synchronizes the chosen family and summary.",
  "conflict-no-refresh": "choose() synchronizes the active family and summary after the conflict; navigation rebuilds other families before they are observed.",
  "sync-no-radio": "Native label activation has already checked the radio before the change handler; a subsequent navigation rebuilds its checked attribute.",
};

let reportPath;
let requested;
for (let i = 2; i < process.argv.length; i++) {
  const flag = process.argv[i];
  if (flag === "--report") {
    assert.ok(process.argv[i + 1], "--report requires a path");
    reportPath = path.resolve(process.argv[++i]);
  } else if (flag === "--mutants") {
    assert.ok(process.argv[i + 1], "--mutants requires comma-separated names");
    requested = new Set(process.argv[++i].split(","));
  } else throw new Error(`Unknown argument: ${flag}`);
}
if (requested) for (const name of requested) assert.ok(mutations.some(([id]) => id === name), `unknown mutation: ${name}`);
const selected = mutations.filter(([name]) => !requested || requested.has(name));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "jaryo-summary-mutations-"));
const env = { ...process.env, TMPDIR: temporary, JARYO_SUMMARY_ROOT: root };
for (const name of Object.keys(env)) if (name.startsWith("GIT_CONFIG_")) delete env[name];
delete env.JARYO_SUMMARY_CATEGORIES; // Every mutant runs the full assertion matrix.
delete env.JARYO_SUMMARY_LAB_SOURCE;
reportPath ||= path.join(temporary, "report.json");
const report = { inventory: mutations.length, selected: selected.length, sourceHashes, baseline: null, mutants: [] };
function persist() { fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n"); }

function execute(args, extraEnv = {}, timeout = 120000) {
  const result = spawnSync(process.execPath, args, { cwd: process.cwd(), env: { ...env, ...extraEnv }, encoding: "utf8", timeout, maxBuffer: 4 * 1024 * 1024 });
  return {
    exit: result.status, signal: result.signal, error: result.error?.code || null,
    stdout: result.stdout || "", stderr: result.stderr || "",
  };
}
function brief(result) {
  return (result.stderr.match(/(?:AssertionError|TypeError|ReferenceError|Error)[^\n]*/) || [result.stderr.trim().split("\n")[0]])[0]?.slice(0, 240) || "";
}
function infrastructure(result) {
  if (result.error === "ETIMEDOUT") return "TIMEOUT";
  if (result.error || result.signal || result.exit === null) return "INFRASTRUCTURE";
  return null;
}

// A non-green baseline ends the run before any mutation can count as killed.
const baseline = execute([test]);
report.baseline = {
  status: infrastructure(baseline) || (baseline.exit === 0 && /^TOTAL \d+ \/ \d+ summary interleaving cases;/m.test(baseline.stdout) ? "PASS" : "FAIL"),
  exit: baseline.exit, diagnostic: brief(baseline), stdout: baseline.stdout, stderr: baseline.stderr,
};
persist();
assert.equal(report.baseline.status, "PASS", `baseline must pass; see ${reportPath}`);
console.log("BASELINE PASS");

for (const [name, find, replacement] of selected) {
  const matches = source.split(find).length - 1;
  const record = { name, status: null };
  if (matches !== 1 || find === replacement) {
    record.status = "PREFLIGHT_REJECTED";
    record.matches = matches;
  } else {
    const mutated = source.replace(find, () => replacement);
    const target = path.join(temporary, `${name}.js`);
    fs.writeFileSync(target, mutated);
    const syntax = execute(["--check", target], {}, 10000);
    const syntaxInfra = infrastructure(syntax);
    if (syntaxInfra || syntax.exit !== 0) {
      record.status = syntaxInfra || "SYNTAX_REJECTED";
      record.diagnostic = brief(syntax);
    } else {
      const result = execute([test], { JARYO_SUMMARY_LAB_SOURCE: target });
      record.exit = result.exit;
      record.passedCases = (result.stdout.match(/^PASS summary /gm) || []).length;
      record.diagnostic = brief(result);
      record.status = infrastructure(result);
      if (!record.status && result.exit === 0) {
        record.status = /^TOTAL \d+ \/ \d+ summary interleaving cases;/m.test(result.stdout) ? "SURVIVED" : "INVALID_RESULT";
        if (record.status === "SURVIVED") record.equivalentReason = equivalentReasons[name] || null;
      } else if (!record.status) {
        // Page errors are captured by the test and asserted there. An unrelated
        // loader/runtime failure must never improve mutation sensitivity.
        record.status = /ERR_ASSERTION|AssertionError/.test(result.stderr) ? "KILLED" : "RUNTIME_ERROR";
      }
      fs.writeFileSync(path.join(temporary, `${name}.log`), result.stdout + result.stderr);
    }
  }
  report.mutants.push(record);
  persist();
  console.log(record.status, name, record.equivalentReason || record.diagnostic || "");
}
report.totals = Object.fromEntries(["PREFLIGHT_REJECTED", "SYNTAX_REJECTED", "TIMEOUT", "INFRASTRUCTURE", "RUNTIME_ERROR", "INVALID_RESULT", "KILLED", "SURVIVED"].map((name) => [name, 0]));
for (const record of report.mutants) report.totals[record.status] = (report.totals[record.status] || 0) + 1;
assert.equal(Object.values(report.totals).reduce((a, b) => a + b, 0), selected.length, "disjoint outcome accounting");
report.survivors = report.mutants.filter((m) => m.status === "SURVIVED").map(({ name, equivalentReason }) => ({ name, equivalentReason }));
report.ok = report.mutants.every((m) => m.status === "KILLED" || (m.status === "SURVIVED" && m.equivalentReason));
for (const [name, expectedHash] of Object.entries(sourceHashes)) assert.equal(hash(fs.readFileSync(path.join(root, name))), expectedHash, `source stayed unchanged: ${name}`);
persist();
console.log("TOTAL", JSON.stringify(report.totals), "of", selected.length, "mutants");
console.log("SURVIVORS", JSON.stringify(report.survivors));
console.log("REPORT", reportPath);
if (!report.ok) process.exitCode = 1;
