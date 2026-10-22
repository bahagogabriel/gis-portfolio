/** Post-v3 release-quality browser acceptance (actual, SHA-pinned site rasters).
 * No invented environmental observations; cloud emulation != physical phones.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir} from "node:fs/promises";
import {chromium} from "playwright";
import AxeBuilder from "@axe-core/playwright";

const ORIGIN="http://127.0.0.1:4199/";
const server=spawn(process.execPath,["node_modules/vite/bin/vite.js","preview",
  "--host","127.0.0.1","--port","4199","--strictPort"],
  {cwd:"petroscreen-ng/web",stdio:"pipe"});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(){for(let i=0;i<120;i++){
  try{if((await fetch(ORIGIN)).ok)return;}catch{}
  await pause(250);
}throw Error("Quality release preview did not start");}
let browser;
try{
 await ready();
 browser=await chromium.launch({headless:true,args:[
   "--enable-webgl","--use-gl=angle","--use-angle=swiftshader",
   "--disable-dev-shm-usage"]});
 await mkdir("petroscreen-ng/artifacts_quality",{recursive:true});
 const manifest=await(await fetch(ORIGIN+"data/manifest.json")).json();
 assert.equal(manifest.states.length,9);
 assert.equal(manifest.state_sources.reduce((n,s)=>n+s.source_files.length,0),31);
 const lga=await(await fetch(ORIGIN+"data/lga_context.geojson")).json();
 const provenance=await(await fetch(ORIGIN+"data/lga_context_provenance.json")).json();
 assert.equal(lga.features.length,185);
 assert.equal(provenance.source_year,"2022");
 assert.equal(provenance.selected_units,185);
 const context=await browser.newContext({viewport:{width:1440,height:900},
   acceptDownloads:true});
 const page=await context.newPage(),requests=[],errors=[];
 page.on("request",r=>requests.push(r.url()));
 page.on("pageerror",e=>errors.push(e.message));
 await page.goto(ORIGIN,{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#data-status")?.dataset.state==="ready",
   null,{timeout:90000});
 assert.equal(await page.locator(".maplibregl-ctrl-scale").count(),1,
   "Metric scale control must be persistent");
 assert.equal(await page.locator("#state-zoom option").count(),10,
   "All nine named pilot states must be available as map navigation");
 assert.equal(await page.locator("#show-admin-context").isChecked(),true);
 await page.locator("#state-zoom").selectOption("Delta");
 for(let i=0;i<12;i++){
   if(await page.locator("#overview-zoom-notice").isVisible())break;
   await page.locator(".maplibregl-ctrl-zoom-in").click();
   await pause(130);
 }
 await page.waitForFunction(()=>!document.querySelector("#overview-zoom-notice")?.hidden,
   null,{timeout:15000});
 assert.match(await page.locator("#overview-zoom-notice").textContent(),
   /generalized.*true source-derived/is);
 await page.waitForFunction(()=>document.querySelector("#admin-boundary-status")?.textContent.includes("185"),
   null,{timeout:30000});
 await page.screenshot({path:"petroscreen-ng/artifacts_quality/navigation-overview.png"});

 // Slow only source TIFFs; the progress panel must not silently go blank.
 await page.route(/\.tif(?:\?|$)/,async route=>{
   await pause(300);
   await route.continue();
 });
 const delta=manifest.state_sources.find(s=>s.state==="Delta");
 await page.locator("#longitude").fill(String(delta.qa_example_lon_lat[0]));
 await page.locator("#latitude").fill(String(delta.qa_example_lon_lat[1]));
 await page.locator("#screen-btn").click();
 await page.waitForFunction(()=>document.querySelector("#screen-progress")?.hidden===false,
   null,{timeout:5000});
 assert.equal(await page.locator("#screen-btn").isDisabled(),true);
 assert.equal(await page.locator("#screen-form").getAttribute("aria-busy"),"true");
 // Programmatic duplicate submit cannot create a second independent request.
 await page.evaluate(()=>document.querySelector("#screen-form").dispatchEvent(
   new Event("submit",{cancelable:true,bubbles:true})));
 await page.waitForFunction(()=>/Screening completed/.test(
   document.querySelector("#form-feedback")?.textContent||""),
   null,{timeout:120000});
 assert.equal(await page.locator("#results").isVisible(),true);
 assert.equal(await page.locator("#screen-progress").isVisible(),false);
 assert.match(await page.locator("#result-subtitle").textContent(),/Delta/);
 const deltaTiffs=requests.filter(u=>/\.tif(?:\?|$)/.test(u)&&
   u.includes("/regions/Delta/"));
 assert.equal(deltaTiffs.length,delta.source_files.length,
   "Duplicate form event must not cause duplicate TIFF loads");
 await page.waitForFunction(()=>document.querySelector("#map")?.dataset.detailReady==="true",
   null,{timeout:60000});
 assert.equal(await page.locator("#overview-zoom-notice").isVisible(),false);
 await page.screenshot({path:"petroscreen-ng/artifacts_quality/screened-delta.png"});

 // A real HTTP 503 must leave an actionable error within findings, then
 // re-click with the same WGS84 point must produce accepted results.
 const rivers=manifest.state_sources.find(s=>s.state==="Rivers");
 let rejectOne=true;
 await page.route(/regions\/Rivers\/.*\.tif/,async route=>{
   if(rejectOne){rejectOne=false;await route.fulfill({status:503,body:"Unavailable"});}
   else await route.continue();
 });
 await page.locator("#longitude").fill(String(rivers.qa_example_lon_lat[0]));
 await page.locator("#latitude").fill(String(rivers.qa_example_lon_lat[1]));
 await page.locator("#screen-btn").click();
 await page.waitForFunction(()=>/Screening failed/.test(
   document.querySelector("#form-feedback")?.textContent||""),
   null,{timeout:120000});
 assert.equal(await page.locator("#screen-progress").getAttribute("data-state"),"error");
 assert.match(await page.locator("#screen-progress").textContent(),/retry/i);
 assert.equal(await page.locator("#longitude").inputValue(),
   String(rivers.qa_example_lon_lat[0]));
 assert.equal(await page.locator("#screen-btn").isEnabled(),true);
 await page.locator("#screen-btn").click();
 await page.waitForFunction(()=>/Screening completed/.test(
   document.querySelector("#form-feedback")?.textContent||""),
   null,{timeout:120000});
 assert.match(await page.locator("#result-subtitle").textContent(),/Rivers/);
 assert.equal(await page.locator("#results").isVisible(),true);
 assert.equal(await page.locator("#screen-progress").isVisible(),false);
 const axe=await new AxeBuilder({page}).withTags(
   ["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
 assert.deepEqual(axe.violations.map(x=>x.id),[]);
 assert.deepEqual(errors,[],"No uncaught JavaScript errors");
 assert.equal(requests.filter(u=>u.startsWith("http")&&!u.startsWith(ORIGIN)).length,0,
   "No third-party map requests or tracking");
 await context.close();
 // Narrow viewport: state navigation and metric scale must still be reachable.
 const mobile=await browser.newContext({viewport:{width:390,height:844}});
 const small=await mobile.newPage();
 await small.goto(ORIGIN,{waitUntil:"domcontentloaded"});
 await small.waitForFunction(()=>document.querySelector("#data-status")?.dataset.state==="ready",
   null,{timeout:90000});
 assert.equal(await small.locator("#state-zoom").isVisible(),true);
 assert.equal(await small.locator(".maplibregl-ctrl-scale").isVisible(),true);
 const over=await small.evaluate(()=>document.documentElement.scrollWidth);
 assert.ok(over<=391,"Mobile viewport should not overflow horizontally");
 await mobile.close();
 console.log("QUALITY_RELEASE_REAL_MAP_SCALE_ADM1_ADM2_SINGLE_FLIGHT_RETRY=PASS");
}finally{
 await browser?.close();
 server.kill("SIGTERM");
}
