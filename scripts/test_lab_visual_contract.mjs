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

// Narrow toast: the JS breakpoint is the CSS narrow breakpoint, the toast never
// takes taps, and while it is open on a narrow screen the page reserves its height
// (scroll padding for focus, body padding for the page end).
{
  const labJs = fs.readFileSync(new URL('../lab.js', import.meta.url), 'utf8');
  assert.match(labJs, /const NARROW_TOAST = "\(max-width: 480px\)";/, "lab.js uses the CSS narrow breakpoint");
  assert.match(labJs, /matchMedia\(NARROW_TOAST\)/, "lab.js tests the narrow breakpoint");
  const narrowStart = css.indexOf('@media (max-width: 480px) {', css.indexOf('/* ============ Narrow / cover screen'));
  assert.ok(narrowStart >= 0, "lab.css has the 480px narrow block");
  const narrow = css.slice(narrowStart, css.indexOf('\n}', narrowStart));
  assert.match(narrow, /html\.toast-open\s*\{[^}]*scroll-padding-bottom:\s*var\(--toast-clear,\s*0px\)/, "focus scrolls clear of the narrow toast");
  assert.match(narrow, /html\.toast-open body\s*\{[^}]*padding-bottom:\s*var\(--toast-clear,\s*0px\)/, "the page end can scroll above the narrow toast");
  assert.match(css, /\.toast\s*\{[^}]*pointer-events:\s*none/, "taps on the toast reach the content under it");
  console.log('PASS narrow toast source contract');
}

// Text over gradients. A gradient may sit only (a) in an empty ::before/::after
// strip whose host is padded clear of it, or (b) behind a container whose text
// sits on a solid plate. Any other gradient rule, or a gradient in markup, fails.
{
  const lum = (h) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const labJs = fs.readFileSync(new URL('../lab.js', import.meta.url), 'utf8');
  const stagesJs = fs.readFileSync(new URL('../lab-stages.js', import.meta.url), 'utf8');
  const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const [name, src] of [['lab.js', labJs], ['lab-stages.js', stagesJs], ['index.html', indexHtml]]) {
    assert.doesNotMatch(src, /gradient\(/, `${name} sets a gradient in markup; move it to a checked stylesheet rule`);
  }
  const rules = (text) => [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ selectors: m[1].trim().split(',').map((x) => x.trim()), body: m[2] }));
  const decl = (body, prop) => { const m = body.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`)); return m ? m[1].trim() : null; };
  const PLATED = { '.hatched': '.hatch-label' };
  let strips = 0;
  for (const [file, text] of [['lab.css', css], ['lab-stages.css', stages]]) {
    const all = rules(text);
    for (const rule of all) {
      const painted = rule.body.split(';').some((d) => /^\s*background(-image)?\s*:/.test(d) && /gradient\(|var\(--hatch\)/.test(d));
      if (!painted) continue;
      for (const selector of rule.selectors) {
        const pseudo = selector.match(/^(.*?)::?(before|after)$/);
        if (pseudo) {
          assert.match(rule.body, /content:\s*""/, `${file} ${selector}: a gradient strip must be empty`);
          const width = Number((decl(rule.body, 'width') || '').replace(/px$/, ''));
          assert.ok(width > 0, `${file} ${selector}: a gradient strip needs a px width`);
          const host = all.find((r) => r.selectors.includes(pseudo[1]) && /padding-left:\s*\d+px/.test(r.body));
          assert.ok(host, `${file} ${selector}: the host ${pseudo[1]} must pad its text clear of the strip`);
          const pad = Number(decl(host.body, 'padding-left').replace(/px$/, ''));
          assert.ok(pad > width, `${file} ${selector}: padding-left ${pad}px does not clear the ${width}px strip`);
          strips++;
          continue;
        }
        const plate = PLATED[selector];
        assert.ok(plate, `${file} ${selector}: text may sit on this gradient; give it a solid plate`);
        const plateRule = all.find((r) => r.selectors.includes(plate));
        assert.ok(plateRule, `${file} has no ${plate} rule for ${selector}`);
        const bg = decl(plateRule.body, 'background');
        const fg = decl(plateRule.body, 'color');
        assert.match(bg || '', /^#[0-9a-f]{6}$/i, `${plate} needs a solid hex background`);
        assert.match(fg || '', /^#[0-9a-f]{6}$/i, `${plate} needs a hex text color`);
        assert.ok(ratio(fg, bg) >= 4.5, `${plate} text contrast ${ratio(fg, bg).toFixed(2)}:1 is below 4.5:1`);
        const cls = selector.slice(1);
        const uses = [...labJs.matchAll(new RegExp(`<div class="${cls}"[^>]*>([\\s\\S]*?)</div>`, 'g'))];
        assert.ok(uses.length > 0, `lab.js renders no .${cls} preview`);
        for (const [, inner] of uses) {
          assert.match(inner, new RegExp(`^<span class="${plate.slice(1)}">[^<]+</span>$`), `.${cls} text must sit inside ${plate}: ${inner}`);
        }
      }
    }
  }
  assert.ok(strips > 0, 'the gradient check found the decorative strips');
  console.log('PASS text over gradients has a solid plate or clears the strip');
}
