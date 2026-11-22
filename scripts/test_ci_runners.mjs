// Browser-free check of CI runner routing in .github/workflows/ci.yml.
// It reads the workflow as text (no YAML dependency) and checks:
// - no blocking job targets an offline self-hosted runner label (pc-win, box-linux);
// - no Playwright job targets the Mac runner;
// - the required `browsers` job runs Firefox and WebKit on GitHub-hosted Ubuntu 24.04
//   with a timeout and the same smoke commands and widths;
// - every script path the workflow runs exists.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = process.argv[2] || path.join(root, ".github", "workflows", "ci.yml");
const text = fs.readFileSync(workflowPath, "utf8");

// Split the top-level `jobs:` mapping into job blocks keyed by job id (two-space indent).
function parseJobs(source) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  assert.notEqual(start, -1, "workflow has a top-level jobs: mapping");
  const jobs = new Map();
  let current;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const id = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (id) { current = { id: id[1], lines: [] }; jobs.set(id[1], current); continue; }
    if (current) current.lines.push(line);
  }
  return jobs;
}

// A job-level key sits at four spaces of indent.
function jobKey(job, key) {
  const match = job.lines.map((line) => new RegExp("^ {4}" + key + ":\\s*(.*)$").exec(line)).find(Boolean);
  return match ? match[1].trim() : undefined;
}

// Step blocks start at "      - " (six spaces); each keeps its own lines.
function steps(job) {
  const out = [];
  for (const line of job.lines) {
    if (/^ {6}- /.test(line)) out.push([line]);
    else if (out.length && (/^ {7,}\S/.test(line) || line.trim() === "")) out[out.length - 1].push(line);
  }
  return out.map((block) => {
    const body = block.join("\n");
    const wd = /^ {8}working-directory:\s*(\S+)/m.exec(body);
    return { body, workingDirectory: wd ? wd[1] : "." };
  });
}

const offlineLabels = ["pc-win", "box-linux"];
const jobs = parseJobs(text);
let passed = 0;
function test(name, run) { run(); passed++; console.log("PASS", name); }

test("workflow defines the required check, browsers and forced-colors jobs", () => {
  for (const id of ["check", "browsers", "forced-colors"]) assert.ok(jobs.has(id), "missing job " + id);
});

for (const job of jobs.values()) {
  const runsOn = jobKey(job, "runs-on") || "";
  const optional = jobKey(job, "continue-on-error") === "true";
  const body = job.lines.join("\n");
  test(job.id + ": no blocking job waits on an offline self-hosted runner", () => {
    for (const label of offlineLabels) {
      assert.ok(optional || !runsOn.includes(label), job.id + " runs-on " + runsOn + " needs " + label + " but is not continue-on-error");
    }
  });
  if (/playwright/.test(body)) {
    test(job.id + ": Playwright job never targets the Mac runner", () => assert.ok(!runsOn.includes("mac-m5"), job.id + " runs-on " + runsOn));
  }
}

const browsers = jobs.get("browsers");
test("browsers runs on GitHub-hosted ubuntu-24.04 for every event", () => assert.equal(jobKey(browsers, "runs-on"), "ubuntu-24.04"));
test("browsers stays a blocking job", () => assert.notEqual(jobKey(browsers, "continue-on-error"), "true"));
test("browsers has a timeout of at most 60 minutes", () => {
  const minutes = Number(jobKey(browsers, "timeout-minutes"));
  assert.ok(Number.isInteger(minutes) && minutes > 0 && minutes <= 60, "timeout-minutes " + jobKey(browsers, "timeout-minutes"));
});
test("browsers installs pinned Playwright Firefox and WebKit with their apt dependencies", () => {
  const body = browsers.lines.join("\n");
  assert.match(body, /npm install[^\n]*playwright@1\.49\.1/);
  assert.match(body, /playwright"? install --with-deps firefox webkit/);
});
test("browsers keeps the Firefox and WebKit smoke commands and widths", () => {
  const body = browsers.lines.join("\n");
  for (const engine of ["firefox", "webkit"]) {
    assert.match(body, new RegExp('SMOKE_WIDTHS=1280,375,260 node scripts/browser/smoke\\.mjs "\\$PWD" \\S+ --browser=' + engine));
  }
});
test("browsers has no Windows-only steps left", () => assert.doesNotMatch(browsers.lines.join("\n"), /runner\.os == 'Windows'|shell: powershell/));

test("docs and smoke messages no longer describe the retired PC runner mapping for browsers", () => {
  const stale = [/on the PC or hosted Linux/i, /PC or hosted Linux/i, /retains its PC runner mapping/i];
  for (const rel of ["README.md", "AGENTS.md", "roadmap.md", "VERIFICATION.md", "CHANGES.md", "docs/CHECKS.md", "scripts/browser/smoke.mjs"]) {
    const body = fs.readFileSync(path.join(root, rel), "utf8");
    for (const pattern of stale) assert.doesNotMatch(body, pattern, rel + " still says " + pattern);
  }
});

test("every script the workflow runs exists", () => {
  const missing = [];
  let count = 0;
  for (const job of jobs.values()) {
    for (const step of steps(job)) {
      for (const line of step.body.split("\n")) {
        if (/^\s*if \[ -f /.test(line)) continue; // guarded optional file
        for (const m of line.matchAll(/\b(?:node|python3)\s+(?:--check\s+)?([\w./-]+\.(?:mjs|js|py))\b/g)) {
          count++;
          const file = path.join(root, step.workingDirectory, m[1]);
          if (!fs.existsSync(file)) missing.push(job.id + ": " + path.relative(root, file));
        }
      }
    }
  }
  assert.ok(count > 0, "found no script references");
  assert.deepEqual(missing, []);
});

test("Node warning policy reaches every Node test step and its children", () => {
  const declaration = /^ {10}NODE_OPTIONS: &warnings-as-errors '([^']+)'$/m;
  const alias = /^ {10}NODE_OPTIONS: \*warnings-as-errors$/m;
  let nodeSteps = 0;
  for (const job of jobs.values()) {
    for (const step of steps(job)) {
      if (!/\bnode\s+(?:--check\s+)?[\w./-]+\.m?js\b/.test(step.body)) continue;
      assert.ok(declaration.test(step.body) || alias.test(step.body), `${job.id} runs Node without the warning policy`);
      nodeSteps++;
    }
  }
  assert.ok(nodeSteps > 0);

  const options = declaration.exec(text)?.[1];
  assert.ok(options);
  const env = { ...process.env, NODE_OPTIONS: options.replace("${{ toJSON(github.workspace) }}", JSON.stringify(root)) };
  const run = (source, ...args) => spawnSync(process.execPath, [...args, "-e", source], {
    env, cwd: path.join(root, "spec"), encoding: "utf8",
  });
  assert.equal(run("").status, 0);
  for (const type of ["Warning", "DeprecationWarning"]) {
    const source = `process.emitWarning("warning policy control", ${JSON.stringify(type)})`;
    const result = run(source);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /warning policy control/);
  }
  const nested = run(`
    const { spawnSync } = require("node:child_process");
    const result = spawnSync(process.execPath, ["-e", 'process.emitWarning("child warning policy control")'], { stdio: "inherit" });
    process.exitCode = result.status;
  `);
  assert.equal(nested.status, 1, nested.stderr);
  assert.match(nested.stderr, /child warning policy control/);

  const startup = run("", "--experimental-loader=data:text/javascript,");
  assert.equal(startup.status, 1, "Node startup warning must be fatal");
  assert.match(startup.stderr, /ExperimentalWarning/);
  assert.match(startup.stderr, /--experimental-loader/);
});

// Self-test of the parser on fixtures, so a parser bug cannot make the routing checks pass vacuously.
test("parser flags a blocking pc-win job and accepts an optional one", () => {
  const fixture = (extra) => "jobs:\n  win:\n    runs-on: [self-hosted, pc-win]\n" + extra + "    steps:\n      - run: echo hi\n";
  const blocking = parseJobs(fixture("")).get("win");
  const optional = parseJobs(fixture("    continue-on-error: true\n")).get("win");
  assert.ok(jobKey(blocking, "runs-on").includes("pc-win"));
  assert.equal(jobKey(blocking, "continue-on-error"), undefined);
  assert.equal(jobKey(optional, "continue-on-error"), "true");
});

console.log("TOTAL", passed, "/", passed, "ci runner checks");
