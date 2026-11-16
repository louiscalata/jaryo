// Fabricated snapshot records in the shape emitted by browser/expanded-layout.mjs.
// These model the assessment inputs, not browser layout or the CSS cascade.
export const black = "rgb(0, 0, 0)";
export const white = "rgb(255, 255, 255)";
export const rect = (left, top, width, height) => ({ left, top, right:left + width, bottom:top + height, width });

export function overflowMetrics(change = {}) {
  return { overflowX:"hidden", overflowY:"hidden", scrollWidth:100, clientWidth:100, scrollHeight:80, clientHeight:80, ...change };
}

export function layoutFixture({ width = 1280, wide = false, count = 2 } = {}) {
  const stacked = wide || width <= 980;
  const cardWidth = wide ? 600 : stacked ? 240 : 500;
  const cards = Array.from({ length:count }, (_, i) => {
    const left = 20, top = 20 + i * 400;
    const card = rect(left, top, cardWidth, 360);
    const body = rect(left + 10, top + 10, cardWidth - 20, 340);
    const title = rect(body.left, body.top, body.width, 20);
    const preview = rect(body.left, title.bottom + 10, wide ? body.width : 200, 100);
    const notes = Array.from({ length:5 }, (_, j) => rect(
      stacked ? body.left : preview.right + 10,
      (stacked ? preview.bottom + 10 : preview.top) + j * 25, 100, 20,
    ));
    return {
      id:`F02.0${i + 1}`, card, body, title, preview, notes,
      children:[title, preview, ...notes], clipped:[], ariaExpanded:"true",
      folioText:`F02.0${i + 1}`, folioFamily:'"IBM Plex Mono", monospace', folioSize:24, titleSize:24,
      titleText:"Expanded fixture", titleVisible:true, titleColor:black, background:white,
      borderColor:black, borderWidth:1, borderStyle:"solid",
    };
  });
  return { snapshot:{ cards, collapsedWidth:240, rootOverflow:0 }, options:{ width, wide, count } };
}
