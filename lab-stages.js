/* Interactive previews for F19 Red interactive UI.
   F18 project stages register on the same object. */
(function () {
  "use strict";

  function frames(label) {
    const items = [["phone", "Phone"], ["fold", "Fold"], ["tablet", "Tablet"], ["desk", "Desk"]];
    return `<div class="jstage-bar" role="group" aria-label="Preview width for ${label}">${items.map(function (item, i) {
      return `<button type="button" data-frame-set="${item[0]}" aria-pressed="${i === 0 ? "true" : "false"}">${item[1]}</button>`;
    }).join("")}</div>`;
  }

  function tone() {
    return `<div class="jstage-bar" role="group" aria-label="Paper or ink">
      <button type="button" data-tone-set="light" aria-pressed="true">Paper</button>
      <button type="button" data-tone-set="dark" aria-pressed="false">Ink</button>
    </div>`;
  }

  function shell(id, label, inner, withTone) {
    return `<div class="jstage" data-stage="${id}">${frames(label)}${withTone ? tone() : ""}<div class="jstage-view" data-frame="phone"><div class="jstage-ui">${inner}</div></div></div>`;
  }

  function pressGroup(parent, selector, chosen) {
    parent.querySelectorAll(selector).forEach(function (btn) {
      const on = btn === chosen;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("is-on", on);
    });
  }

  function move(event, selector) {
    const btn = event.target.closest(selector);
    if (!btn) return false;
    const group = btn.parentElement;
    const list = Array.from(group.children).filter(function (el) { return el.matches && el.matches(selector); });
    if (list.length < 2 || list.indexOf(btn) < 0) return false;
    const i = list.indexOf(btn);
    let j = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") j = (i + 1) % list.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") j = (i - 1 + list.length) % list.length;
    else if (event.key === "Home") j = 0;
    else if (event.key === "End") j = list.length - 1;
    else return false;
    event.preventDefault();
    event.stopPropagation();
    list[j].focus();
    list[j].click();
    return true;
  }

  function onClick(event) {
    const frameBtn = event.target.closest("[data-frame-set]");
    if (frameBtn && frameBtn.closest(".jstage")) {
      const stage = frameBtn.closest(".jstage");
      pressGroup(frameBtn.parentElement, "[data-frame-set]", frameBtn);
      stage.querySelector(".jstage-view").setAttribute("data-frame", frameBtn.getAttribute("data-frame-set"));
      return;
    }
    const toneBtn = event.target.closest("[data-tone-set]");
    if (toneBtn) {
      const stage = toneBtn.closest(".jstage");
      pressGroup(toneBtn.parentElement, "[data-tone-set]", toneBtn);
      stage.querySelector(".jstage-ui").setAttribute("data-tone", toneBtn.getAttribute("data-tone-set"));
      return;
    }
    const alignBtn = event.target.closest("[data-align]");
    if (alignBtn) {
      const ui = alignBtn.closest(".jstage-ui");
      pressGroup(alignBtn.parentElement, "[data-align]", alignBtn);
      ui.setAttribute("data-align", alignBtn.getAttribute("data-align"));
      return;
    }
    const pick = event.target.closest("[data-pick]");
    if (pick) {
      pressGroup(pick.parentElement, "[data-pick]", pick);
      const live = pick.closest(".jstage-ui").querySelector("[data-live]");
      if (live) live.textContent = pick.getAttribute("data-label") || pick.textContent.trim();
      return;
    }
    const cycle = event.target.closest("[data-cycle]");
    if (cycle) {
      const ui = cycle.closest(".jstage-ui");
      const names = cycle.getAttribute("data-cycle").split("|");
      let i = Number(ui.getAttribute("data-i") || "0");
      i = (i + 1) % names.length;
      ui.setAttribute("data-i", String(i));
      const parts = names[i].split("/");
      ui.querySelector(".wm-full").textContent = parts[0];
      ui.querySelector(".wm-short").textContent = parts[1];
      const live = ui.querySelector("[data-live]");
      if (live) live.textContent = parts[0];
      return;
    }
    const adv = event.target.closest("[data-advance]");
    if (adv) {
      const ui = adv.closest(".jstage-ui");
      const lines = adv.getAttribute("data-advance").split("|");
      let i = Number(ui.getAttribute("data-i") || "0");
      i = (i + 1) % lines.length;
      ui.setAttribute("data-i", String(i));
      ui.querySelector("[data-line]").textContent = lines[i];
      return;
    }
    const step = event.target.closest("[data-step]");
    if (step) {
      const ui = step.closest(".jstage-ui");
      const host = ui.querySelector("[data-people]") || ui;
      const people = host.getAttribute("data-people").split("|");
      let i = Number(host.getAttribute("data-i") || "0");
      i = (i + Number(step.getAttribute("data-step")) + people.length) % people.length;
      host.setAttribute("data-i", String(i));
      const parts = people[i].split("/");
      ui.querySelector("[data-person]").textContent = parts[0];
      ui.querySelector("[data-tag]").textContent = parts[1];
      const live = ui.querySelector("[data-live]");
      if (live) live.textContent = parts[0] + " " + parts[1];
      return;
    }
    const disc = event.target.closest("[data-disclose]");
    if (disc) {
      const open = disc.getAttribute("aria-expanded") !== "true";
      disc.setAttribute("aria-expanded", open ? "true" : "false");
      const panel = disc.parentElement.querySelector("[data-panel]");
      if (panel) panel.hidden = !open;
    }
  }

  function onKey(event) {
    if (move(event, "[data-frame-set]")) return;
    if (move(event, "[data-tone-set]")) return;
    if (move(event, "[data-align]")) return;
    if (move(event, "[data-pick]")) return;
  }

  const stages = {
    "F19.01": function () {
      return shell("F19.01", "Red spec title", `
        <div class="red" data-tone="light" data-align="left">
          <p class="red-kicker">Project 5.3</p>
          <h4 class="red-title">Typesetting paragraphs</h4>
          <p class="red-section">Visible and invisible language</p>
          <p class="red-body">A section title, a reading paragraph, and a spec line. Red marks the project. The paragraph stays black or white.</p>
          <p class="red-spec">16/24 · IBM Plex Sans · regular · 0 tracking</p>
          <div class="toolrow" role="group" aria-label="Paragraph alignment">
            <button type="button" data-align="left" aria-pressed="true">Left</button>
            <button type="button" data-align="center" aria-pressed="false">Center</button>
            <button type="button" data-align="justify" aria-pressed="false">Justify</button>
          </div>
          <p data-live>Left, rag right</p>
        </div>`, true);
    },
    "F19.02": function () {
      return shell("F19.02", "Red cross-align meta", `
        <div class="red" data-tone="light">
          <div class="cross">
            <div class="meta-col">
              <span>16/24</span>
              <span>Libre Baskerville</span>
              <span>Regular</span>
              <span>Flush left</span>
            </div>
            <div>
              <p class="red-section">Visible and invisible language</p>
              <p class="read-col">The notes sit beside the reading column and share its vertical rhythm. On a narrow width they stack above the paragraph.</p>
            </div>
          </div>
          <p class="red-spec">Meta is red. The paragraph is not.</p>
        </div>`, true);
    },
    "F19.03": function () {
      return shell("F19.03", "Red wordmark plate", `
          <div class="red" data-tone="light">
          <div class="wordmark">
            <p class="wm"><span class="wm-full">JARYO</span><span class="wm-short">JRY</span></p>
            <div class="rule" role="presentation"></div>
            <button type="button" data-cycle="JARYO/JRY|AGIW/AGW|OPOS/OPS|NISI/NSI">Next wordmark</button>
            <p data-live>JARYO</p>
          </div>
        </div>`, true);
    },
    "F19.04": function () {
      return shell("F19.04", "Red interactive chips", `
        <div class="red" data-tone="light">
          <p class="red-section">Archive tags</p>
          <div class="chips" role="group" aria-label="Red chips">
            <button type="button" data-pick data-label="Specimen selected" aria-pressed="true"><span class="mark" aria-hidden="true">✓</span>Specimen</button>
            <button type="button" data-pick data-label="Grid selected" aria-pressed="false"><span class="mark" aria-hidden="true">✓</span>Grid</button>
            <button type="button" data-pick data-label="Poster selected" aria-pressed="false"><span class="mark" aria-hidden="true">✓</span>Poster</button>
          </div>
          <p data-live>Specimen selected</p>
          <p class="red-spec">Selected is fill plus a check. Red is not the only signal.</p>
        </div>`, true);
    },
    "F18.01": function () {
      return shell("F18.01", "Mendacity void cue", `
        <div class="mv">
          <h4 class="mv-title">MENDACITY</h4>
          <div class="mv-stage"><div class="mv-actor" aria-hidden="true">A</div></div>
          <div class="mv-actions" role="group" aria-label="Mendacity cue">
            <button type="button" data-pick data-label="Step forward" aria-pressed="true">Step</button>
            <button type="button" data-pick data-label="Exit" aria-pressed="false">Exit</button>
          </div>
          <p data-live>Step forward</p>
        </div>`);
    },
    "F18.02": function () {
      return shell("F18.02", "Mendacity combat ledger", `
        <div class="mv">
          <div class="mv-ledger">
            <div class="mv-disc" aria-hidden="true">A</div>
            <div>
              <p class="mv-row"><span>HP</span><span>95%</span></p>
              <p class="mv-row"><span>MP</span><span>44%</span></p>
              <p class="mv-row"><span>Bow</span><span>3</span></p>
            </div>
            <div>
              <button type="button" data-disclose aria-expanded="true" aria-controls="mend-keys">Keys</button>
              <div id="mend-keys" data-panel>
                <p class="mv-row"><span>Move</span><span>WASD</span></p>
                <p class="mv-row"><span>Sprint</span><span>Shift</span></p>
                <p class="mv-row"><span>Attack</span><span>J</span></p>
              </div>
            </div>
          </div>
        </div>`);
    },
    "F18.03": function () {
      return shell("F18.03", "Plague journal menu", `
        <div class="plague">
          <p class="plague-quest">Objective · find the source</p>
          <div class="plague-body">
            <div class="plague-lockup">
              <h4 class="plague-title">PLAGUE</h4>
              <div class="plague-rule" role="presentation"></div>
            </div>
            <div class="plague-menu" role="group" aria-label="Plague menu">
              <button type="button" data-pick data-label="Resume" aria-pressed="true">Resume</button>
              <button type="button" data-pick data-label="Save" aria-pressed="false">Save</button>
              <button type="button" data-pick data-label="Options" aria-pressed="false">Options</button>
              <button type="button" data-pick data-label="Quit" aria-pressed="false">Quit</button>
            </div>
            <p data-live>Resume</p>
          </div>
        </div>`);
    },
    "F18.04": function () {
      return shell("F18.04", "Plague dialogue", `
        <div class="plague">
          <div class="dlg">
            <div class="mv-disc" aria-hidden="true">D</div>
            <p class="dlg-name">DOC</p>
            <p class="dlg-line" data-line>The outbreak is moving up from the catacombs.</p>
            <button type="button" class="advance" data-advance="The outbreak is moving up from the catacombs.|The source is still below the streets.|Keep the objective on screen.">Advance</button>
          </div>
        </div>`);
    },
    "F18.05": function () {
      return shell("F18.05", "Brawler focus stack", `
        <div class="brawl">
          <h4 class="brawl-mark">BRAWLER</h4>
          <p class="brawl-sub">NEON CITY</p>
          <div class="brawl-menu" role="group" aria-label="Brawler menu">
            <button type="button" data-pick data-label="Play" aria-pressed="true">Play</button>
            <button type="button" data-pick data-label="Quit" aria-pressed="false">Quit</button>
          </div>
          <p data-live>Play</p>
        </div>`);
    },
    "F18.06": function () {
      return shell("F18.06", "Brawler character rail", `
        <div class="brawl" data-people="Lead/P1|Partner/P2">
          <p class="brawl-sub">CHARACTER</p>
          <div class="rail">
            <button type="button" data-step="-1" aria-label="Previous character">Prev</button>
            <div>
              <p class="rail-name" data-person>Lead</p>
              <p class="rail-tag" data-tag>P1</p>
            </div>
            <button type="button" data-step="1" aria-label="Next character">Next</button>
          </div>
          <p data-live>Lead P1</p>
        </div>`);
    },
    "F18.07": function () {
      return shell("F18.07", "Contrails tactical select", `
        <div class="ct">
          <div class="ct-body">
            <div>
              <div class="ct-mark" role="img" aria-label="Contrails mark"></div>
              <p class="ct-word">CTRLS</p>
            </div>
            <div>
              <p class="ct-alert"><b>CONTROL</b> OR BE CONTROLLED</p>
              <p class="ct-meter">SPD <span class="seg on"></span><span class="seg on"></span><span class="seg on"></span><span class="seg"></span><span class="seg"></span> 60%</p>
              <p class="ct-meter">RNG <span class="seg on"></span><span class="seg on"></span><span class="seg on"></span><span class="seg on"></span><span class="seg"></span> 80%</p>
              <button type="button" data-pick data-label="Back" aria-pressed="false">Back</button>
            </div>
            <div class="ct-menu" role="group" aria-label="Contrails menu">
              <button type="button" data-pick data-label="Continue" aria-pressed="true">Continue</button>
              <button type="button" data-pick data-label="New game" aria-pressed="false">New game</button>
              <button type="button" data-pick data-label="Settings" aria-pressed="false">Settings</button>
              <button type="button" data-pick data-label="Quit" aria-pressed="false">Quit</button>
            </div>
          </div>
          <p data-live>Continue</p>
        </div>`);
    },
    "F18.08": function () {
      return shell("F18.08", "Contrails status", `
        <div class="ct">
          <p class="ct-word">CTRLS</p>
          <div class="status-row" role="group" aria-label="Contrails status">
            <button type="button" data-pick data-label="Help" aria-pressed="false"><span class="glyph diamond" aria-hidden="true"></span>Help</button>
            <button type="button" data-pick data-label="Mute" aria-pressed="false"><span class="glyph diamond" aria-hidden="true"></span>Mute</button>
            <button type="button" data-pick data-label="OK" aria-pressed="true"><span class="glyph diamond solid" aria-hidden="true"></span>OK</button>
            <button type="button" data-pick data-label="Blocked, link down" aria-pressed="false"><span class="glyph diamond" aria-hidden="true"></span>Blocked</button>
            <button type="button" data-pick data-label="Locked" aria-pressed="false"><span class="glyph round" aria-hidden="true"></span>Locked</button>
          </div>
          <p data-live>OK</p>
        </div>`);
    }
  };

  /* F19.01 puts data-align on an inner .red, but the click handler sets it on .jstage-ui.
     Mirror the attribute onto .red so the CSS matches. */
  const baseClick = onClick;
  function onClickFixed(event) {
    baseClick(event);
    const alignBtn = event.target.closest && event.target.closest("[data-align]");
    if (alignBtn) {
      const red = alignBtn.closest(".red");
      if (red) red.setAttribute("data-align", alignBtn.getAttribute("data-align"));
      const live = alignBtn.closest(".jstage-ui").querySelector("[data-live]");
      const names = { left: "Left, rag right", center: "Centered", justify: "Justified" };
      if (live) live.textContent = names[alignBtn.getAttribute("data-align")] || "";
    }
    const toneBtn = event.target.closest && event.target.closest("[data-tone-set]");
    if (toneBtn) {
      const red = toneBtn.closest(".jstage").querySelector(".red");
      if (red) red.setAttribute("data-tone", toneBtn.getAttribute("data-tone-set"));
    }
  }

  window.JARYO_STAGE_UI = {
    has: function (id) { return Object.prototype.hasOwnProperty.call(stages, id); },
    render: function (opt) {
      const fn = stages[opt.id];
      return fn ? fn(opt) : "";
    },
    wideFamilies: { F18: true, F19: true },
    bind: function (root) {
      root.addEventListener("click", onClickFixed);
      root.addEventListener("keydown", onKey);
    },
    _stages: stages
  };
})();
