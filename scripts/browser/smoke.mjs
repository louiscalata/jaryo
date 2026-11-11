// Usage: node smoke.mjs <labDir> <outJson> [shotDir] --browser=chromium|firefox|webkit
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
import { runExpandedLayoutChecks, contrast } from "./expanded-layout.mjs";
import { parseSmokeArgs, verifyBrowserIdentity } from "./smoke-cli.mjs";
import { assessFocusCoverage, requiredLinks, readFocusedTarget } from "./focus-coverage.mjs";
let options;
try { options = parseSmokeArgs(process.argv.slice(2), process.env); }
catch (error) { console.error(error.message); process.exit(1); }
if (process.platform === "darwin") {
  console.error("Browser smoke runs on the PC or hosted Linux, not on the Mac.");
  process.exit(1);
}
const { labDir, outJson, shotDir, engineName } = options;
const { chromium, firefox, webkit } = await import("playwright");
const engines = { chromium, firefox, webkit };
const widths = (process.env.SMOKE_WIDTHS || "1280,260").split(",").map((n) => Number(n.trim())).filter((n) => n > 0);
const types = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".png":"image/png" };
const server = http.createServer((req, res) => {
  const p = path.join(labDir, decodeURIComponent(req.url.split("?")[0]).replace(/^\/$/, "/index.html"));
  if (!p.startsWith(labDir) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }); fs.createReadStream(p).pipe(res);
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/index.html`;
const out = { checks: [], errors: [] };
const check = (name, pass, detail) => { out.checks.push({ name, pass: !!pass, detail }); console.log(pass ? "PASS" : "FAIL", name, detail !== undefined ? JSON.stringify(detail) : ""); };
// Scroll clear of the fixed toast, then let locator.click wait until the
// target is visible, stable, enabled, and the top element at the point.
async function clickReady(locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" }));
  await locator.waitFor({ state: "visible" });
  await locator.click({ trial: true });
  await locator.click();
}
const launchOpts = engineName === "chromium"
  ? { args: ["--use-mock-keychain", "--password-store=basic"] }
  : {};
const browser = await engines[engineName].launch(launchOpts);
try {
  const identity = verifyBrowserIdentity(browser, engineName, value => console.log("BROWSER", JSON.stringify(value)));
  check("requested browser matches launched engine and reports version", true, identity);
} catch (error) {
  check("requested browser matches launched engine and reports version", false, String(error));
  fs.writeFileSync(outJson, JSON.stringify(out, null, 2));
  try { await browser.close(); } finally { server.close(); }
  throw error;
}
async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.width || 1280, height: 900 }, colorScheme: opts.colorScheme || "light", reducedMotion: opts.reducedMotion || "no-preference" });
  try {
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "error") out.errors.push(`[${opts.tag||"main"}] ${m.text()}`); });
    page.on("pageerror", (e) => out.errors.push(`[${opts.tag||"main"}] pageerror ${e}`));
    await page.goto(url); await page.waitForSelector(".opt-card");
    return { ctx, page };
  } catch (error) {
    await ctx.close();
    throw error;
  }
}
const famIds = await (async () => { const { ctx, page } = await open(); const f = await page.$$eval("[data-fam]", (b) => b.map((x) => x.dataset.fam)); await ctx.close(); return f; })();

// 1) Count + click every option (mouse), at 1280 and 260
for (const width of widths) {
  const { ctx, page } = await open({ width, tag: "click-" + width });
  const data = await page.evaluate(() => { const d = window.JARYO_LAB_DATA; return { fams: d.families.length, opts: d.families.reduce((n, f) => n + f.options.length, 0), monoBase: d.families.filter(f=>/^F(0[1-9]|1[0-6])$/.test(f.id)).reduce((n,f)=>n+f.options.length,0), color: (d.families.find(f=>f.id==="F17")||{options:[]}).options.length, legacy: (d.families.find(f=>f.id==="F18")||{options:[]}).options.length, red: (d.families.find(f=>f.id==="F19")||{options:[]}).options.length }; });
  let domTotal = 0, clicked = 0, fails = [];
  for (const fam of famIds) {
    await clickReady(page.locator(`[data-fam="${fam}"]`));
    const ids = await page.$$eval("#cards .opt-card", (c) => c.map((x) => x.dataset.id));
    domTotal += ids.length;
    for (const id of ids) {
      await clickReady(page.locator(`.opt-card[data-id="${id}"] .choose-label`));
      const ok = await page.evaluate((id) => {
        const card = document.querySelector(`.opt-card[data-id="${id}"]`);
        const r = card.querySelector('input[type=radio]');
        const stored = JSON.parse(localStorage.getItem("jaryo-adaptive-lab-choices-v1") || "{}");
        return card.classList.contains("chosen") && r.checked && /CHOSEN/.test(card.querySelector(".chosen-marker").textContent) && stored.choices && stored.choices[id.slice(0,3)] === id && document.querySelectorAll("#cards .opt-card.chosen").length === 1;
      }, id);
      if (ok) clicked++; else fails.push(id);
    }
    // expand toggle on first card
    const b = page.locator("#cards .expand-btn").first();
    await clickReady(b);
    const exp = await b.getAttribute("aria-expanded");
    if (exp !== "true") fails.push(fam + ":expand");
    await clickReady(b);
  }
  const expectedOpts = data.fams >= 19 ? 97 : 85;
  const expectedFams = data.fams >= 19 ? 19 : 17;
  // WebKit at 260px on Windows can briefly show 18/19 after the last click; wait for the summary to catch up.
  await clickReady(page.locator('.tab[data-tab="summary"]'));
  await page.waitForSelector("#summary-count");
  try {
    await page.waitForFunction((re) => new RegExp(re).test(document.querySelector("#summary-count")?.textContent || ""), `^${expectedFams} / ${expectedFams}`, { timeout: 5000 });
  } catch {
    // Keep the original assertion below so a real shortfall still fails the job.
  }
  const summary = await page.textContent("#summary-count");
  check(`options-count data (w=${width})`, data.opts === expectedOpts && data.fams === expectedFams && data.color === 5 && data.legacy === (expectedFams>=19?8:0) && data.red === (expectedFams>=19?4:0), data);
  check(`original-85 still present (w=${width})`, data.monoBase === 80, data);
  check(`options-count DOM rendered (w=${width})`, domTotal === expectedOpts, domTotal);
  const groups = await page.evaluate(() => ({ monoBase: [...document.querySelectorAll("#family-nav [data-fam]")].filter(e=>/^F(0[1-9]|1[0-6])$/.test(e.dataset.fam)).length, color: document.querySelectorAll('#family-nav [data-fam="F17"]').length, legacy: document.querySelectorAll('#family-nav [data-fam="F18"]').length, red: document.querySelectorAll('#family-nav [data-fam="F19"]').length, labels: [...document.querySelectorAll("#family-nav .navgroup")].map(e => e.textContent) }));
  const labelOk = groups.labels.some(t=>/Monochrome set/.test(t)) && groups.labels.some(t=>/Color batch/.test(t)) && (expectedFams<19 || (groups.labels.some(t=>/Legacy studies/.test(t)) && groups.labels.some(t=>/Red interactive UI/.test(t))));
  check(`nav groups present (w=${width})`, groups.monoBase === 16 && groups.color === 1 && labelOk, groups);
  check(`all options selectable by click (w=${width})`, clicked === expectedOpts && fails.length === 0, { clicked, fails, expectedOpts });
  const sumN = expectedFams; check(`summary shows ${sumN}/${sumN} (w=${width})`, new RegExp(`^${sumN} / ${sumN}`).test(summary), summary);
  const hs = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`no horizontal overflow after click-through (w=${width})`, hs <= 0, hs);
  await ctx.close();
}

// 2) Keyboard radiogroup nav
{
  const { ctx, page } = await open({ tag: "kbd" });
  await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector(".opt-card");
  await page.click('[data-fam="F02"]');
  const roles = await page.evaluate(() => { const g = document.querySelector("#cards"); return { role: g.getAttribute("role"), name: g.getAttribute("aria-labelledby") && document.getElementById(g.getAttribute("aria-labelledby")).textContent, radios: g.querySelectorAll('input[type=radio]').length, tabbable: [...g.querySelectorAll('input[type=radio]')].filter(r=>r.tabIndex===0).map(r=>r.value) }; });
  check("radiogroup role + label + single tab stop", roles.role === "radiogroup" && roles.radios === 5 && roles.tabbable.length === 1 && roles.tabbable[0] === "F02.01", roles);
  // Tab from the tablist's last focusable... focus the section title region: focus first tab then Tab until a radio
  await page.focus('.tab[aria-selected="true"]');
  let landed = null;
  for (let i = 0; i < 6; i++) { await page.keyboard.press("Tab"); landed = await page.evaluate(() => document.activeElement.matches('input[type=radio]') ? document.activeElement.value : null); if (landed) break; }
  check("Tab lands on first radio when none chosen", landed === "F02.01", landed);
  const fv = await page.evaluate(() => { const l = document.activeElement.closest(".choose-label"); const s = getComputedStyle(l); return { style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor, matches: document.activeElement.matches(":focus-visible") }; });
  check("radio focus ring visible (label outline dashed 3px)", fv.matches && fv.style === "dashed" && fv.width === "3px", fv);
  if (shotDir) await page.screenshot({ path: path.join(shotDir, "focus-radio-light-1280.png") });
  const seq = [];
  const cur = () => page.evaluate(() => ({ focus: document.activeElement.value, checked: (document.querySelector('#cards input:checked')||{}).value || null, stored: (JSON.parse(localStorage.getItem("jaryo-adaptive-lab-choices-v1")||"{}").choices||{}).F02 || null, tabbable: [...document.querySelectorAll('#cards input[type=radio]')].filter(r=>r.tabIndex===0).map(r=>r.value).join() }));
  await page.keyboard.press("Space"); seq.push(["Space", await cur()]);
  await page.keyboard.press("ArrowRight"); seq.push(["ArrowRight", await cur()]);
  await page.keyboard.press("ArrowDown"); seq.push(["ArrowDown", await cur()]);
  await page.keyboard.press("End"); seq.push(["End", await cur()]);
  await page.keyboard.press("ArrowRight"); seq.push(["ArrowRight(wrap)", await cur()]);
  await page.keyboard.press("ArrowLeft"); seq.push(["ArrowLeft(wrap)", await cur()]);
  await page.keyboard.press("Home"); seq.push(["Home", await cur()]);
  await page.keyboard.press("ArrowUp"); seq.push(["ArrowUp(wrap)", await cur()]);
  const exp = [["Space","F02.01"],["ArrowRight","F02.03"],["ArrowDown","F02.04"],["End","F02.09"],["ArrowRight(wrap)","F02.01"],["ArrowLeft(wrap)","F02.09"],["Home","F02.01"],["ArrowUp(wrap)","F02.09"]];
  const ok = seq.every(([k, s], i) => s.focus === exp[i][1] && s.checked === exp[i][1] && s.stored === exp[i][1] && s.tabbable === exp[i][1]);
  check("arrow/Home/End/Space move+select, roving tabindex follows, persisted", ok, seq);
  // Tab out goes to Expand button of... next focusable after radio, then Shift+Tab returns to checked radio
  await page.keyboard.press("Tab");
  const afterTab = await page.evaluate(() => document.activeElement.className + "|" + document.activeElement.dataset.expand);
  await page.keyboard.press("Shift+Tab");
  const back = await page.evaluate(() => document.activeElement.value);
  check("Tab leaves group (one stop), Shift+Tab returns to checked radio", /expand-btn/.test(afterTab) && back === "F02.09", { afterTab, back });
  // Space on expand button
  await page.keyboard.press("Tab"); await page.keyboard.press("Space");
  const ex = await page.evaluate(() => document.activeElement.getAttribute("aria-expanded"));
  check("Expand button keyboard (Space) toggles aria-expanded", ex === "true", ex);
  // Tabs pattern
  await page.focus('.tab[data-tab="compare"]');
  await page.keyboard.press("ArrowRight");
  let t = await page.evaluate(() => ({ f: document.activeElement.dataset.tab, sel: document.querySelector('.tab[aria-selected=true]').dataset.tab, vis: document.querySelector('#panel-journeys').classList.contains('active') }));
  await page.keyboard.press("End");
  const t2 = await page.evaluate(() => document.activeElement.dataset.tab);
  await page.keyboard.press("Home");
  const t3 = await page.evaluate(() => ({ f: document.activeElement.dataset.tab, tabbable: [...document.querySelectorAll('.tab')].filter(x=>x.tabIndex===0).length }));
  check("tablist arrows/Home/End with roving tabindex", t.f === "journeys" && t.sel === "journeys" && t.vis && t2 === "docs" && t3.f === "compare" && t3.tabbable === 1, { t, t2, t3 });
  // Theme select
  await page.selectOption("#theme-select", "dark");
  await page.waitForTimeout(400); // body bg has a quiet 160ms transition
  const th = await page.evaluate(() => ({ attr: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor, stored: localStorage.getItem("jaryo-adaptive-lab-theme") }));
  await page.reload(); await page.waitForSelector(".opt-card");
  const th2 = await page.evaluate(() => ({ attr: document.documentElement.dataset.theme, sel: document.querySelector("#theme-select").value, choiceKept: (JSON.parse(localStorage.getItem("jaryo-adaptive-lab-choices-v1")).choices||{}).F02 }));
  check("theme toggle dark persists across reload, choices untouched", th.attr === "dark" && th.bg === "rgb(12, 12, 12)" && th2.attr === "dark" && th2.sel === "dark" && th2.choiceKept === "F02.09", { th, th2 });
  await page.selectOption("#theme-select", "system");
  await ctx.close();
}

// 3) Focus-visible on every interactive element type, both themes; ring contrast vs page bg
for (const scheme of ["light", "dark"]) for (const width of widths) {
  const { ctx, page } = await open({ colorScheme: scheme, width, tag: "focus-" + scheme });
  const res = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(readFocusedTarget);
    if (r) res.push(r); // Every sample participates, including repeated type keys.
  }
  const directLinks = [];
  for (const spec of requiredLinks) {
    const locator = page.locator(spec.selector), matchCount = await locator.count();
    try {
      if (matchCount !== 1) throw new Error("Expected one real link, found " + matchCount);
      await page.keyboard.press("Tab"); // Establish keyboard modality, then test direct focus separately.
      await locator.focus({ timeout: 5000 });
      await page.waitForFunction(selector => document.activeElement?.matches(selector) && document.activeElement.matches(":focus-visible"), spec.selector, { timeout: 5000 });
      await locator.scrollIntoViewIfNeeded({ timeout: 5000 });
      directLinks.push({ ...await page.evaluate(readFocusedTarget, spec.selector), id:spec.id, matchCount });
    } catch (error) { directLinks.push({ id:spec.id, matchCount, active:false, error:String(error) }); }
  }
  const coverage = assessFocusCoverage(res, directLinks);
  const reachability = { scheme, width, tabSteps:60, links:requiredLinks.map(spec => ({ id:spec.id, reachedByTab:res.some(r => r.tag === "A" && r.href === spec.href) })) };
  (out.focusReachability ||= []).push(reachability);
  console.log("MEASURED natural Tab reachability", JSON.stringify(reachability));
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const ring = res.find((r) => r.key.startsWith("BUTTON"))?.color;
  const cr = ring ? contrast(ring, bodyBg) : 0;
  check(`focus-visible rings on observed Tab targets (${scheme}, w=${width})`, coverage.badTabbed.length === 0 && coverage.missingControls.length === 0, { types:[...new Set(res.map(r=>r.key))], controls:coverage.observedControls, missing:coverage.missingControls, bad:coverage.badTabbed });
  check(`skip/header links focus-visible with contrast (${scheme}, w=${width})`, coverage.badLinks.length === 0, { mode:"direct focus after keyboard input", bad:coverage.badLinks, links:directLinks });
  check(`focus ring contrast >= 3:1 vs page (${scheme}, w=${width})`, cr >= 3, { ring, bodyBg, ratio: +cr.toFixed(2) });
  if (shotDir && width === 260) {
    await page.click('[data-fam="F04"]');
    await page.locator('#cards input[type=radio]').first().focus();
    await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowLeft");
    await page.locator('#cards .opt-card').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(shotDir, `focus-radio-${scheme}-260.png`) });
  }
  await ctx.close();
}

// 4) Reduced motion
for (const rm of ["no-preference", "reduce"]) {
  const { ctx, page } = await open({ reducedMotion: rm, tag: "rm-" + rm });
  await page.click('[data-fam="F13"]');
  const r = await page.evaluate(() => {
    const d = document.querySelector("#cards .dash"); const s = d && getComputedStyle(d);
    const btn = getComputedStyle(document.querySelector(".btn"));
    const note = document.querySelector(".motion-note"); 
    return { anim: s && s.animationName, dur: s && s.animationDuration, btnTransition: btn.transitionDuration, scroll: getComputedStyle(document.documentElement).scrollBehavior, noteShown: note ? getComputedStyle(note).display !== "none" : null };
  });
  if (rm === "reduce") check("reduced-motion: dash animation off, transitions ~0, smooth scroll off, note shown", r.anim === "none" && parseFloat(r.btnTransition) < 0.01 && r.scroll === "auto" && r.noteShown === true, r);
  else check("default motion: dash animates, transitions on", r.anim === "dashmove" && parseFloat(r.btnTransition) > 0 && r.noteShown === false, r);
  if (shotDir && rm === "reduce") await page.screenshot({ path: path.join(shotDir, "reduced-motion-F13-1280.png") });
  await ctx.close();
}

// 5) Narrow usability: hit targets at 260
{
  const { ctx, page } = await open({ width: 260, tag: "w260" });
  const small = await page.evaluate(() => [...document.querySelectorAll("button, select, .choose-label")].filter((e) => e.offsetParent).map((e) => {
    const r = e.getBoundingClientRect();
    let scroller = false;
    for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(n).overflowX)) { scroller = true; break; }
    }
    return { t: (e.id || e.className || e.tagName) + "", w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), left: Math.round(r.left), scroller };
  }).filter((x) => x.h < 44 || x.w < 44 || (!x.scroller && (x.right > 260 || x.left < 0))));
  check("w=260: all visible controls >=44x44 and inside viewport", small.length === 0, small.slice(0, 10));
  if (shotDir) { await page.click('[data-fam="F17"]'); await page.locator("#section-title").scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(shotDir, "light-260-F17-cards.png") }); }
  await ctx.close();
}
// Expanded normal cards and full-width F18/F19 frames, including ultrawide.
// This bounded matrix does not repeat the 97-option click-through at 1920.
for (const width of [1280, 375, 260, 1920]) for (const colorScheme of ["light", "dark"]) {
  let ctx;
  try {
    const opened = await open({ width, colorScheme, reducedMotion: "reduce", tag: `expanded-${colorScheme}-${width}` });
    ctx = opened.ctx;
    const { page } = opened;
    await runExpandedLayoutChecks({ page, width, check });
  } catch (error) {
    check(`expanded matrix completes (${colorScheme}, w=${width})`, false, String(error));
  } finally {
    if (ctx) {
      try { await ctx.close(); }
      catch (error) { check(`expanded context closes (${colorScheme}, w=${width})`, false, String(error)); }
    }
  }
}
check("no console errors across smoke run", out.errors.length === 0, out.errors);
fs.writeFileSync(outJson, JSON.stringify(out, null, 2));
const passed = out.checks.filter((c) => c.pass).length;
console.log("TOTAL", passed, "/", out.checks.length, engineName);
try { await browser.close(); } finally { server.close(); }
if (passed !== out.checks.length || out.errors.length) process.exit(1);
