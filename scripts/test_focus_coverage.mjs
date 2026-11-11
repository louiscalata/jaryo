// Browser-free assessment regressions; native focus/traversal still requires CI.
import assert from "node:assert/strict";
import { assessFocusCoverage, requiredLinks } from "./browser/focus-coverage.mjs";
let passed=0;
function test(name,run){run();passed++;console.log("PASS",name);}
const ring={fv:true,style:"dashed",width:3,color:"rgb(0,0,0)"};
const controls=[
  {...ring,key:"SELECT.btn",tag:"SELECT",classes:["btn"]},
  {...ring,key:"BUTTON.navbtn",tag:"BUTTON",classes:["navbtn"]},
  {...ring,key:"BUTTON.tab",tag:"BUTTON",classes:["tab"]},
  {...ring,key:"INPUT.radio",tag:"INPUT",classes:[],type:"radio"},
  {...ring,key:"BUTTON.btn expand-btn",tag:"BUTTON",classes:["btn","expand-btn"]},
];
const links=requiredLinks.map(spec=>({...ring,id:spec.id,matchCount:1,active:true,tag:"A",href:spec.href,shown:true,text:spec.id,textColor:"rgb(0,0,0)",textBackground:"rgb(255,255,255)",outlineBackground:"rgb(255,255,255)"}));
function valid(result){return !result.badTabbed.length&&!result.missingControls.length&&!result.badLinks.length;}
test("five named natural-Tab controls plus four directly focused links pass",()=>assert.ok(valid(assessFocusCoverage(controls,links))));
for(let i=0;i<controls.length;i++)test("missing named control fails despite extra type keys: "+controls[i].key,()=>{
  const samples=controls.filter((_,j)=>i!==j).concat([0,1,2].map(n=>({...ring,key:"OTHER"+n,tag:"BUTTON",classes:[]})));
  assert.equal(assessFocusCoverage(samples,links).missingControls.length,1);
});
test("later bad ring with the same key is rejected",()=>assert.equal(assessFocusCoverage([...controls,{...controls[0],width:1}],links).badTabbed.length,1));
test("every observed target must be focus-visible",()=>assert.equal(assessFocusCoverage([...controls,{...ring,key:"EXTRA",tag:"BUTTON",classes:[],fv:false}],links).badTabbed.length,1));
test("none outline is rejected",()=>assert.equal(assessFocusCoverage([{...controls[0],style:"none"},...controls.slice(1)],links).badTabbed.length,1));
for(const spec of requiredLinks)test("missing fixed link fails: "+spec.id,()=>assert.ok(assessFocusCoverage(controls,links.filter(r=>r.id!==spec.id)).badLinks.includes(spec.id)));
test("duplicate link record fails",()=>assert.ok(assessFocusCoverage(controls,[...links,links[0]]).badLinks.includes("skip")));
for(const [name,change] of [
  ["missing DOM target",{matchCount:0}], ["duplicate DOM target",{matchCount:2}], ["wrong active element",{active:false}],
  ["wrong href",{href:"#wrong"}], ["hidden text",{shown:false}], ["empty text",{text:" "}], ["not focus-visible",{fv:false}],
  ["outline absent",{style:"none"}], ["thin outline",{width:1}], ["low outline contrast",{color:"rgb(230,230,230)"}],
  ["unsupported outline color",{color:"color(srgb 0 0 0)"}], ["transparent outline",{color:"rgba(0,0,0,0)"}],
  ["invisible text color",{textColor:"rgb(255,255,255)"}], ["unknown background",{textBackground:"transparent"}],
])test("direct link rejects "+name,()=>assert.ok(assessFocusCoverage(controls,[{...links[0],...change},...links.slice(1)]).badLinks.includes("skip")));
console.log("TOTAL",passed,"/",passed,"browser-free focus coverage");
