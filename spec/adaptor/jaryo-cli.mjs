// Jaryo CLI, the install route chosen in LOU-29: `jaryo connect <target> --manifest <m.json>` reads a pipeline's
// own record read-only through adaptor/sources.mjs and prints a summary, the view JSON, or a static page.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { connect, SOURCES } from "./sources.mjs";
import { renderViewPage } from "./build-view-page.mjs";

function err(msg) {
  process.stderr.write(msg + "\n");
  return 2;
}

function isMain() {
  try { return !!process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href; } catch { return false; }
}

function parse(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--manifest") out.manifest = argv[++i];
    else if (a === "--kind") out.kind = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--json") out.json = true;
    else if (a === "--force") out.force = true;
    else out._.push(a);
  }
  return out;
}

function summarize(view, kind) {
  const lines = [];
  lines.push(view.pipeline?.name ?? "");
  lines.push(`source: ${kind}${view.source?.authenticated === false ? " (unauthenticated)" : ""}`);
  for (const step of view.steps ?? []) lines.push(`${String(step.state ?? "").padEnd(8)} ${step.id}  ${step.reason ?? ""}`.trimEnd());
  for (const u of view.undeclared ?? []) lines.push(`UNKNOWN  ${u.logId ?? u.id}  not declared by the manifest`);
  for (const w of view.warnings ?? []) lines.push(`warning: ${w}`);
  return lines.join("\n");
}

export function main(argv) {
  try {
    const args = parse(argv);
    const cmd = args._[0];
    if (cmd === "sources") {
      for (const [k, v] of Object.entries(SOURCES)) console.log(`${k}: ${v.label}`);
      return 0;
    }
    if (cmd === "--help" || !cmd) {
      console.log("usage: jaryo connect <target> --manifest <manifest.json> [--kind nisi|record] [--out <view.html> [--force]] [--json]\n       jaryo sources\nRead-only: Jaryo reads the target and the manifest and never writes to them.");
      return 0;
    }
    if (cmd !== "connect") return err("unknown command");
    const target = args._[1];
    if (!target) return err("missing target");
    if (!args.manifest) return err("missing manifest");
    let kind = args.kind;
    let statTarget = null;
    try { statTarget = fs.statSync(target); } catch { return err("missing target"); }
    if (!kind) kind = statTarget.isDirectory() ? "record" : "nisi";
    const view = connect({ kind, manifestPath: args.manifest, target });
    if (args.json) {
      process.stdout.write(JSON.stringify(view, null, 2) + "\n");
      return 0;
    }
    if (args.out) {
      const out = path.resolve(args.out);
      const manifestReal = fs.realpathSync(args.manifest);
      const targetReal = fs.realpathSync(target);
      // Anything already at --out (a file, a folder or a symlink, even a dangling one) counts as existing.
      let existing = null;
      try { existing = fs.lstatSync(out); } catch { existing = null; }
      if (existing && !args.force) return err("output exists (use --force)");
      let outReal;
      try { outReal = existing ? fs.realpathSync(out) : path.join(fs.realpathSync(path.dirname(out)), path.basename(out)); } catch { return err("output path cannot be resolved"); }
      if (existing && !fs.statSync(outReal).isFile()) return err("output is not a regular file");
      if (outReal === manifestReal || outReal === targetReal) return err("refusing to overwrite manifest or target");
      // Never write into the pipeline's own folder: the target directory, or the folder holding a target file.
      const home = statTarget.isDirectory() ? targetReal : path.dirname(targetReal);
      const rel = path.relative(home, outReal);
      if (!rel.startsWith("..") && !path.isAbsolute(rel)) return err("refusing to write inside the target's folder");
      // Without --force, O_EXCL: fail rather than follow or replace anything created since the check.
      fs.writeFileSync(existing ? outReal : out, renderViewPage(view), { flag: existing ? "w" : "wx" });
      return 0;
    }
    console.log(summarize(view, kind));
    return 0;
  } catch (e) {
    return err(e && e.message ? e.message : "error");
  }
}

if (isMain()) process.exitCode = main(process.argv.slice(2));
