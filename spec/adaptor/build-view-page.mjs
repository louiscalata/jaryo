// usage: node adaptor/build-view-page.mjs <view.json> <out.html>
// renderViewPage(view) is the same page as a string, for front ends such as adaptor/jaryo-cli.mjs.
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export function renderViewPage(view) {
  const LS = String.fromCharCode(0x2028);
  const PS = String.fromCharCode(0x2029);
  const safe = JSON.stringify(view)
    .split("<").join("\\u003c")
    .split(LS).join("\\u2028")
    .split(PS).join("\\u2029");
  const tpl = fs.readFileSync(new URL("./view-template.html", import.meta.url), "utf8");
  return tpl.replace("@@VIEW@@", () => safe);
}

const isMain = () => {
  try { return !!process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href; } catch { return false; }
};

if (isMain()) {
  const [viewPath, out] = process.argv.slice(2);
  const view = JSON.parse(fs.readFileSync(viewPath, "utf8"));
  fs.writeFileSync(out, renderViewPage(view));
  console.log("wrote", out);
}
