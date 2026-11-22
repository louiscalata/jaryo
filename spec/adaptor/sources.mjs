// The adapter layer between front ends (today adaptor/jaryo-cli.mjs; later, if wanted, an MCP or MCP-Apps host)
// and the read-only adaptors. A front end calls connect() and renders the view; it never reads a pipeline itself.
// This file only reads files.
import fs from "node:fs"; import path from "node:path";
import { readJournalFile, buildJournalView } from "./nisi-journal-adaptor.mjs";
import { buildView, latestRecordFile } from "./jaryo-adaptor.mjs";

function loadNisi(manifest, target, now) {
  const input = readJournalFile(target);
  return { view: buildJournalView(manifest, input, now), inputPaths: [target] };
}

function loadRecord(manifest, target, now) {
  const latest = latestRecordFile(fs.readdirSync(target));
  const recordPath = latest ? path.join(target, latest) : null;
  const text = recordPath ? fs.readFileSync(recordPath, "utf8") : "";
  return { view: buildView(manifest, text, now), inputPaths: recordPath ? [recordPath] : [] };
}

export const SOURCES = Object.freeze({
  nisi: Object.freeze({
    label: "Nisi run journal (nisi-run-journal-v1), read-only, unauthenticated",
    load: (...args) => loadNisi(...args).view,
    loadWithInputs: loadNisi,
  }),
  record: Object.freeze({
    label: "Jaryo run record directory (run-NNNN.jsonl), read-only",
    load: (...args) => loadRecord(...args).view,
    loadWithInputs: loadRecord,
  }),
});

export function connectWithInputs({ kind, manifestPath, target, now = Date.now() }) {
  if (!manifestPath) throw new Error("missing manifest");
  if (!target) throw new Error("missing target");
  const src = Object.getOwnPropertyDescriptor(SOURCES, kind)?.value;
  if (!src) throw new Error(`unknown kind: ${kind}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const loaded = src.loadWithInputs(manifest, target, now);
  return { ...loaded, inputPaths: [manifestPath, ...loaded.inputPaths] };
}

export function connect({ kind, manifestPath, target, now = Date.now() }) {
  return connectWithInputs({ kind, manifestPath, target, now }).view;
}
