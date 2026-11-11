// Browser-free assessment regressions; native focus/traversal still requires CI.
import assert from "node:assert/strict";
import { assessFocusCoverage, requiredLinks, readFocusedTarget } from "./browser/focus-coverage.mjs";
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
const rect=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
function readFixture({box=rect(8,8,150,48),text=rect(16,16,120,20),clip=false,hidden=false,legacyClip=false}={}) {
  const defaults={visibility:"visible",opacity:"1",outlineStyle:"dashed",outlineWidth:"3px",outlineColor:"rgb(0,0,0)",color:"rgb(255,255,255)",backgroundColor:"rgb(0,0,0)",overflowX:"visible",overflowY:"visible",clip:"auto",clipPath:"none"};
  function node(bounds,style={},parentElement=null){return {style:{...defaults,...style},parentElement,clientLeft:0,clientTop:0,clientWidth:bounds.width,clientHeight:bounds.height,getBoundingClientRect:()=>bounds};}
  const root=node(rect(0,0,1280,900)),body=node(rect(0,0,1280,900),{backgroundColor:"rgb(255,255,255)"},root);
  const ancestor=node(clip?rect(0,0,20,20):rect(0,0,1280,900),{overflowX:clip?"hidden":"visible",overflowY:clip?"hidden":"visible",opacity:hidden?"0":"1"},body);
  const anchor=Object.assign(node(box,{clip:legacyClip?"rect(0px, 0px, 0px, 0px)":"auto"},ancestor),{tagName:"A",className:"skip",classList:["skip"],textContent:"Skip to content",getAttribute:name=>name==="href"?"#main":null,matches:selector=>selector!== 'input[type="radio"]'});
  const oldDocument=globalThis.document,oldStyle=globalThis.getComputedStyle;
  try {
    globalThis.document={activeElement:anchor,body,documentElement:root,createRange:()=>({selectNodeContents(){},getClientRects:()=>text?[text]:[]})};
    globalThis.getComputedStyle=element=>element.style;
    return readFocusedTarget(requiredLinks[0].selector);
  } finally {
    if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
    if(oldStyle===undefined)delete globalThis.getComputedStyle;else globalThis.getComputedStyle=oldStyle;
  }
}
test("actual reader accepts revealed in-viewport skip text",()=>assert.equal(readFixture().shown,true));
for(const [name,fixture] of [
  ["offscreen skip at -9999",{box:rect(-9999,0,150,48),text:rect(-9999,0,130,20)}],
  ["offscreen text inside onscreen link box",{text:rect(-9999,0,130,20)}],
  ["no rendered text rectangles",{text:null}], ["ancestor clips text",{clip:true}],
  ["ancestor hides text",{hidden:true}], ["legacy clip hides text",{legacyClip:true}],
])test("actual reader rejects "+name,()=>{
  const record=readFixture(fixture);assert.equal(record.shown,false);
  assert.ok(assessFocusCoverage(controls,[{...record,id:"skip",matchCount:1},...links.slice(1)]).badLinks.includes("skip"));
});
console.log("TOTAL",passed,"/",passed,"browser-free focus coverage");
