// Shared native smoke checks for the selected expanded-card treatment.
const timeout = 5000;
const near = (a, b) => Math.abs(a - b) <= 1;
const contained = (inner, outer) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1 && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
const overlaps = (a, b) => Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1;
function contrast(a, b) {
  const luminance = color => {
    const rgb = color.match(/[\d.]+/g)?.map(Number);
    if (!rgb || rgb.length < 3 || (rgb.length === 4 && rgb[3] !== 1)) return NaN;
    const linear = rgb.slice(0, 3).map(n => n / 255).map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function assessExpandedLayout(s, { width, wide, count }) {
  const stacked = wide || width <= 980;
  return {
    expanded: s.cards.length === count && s.cards.every(c => c.ariaExpanded === "true"),
    placement: s.cards.length === count && s.cards.every(c => c.notes.length >= 5 && c.title.bottom <= c.preview.top + 1 && (stacked
      ? c.notes.every(n => n.top >= c.preview.bottom - 1)
      : c.notes.every(n => n.left >= c.preview.right - 1) && c.notes[0].top < c.preview.bottom)),
    width: s.cards.length === count && s.cards.every(c => wide
      ? near(c.preview.left, c.title.left) && near(c.preview.right, c.title.right)
      : width > 980 ? c.card.width > s.collapsedWidth + 1 : near(c.card.width, s.collapsedWidth)),
    containment: s.cards.every(c => c.children.every(r => contained(r, c.body)) && c.clipped.length === 0),
    separateCards: s.cards.every((c, i) => s.cards.slice(i + 1).every(other => !overlaps(c.card, other.card))),
    rootFits: s.rootOverflow <= 1,
    folios: s.cards.every(c => /IBM Plex Mono/.test(c.folioFamily) && c.folioSize >= c.titleSize && c.folioText === c.id),
    titleContrast: s.cards.every(c => contrast(c.titleColor, c.background) >= 4.5),
    forcedColors: s.cards.every(c => c.titleText.trim() && c.titleVisible && contrast(c.titleColor, c.background) >= 4.5 && c.borderStyle !== "none" && c.borderWidth > 0 && contrast(c.borderColor, c.background) >= 3),
  };
}

async function clickReady(locator) {
  await locator.scrollIntoViewIfNeeded({ timeout });
  await locator.evaluate(el => el.scrollIntoView({ block: "center", inline: "nearest" }));
  await locator.waitFor({ state: "visible", timeout });
  await locator.click({ trial: true, timeout });
  await locator.click({ timeout });
}

async function snapshot(page) {
  // Wait for the preview's finite height transition, rather than sleeping.
  await page.waitForFunction(() => [...document.querySelectorAll(".preview-stage.expanded")].every(el => el.getAnimations().every(a => a.playState !== "running")), null, { timeout });
  return page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width }; };
    const collapsed = document.querySelector("#cards .opt-card:not(:has(.preview-stage.expanded))");
    return {
      rootOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      collapsedWidth: collapsed?.getBoundingClientRect().width || 0,
      cards: [...document.querySelectorAll("#cards .opt-card:has(.preview-stage.expanded)")].map(card => {
        const body = card.querySelector(":scope > .body"), title = body.querySelector(":scope > h3");
        const preview = body.querySelector(":scope > .preview-stage"), folio = card.querySelector(".oid");
        const ts = getComputedStyle(title), cs = getComputedStyle(card), fs = getComputedStyle(folio);
        const children = [...body.children];
        return {
          id:card.dataset.id, card:rect(card), body:rect(body), title:rect(title), preview:rect(preview),
          notes:[...body.querySelectorAll(":scope > .spec-foot, :scope > .small, :scope > .tradeoff")].map(rect),
          children:children.map(rect), clipped:[body, ...children].filter(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1).map(el => el.className || el.tagName),
          ariaExpanded:card.querySelector(".expand-btn").getAttribute("aria-expanded"),
          folioText:folio.textContent, folioFamily:fs.fontFamily, folioSize:parseFloat(fs.fontSize), titleSize:parseFloat(ts.fontSize),
          titleText:title.textContent, titleVisible:ts.visibility !== "hidden" && Number(ts.opacity) !== 0,
          titleColor:ts.color, background:cs.backgroundColor, borderColor:cs.borderTopColor, borderWidth:parseFloat(cs.borderTopWidth), borderStyle:cs.borderTopStyle,
        };
      }),
    };
  });
}

export async function runExpandedLayoutChecks({ page, width, check, forcedColors = false }) {
  await page.waitForFunction(() => document.fonts.status === "loaded", null, { timeout });
  if (forcedColors) check(`expanded forced-colors emulation active (w=${width})`, await page.evaluate(() => matchMedia("(forced-colors: active)").matches));
  const mode = forcedColors ? "forced-colors" : await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  const inspect = async (family, wide, count) => {
    const s = await snapshot(page), results = assessExpandedLayout(s, { width, wide, count });
    for (const name of ["expanded", "placement", "width", "containment", "separateCards", "rootFits", "folios", "titleContrast"]) {
      check(`expanded ${family} ${name} (${mode}, w=${width})`, results[name], s);
    }
    if (forcedColors) check(`expanded ${family} forced-colors title and rule (${mode}, w=${width})`, results.forcedColors, s);
  };

  await clickReady(page.locator('[data-fam="F02"]'));
  const cards = page.locator("#cards .opt-card");
  const firstId = await cards.nth(0).getAttribute("data-id");
  await clickReady(cards.nth(0).locator(".expand-btn"));
  await clickReady(cards.nth(1).locator(".expand-btn"));
  await inspect("F02-multiple", false, 2);

  const radio = cards.nth(0).locator('input[type="radio"]');
  await radio.scrollIntoViewIfNeeded({ timeout });
  await radio.focus({ timeout });
  await page.keyboard.press("Tab");
  await page.waitForFunction(id => document.activeElement?.dataset.expand === id, firstId, { timeout });
  const focus = await page.evaluate(() => {
    const el = document.activeElement, s = getComputedStyle(el), r = el.getBoundingClientRect();
    return { text:el.textContent.trim(), visible:el.matches(":focus-visible"), outline:s.outlineStyle, outlineWidth:parseFloat(s.outlineWidth), outlineColor:s.outlineColor, background:getComputedStyle(el.closest(".opt-card")).backgroundColor, shown:s.visibility !== "hidden" && Number(s.opacity) !== 0, inside:r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
  });
  check(`expanded keyboard focus visible (${mode}, w=${width})`, focus.text.length > 0 && focus.visible && focus.outline !== "none" && focus.outlineWidth >= 2 && contrast(focus.outlineColor, focus.background) >= 3 && focus.shown && focus.inside, focus);
  await page.keyboard.press("Space");
  const collapse = await page.evaluate(id => ({ first:document.querySelector(`[data-expand="${id}"]`).getAttribute("aria-expanded"), others:document.querySelectorAll("#cards .preview-stage.expanded").length, focused:document.activeElement?.dataset.expand === id }), firstId);
  check(`expanded keyboard collapses only its card (${mode}, w=${width})`, collapse.first === "false" && collapse.others === 1 && collapse.focused, collapse);
  await page.keyboard.press("Space");
  await inspect("F02-keyboard-reexpanded", false, 2);

  for (const family of ["F18", "F19"]) {
    await clickReady(page.locator(`[data-fam="${family}"]`));
    await clickReady(page.locator("#cards .expand-btn").first());
    await inspect(family, true, 1);
  }
}
