// The adapter layer between front ends (today adaptor/jaryo-cli.mjs; later, if wanted, an MCP or MCP-Apps host)
// and the read-only adaptors. A front end calls connect() and renders the view; it never reads a pipeline itself.
// This file only reads files.
import fs from "node:fs"; import path from "node:path";
import { readJournalFile, buildJournalView } from "./nisi-journal-adaptor.mjs";
import { buildView, latestRecordFile } from "./jaryo-adaptor.mjs";

export const SOURCES = Object.freeze({
  nisi: Object.freeze({
    label: "Nisi run journal (nisi-run-journal-v1), read-only, unauthenticated",
    load(manifest, target, now) {
      const input = readJournalFile(target);
      return buildJournalView(manifest, input, now);
    },
  }),
  record: Object.freeze({
    label: "Jaryo run record directory (run-NNNN.jsonl), read-only",
    load(manifest, target, now) {
      const fileNames = fs.readdirSync(target);
      const latest = latestRecordFile(fileNames);
      const text = latest ? fs.readFileSync(path.join(target, latest), "utf8") : "";
      return buildView(manifest, text, now);
    },
  }),
});

export function connect({ kind, manifestPath, target, now = Date.now() }) {
  if (!manifestPath) throw new Error("missing manifest");
  if (!target) throw new Error("missing target");
  const src = SOURCES[kind];
  if (!src) throw new Error(`unknown kind: ${kind}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return src.load(manifest, target, now);
}
