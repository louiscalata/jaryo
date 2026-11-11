import { contrast } from "./expanded-layout.mjs";

export const requiredControls = ["select", "family navigation", "section tab", "choice radio", "expand button"];
export const requiredLinks = [
  { id:"skip", href:"#main", selector:'a.skip[href="#main"]' },
  { id:"repository", href:"https://github.com/louiscalata/jaryo", selector:'.app-header a[href="https://github.com/louiscalata/jaryo"]' },
  { id:"live lab", href:"https://louiscalata.github.io/jaryo/", selector:'.app-header a[href="https://louiscalata.github.io/jaryo/"]' },
  { id:"project page", href:"https://fortheloveof.studio/code/jaryo/", selector:'.app-header a[href="https://fortheloveof.studio/code/jaryo/"]' },
];
function category(r) {
  if (r.tag === "SELECT") return "select";
  if (r.tag === "INPUT" && r.type === "radio") return "choice radio";
  if (r.tag === "BUTTON") {
    if (r.classes.includes("navbtn")) return "family navigation";
    if (r.classes.includes("tab")) return "section tab";
    if (r.classes.includes("expand-btn")) return "expand button";
  }
  return null;
}
const ringVisible = r => r.fv && r.style !== "none" && r.width >= 2;

export function assessFocusCoverage(tabbed, links) {
  const observedControls = [...new Set(tabbed.map(category).filter(Boolean))];
  const badTabbed = tabbed.filter(r => !ringVisible(r));
  const missingControls = requiredControls.filter(name => !observedControls.includes(name));
  const badLinks = requiredLinks.flatMap(spec => {
    const matches = links.filter(r => r.id === spec.id), r = matches[0];
    if (matches.length !== 1 || r.matchCount !== 1 || !r.active || r.tag !== "A" || r.href !== spec.href || !r.shown || !r.text?.trim() || !ringVisible(r)
      || !(contrast(r.color, r.outlineBackground) >= 3) || !(contrast(r.textColor, r.textBackground) >= 4.5)) return [spec.id];
    return [];
  });
  return { observedControls, badTabbed, missingControls, badLinks };
}

// Serialized by Playwright into the native page; no browser is imported here.
export function readFocusedTarget(expectedSelector) {
  const a = document.activeElement;
  if (!a || a === document.body) return null;
  const target = a.matches('input[type="radio"]') ? a.closest(".choose-label") : a;
  const s = getComputedStyle(target), box = target.getBoundingClientRect();
  let backgroundNode = target, textBackground;
  while (backgroundNode) {
    textBackground = getComputedStyle(backgroundNode).backgroundColor;
    if (textBackground !== "transparent" && textBackground !== "rgba(0, 0, 0, 0)") break;
    backgroundNode = backgroundNode.parentElement;
  }
  return {
    key:a.tagName + "." + (a.className || a.id || a.type), tag:a.tagName, classes:[...a.classList], type:a.type,
    href:a.getAttribute("href"), active:expectedSelector ? a.matches(expectedSelector) : true,
    fv:a.matches(":focus-visible"), style:s.outlineStyle, width:parseFloat(s.outlineWidth), color:s.outlineColor,
    shown:s.visibility !== "hidden" && Number(s.opacity) !== 0 && box.width > 0 && box.height > 0,
    text:target.textContent.trim(), textColor:s.color, textBackground,
    outlineBackground:getComputedStyle(document.body).backgroundColor,
  };
}
