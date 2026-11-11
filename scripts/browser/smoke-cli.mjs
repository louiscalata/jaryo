const browsers = ["chromium", "firefox", "webkit"];

export function parseSmokeArgs(args, env = {}) {
  const positional = [];
  let explicit;
  for (const arg of args) {
    if (arg.startsWith("--browser=")) {
      if (explicit !== undefined) throw new Error("Specify --browser only once.");
      explicit = arg.slice("--browser=".length);
    } else if (arg.startsWith("--")) {
      throw new Error("Unknown smoke option: " + arg);
    } else positional.push(arg);
  }
  if (positional.length < 2 || positional.length > 4 || !positional[0] || !positional[1]) {
    throw new Error("Usage: smoke.mjs <labDir> <outJson> [shotDir] --browser=chromium|firefox|webkit");
  }
  const [labDir, outJson, shotDir, legacyBrowser] = positional;
  if (explicit !== undefined && legacyBrowser && explicit !== legacyBrowser) throw new Error("Conflicting explicit and legacy browser names.");
  // Windows PowerShell can remove a legacy empty shotDir argument. Refuse the
  // resulting ambiguous argv rather than silently treating firefox as a path.
  if (positional.length === 3 && browsers.includes(shotDir) && explicit === undefined && !env.SMOKE_BROWSER) {
    throw new Error("Ambiguous third argument; use --browser=" + shotDir + " instead of an empty positional placeholder.");
  }
  const engineName = explicit !== undefined ? explicit : legacyBrowser || env.SMOKE_BROWSER || "chromium";
  if (!browsers.includes(engineName)) throw new Error("Unknown smoke browser: " + engineName);
  return { labDir, outJson, shotDir, engineName };
}

export function verifyBrowserIdentity(browser, requested, report = () => {}) {
  const identity = { requested, actual: browser.browserType().name(), version: browser.version() };
  report(identity);
  if (!browsers.includes(requested) || identity.actual !== requested || typeof identity.version !== "string" || !identity.version.trim()) {
    throw new Error("Browser identity mismatch or missing version: " + JSON.stringify(identity));
  }
  return identity;
}
