import assert from "node:assert/strict";
import fs from "node:fs";
const css = fs.readFileSync(new URL('../lab.css', import.meta.url), 'utf8');
const stages = fs.readFileSync(new URL('../lab-stages.css', import.meta.url), 'utf8');
assert.match(css, /\.dash\s*\{[^}]*animation:\s*dashmove\s+1\.2s\s+linear\s+1\s+forwards/s);
const forced = stages.match(/@media\s*\(forced-colors:\s*active\)\s*\{([\s\S]*?)\n\}/);
assert.ok(forced, "lab-stages.css has a forced-colors block");
const pressedRule = forced[1].match(/([^{}]*button\[aria-pressed="true"\][^{}]*)\{([^}]*)\}/);
assert.ok(pressedRule, "forced-colors block styles pressed preview buttons");
assert.match(pressedRule[2], /forced-color-adjust:\s*none;\s*background:\s*Highlight;\s*color:\s*HighlightText/);
const forcedSelectors = pressedRule[1].split(",").map((s) => s.trim());
assert.ok(forcedSelectors.includes('.jstage button[aria-pressed="true"]'));
// The forced-colors rule must win the cascade over every author pressed-button
// rule. `.jstage button[aria-pressed]` has one class; an author selector with
// more classes outranks it and has to be listed in the forced-colors rule.
const classCount = (selector) => (selector.match(/\.[A-Za-z_-]/g) || []).length;
const authorPressed = [...stages.slice(0, forced.index).matchAll(/([^{}]+)\{[^}]*\}/g)]
  .flatMap((m) => m[1].split(",").map((s) => s.trim()))
  .filter((s) => /button\[aria-pressed="true"\]$/.test(s));
assert.ok(authorPressed.includes('.jstage-bar button[aria-pressed="true"]') && authorPressed.includes('.red .toolrow button[aria-pressed="true"]'), "author pressed-button rules were found");
const strongest = Math.max(...forcedSelectors.map(classCount));
for (const selector of authorPressed) {
  if (classCount(selector) < classCount('.jstage button[aria-pressed="true"]') + 1) continue;
  assert.ok(forcedSelectors.includes(selector) && classCount(selector) <= strongest,
    `forced-colors pressed rule is outranked by ${selector}`);
}
console.log('PASS lab visual source contracts');
