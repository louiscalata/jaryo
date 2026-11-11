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
  const viewport = { left:0, top:0, right:document.documentElement.clientWidth, bottom:document.documentElement.clientHeight };
  const range = document.createRange(); range.selectNodeContents(target);
  const textRects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
  const fits = (r, b) => r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
  const visibilityProblems = [];
  if (!fits(box, viewport)) visibilityProblems.push("target outside viewport");
  if (!textRects.length || !textRects.every(r => fits(r, viewport))) visibilityProblems.push("text outside viewport or empty");
  for (let n = target; n; n = n.parentElement) {
    const style = getComputedStyle(n), bounds = n.getBoundingClientRect();
    if (style.visibility === "hidden" || style.visibility === "collapse" || Number(style.opacity) === 0) visibilityProblems.push("hidden ancestor");
    if ((style.clip && style.clip !== "auto") || (style.clipPath && style.clipPath !== "none")) visibilityProblems.push("unsupported clipping");
    const left = bounds.left + n.clientLeft, top = bounds.top + n.clientTop;
    if (style.overflowX !== "visible" && textRects.some(r => r.left < left - 1 || r.right > left + n.clientWidth + 1)) visibilityProblems.push("text clipped horizontally");
    if (style.overflowY !== "visible" && textRects.some(r => r.top < top - 1 || r.bottom > top + n.clientHeight + 1)) visibilityProblems.push("text clipped vertically");
  }
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
    shown:visibilityProblems.length === 0 && box.width > 0 && box.height > 0,
    visibilityProblems, viewport, textRects:textRects.map(r => ({left:r.left,right:r.right,top:r.top,bottom:r.bottom})),
    text:target.textContent.trim(), textColor:s.color, textBackground,
    outlineBackground:getComputedStyle(document.body).backgroundColor,
  };
}
