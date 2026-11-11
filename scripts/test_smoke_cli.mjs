// Browser-free command transport and identity checks, including legacy argv loss.
import assert from "node:assert/strict";
import { parseSmokeArgs, verifyBrowserIdentity } from "./browser/smoke-cli.mjs";
let passed = 0;
function test(name, run) { run(); passed++; console.log("PASS", name); }
const args = ["lab path", "out path.json"];
for (const engine of ["chromium", "firefox", "webkit"]) {
  test("explicit " + engine, () => assert.deepEqual(parseSmokeArgs([...args, "--browser=" + engine]), { labDir:args[0], outJson:args[1], shotDir:undefined, engineName:engine }));
  test("legacy empty shotDir " + engine, () => assert.equal(parseSmokeArgs([...args, "", engine]).engineName, engine));
  test("identity " + engine, () => {
    let observed;
    const result = verifyBrowserIdentity({ browserType:()=>({name:()=>engine}), version:()=>"fixture-version" }, engine, value => { observed = value; });
    assert.deepEqual(result, {requested:engine,actual:engine,version:"fixture-version"});
    assert.equal(observed, result);
  });
}
test("default Chromium with ordinary screenshot directory", () => assert.equal(parseSmokeArgs([...args, "shots"]).engineName, "chromium"));
test("explicit browser preserves screenshot directory", () => assert.equal(parseSmokeArgs([...args, "shots", "--browser=webkit"]).shotDir, "shots"));
test("explicit flag may precede positional arguments", () => assert.equal(parseSmokeArgs(["--browser=firefox", ...args]).engineName, "firefox"));
test("explicit flag overrides environment default", () => assert.equal(parseSmokeArgs([...args, "--browser=webkit"], {SMOKE_BROWSER:"chromium"}).engineName, "webkit"));
test("environment default remains supported", () => assert.equal(parseSmokeArgs(args, {SMOKE_BROWSER:"firefox"}).engineName, "firefox"));
test("matching explicit and legacy names remain supported", () => assert.equal(parseSmokeArgs([...args, "shots", "webkit", "--browser=webkit"]).engineName, "webkit"));
test("before evidence: removed empty argument formerly selected Chromium", () => {
  const shifted = [...args, "firefox"];
  const [, , oldShotDir, oldBrowser] = shifted;
  assert.equal(oldShotDir, "firefox"); assert.equal(oldBrowser || "chromium", "chromium");
  assert.throws(() => parseSmokeArgs(shifted), /Ambiguous third argument/);
});
test("explicit browser disambiguates a browser-named screenshot directory", () => assert.equal(parseSmokeArgs([...args, "firefox", "--browser=chromium"]).shotDir, "firefox"));
for (const bad of [[], ["lab"], ["", "out"], [...args, "--browser="], [...args, "--browser=safari"], [...args, "--browser=firefox", "--browser=webkit"], [...args, "--unknown"], [...args, "shots", "webkit", "--browser=firefox"], [...args, "shots", "safari"], [...args, "shots", "firefox", "extra"]]) {
  test("invalid argv " + JSON.stringify(bad), () => assert.throws(() => parseSmokeArgs(bad)));
}
test("invalid environment browser fails", () => assert.throws(() => parseSmokeArgs(args, {SMOKE_BROWSER:"safari"})));
test("actual engine mismatch fails after reporting identity", () => {
  let observed;
  assert.throws(() => verifyBrowserIdentity({browserType:()=>({name:()=>"chromium"}),version:()=>"fixture-version"}, "firefox", value => { observed=value; }), /identity mismatch/);
  assert.equal(observed.actual, "chromium"); assert.equal(observed.requested, "firefox");
});
test("missing browser version fails", () => assert.throws(() => verifyBrowserIdentity({browserType:()=>({name:()=>"webkit"}),version:()=>""}, "webkit"), /missing version/));
console.log("TOTAL", passed, "/", passed, "browser-free smoke CLI");
