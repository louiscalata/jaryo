// usage: node adaptor/build-view-page.mjs <view.json> <out.html>
import fs from "node:fs";
const [viewPath, out] = process.argv.slice(2);
const view = JSON.parse(fs.readFileSync(viewPath, "utf8"));
const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
const safe = JSON.stringify(view).split("<").join("\\u003c").split(LS).join("\\u2028").split(PS).join("\\u2029");
const tpl = fs.readFileSync(new URL("./view-template.html", import.meta.url), "utf8");
fs.writeFileSync(out, tpl.replace("@@VIEW@@", () => safe));
console.log("wrote", out);
