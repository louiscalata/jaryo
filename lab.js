/* Jaryo Adaptive Design Lab — interactive companion (local demo only) */
(function () {
  "use strict";

  const STORAGE_KEY = "jaryo-adaptive-lab-choices-v1";
  const DATA_URL = "data/curated-extended.json";

  /** @type {any} */
  let DATA = null;
  /** @type {Record<string,string>} */
  let choices = {};
  let storageOk = true;
  let storageMsg = "";
  let activeFamily = "F01";
  let activeTab = "compare";
  let demoState = "idle";
  /** @type {{key:string,value:unknown,reason:string}[]} */
  let persistenceRejects = [];
  let persistenceStatus = "missing"; // missing|valid|partial|malformed|unavailable|catalog-mismatch
  /** @type {string|null} raw localStorage text retained for recovery download when load fails */
  let recoveryRaw = null;
  /** @type {string|null} catalogVersion from loaded/imported envelope when present */
  let envelopeCatalogVersion = null;
  const writerId = "lab-" + Math.random().toString(36).slice(2, 10);
  /** @type {Record<string, Set<string>>} */
  let expandedByFamily = {};

  const THEME_KEY = "jaryo-adaptive-lab-theme"; // UI preference only; separate from choices envelope
  function readTheme() {
    try { const t = localStorage.getItem(THEME_KEY); return t === "light" || t === "dark" ? t : "system"; } catch (_) { return "system"; }
  }
  function applyTheme(t) {
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
  }
  applyTheme(readTheme());

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function loadChoices() {
    persistenceRejects = [];
    persistenceStatus = "missing";
    recoveryRaw = null;
    envelopeCatalogVersion = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      storageOk = true;
      storageMsg = "Selections save in this browser only (localStorage).";
      if (raw == null || raw === "") {
        choices = {};
        persistenceStatus = "missing";
        return;
      }
      recoveryRaw = raw;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        choices = {};
        persistenceStatus = "malformed";
        persistenceRejects.push({ key: "(root)", value: raw.slice(0, 120), reason: "json-parse-failed" });
        storageMsg = "Stored selections were malformed and were not applied. Raw bytes retained — use Download recovery raw.";
        return;
      }
      // Accept legacy bare map or envelope {schemaVersion, choices}
      let map = parsed;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.choices && typeof parsed.choices === "object") {
        map = parsed.choices;
        if (typeof parsed.catalogVersion === "string") envelopeCatalogVersion = parsed.catalogVersion;
      }
      if (!map || typeof map !== "object" || Array.isArray(map)) {
        choices = {};
        persistenceStatus = "malformed";
        persistenceRejects.push({ key: "(root)", value: typeof parsed, reason: "expected-object-map" });
        storageMsg = "Stored selections were not an object map and were not applied. Raw bytes retained — use Download recovery raw.";
        return;
      }
      // Defer catalog validation until DATA is loaded (normalizeAfterCatalog).
      choices = map;
      persistenceStatus = "pending-catalog";
    } catch (e) {
      storageOk = false;
      persistenceStatus = "unavailable";
      storageMsg = "Storage unavailable or blocked — choices will not persist: " + (e && e.message ? e.message : String(e));
      choices = {};
      recoveryRaw = null;
    }
  }

  function normalizeAfterCatalog() {
    if (!DATA) return;
    const accepted = {};
    const rejects = persistenceRejects.slice();
    const famIds = new Set(DATA.families.map((f) => f.id));
    const optByFam = {};
    DATA.families.forEach((f) => {
      optByFam[f.id] = new Set(f.options.map((o) => o.id));
    });
    const src = choices && typeof choices === "object" && !Array.isArray(choices) ? choices : {};
    Object.keys(src).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(src, key)) return;
      const val = src[key];
      if (!famIds.has(key)) {
        rejects.push({ key, value: val, reason: "unknown-family" });
        return;
      }
      if (typeof val !== "string") {
        rejects.push({ key, value: val, reason: "non-string-option" });
        return;
      }
      if (!optByFam[key].has(val)) {
        rejects.push({ key, value: val, reason: val.slice(0, 3) !== key ? "cross-family-or-retired" : "retired-or-unknown-option" });
        return;
      }
      accepted[key] = val;
    });
    choices = accepted;
    if (envelopeCatalogVersion && DATA && DATA.version && envelopeCatalogVersion !== DATA.version) {
      rejects.push({
        key: "(catalogVersion)",
        value: envelopeCatalogVersion,
        reason: "catalog-mismatch",
      });
    }
    persistenceRejects = rejects;
    if (persistenceStatus === "pending-catalog" || persistenceStatus === "missing") {
      persistenceStatus = rejects.length && Object.keys(accepted).length ? "partial" : rejects.length ? "malformed" : Object.keys(accepted).length ? "valid" : "missing";
    } else if (rejects.length && Object.keys(accepted).length) {
      persistenceStatus = "partial";
    }
    if (rejects.some((r) => r.reason === "catalog-mismatch") && Object.keys(accepted).length) {
      persistenceStatus = "catalog-mismatch";
      storageMsg = "Catalog version in stored/imported envelope differs from this lab (" + envelopeCatalogVersion + " ≠ " + DATA.version + "). Valid entries kept; confirm before treating as authoritative.";
    }
  }

  function saveChoices() {
    try {
      const envelope = {
        schemaVersion: 1,
        catalogVersion: DATA && DATA.version ? DATA.version : "unknown",
        revision: 1,
        writerId,
        choices,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
      storageOk = true;
      const hasCatalogMismatch = persistenceRejects.some((r) => r.reason === "catalog-mismatch");
      if (hasCatalogMismatch && Object.keys(choices).length) {
        persistenceStatus = "catalog-mismatch";
        if (!storageMsg || storageMsg.indexOf("catalogVersion") === -1) {
          storageMsg = "Catalog version in envelope differs from this lab. Valid entries kept; confirm before treating as authoritative.";
        }
      } else {
        persistenceStatus = persistenceRejects.length ? "partial" : (Object.keys(choices).length ? "valid" : "missing");
        storageMsg = "Selections save in this browser only (localStorage).";
      }
      if ($("#storage-banner")) {
        $("#storage-banner").textContent = storageMsg + " A saved choice is a preference, not a product change.";
        $("#storage-banner").className = hasCatalogMismatch ? "banner warn" : "banner warn";
        $("#storage-banner").hidden = false;
      }
      return true;
    } catch (e) {
      storageOk = false;
      persistenceStatus = "unavailable";
      storageMsg = "Could not save selections (kept in memory only): " + (e && e.message ? e.message : String(e));
      $("#storage-banner").textContent = storageMsg;
      $("#storage-banner").className = "banner err";
      $("#storage-banner").hidden = false;
      return false;
    }
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------- Distinct SVG / HTML previews (structure differs per ID) ---------- */
  function svgWrap(inner, w = 280, h = 140) {
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  }

  const PREVIEW = {
    "F01.01": () => svgWrap(`
      <rect x="20" y="10" width="16" height="120" fill="#000"/>
      <rect x="50" y="18" width="90" height="22" fill="#fff" stroke="#000" stroke-width="2"/>
      <text x="58" y="34" font-size="11" font-family="monospace">[IN]</text>
      <line x1="36" y1="40" x2="50" y2="40" stroke="#000" stroke-width="2"/>
      <rect x="50" y="52" width="140" height="22" fill="#fff" stroke="#000" stroke-width="2"/>
      <text x="58" y="68" font-size="11" font-family="monospace">[STEP A]</text>
      <line x1="36" y1="74" x2="50" y2="74" stroke="#000" stroke-width="2"/>
      <rect x="50" y="86" width="140" height="22" fill="#fff" stroke="#000" stroke-width="2"/>
      <text x="58" y="102" font-size="11" font-family="monospace">[STEP B]</text>
      <line x1="36" y1="108" x2="50" y2="108" stroke="#000" stroke-width="2"/>
      <rect x="50" y="110" width="90" height="18" fill="#000"/>
      <text x="58" y="123" font-size="11" fill="#fff" font-family="monospace">[OUT]</text>
    `),
    "F01.02": () => svgWrap(`
      ${[0,1,2].map(r=>[0,1,2].map(c=>{
        const x=20+c*85,y=16+r*40, lab=['A','B','C','D','E','F','G',' ','H'][r*3+c];
        const rev = lab==='E';
        return `<rect x="${x}" y="${y}" width="78" height="32" fill="#fff" stroke="#000" stroke-width="2"/>
          <text x="${x+8}" y="${y+20}" font-size="11" font-family="monospace">[${lab}${rev?' REVIEW':''}]</text>`;
      }).join('')).join('')}
    `),
    "F01.03": () => svgWrap(`
      <rect x="8" y="12" width="70" height="100" fill="#fff" stroke="#000" stroke-width="2"/>
      <text x="18" y="30" font-size="11" font-family="monospace">IN</text>
      <rect x="86" y="12" width="108" height="100" fill="#fff" stroke="#000" stroke-width="2"/>
      <text x="110" y="30" font-size="11" font-family="monospace">GRAPH</text>
      <path d="M100 50 H180 M100 70 H160" stroke="#000" stroke-width="2" fill="none"/>
      <rect x="202" y="12" width="70" height="100" fill="#fff" stroke="#000" stroke-width="2"/>
      <text x="214" y="30" font-size="11" font-family="monospace">OUT</text>
      <rect x="8" y="118" width="264" height="18" fill="#000"/>
      <text x="16" y="131" font-size="10" fill="#fff" font-family="monospace">STATUS: RUN OK 3/4</text>
    `),
    "F01.04": () => svgWrap(`
      <rect x="16" y="20" width="90" height="50" fill="#fff" stroke="#000" stroke-width="3"/>
      <text x="34" y="50" font-size="12" font-family="monospace">[ P1 ]</text>
      <rect x="160" y="16" width="90" height="50" fill="#fff" stroke="#000" stroke-width="3"/>
      <text x="180" y="46" font-size="12" font-family="monospace">[ P2 ]</text>
      <rect x="70" y="90" width="110" height="40" fill="#fff" stroke="#000" stroke-width="3"/>
      <text x="96" y="115" font-size="12" font-family="monospace">[ P3 ]</text>
    `),
    "F01.08": () => svgWrap(`
      <text x="16" y="24" font-size="12" font-family="monospace">PLAN  A → B → C</text>
      <line x1="16" y1="40" x2="260" y2="40" stroke="#000" stroke-width="2"/>
      <text x="16" y="64" font-size="12" font-family="monospace">RUN</text>
      <rect x="16" y="74" width="70" height="28" fill="#000"/><text x="28" y="93" fill="#fff" font-size="11" font-family="monospace">A ok</text>
      <rect x="96" y="74" width="70" height="28" fill="#fff" stroke="#000" stroke-width="2"/><text x="108" y="93" font-size="11" font-family="monospace">B …</text>
      <rect x="176" y="74" width="70" height="28" fill="#fff" stroke="#000" stroke-dasharray="4 3"/><text x="188" y="93" font-size="11" font-family="monospace">C ?</text>
    `),
    "F02.01": () => `<div class="ascii">STEP   STATE\nfetch  [OK]\nparse  [--]\nload   [RUN]</div>`,
    "F02.03": () => `<div class="ascii">[MODEL] llama\n[ROUTE] main\n[UNKNOWN] eta</div>`,
    "F02.04": () => `<div><div>Clean customer rows</div><div class="ascii" style="color:#444">  step_id: dedupe_v2</div><div style="margin-top:6px">Load to warehouse</div><div class="ascii" style="color:#444">  step_id: load_wh</div></div>`,
    "F02.05": () => svgWrap(`
      <rect x="10" y="16" width="260" height="28" fill="#000"/><text x="20" y="35" fill="#fff" font-size="12" font-family="monospace">#### STEPS ####</text>
      <text x="20" y="70" font-size="12" font-family="monospace">row · fetch</text>
      <text x="20" y="94" font-size="12" font-family="monospace">row · parse</text>
      <rect x="10" y="108" width="260" height="24" fill="#000"/><text x="20" y="125" fill="#fff" font-size="12" font-family="monospace">#### RESULTS ####</text>
    `),
    "F02.09": () => `<div class="ascii">> parse ok\n! load failed\n? eta unknown</div>`,
    "F03.01": () => svgWrap(`
      <text x="30" y="36" font-size="12" font-family="monospace">  ingest</text>
      <rect x="20" y="48" width="160" height="26" fill="#000"/><text x="40" y="66" fill="#fff" font-size="12" font-family="monospace">## PARSE ##</text>
      <text x="30" y="100" font-size="12" font-family="monospace">  load</text>
      <text x="30" y="124" font-size="12" font-family="monospace">  publish</text>
    `),
    "F03.02": () => `<div class="ascii">UP   [parse] [validate]\n## CURRENT: load ##\nDOWN [warehouse]</div>`,
    "F03.03": () => svgWrap(`
      <rect x="20" y="50" width="100" height="36" fill="#fff" stroke="#000" stroke-width="2"/><text x="36" y="73" font-size="12" font-family="monospace">&lt; parse</text>
      <rect x="150" y="50" width="100" height="36" fill="#000"/><text x="168" y="73" fill="#fff" font-size="12" font-family="monospace">load &gt;</text>
    `),
    "F03.07": () => svgWrap(`
      ${['CONNECT','MAP','RUN','OUT'].map((t,i)=>{
        const x=12+i*68, on=t==='RUN';
        return `<rect x="${x}" y="48" width="64" height="36" fill="${on?'#000':'#fff'}" stroke="#000" stroke-width="2"/>
          <text x="${x+8}" y="71" font-size="10" fill="${on?'#fff':'#000'}" font-family="monospace">${t}</text>`;
      }).join('')}
    `),
    "F03.08": () => `<div class="ascii">[FIND STEP] k\n&gt; par_\nparse · orders-etl\npartition · metrics</div>`,
    "F04.01": () => svgWrap(`
      <rect x="30" y="20" width="60" height="28" fill="#fff" stroke="#000" stroke-width="1"/><text x="48" y="39" font-size="11" font-family="monospace">[A]</text>
      <rect x="100" y="55" width="80" height="34" fill="#000"/><text x="112" y="77" fill="#fff" font-size="11" font-family="monospace">▶ [B]</text>
      <rect x="30" y="100" width="60" height="28" fill="#fff" stroke="#000" stroke-width="1"/><text x="48" y="119" font-size="11" font-family="monospace">[C]</text>
      <path d="M90 34 H100 V72 M90 114 H100 V88" stroke="#000" stroke-width="2" fill="none"/>
    `),
    "F04.02": () => svgWrap(`
      <rect x="40" y="18" width="200" height="110" fill="#fff" stroke="#000" stroke-width="3"/>
      <text x="70" y="44" font-size="13" font-family="monospace">RUN DEPLOY?</text>
      <text x="70" y="66" font-size="11" font-family="monospace">diff: 3 files</text>
      <rect x="60" y="84" width="70" height="28" fill="#fff" stroke="#000" stroke-width="2"/><text x="72" y="103" font-size="11" font-family="monospace">CANCEL</text>
      <rect x="150" y="84" width="70" height="28" fill="#000"/><text x="158" y="103" fill="#fff" font-size="11" font-family="monospace">CONFIRM</text>
    `),
    "F04.03": () => `<div>
      <button class="btn primary" type="button" tabindex="-1">RUN</button>
      <div style="margin-top:8px"><button class="btn" type="button" aria-disabled="true" tabindex="-1">PAUSE</button></div>
      <div class="small" style="margin-top:6px">n/a: backend lacks pause</div>
    </div>`,
    "F04.04": () => `<div class="card-actions">
      <button class="btn primary" type="button" tabindex="-1">RUN</button>
      <button class="btn" type="button" tabindex="-1">DRY-RUN</button>
      <button class="btn" type="button" tabindex="-1" aria-label="run options">▾</button>
    </div>`,
    "F04.09": () => `<div class="card-actions">
      <button class="btn primary" type="button" tabindex="-1">PREVIEW</button>
      <button class="btn" type="button" tabindex="-1">then RUN</button>
    </div>`,
    "F05.01": () => `<div class="ascii">model: [________]\ntemp:  [0.7_____]\n*required</div>`,
    "F05.02": () => svgWrap(`
      <rect x="20" y="40" width="90" height="40" fill="#fff" stroke="#000" stroke-width="2"/><text x="36" y="65" font-size="12" font-family="monospace">[parse]</text>
      <circle cx="120" cy="60" r="8" fill="#fff" stroke="#000" stroke-width="2"/>
      <line x1="128" y1="60" x2="190" y2="60" stroke="#000" stroke-width="2"/>
      <text x="198" y="64" font-size="12" font-family="monospace">rows</text>
    `),
    "F05.05": () => svgWrap(`
      <rect x="10" y="20" width="120" height="100" fill="#fff" stroke="#000" stroke-width="2"/><text x="40" y="42" font-size="12" font-family="monospace">FORM</text>
      <text x="24" y="70" font-size="10" font-family="monospace">temp [0.7]</text>
      <rect x="150" y="20" width="120" height="100" fill="#fff" stroke="#000" stroke-width="2"/><text x="180" y="42" font-size="12" font-family="monospace">JSON</text>
      <text x="162" y="70" font-size="10" font-family="monospace">{"temp":0.7}</text>
    `),
    "F05.08": () => `<div class="ascii">batch [32] INFERRED\nbudget [$] INFERRED CONFIRM</div>`,
    "F05.09": () => `<div class="ascii">! model required\n! temp &gt; 2\n[jump → model]</div>`,
    "F06.01": () => svgWrap(`
      <rect x="30" y="20" width="220" height="100" fill="#fff" stroke="#000" stroke-width="3"/>
      <rect x="30" y="20" width="220" height="26" fill="#000"/><text x="44" y="38" fill="#fff" font-size="12" font-family="monospace">## TITLE ##</text>
      <text x="44" y="70" font-size="12" font-family="monospace">body content</text>
    `),
    "F06.02": () => svgWrap(`
      <text x="8" y="70" font-size="11" font-family="monospace">IN&gt;</text>
      <path d="M30 50 H50 V30 H230 V50 H250 M30 90 H50 V110 H230 V90 H250" stroke="#000" stroke-width="2" fill="none"/>
      <rect x="50" y="40" width="180" height="60" fill="#fff"/>
      <text x="100" y="75" font-size="12" font-family="monospace">STEP</text>
      <text x="252" y="70" font-size="11" font-family="monospace">&gt;OUT</text>
    `),
    "F06.04": () => `<div class="ascii">▶ deck 1\n▼ deck 2\n   detail lines…\n▶ deck 3</div>`,
    "F06.08": () => `<div class="hatched" style="height:90px;border:2px solid #000;display:flex;align-items:center;justify-content:center;font-family:monospace">/ n/a /</div>`,
    "F06.09": () => svgWrap(`
      <rect x="20" y="30" width="70" height="28" fill="#fff" stroke="#000" stroke-width="2"/><text x="36" y="49" font-size="11" font-family="monospace">LOG</text>
      <rect x="90" y="30" width="70" height="28" fill="#000"/><text x="106" y="49" fill="#fff" font-size="11" font-family="monospace">OUT</text>
      <rect x="160" y="30" width="70" height="28" fill="#fff" stroke="#000" stroke-width="2"/><text x="176" y="49" font-size="11" font-family="monospace">CFG</text>
      <rect x="20" y="58" width="210" height="60" fill="#fff" stroke="#000" stroke-width="2"/>
    `),
    "F07.01": () => `<div class="ascii">step   ms   rows\nparse  120  1240\nload    40   980</div>`,
    "F07.03": () => `<div class="ascii">! FAIL  load\n&gt; OK    parse\n? UNK   eta</div>`,
    "F07.05": () => `<div class="ascii">k     plan  act   Δ\nrows  1000  980  -20\nms     120  140  +20</div>`,
    "F07.07": () => `<div class="ascii">&gt; run 42 [open log]\n[panel] log… [Esc]</div>`,
    "F07.09": () => `<div class="ascii">field  control  ev\nmodel  select   schema\n[CONFIRM ROW]</div>`,
    "F08.01": () => svgWrap(`
      <rect x="20" y="30" width="50" height="28" fill="#fff" stroke="#000" stroke-width="2"/><text x="34" y="49" font-size="11" font-family="monospace">[A]</text>
      <rect x="20" y="90" width="50" height="28" fill="#fff" stroke="#000" stroke-width="2"/><text x="34" y="109" font-size="11" font-family="monospace">[B]</text>
      <rect x="140" y="60" width="50" height="28" fill="#fff" stroke="#000" stroke-width="2"/><text x="154" y="79" font-size="11" font-family="monospace">[C]</text>
      <path d="M70 44 H100 V74 H140 M70 104 H100 V74" stroke="#000" stroke-width="2" fill="none"/>
    `),
    "F08.02": () => svgWrap(`
      <text x="10" y="40" font-size="11" font-family="monospace">GPU</text>
      <line x1="50" y1="36" x2="260" y2="36" stroke="#000" stroke-width="2"/>
      <rect x="80" y="24" width="40" height="24" fill="#fff" stroke="#000" stroke-width="2"/><text x="92" y="41" font-size="10" font-family="monospace">a</text>
      <rect x="160" y="24" width="40" height="24" fill="#fff" stroke="#000" stroke-width="2"/><text x="172" y="41" font-size="10" font-family="monospace">c</text>
      <text x="10" y="90" font-size="11" font-family="monospace">CPU</text>
      <line x1="50" y1="86" x2="260" y2="86" stroke="#000" stroke-width="2"/>
      <rect x="120" y="74" width="40" height="24" fill="#fff" stroke="#000" stroke-width="2"/><text x="132" y="91" font-size="10" font-family="monospace">b</text>
    `),
    "F08.05": () => `<div class="ascii">src.field  via    dest.field\nemail      parse  email_norm\n[UNKNOWN]  load   ?</div>`,
    "F08.07": () => svgWrap(`
      <rect x="20" y="30" width="70" height="36" fill="#fff" stroke="#000" stroke-width="2"/><text x="36" y="53" font-size="11" font-family="monospace">[CLI]</text>
      <line x1="90" y1="48" x2="140" y2="48" stroke="#000" stroke-width="2"/>
      <rect x="140" y="30" width="70" height="36" fill="#fff" stroke="#000" stroke-width="2"/><text x="154" y="53" font-size="11" font-family="monospace">[MCP]</text>
      <text x="40" y="90" font-size="10" font-family="monospace">CONNECTED</text>
      <line x1="90" y1="110" x2="140" y2="110" stroke="#000" stroke-width="2" stroke-dasharray="4 3"/>
      <text x="40" y="128" font-size="10" font-family="monospace">PROPOSED → [SDK]</text>
    `),
    "F08.10": () => svgWrap(`
      <rect x="20" y="50" width="50" height="28" fill="#fff" stroke="#000" stroke-width="2"/><text x="34" y="69" font-size="11" font-family="monospace">[A]</text>
      <rect x="100" y="50" width="50" height="28" fill="#fff" stroke="#000" stroke-width="2" stroke-dasharray="4 3"/>
      <text x="112" y="69" font-size="11" font-family="monospace">[?]</text>
      <rect x="100" y="50" width="50" height="28" fill="url(#h)" opacity="0.15"/>
      <rect x="180" y="50" width="50" height="28" fill="#fff" stroke="#000" stroke-width="2"/><text x="194" y="69" font-size="11" font-family="monospace">[C]</text>
      <path d="M70 64 H100 M150 64 H180" stroke="#000" stroke-width="2"/>
      <defs><pattern id="h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#000" stroke-width="2"/></pattern></defs>
    `),
    "F09.01": () => `<div class="state-row">
      <span class="state-swatch">[OK]</span>
      <span class="state-swatch selected">[RUNNING]</span>
      <span class="state-swatch blocked">× [BLOCKED]</span>
      <span class="state-swatch unknown">? [UNKNOWN]</span>
    </div>`,
    "F09.02": () => `<div class="ascii">[OK] from log 11:52\nsource: runner.event</div>`,
    "F09.03": () => `<div class="ascii">RUN     YES  manifest\nPAUSE   NO   manifest\nLOGS    ?    not declared</div>`,
    "F09.05": () => `<div class="state-swatch blocked" style="display:block">× [BLOCKED]<div class="small">needs: api key</div></div>`,
    "F09.08": () => `<div class="ascii">[OK] 4s ago\n[OK] STALE 9m</div>`,
    "F10.01": () => `<div class="ascii">No pipelines found.\n[CONNECT ONE]</div>`,
    "F10.02": () => `<div class="ascii">checked: PATH ok\nmcp: 2 tools\nfailed first: auth ?</div>`,
    "F10.05": () => `<div class="ascii">! load failed\nraw: 401\n[RETRY] [EDIT]</div>`,
    "F10.07": () => `<div class="ascii">DISCONNECTED\nlast: 11:50</div>`,
    "F10.08": () => `<div class="state-swatch unavailable" style="display:block">PAUSE not offered<br>by this backend</div>`,
    "F11.01": () => svgWrap(`
      <rect x="10" y="16" width="150" height="110" fill="#fff" stroke="#000" stroke-width="2"/><text x="50" y="40" font-size="11" font-family="monospace">GRAPH</text>
      <rect x="170" y="16" width="100" height="110" fill="#fff" stroke="#000" stroke-width="3"/><text x="186" y="40" font-size="11" font-family="monospace">DETAIL</text>
      <text x="180" y="70" font-size="10" font-family="monospace">step…</text>
    `),
    "F11.02": () => svgWrap(`
      <rect x="0" y="0" width="280" height="140" fill="#000" opacity="0.08"/>
      <rect x="50" y="20" width="180" height="100" fill="#fff" stroke="#000" stroke-width="3"/>
      <text x="100" y="48" font-size="12" font-family="monospace">+ REVIEW +</text>
      <text x="90" y="72" font-size="11" font-family="monospace">diff panel</text>
      <rect x="70" y="88" width="50" height="22" fill="#000"/><text x="80" y="104" fill="#fff" font-size="10" font-family="monospace">OK</text>
      <rect x="140" y="88" width="50" height="22" fill="#fff" stroke="#000" stroke-width="2"/><text x="152" y="104" font-size="10" font-family="monospace">NO</text>
    `),
    "F11.04": () => `<div class="ascii">TRACE · load\n! empty rows\nevidence: log 4112\n[JUMP TO PARSE]</div>`,
    "F11.05": () => `<div class="ascii">[DATA] [TIME] [ERR off]\nFAILED: 3</div>`,
    "F11.08": () => `<div class="ascii">RUN      YES  manifest\nPAUSE    NO   manifest\nSCHEDULE UNKNOWN</div>`,
    "F12.01": () => `<div class="ascii">/ / / / / / /</div>`,
    "F12.03": () => `<div class="ascii">┬┬┬ ┬┬┬\n6 of 7 declared</div>`,
    "F12.04": () => svgWrap(`<path d="M20 70 H220" stroke="#000" stroke-width="6"/><polygon points="220,55 250,70 220,85" fill="#000"/>`),
    "F12.05": () => svgWrap(`
      <rect x="80" y="30" width="120" height="80" fill="none" stroke="#000" stroke-width="3"/>
      <text x="118" y="78" font-size="12" font-family="monospace">LOOP</text>
    `),
    "F12.10": () => svgWrap(`
      <rect x="20" y="50" width="50" height="28" fill="#fff" stroke="#000" stroke-width="2"/><text x="34" y="69" font-size="11" font-family="monospace">[A]</text>
      <line x1="70" y1="64" x2="110" y2="64" stroke="#000" stroke-width="2"/>
      <line x1="110" y1="64" x2="170" y2="64" stroke="#000" stroke-width="2" stroke-dasharray="4 4"/>
      <line x1="170" y1="64" x2="200" y2="64" stroke="#000" stroke-width="2"/>
      <rect x="200" y="50" width="50" height="28" fill="#fff" stroke="#000" stroke-width="2"/><text x="214" y="69" font-size="11" font-family="monospace">[D]</text>
      <text x="100" y="100" font-size="10" font-family="monospace">[+2 optional]</text>
    `),
    "F13.02": () => `<div class="ascii motion-demo">event tick: =&gt;====  (only on real events)</div><div class="motion-note small">Reduced motion: tick shown static.</div>`,
    "F13.03": () => `<div class="ascii">A ¦ B   hard cut — no easing</div>`,
    "F13.07": () => `<div class="motion-note small">Reduced motion: dash trace shown static.</div>` + svgWrap(`
      <rect x="20" y="50" width="50" height="28" fill="#fff" stroke="#000" stroke-width="2"/><text x="34" y="69" font-size="11" font-family="monospace">[A]</text>
      <rect x="100" y="50" width="50" height="28" fill="#fff" stroke="#000" stroke-width="2"/><text x="114" y="69" font-size="11" font-family="monospace">[B]</text>
      <rect x="180" y="50" width="50" height="28" fill="#fff" stroke="#000" stroke-width="2"/><text x="194" y="69" font-size="11" font-family="monospace">[C]</text>
      <path class="dash" d="M70 64 H100 M150 64 H180" stroke="#000" stroke-width="3" fill="none"/>
      <text x="70" y="110" font-size="10" font-family="monospace">^^^^ traced once</text>
    `, 280, 140),
    "F13.08": () => `<div class="ascii">|&lt;  [==#----]  &gt;|\nevent 14/40 11:02\n(recorded — not simulated)</div>`,
    "F13.10": () => `<div class="ascii">MAP\n[load] → cut\np1 / etl / load</div>`,
    "F14.01": () => `<div class="ascii">1 fetch\n2 parse  ← fetch\n  ├ validate 1/2\n  └ enrich   0/2\n3 publish</div>`,
    "F14.02": () => svgWrap(`
      <rect x="10" y="90" width="260" height="40" fill="#000"/>
      <text x="30" y="115" fill="#fff" font-size="12" font-family="monospace">[RUN]  [LOG]  [MORE]</text>
      <text x="20" y="40" font-size="11" font-family="monospace">content above thumb bar</text>
    `),
    "F14.03": () => `<div class="ascii">&gt; parse  12s\n! load   fail\n  log…\n  match  2/3</div>`,
    "F14.05": () => svgWrap(`
      <rect x="20" y="20" width="240" height="44" fill="#fff" stroke="#000" stroke-width="2"/><text x="40" y="48" font-size="12" font-family="monospace">[ row one          ]</text>
      <rect x="20" y="74" width="240" height="44" fill="#fff" stroke="#000" stroke-width="2"/><text x="40" y="102" font-size="12" font-family="monospace">[ row two          ]</text>
    `),
    "F14.08": () => svgWrap(`
      <rect x="40" y="10" width="200" height="120" fill="#fff" stroke="#000" stroke-width="3"/>
      <text x="100" y="50" font-size="14" font-family="monospace">REVIEW</text>
      <rect x="70" y="70" width="140" height="40" fill="#000"/><text x="100" y="95" fill="#fff" font-size="12" font-family="monospace">CONFIRM</text>
    `),
    "F15.01": () => `<div class="ascii">$ jaryo connect …\n[OPEN CONNECT UI]\n→ your pipeline, visual</div>`,
    "F15.02": () => svgWrap(`
      <rect x="10" y="20" width="120" height="100" fill="#fff" stroke="#000" stroke-width="2"/><text x="45" y="50" font-size="12" font-family="monospace">CLI</text>
      <text x="24" y="80" font-size="10" font-family="monospace">$ run …</text>
      <rect x="150" y="20" width="120" height="100" fill="#fff" stroke="#000" stroke-width="2"/><text x="175" y="50" font-size="12" font-family="monospace">JARYO</text>
      <text x="168" y="80" font-size="10" font-family="monospace">[A]→[B]</text>
    `),
    "F15.05": () => `<div class="ascii">[DEMO] A → B → C\nscoped to one adapter\nkeyboard operable</div>`,
    "F15.06": () => `<div class="ascii">run    yes\npause  depends\nlive   unknown</div>`,
    "F15.07": () => svgWrap(`
      <rect x="16" y="40" width="70" height="50" fill="#fff" stroke="#000" stroke-width="2"/><text x="32" y="70" font-size="11" font-family="monospace">CLI</text>
      <rect x="104" y="40" width="70" height="50" fill="#fff" stroke="#000" stroke-width="2"/><text x="118" y="70" font-size="11" font-family="monospace">MCP</text>
      <rect x="192" y="40" width="70" height="50" fill="#fff" stroke="#000" stroke-dasharray="4 3" stroke-width="2"/><text x="206" y="70" font-size="11" font-family="monospace">SDK</text>
      <text x="20" y="120" font-size="10" font-family="monospace">PROPOSED / SHIPPED labels required</text>
    `),
    "F16.01": () => `<div class="ascii">&gt; run_\nrun parse\nrun all (n/a)</div>`,
    "F16.03": () => `<div class="ascii">'failed today'\n→ [FAILED] [TODAY]</div>`,
    "F16.05": () => `<div class="ascii">RUN yes\nPAUSE no\nSCHEDULE ?</div>`,
    "F16.07": () => `<div class="state-row">
      <span class="state-swatch">[ALL]</span>
      <span class="state-swatch selected">[FAIL ON]</span>
      <span class="state-swatch">[OK]</span>
    </div>`,
    "F16.10": () => `<div class="ascii">= run --step parse\n(only if CLI parity declared)</div>`,
  };

  /* WCAG relative luminance / contrast helpers (for legible chip ink on token fills). */
  function hexRgb(h) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(h || "").trim());
    if (!m) return null;
    let x = m[1];
    if (x.length === 3) x = x.split("").map((c) => c + c).join("");
    return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
  }
  function lum(h) {
    const c = hexRgb(h);
    if (!c) return null;
    const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) {
    const la = lum(a), lb = lum(b);
    if (la == null || lb == null) return 21;
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  /** First candidate meeting AA 4.5:1 on bg, else whichever of #000/#fff is higher. */
  function inkFor(bg, candidates) {
    for (const c of candidates) if (c && contrast(c, bg) >= 4.5) return c;
    return contrast("#000000", bg) >= contrast("#ffffff", bg) ? "#000000" : "#ffffff";
  }

  function colorPreview(opt) {
    const t = opt.tokens || {};
    const keys = ["bg", "surface", "text", "accent_identity", "status_ok", "status_run", "status_blocked", "focus_ring"];
    const sw = keys.filter(k => t[k]).map(k =>
      `<div class="token"><div class="sw" style="background:${esc(t[k])}"></div>${esc(k)}<br>${esc(t[k])}</div>`
    ).join("");
    const note = opt.id === "F17.01"
      ? `<div class="example-tag">EXAMPLE ONLY — not a chosen default</div>`
      : "";
    const surf = t.surface || t.bg || "#fff";
    const okBg = t.status_ok || "#ccc", runBg = t.status_run || "#ccc", blkBg = t.status_blocked_bg || t.status_blocked || "#eee";
    const okInk = inkFor(okBg, [t.text, t.bg, t.surface]);
    const runInk = inkFor(runBg, [t.text, t.bg, t.surface]);
    const blkInk = inkFor(blkBg, [t.status_blocked, t.text, t.bg]);
    const ctaBg = t.accent_identity || "#000";
    const ctaInk = inkFor(ctaBg, [t.accent_ink, "#fff"]);
    const mutedInk = inkFor(t.bg || "#fff", [t.muted, t.text]);
    const textInk = inkFor(t.bg || "#fff", [t.text]);
    const surfInk = inkFor(surf, [t.text]);
    return `<div class="color-preview" style="background:${esc(t.bg || "#fff")};color:${esc(textInk)}">
      ${note}
      <div style="border:1px solid ${esc(t.border || "#000")};padding:8px;margin-top:6px;background:${esc(surf)};color:${esc(surfInk)}">
        <button type="button" tabindex="-1" style="background:${esc(ctaBg)};color:${esc(ctaInk)};border:2px solid ${esc(t.border || "#000")};min-height:36px;padding:6px 10px;font-family:monospace">PRIMARY CTA</button>
        <div class="chips" style="margin-top:8px;font-family:monospace;font-size:11px">
          <span style="border:1px solid ${esc(t.border||'#000')};padding:2px 6px;background:${esc(okBg)};color:${esc(okInk)}">● [OK]</span>
          <span style="border:1px solid ${esc(t.border||'#000')};padding:2px 6px;background:${esc(runBg)};color:${esc(runInk)}">▶ [RUNNING]</span>
          <span style="border:3px double ${esc(t.border||'#000')};padding:2px 6px;background:${esc(blkBg)};color:${esc(blkInk)}">× [BLOCKED]</span>
        </div>
        <div style="margin-top:8px;outline:3px dashed ${esc(t.focus_ring||'#000')};outline-offset:3px;display:inline-block;padding:4px 8px;font-family:monospace;font-size:11px">focus ≠ selected</div>
      </div>
      <div class="token-grid" style="margin-top:8px">${sw}</div>
      <div class="small" style="margin-top:6px;color:${esc(mutedInk)}">Identity accent ≠ status. Mono fallback: ${esc(opt.mono_fallback || "invert + hatch")}</div>
    </div>`;
  }

  function renderPreview(opt) {
    if (window.JARYO_STAGE_UI && window.JARYO_STAGE_UI.has(opt.id)) return window.JARYO_STAGE_UI.render(opt);
    if (opt.id.startsWith("F17") || opt.id.startsWith("F19")) return colorPreview(opt);
    const fn = PREVIEW[opt.id];
    if (fn) return fn(opt);
    const ascii = (opt.preview_ascii || []).join("\n");
    return `<div class="ascii">${esc(ascii || opt.name)}</div>`;
  }

  function familyById(id) {
    return DATA.families.find((f) => f.id === id);
  }

  function catalogPhrase() {
    const families = DATA.families.length;
    const total = DATA.families.reduce((n, f) => n + f.options.length, 0);
    const curated = Number(DATA.source_catalog && DATA.source_catalog.curated_count) || 0;
    const optional = Math.max(0, total - curated);
    return `${families} families · ${curated} curated + ${optional} optional (${total} total)`;
  }

  function withLinks(text) {
    return esc(text).replace(/https?:\/\/[^\s<]+/g, (raw) => {
      const url = raw.replace(/[),.;]+$/, "");
      const tail = raw.slice(url.length);
      return `<a href="${url}">${url}</a>${tail}`;
    });
  }

  function renderNav() {
    const nav = $("#family-nav");
    const catalog = $("#catalog-count");
    if (catalog) catalog.textContent = catalogPhrase();
    const btn = (f) =>
      `<button type="button" class="navbtn" data-fam="${f.id}" title="${f.id} · ${esc(f.title)}" aria-current="${f.id === activeFamily ? "true" : "false"}"><span class="fid">${f.id}</span><span class="ftitle"><span class="sep"> · </span>${esc(f.title)}</span></button>`;
    const count = (arr) => arr.reduce((n, f) => n + f.options.length, 0);
    // Monochrome F01–F16 primary; F17 color batch optional; F18 legacy studies; F19 Red interactive UI optional.
    const mono = DATA.families.filter((f) => /^F(0[1-9]|1[0-6])$/.test(f.id));
    const color = DATA.families.filter((f) => f.id === "F17");
    const legacy = DATA.families.filter((f) => f.id === "F18");
    const red = DATA.families.filter((f) => f.id === "F19");
    nav.innerHTML =
      `<p class="navgroup" id="ng-mono">Monochrome set · ${count(mono)} options</p>` +
      mono.map(btn).join("") +
      (color.length ? `<p class="navgroup navgroup-color" id="ng-color">Color batch · ${count(color)} options · optional</p>` + color.map(btn).join("") : "") +
      (legacy.length ? `<p class="navgroup navgroup-legacy" id="ng-legacy">Legacy studies · ${count(legacy)} options</p>` + legacy.map(btn).join("") : "") +
      (red.length ? `<p class="navgroup navgroup-red" id="ng-red">Red interactive UI · ${count(red)} options · optional</p>` + red.map(btn).join("") : "");
  }

  function renderCompare() {
    const fam = familyById(activeFamily);
    if (!fam) return;
    $("#section-title").textContent = `${fam.id} — ${fam.title}`;
    $("#section-meta").textContent = `Curated ${fam.curated_count || fam.options.length} of ${fam.catalog_size || fam.options.length} catalog options · stable IDs preserved · 24/29 IBM Plex Mono 700`;
    $("#contexts").innerHTML = fam.screen_contexts.map((c) => `<span class="chip">${esc(c)}</span>`).join("");
    const cards = $("#cards");
    const expanded = expandedByFamily[fam.id] || new Set();
    cards.classList.toggle("cards-wide", !!(window.JARYO_STAGE_UI && window.JARYO_STAGE_UI.wideFamilies[fam.id]));
    cards.setAttribute("role", "radiogroup");
    cards.setAttribute("aria-labelledby", "section-title");
    cards.innerHTML = fam.options.map((opt, idx) => {
      const chosen = choices[fam.id] === opt.id;
      const isExp = expanded.has(opt.id);
      const example = opt.id === "F17.01" ? `<span class="example-tag">EXAMPLE</span>` : "";
      return `<article class="opt-card${chosen ? " chosen" : ""}" data-id="${opt.id}">
        <div class="idbar"><span class="oid">${esc(opt.id)}</span><span class="oidx" aria-hidden="true">${idx + 1}/${fam.options.length}</span>${example}<span class="chosen-marker">${chosen ? "CHOSEN" : ""}</span></div>
        <div class="body">
          <h3>${esc(opt.name)}</h3>
          <div class="preview-stage${isExp ? " expanded" : ""}" id="stage-${opt.id.replace(".", "-")}" data-preview="${opt.id}">${renderPreview(opt)}</div>
          <p class="spec-foot">14/21 · IBM Plex Sans · regular · 0 tracking</p>
          <p class="small"><strong>Mechanism:</strong> ${esc(opt.mechanism)}</p>
          <p class="small"><strong>Why curated:</strong> ${esc(opt.curation_rationale)}</p>
          <p class="tradeoff"><strong>Tradeoff:</strong> ${esc(opt.tradeoff)}</p>
          <p class="small"><strong>Narrow / touch:</strong> ${esc(opt.narrow)}</p>
          ${opt.provenance ? `<p class="small provenance"><strong>Provenance:</strong> ${esc(opt.provenance.source_project || "")}${opt.provenance.improved && opt.provenance.improved.length ? " · improved: " + esc(opt.provenance.improved.slice(0, 2).join("; ")) : ""}</p>` : ""}
          <div class="card-actions">
            <label class="choose-label">
              <input type="radio" name="jaryo-choice-${esc(fam.id)}" value="${esc(opt.id)}" data-choice="${esc(opt.id)}"
                ${chosen ? "checked" : ""}/>
              <span class="choose-text">${chosen ? "Selected" : "Choose"} · ${esc(opt.id)}</span><span class="sr-only"> ${esc(opt.name)}</span>
            </label>
            <button type="button" class="btn expand-btn" data-expand="${opt.id}" aria-expanded="${isExp ? "true" : "false"}" aria-controls="stage-${opt.id.replace(".", "-")}">${isExp ? "Collapse preview" : "Expand preview"}<span class="sr-only"> ${esc(opt.id)}</span></button>
          </div>
        </div>
      </article>`;
    }).join("");
    updateRoving();
  }

  /** Roving tabindex for the option radiogroup: only the checked radio (or the first) is in Tab order. */
  function updateRoving() {
    const radios = $$('#cards input[type="radio"][data-choice]');
    if (!radios.length) return;
    const checked = radios.find((r) => r.checked) || radios[0];
    radios.forEach((r) => { r.tabIndex = r === checked ? 0 : -1; });
  }

  function onRadioKey(e) {
    const radio = e.target;
    if (!radio || !radio.matches || !radio.matches('input[type="radio"][data-choice]')) return;
    const radios = $$('#cards input[type="radio"][data-choice]');
    const i = radios.indexOf(radio);
    if (i < 0) return;
    let j = null;
    switch (e.key) {
      case "ArrowRight": case "ArrowDown": j = (i + 1) % radios.length; break;
      case "ArrowLeft": case "ArrowUp": j = (i - 1 + radios.length) % radios.length; break;
      case "Home": j = 0; break;
      case "End": j = radios.length - 1; break;
      case " ": case "Spacebar":
        e.preventDefault();
        if (!radio.checked) { radio.checked = true; choose(radio.value); }
        return;
      default: return;
    }
    e.preventDefault();
    const target = radios[j];
    target.focus();
    if (!target.checked) { target.checked = true; choose(target.value); }
    else updateRoving();
  }

  /** Update selection UI in place (no card rebuild) when the active family cards are mounted. */
  function syncChoiceUI(famId) {
    const cards = $("#cards");
    if (!cards || !familyById(activeFamily) || famId !== activeFamily) {
      renderCompare();
      return;
    }
    $$(".opt-card", cards).forEach((card) => {
      const id = card.getAttribute("data-id");
      const chosen = choices[famId] === id;
      card.classList.toggle("chosen", chosen);
      const marker = card.querySelector(".chosen-marker");
      if (marker) marker.textContent = chosen ? "CHOSEN" : "";
      const radio = card.querySelector('input[type="radio"][data-choice]');
      if (radio) {
        radio.checked = chosen;
        const labelSpan = radio.parentElement && radio.parentElement.querySelector("span.choose-text");
        if (labelSpan) labelSpan.textContent = (chosen ? "Selected" : "Choose") + " · " + id;
      }
    });
    updateRoving();
  }

  function renderJourneys() {
    const root = $("#journeys");
    root.innerHTML = DATA.journeys.map((j) => {
      const surfaces = j.surfaces.map((s) => frameFor(s, j)).join("");
      return `<section class="journey" aria-labelledby="jh-${j.id}">
        <div class="jhead" id="jh-${j.id}">${esc(j.id)} · ${esc(j.name)} · ${esc(j.demo_note)}</div>
        <div class="jbody">
          <div class="small">Steps: ${esc(j.steps.join(" → "))} · Families: ${esc(j.uses_families.join(", "))}</div>
          <div class="journey-frames">${surfaces}</div>
        </div>
      </section>`;
    }).join("");
  }

  function frameFor(surface, journey) {
    const choiceBits = journey.uses_families.map((fid) => {
      const c = choices[fid];
      return c || `${fid}:—`;
    }).join(" · ");
    let body = "";
    if (surface === "mobile") {
      body = `<div class="phone">
        <div class="ascii">[SAMPLE · not live]\nTHUMB [RUN][LOG]\n1 fetch\n2 parse\n! load fail\n[FULLSCREEN REVIEW]</div>
      </div>`;
    } else if (surface === "desktop") {
      body = `<div class="ascii">DESKTOP WORKBENCH\nIN | GRAPH | OUT\nstatus strip\nislands / tabs for parallel workloads\nkeyboard focus visible</div>`;
    } else {
      body = `<div class="ascii">BROWSER\nInstall line / DEMO playground\nCapability honesty\nMouse + keyboard paths</div>`;
    }
    return `<div class="frame">
      <div class="flabel">${esc(surface.toUpperCase())} · composed from choices</div>
      <div class="fview">${body}<div class="small" style="margin-top:8px">${esc(choiceBits)}</div>
      <div class="state-row" style="margin-top:8px">
        <span class="state-swatch selected">selected</span>
        <span class="state-swatch focusish">focus</span>
        <span class="state-swatch blocked">× blocked</span>
        <span class="state-swatch unknown">? unknown</span>
        <span class="state-swatch unavailable">unavailable</span>
      </div></div>
    </div>`;
  }

  function acceptedChoiceCount() {
    return DATA.families.reduce((n, f) => n + (choices[f.id] ? 1 : 0), 0);
  }

  function renderSummary() {
    const rows = DATA.families.map((f) => {
      const id = choices[f.id] || "";
      const opt = f.options.find((o) => o.id === id);
      return `<tr><td>${esc(f.id)}</td><td>${esc(f.title)}</td><td>${esc(id || "—")}</td><td>${esc(opt ? opt.name : "")}</td></tr>`;
    }).join("");
    $("#summary-body").innerHTML = rows;
    const payload = exportPayload();
    $("#export-box").textContent = JSON.stringify(payload, null, 2);
    const n = acceptedChoiceCount();
    let extra = "";
    if (persistenceRejects.length) {
      extra = ` · ${persistenceRejects.length} rejected stored entr${persistenceRejects.length === 1 ? "y" : "ies"} (${persistenceStatus})`;
    }
    $("#summary-count").textContent = `${n} / ${DATA.families.length} families chosen (validated)${extra}`;
  }

  function exportPayload() {
    return {
      artifact: "jaryo-adaptive-lab-choices",
      schemaVersion: 1,
      catalogVersion: DATA && DATA.version ? DATA.version : "unknown",
      writerId,
      notice: "A saved choice is a preference, not a product change. Demo data is fictional.",
      exported_at_utc: new Date().toISOString(),
      persistenceStatus,
      acceptedCount: acceptedChoiceCount(),
      copper_note: "Copper is an example palette in the color set, not the default.",
      choices,
      rejects: persistenceRejects.slice(),
      by_family: DATA.families.map((f) => ({
        family: f.id,
        title: f.title,
        choice: choices[f.id] || null,
        name: (f.options.find((o) => o.id === choices[f.id]) || {}).name || null,
      })),
    };
  }

  /** Import selection JSON (envelope or bare map).
   * Merges validated family entries into existing choices (does not wipe families absent from the import).
   * Empty / all-invalid nonempty imports are rejected without changing existing selections.
   */
  function importPayloadText(raw) {
    if (raw == null || String(raw).trim() === "") {
      return { ok: false, message: "Import rejected: empty payload. Existing selections unchanged." };
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return { ok: false, message: "Import JSON parse failed. Existing selections unchanged." };
    }
    let map = parsed;
    let incomingCatalog = null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.choices) {
      map = parsed.choices;
      if (typeof parsed.catalogVersion === "string") incomingCatalog = parsed.catalogVersion;
    }
    if (!map || typeof map !== "object" || Array.isArray(map)) {
      return { ok: false, message: "Import must be an object map or envelope with choices. Existing selections unchanged." };
    }
    const keys = Object.keys(map).filter((k) => Object.prototype.hasOwnProperty.call(map, k));
    if (keys.length === 0) {
      return {
        ok: false,
        message: "Empty import rejected; existing selections unchanged. Use Reset to clear intentionally.",
      };
    }
    const previous = Object.assign({}, choices);
    const previousRejects = persistenceRejects.slice();
    const previousStatus = persistenceStatus;
    const previousEnvelopeCatalog = envelopeCatalogVersion;
    // Dry-run normalize on incoming map only (do not assign to choices yet).
    const famIds = new Set(DATA.families.map((f) => f.id));
    const optByFam = {};
    DATA.families.forEach((f) => {
      optByFam[f.id] = new Set(f.options.map((o) => o.id));
    });
    const incomingAccepted = {};
    const incomingRejects = [];
    keys.forEach((key) => {
      const val = map[key];
      if (!famIds.has(key)) {
        incomingRejects.push({ key, value: val, reason: "unknown-family" });
        return;
      }
      if (typeof val !== "string") {
        incomingRejects.push({ key, value: val, reason: "non-string-option" });
        return;
      }
      if (!optByFam[key].has(val)) {
        incomingRejects.push({
          key,
          value: val,
          reason: val.slice(0, 3) !== key ? "cross-family-or-retired" : "retired-or-unknown-option",
        });
        return;
      }
      incomingAccepted[key] = val;
    });
    if (incomingCatalog && DATA && DATA.version && incomingCatalog !== DATA.version) {
      incomingRejects.push({ key: "(catalogVersion)", value: incomingCatalog, reason: "catalog-mismatch" });
    }
    const acceptedN = Object.keys(incomingAccepted).length;
    if (acceptedN === 0) {
      return {
        ok: false,
        message: `Import rejected: ${keys.length} entr${keys.length === 1 ? "y" : "ies"} none matched the curated catalog. Existing selections unchanged.`,
      };
    }
    // Merge: only overwrite families present in incomingAccepted; keep other prior choices.
    let changed = 0;
    let unchanged = 0;
    Object.keys(incomingAccepted).forEach((k) => {
      if (previous[k] === incomingAccepted[k]) unchanged += 1;
      else changed += 1;
      choices[k] = incomingAccepted[k];
    });
    persistenceRejects = incomingRejects.slice();
    envelopeCatalogVersion = incomingCatalog || envelopeCatalogVersion;
    if (incomingRejects.some((r) => r.reason === "catalog-mismatch")) {
      persistenceStatus = "catalog-mismatch";
      storageMsg = "Imported envelope catalogVersion differs from this lab. Valid entries merged; not treated as authoritative without review.";
    } else {
      persistenceStatus = incomingRejects.length ? "partial" : "valid";
    }
    const ok = saveChoices();
    if (!ok) {
      // save failed: keep merged memory (intent applied) but banner already honest from saveChoices
    } else {
      recoveryRaw = null; // successful persist replaces prior recovery need
    }
    renderNav();
    refreshChoiceSurfaces();
    return {
      ok: true,
      message: `Merged ${acceptedN} validated choice(s) (${changed} changed, ${unchanged} already same); ${incomingRejects.length} rejected. Prior families not in import kept. ` + (ok ? "Saved." : "Kept in memory only (save failed)."),
    };
  }

  function renderDocs() {
    const g = DATA.state_grammar_v4;
    $("#docs").innerHTML = `
      <h3>Type roles</h3>
      <p class="meta">From Typography 1 (FALL 2021). Tokens live in lab.css. Licenses: <a href="docs/FONTS.md">docs/FONTS.md</a>.</p>
      <div class="type-specimen">
        <div class="type-row"><div class="role-meta spec-foot">Display</div><div class="role-display">Visible language</div></div>
        <div class="type-row"><div class="role-meta spec-foot">Title</div><div class="role-title">Card and document titles</div></div>
        <div class="type-row"><div class="role-meta spec-foot">Reading</div><div class="role-body">Reading text uses IBM Plex Sans at 14px on 21px leading. Alignment in the lab is left, rag right.</div></div>
        <div class="type-row"><div class="role-meta spec-foot">Study serif</div><div class="role-serif">Libre Baskerville is the study serif. The booklet’s Baskerville is not a free web font and is not shipped.</div></div>
        <div class="type-row"><div class="role-meta spec-foot">Spec</div><p class="spec-foot">14/21 · IBM Plex Sans · regular · 0 tracking</p></div>
      </div>
      <h3>Product frame (proposed)</h3>
      <p>Jaryo is a proposed graphical interface for pipelines via CLI, MCP, or other adapters. The architecture is exploratory. AGIW Suite is one application of Jaryo, not the whole product. MCP alone has no renderer; a host is still required. This lab is not an installable product.</p>
      <h3>State grammar (v4)</h3>
      <ul>
        <li><strong>Selected:</strong> ${esc(g.selected)}</li>
        <li><strong>Focus:</strong> ${esc(g.focus)}</li>
        <li><strong>Blocked:</strong> ${esc(g.blocked)}</li>
        <li><strong>Unknown:</strong> ${esc(g.unknown)}</li>
        <li><strong>Unavailable:</strong> ${esc(g.unavailable)}</li>
        <li><strong>Identity accent:</strong> ${esc(g.identity_accent)}</li>
      </ul>
      <h3>Implemented in this lab vs proposed product</h3>
      <p><strong>Lab implements:</strong> ${esc(DATA.implemented_in_lab.join("; "))}</p>
      <p><strong>Proposed / not implemented:</strong> ${esc(DATA.proposed_not_implemented.join("; "))}</p>
      <h3>Accessibility baseline (required, not an option)</h3>
      <p>Contrast-aware B/W or color-independent signals; 3px dashed focus ring; ≥44px hit targets; state in words/glyphs; keyboard path; prefers-reduced-motion respected; honest unsupported controls.</p>
      <h3>Notices</h3>
      <ul>${DATA.notices.map((n) => `<li>${withLinks(n)}</li>`).join("")}</ul>
      <h3>Links</h3>
      <ul>
        <li><a href="https://github.com/louiscalata/jaryo">Repository</a></li>
        <li><a href="${esc(DATA.canonical_notion || DATA.homepage || "https://louiscalata.github.io/jaryo/")}">Published lab</a></li>
      </ul>
      <p>This lab is an interactive companion, not a production product.</p>
    `;
  }

  function setTab(tab) {
    activeTab = tab;
    $$(".tab").forEach((t) => {
      const on = t.dataset.tab === tab;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
    });
    $$(".panel").forEach((p) => p.classList.toggle("active", p.id === `panel-${tab}`));
    if (tab === "summary") renderSummary();
    if (tab === "journeys") renderJourneys();
  }

  function choose(optId) {
    const famId = optId.slice(0, 3);
    if (!DATA || !familyById(famId) || !familyById(famId).options.some((o) => o.id === optId)) {
      toast("Ignored invalid option id.");
      return;
    }
    choices[famId] = optId;
    const ok = saveChoices();
    syncChoiceUI(famId);
    renderSummary();
    toast(ok
      ? `Chose ${optId}. Preference only — not production validation.`
      : `Chose ${optId} in-memory only (storage failed).`);
    const live = $("#choice-live");
    if (live) live.textContent = `Selected ${optId}`;
  }

  function refreshChoiceSurfaces() {
    // Full compare rebuild so CHOSEN markers/radios match choices (incl. empty after reset).
    renderCompare();
    renderJourneys();
    renderSummary();
    const live = $("#choice-live");
    if (live) {
      const n = acceptedChoiceCount();
      live.textContent = n ? `${n} validated choice(s) retained` : "No selections";
    }
    updateRecoveryButton();
  }

  function resetChoices() {
    const previous = Object.assign({}, choices);
    const previousRejects = persistenceRejects.slice();
    const previousStatus = persistenceStatus;
    const previousEnvelopeCatalog = envelopeCatalogVersion;
    choices = {};
    persistenceRejects = [];
    persistenceStatus = "missing";
    envelopeCatalogVersion = null;
    const ok = saveChoices();
    if (!ok) {
      choices = previous;
      persistenceRejects = previousRejects;
      persistenceStatus = previousStatus;
      envelopeCatalogVersion = previousEnvelopeCatalog;
      refreshChoiceSurfaces();
      toast("Persistent reset failed; existing selections preserved in memory.");
      return;
    }
    recoveryRaw = null;
    refreshChoiceSurfaces();
    toast("Selections reset and cleared from storage.");
  }

  async function copyExport() {
    const text = JSON.stringify(exportPayload(), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied selection JSON.");
    } catch (e) {
      toast("Clipboard blocked — use Download JSON instead.");
    }
  }

  function downloadExport() {
    const blob = new Blob([JSON.stringify(exportPayload(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "jaryo-lab-choices.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function updateRecoveryButton() {
    const btn = $("#btn-recovery");
    if (!btn) return;
    // Show whenever raw bytes were retained for recovery (malformed load or later save failure with retained raw).
    btn.hidden = !recoveryRaw;
  }

  function downloadRecoveryRaw() {
    if (!recoveryRaw) {
      toast("No recovery raw available.");
      return;
    }
    const blob = new Blob([recoveryRaw], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "jaryo-lab-recovery-raw.json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Downloaded recovery raw (unparsed storage bytes).");
  }

  function bind() {

    $("#family-nav").addEventListener("click", (e) => {
      const b = e.target.closest("[data-fam]");
      if (!b) return;
      activeFamily = b.dataset.fam;
      renderNav();
      renderCompare();
      setTab("compare");
    });
    $("#cards").addEventListener("change", (e) => {
      const radio = e.target;
      if (radio && radio.matches('input[type="radio"][data-choice]') && radio.checked) {
        choose(radio.value);
      }
    });
    if (window.JARYO_STAGE_UI) window.JARYO_STAGE_UI.bind($("#cards"));
    $("#cards").addEventListener("click", (e) => {
      const exp = e.target.closest("[data-expand]");
      if (!exp) return;
      const card = exp.closest(".opt-card");
      const stage = card.querySelector(".preview-stage");
      const on = stage.classList.toggle("expanded");
      exp.setAttribute("aria-expanded", on ? "true" : "false");
      exp.textContent = on ? "Collapse preview" : "Expand preview";
      const id = card.getAttribute("data-id");
      if (!expandedByFamily[activeFamily]) expandedByFamily[activeFamily] = new Set();
      if (on) expandedByFamily[activeFamily].add(id);
      else expandedByFamily[activeFamily].delete(id);
    });
    const importInput = $("#import-file");
    const importBtn = $("#btn-import");
    if (importBtn && importInput) {
      importBtn.addEventListener("click", () => {
        importInput.click();
      });
    }
    if (importInput) {
      importInput.addEventListener("change", async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          const raw = await file.text();
          const result = importPayloadText(raw);
          toast(result.message);
        } catch (err) {
          toast("Import failed: " + (err && err.message ? err.message : String(err)));
        }
        e.target.value = "";
      });
    }
    $$(".tab").forEach((t) => t.addEventListener("click", () => setTab(t.dataset.tab)));
    // Tabs pattern: roving tabindex, arrows / Home / End move + activate (automatic activation).
    const tablist = $(".tabs[role=tablist]");
    if (tablist) tablist.addEventListener("keydown", (e) => {
      const tabs = $$(".tab", tablist);
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      let j = null;
      if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
      else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = tabs.length - 1;
      if (j == null) return;
      e.preventDefault();
      setTab(tabs[j].dataset.tab);
      tabs[j].focus();
    });
    $("#cards").addEventListener("keydown", onRadioKey);
    const themeSel = $("#theme-select");
    if (themeSel) {
      themeSel.value = readTheme();
      themeSel.addEventListener("change", () => {
        const v = themeSel.value;
        applyTheme(v);
        try { if (v === "system") localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, v); } catch (_) {}
        toast(`Theme: ${v}.`);
      });
    }
    $("#btn-reset").addEventListener("click", resetChoices);
    const recoveryBtn = $("#btn-recovery");
    if (recoveryBtn) recoveryBtn.addEventListener("click", downloadRecoveryRaw);
    $("#btn-copy").addEventListener("click", copyExport);
    $("#btn-download").addEventListener("click", downloadExport);
    $("#demo-state").addEventListener("change", (e) => {
      demoState = e.target.value;
      const stage = $("#grammar-demo");
      stage.className = "state-swatch " + (demoState === "idle" ? "" : demoState);
      const labels = {
        idle: "demo control",
        selected: "▶ selected (invert)",
        focusish: "focus ring (≠ selected)",
        blocked: "× blocked + reason",
        unknown: "? unknown",
        unavailable: "unavailable + reason",
      };
      stage.textContent = labels[demoState] || demoState;
    });
  }

  async function boot() {
    loadChoices();
    $("#storage-banner").textContent = storageMsg + " A saved choice is a preference, not a product change.";
    $("#storage-banner").className = (!storageOk || persistenceStatus === "malformed") ? "banner err" : "banner warn";
    $("#storage-banner").hidden = false;
    updateRecoveryButton();

    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error("HTTP " + res.status);
      DATA = await res.json();
    } catch (e) {
      // file:// or fetch fail → use embedded
      if (window.JARYO_LAB_DATA) {
        DATA = window.JARYO_LAB_DATA;
        toast("Loaded embedded catalog (fetch unavailable).");
      } else {
        $("#main").innerHTML = `<div class="banner err">Failed to load ${DATA_URL}: ${esc(e.message)}. Open via a local static server or use the embedded build.</div>`;
        return;
      }
    }

    $("#lab-version").textContent = catalogPhrase();
    normalizeAfterCatalog();
    if (persistenceRejects.length) {
      storageMsg += ` Rejected ${persistenceRejects.length} invalid stored entr${persistenceRejects.length === 1 ? "y" : "ies"} (status=${persistenceStatus}).`;
      $("#storage-banner").textContent = storageMsg + " A saved choice is a preference, not a product change.";
      $("#storage-banner").className = persistenceStatus === "malformed" || persistenceStatus === "unavailable" ? "banner err" : "banner warn";
    }
    updateRecoveryButton();
    renderNav();
    renderCompare();
    renderJourneys();
    renderDocs();
    renderSummary();
    bind();
    setTab("compare");
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
