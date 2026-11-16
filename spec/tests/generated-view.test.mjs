// Keep the committed adaptor snapshots reproducible with the current template.
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import assert from "node:assert/strict"; import { isDeepStrictEqual } from "node:util"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { buildView } = await import(pathToFileURL(path.join(root, "adaptor/jaryo-adaptor.mjs")).href);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jaryo-generated-"));
let n = 0, failed = 0;
const test = (name, fn) => { n++; try { fn(); console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, e.message); } };
const records = { "adaptor-view.html": "pipeline/runs/run-0005.jsonl", "adaptor-view-failed-example.html": "pipeline/runs/run-0002.jsonl",
  "adaptor-view-undeclared-fixture.html": "pipeline/fixtures/undeclared-step-run.jsonl" };
for (const name of ["adaptor-view.html", "adaptor-view-failed-example.html", "adaptor-view-undeclared-fixture.html"]) {
  const html = fs.readFileSync(path.join(root, "reference", name), "utf8");
  const view = JSON.parse(html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/)[1]);
  {
    test(name === "adaptor-view-failed-example.html" ? "the failed example view is rebuilt from its recorded run" : `${name} matches the current adaptor and its recorded run`, () => {
      // These are the manifest declarations captured by this historical snapshot.
      const manifest = { ...view.pipeline, declares: { actions: view.capabilities.declared, events: view.capabilities.eventStream,
        ...(view.capabilities.heartbeat === null ? {} : { heartbeat: view.capabilities.heartbeat }) },
        steps: view.steps.map(({ id, name, needs, consequential }) => ({ id, name, needs, consequential })) };
      const record = fs.readFileSync(path.join(root, records[name]), "utf8");
      assert.ok(isDeepStrictEqual(view, buildView(manifest, record, Date.parse(view.generatedAt))), "snapshot view differs from the adaptor result for its recorded run");
    });
  }
  test(`${name} uses the current page builder and template`, () => {
    const input = path.join(tmp, "view.json"), output = path.join(tmp, "page.html");
    fs.writeFileSync(input, JSON.stringify(view));
    const built = spawnSync(process.execPath, [path.join(root, "adaptor/build-view-page.mjs"), input, output], { encoding: "utf8" });
    assert.equal(built.status, 0, built.stderr);
    assert.ok(fs.readFileSync(output, "utf8") === html, "snapshot HTML differs from the current builder output");
  });
}
console.log(`${n - failed}/${n} passed`);
process.exit(failed ? 1 : 0);
