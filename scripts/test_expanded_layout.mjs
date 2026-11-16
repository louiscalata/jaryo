// Browser-free regression tests for expanded-card assessment. No DOM or jsdom.
import assert from "node:assert/strict";
import { contrast, contrastOverOpaqueSurface, hasClippedOverflow, assessExpandedLayout } from "./browser/expanded-layout.mjs";
import { black, white, rect, overflowMetrics, layoutFixture } from "./fixtures/expanded-layout.mjs";

let passed = 0;
function test(name, run) {
  try { run(); } catch (error) { console.error("FAIL", name); throw error; }
  passed++;
  console.log("PASS", name);
}
function close(actual, expected) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-10, `${actual} != ${expected}`);
}
function assessment(change, options) {
  const fixture = layoutFixture(options);
  change(fixture.snapshot, fixture.options);
  return assessExpandedLayout(fixture.snapshot, fixture.options);
}
function cardResult(change, key, expected = false, options) {
  assert.equal(assessment(s => change(s.cards[0], s), options)[key], expected);
}
const allPass = {
  expanded:true, placement:true, width:true, containment:true, separateCards:true,
  rootFits:true, folios:true, titleContrast:true, forcedColors:true,
};

// Fixed WCAG sRGB golden values, rather than expectations from the tested helper.
for (const [name, a, b, expected] of [
  ["black on white", black, white, 21], ["white on black", white, black, 21],
  ["equal black", black, black, 1], ["equal white", white, white, 1],
  ["equal mid-grey", "rgb(127,127,127)", "rgb(127,127,127)", 1],
  ["red", "rgb(255,0,0)", black, 5.252],
  ["green", "rgb(0,255,0)", black, 15.304],
  ["blue", "rgb(0,0,255)", black, 2.444],
  ["low sRGB branch", "rgb(10,10,10)", black, 1.0607053967097675],
  ["high sRGB branch", "rgb(11,11,11)", black, 1.066930715277982],
  ["opaque rgba", "rgba(0,0,0,1)", white, 21],
  ["CSSOM numeric tokens", "RGB(+0, 0e0, .0)", "rgba(255.,255,255,1e0)", 21],
]) test("contrast golden: " + name, () => close(contrast(a, b), expected));
test("uppercase RGBA is read like lowercase", () => {
  close(contrast("RGBA(0,0,0,1)", "rgb(255,255,255)"), 21);
});
test("sRGB linearisation uses the 0.04045 threshold", () => {
  close(contrast("rgb(10.2,10.2,10.2)", "rgb(0,0,0)"), 1.061919504643963);
});

const invalidColors = [
  null, undefined, NaN, 0, {}, "", "transparent", "CanvasText", "#000000",
  "color(srgb 0 0 0)", "hsl(0,0%,0%)", "rgb(0 0 0)", "rgb(0%,0%,0%)",
  "rgb(0,0)", "rgb(0,0,0,1)", "rgba(0,0,0)", "rgba(0,0,0,1,0)",
  "rgb(,0,0)", "rgb(0px,0,0)", "rgb(NaN,0,0)", "rgb(Infinity,0,0)",
  "rgb(1e309,0,0)", "rgb(-1,0,0)", "rgb(0,256,0)", "rgb(0,0,-.1)",
  "rgba(0,0,0,NaN)", "rgba(0,0,0,-.01)", "rgba(0,0,0,1.01)",
  "prefix rgb(0,0,0)", "rgb(0,0,0) trailing", "rgb(0,0,0)\n",
];
for (const [i, color] of invalidColors.entries()) {
  test("unsupported color fails closed in every input: " + i, () => {
    assert.ok(Number.isNaN(contrast(color, white)));
    assert.ok(Number.isNaN(contrast(black, color)));
    assert.ok(Number.isNaN(contrastOverOpaqueSurface(color, white)));
    assert.ok(Number.isNaN(contrastOverOpaqueSurface(black, color)));
  });
}
for (const alpha of [0, 0.25, 0.5, 0.99]) {
  test("ordinary contrast rejects translucent foreground and surface: " + alpha, () => {
    const color = `rgba(0,0,0,${alpha})`;
    assert.ok(Number.isNaN(contrast(color, white)));
    assert.ok(Number.isNaN(contrast(white, color)));
    assert.ok(Number.isNaN(contrastOverOpaqueSurface(black, color)));
  });
}
for (const [name, fg, bg, expected] of [
  ["transparent outline", "rgba(0,0,0,0)", white, 1],
  ["opaque outline", "rgba(0,0,0,1)", white, 21],
  ["half-black on white", "rgba(0,0,0,.5)", white, 3.976653024912438],
  ["half-white on black", "rgba(255,255,255,.5)", black, 5.280822809644651],
  ["colored outline on opaque rgba", "rgba(255,0,0,.5)", "rgba(0,0,255,1)", 1.1013085159255445],
]) test("translucent-over-opaque golden: " + name, () => close(contrastOverOpaqueSurface(fg, bg), expected));
test("forced-colors outline can pass after compositing while ordinary contrast rejects alpha", () => {
  const outline = "rgba(0,0,0,.5)";
  assert.ok(Number.isNaN(contrast(outline, white)));
  assert.ok(contrastOverOpaqueSurface(outline, white) >= 3);
  assert.ok(contrastOverOpaqueSurface("rgba(0,0,0,.4)", white) < 3);
});

for (const axis of ["X", "Y"]) {
  const scroll = axis === "X" ? "scrollWidth" : "scrollHeight";
  const client = axis === "X" ? "clientWidth" : "clientHeight";
  for (const overflow of ["hidden", "clip", "auto", "scroll"]) {
    for (const [excess, expected] of [[0, false], [1, false], [1.001, true], [2, true]]) {
      test(`clipping ${axis} ${overflow} excess ${excess}`, () => {
        assert.equal(hasClippedOverflow(overflowMetrics({ ["overflow" + axis]:overflow, [scroll]:100 + excess, [client]:100 })), expected);
      });
    }
  }
  test("visible overflow is not clipping on " + axis, () => {
    assert.equal(hasClippedOverflow(overflowMetrics({ ["overflow" + axis]:"visible", [scroll]:10000 })), false);
  });
  test("zero-size clipping threshold on " + axis, () => {
    for (const [size, expected] of [[0, false], [1, false], [2, true]]) {
      assert.equal(hasClippedOverflow(overflowMetrics({ [scroll]:size, [client]:0 })), expected);
    }
  });
  for (const field of [scroll, client]) {
    test("NaN cannot produce a clipping finding: " + field, () => {
      assert.equal(hasClippedOverflow(overflowMetrics({ [field]:NaN })), false);
    });
  }
}
test("a visible X axis cannot mask clipped Y overflow", () => {
  assert.equal(hasClippedOverflow(overflowMetrics({ overflowX:"visible", scrollWidth:10000, scrollHeight:82 })), true);
});
test("a visible Y axis cannot mask clipped X overflow", () => {
  assert.equal(hasClippedOverflow(overflowMetrics({ overflowY:"visible", scrollHeight:10000, scrollWidth:102 })), true);
});

for (const width of [260, 375, 980, 981, 1280, 1920]) {
  for (const wide of [false, true]) {
    test(`valid fabricated layout width=${width} wide=${wide}`, () => {
      const { snapshot, options } = layoutFixture({ width, wide });
      assert.deepEqual(assessExpandedLayout(snapshot, options), allPass);
    });
  }
}
for (const [rootOverflow, expected] of [[-5, true], [-1, true], [0, true], [1, true], [1.001, false], [2, false], [NaN, false]]) {
  test("reduced-motion root overflow still gates rootFits: " + rootOverflow, () => {
    // Snapshot records root overflow independently of animation/transition state.
    assert.equal(assessment(s => { s.rootOverflow = rootOverflow; }).rootFits, expected);
  });
}
test("visible overflow metrics do not become clipped-card names", () => {
  const metrics = [overflowMetrics({ name:"visible note", overflowX:"visible", overflowY:"visible", scrollWidth:400, scrollHeight:300 })];
  cardResult(c => { c.clipped = metrics.filter(hasClippedOverflow).map(m => m.name); }, "containment", true);
});
test("clipped overflow metrics fail containment", () => {
  const metrics = [overflowMetrics({ name:"clipped note", scrollWidth:102 })];
  cardResult(c => { c.clipped = metrics.filter(hasClippedOverflow).map(m => m.name); }, "containment");
});
for (const count of [0, 1, 3]) {
  test("unexpected card count gates expansion, placement and width: " + count, () => {
    const { snapshot } = layoutFixture({ count });
    const result = assessExpandedLayout(snapshot, { width:1280, wide:false, count:2 });
    for (const key of ["expanded", "placement", "width"]) assert.equal(result[key], false);
  });
}
for (const ariaExpanded of ["false", true, undefined]) {
  test("aria-expanded must be the true string: " + ariaExpanded, () => cardResult(c => { c.ariaExpanded = ariaExpanded; }, "expanded"));
}
test("every card is assessed, including the last", () => {
  assert.equal(assessment(s => { s.cards[1].ariaExpanded = "false"; }).expanded, false);
});
test("fewer than five notes fail placement", () => cardResult(c => { c.notes.pop(); }, "placement"));
test("exact title/preview tolerance passes", () => cardResult(c => { c.title.bottom = c.preview.top + 1; }, "placement", true));
test("title beyond preview tolerance fails", () => cardResult(c => { c.title.bottom = c.preview.top + 1.001; }, "placement"));
for (const width of [980, 981]) {
  const stacked = width === 980;
  const field = stacked ? "top" : "left";
  test("note placement exact tolerance at width " + width, () => cardResult(c => {
    c.notes[4][field] = (stacked ? c.preview.bottom : c.preview.right) - 1;
  }, "placement", true, { width }));
  test("note outside placement tolerance at width " + width, () => cardResult(c => {
    c.notes[4][field] = (stacked ? c.preview.bottom : c.preview.right) - 1.001;
  }, "placement", false, { width }));
}
test("desktop first note must start before preview bottom", () => cardResult(c => { c.notes[0].top = c.preview.bottom; }, "placement"));
test("wide notes stack on desktop too", () => cardResult(c => { c.notes[4].top = c.preview.bottom - 1.001; }, "placement", false, { wide:true }));
for (const [delta, expected] of [[1, false], [1.001, true]]) {
  test("desktop card width increase " + delta, () => cardResult((c, s) => { c.card.width = s.collapsedWidth + delta; }, "width", expected));
}
for (const width of [260, 980]) {
  for (const [delta, expected] of [[-1, true], [1, true], [-1.001, false], [1.001, false]]) {
    test(`narrow width tolerance ${width} delta ${delta}`, () => cardResult((c, s) => { c.card.width = s.collapsedWidth + delta; }, "width", expected, { width }));
  }
}
for (const edge of ["left", "right"]) {
  for (const [delta, expected] of [[-1, true], [1, true], [-1.001, false], [1.001, false]]) {
    test(`wide preview ${edge} alignment ${delta}`, () => cardResult(c => { c.preview[edge] = c.title[edge] + delta; }, "width", expected, { wide:true }));
  }
}
for (const [edge, direction] of [["left", -1], ["right", 1], ["top", -1], ["bottom", 1]]) {
  for (const [excess, expected] of [[1, true], [1.001, false]]) {
    test(`child containment ${edge} excess ${excess}`, () => cardResult(c => {
      c.children.push({ ...c.body, [edge]:c.body[edge] + direction * excess });
    }, "containment", expected));
  }
  test("NaN child " + edge + " fails containment", () => cardResult(c => { c.children.push({ ...c.body, [edge]:NaN }); }, "containment"));
}
test("zero-size child inside body is contained", () => cardResult(c => { c.children.push(rect(c.body.left, c.body.top, 0, 0)); }, "containment", true));
for (const [x, y, expected] of [[0, 10, true], [1, 10, true], [10, 1, true], [1.001, 1.001, false], [10, 10, false]]) {
  test(`separate cards intersect by ${x} x ${y}`, () => {
    assert.equal(assessment(s => {
      const a = s.cards[0].card;
      s.cards[1].card = rect(a.right - x, a.bottom - y, 100, 100);
    }).separateCards, expected);
  });
}
test("zero-size card is not a positive-area overlap", () => {
  assert.equal(assessment(s => { s.cards[1].card = rect(30, 30, 0, 0); }).separateCards, true);
});
test("a nonadjacent overlapping pair is assessed", () => {
  assert.equal(assessment(s => { s.cards[2].card = { ...s.cards[0].card }; }, { count:3 }).separateCards, false);
});
for (const [name, change] of [
  ["wrong font", { folioFamily:"IBM Plex Sans" }], ["smaller folio", { folioSize:23.99 }],
  ["wrong ID text", { folioText:"F02.99" }], ["ID prefix as folio text", { folioText:"F02" }], ["NaN size", { folioSize:NaN }],
]) test("folio rejects " + name, () => cardResult(c => Object.assign(c, change), "folios"));
for (const [name, change] of [
  ["low title contrast", { titleColor:"rgb(119,119,119)" }],
  ["unsupported title", { titleColor:"CanvasText" }], ["translucent surface", { background:"rgba(255,255,255,.5)" }],
]) test("title and forced-colors reject " + name, () => {
  const result = assessment(s => Object.assign(s.cards[0], change));
  assert.equal(result.titleContrast, false);
  assert.equal(result.forcedColors, false);
});
test("title contrast above threshold passes", () => cardResult(c => { c.titleColor = "rgb(118,118,118)"; }, "titleContrast", true));
for (const [name, change] of [
  ["empty title", { titleText:" \n\t" }], ["hidden title", { titleVisible:false }],
  ["absent border", { borderStyle:"none" }], ["zero border width", { borderWidth:0 }],
  ["NaN border width", { borderWidth:NaN }], ["low border contrast", { borderColor:"rgb(149,149,149)" }],
  ["translucent border", { borderColor:"rgba(0,0,0,.5)" }], ["unknown system border color", { borderColor:"CanvasText" }],
]) test("forced-colors rejects " + name, () => cardResult(c => Object.assign(c, change), "forcedColors"));
test("forced-colors opaque resolved colors pass on a dark surface", () => cardResult(c => {
  Object.assign(c, { titleColor:white, background:black, borderColor:white });
}, "forcedColors", true));
test("forced-colors border above threshold passes", () => cardResult(c => { c.borderColor = "rgb(148,148,148)"; }, "forcedColors", true));
test("NaN preview coordinate fails wide alignment", () => {
  const result = assessment(s => { s.cards[0].preview.left = NaN; }, { wide:true });
  assert.equal(result.width, false);
});
test("NaN desktop card width fails width", () => cardResult(c => { c.card.width = NaN; }, "width"));

console.log("TOTAL", passed, "/", passed, "browser-free expanded layout");
