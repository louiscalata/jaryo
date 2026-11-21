import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "jaryo package "));

try {
  execFileSync("npm", ["pack", "--offline", "--pack-destination", scratch], { cwd: repo });
  const archives = fs.readdirSync(scratch).filter(name => name.endsWith(".tgz"));
  assert.equal(archives.length, 1);
  execFileSync("npm", [
    "install", "--prefix", scratch, "--offline", "--ignore-scripts", "--no-audit", "--no-fund",
    path.join(scratch, archives[0]),
  ], { cwd: scratch });

  const cli = path.join(scratch, "node_modules", ".bin", "jaryo");
  const run = (...args) => execFileSync(cli, args, { cwd: scratch, encoding: "utf8" });
  const journal = path.join(repo, "spec", "pipeline", "fixtures", "nisi-bundle-demo-journal.jsonl");
  const manifest = path.join(repo, "spec", "pipeline", "nisi-bundle-demo.manifest.json");
  const connectArgs = ["connect", journal, "--manifest", manifest];
  const sources = run("sources");
  assert.match(sources, /\bnisi\b/);
  assert.match(sources, /\brecord\b/);
  const view = JSON.parse(run(...connectArgs, "--json"));
  assert.equal(view.steps.find(step => step.id === "fixed-run")?.state, "OK");
  assert.equal(view.steps.find(step => step.id === "tests")?.state, "UNKNOWN");
  const html = path.join(scratch, "view.html");
  run(...connectArgs, "--out", html);
  assert.match(fs.readFileSync(html, "utf8"), /jaryo-view\/0/);
  console.log("Installed Jaryo CLI listed sources, read a journal and rendered HTML");
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
