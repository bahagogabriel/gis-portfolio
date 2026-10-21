/** Stage 21: true Chromium functional acceptance under simulated low-end CPU.
 * Browser emulation is NOT a physical Android phone or real TalkBack/NVDA.
 * Validates evidence invariants, option controls, no repeat source downloads
 * and recoverability after an HTTP raster failure.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir} from "node:fs/promises";
import {chromium} from "playwright";
import AxeBuilder from "@axe-core/playwright";

const ORIGIN="http://127.0.0.1:4191/";
const server=spawn(process.execPath,["node_modules/vite/bin/vite.js","preview",
 "--host","127.0.0.1","--port","4191","--strictPort"],
 {cwd:"petroscreen-ng/web",stdio:"pipe"});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function serverReady(){
 for(let i=0;i<100;i++){
  try{if((await fetch(ORIGIN)).ok)return;}catch{}
  await pause(250);
 }
 throw Error("Stage21 local preview did not start");
}
const runScreen=async (page,lon,lat)=>{
 await page.locator("#longitude").fill(String(lon));
 await page.locator("#latitude").fill(String(lat));
 await page.locator("#screen-btn").click();
 await page.waitForFunction(()=>/Screening completed|Screening failed/.test(
   document.querySelector("#form-feedback")?.textContent||""),
   null,{timeout:120000});
 return await page.locator("#form-feedback").textContent();
};
const waitDetail=async (page,size)=>{
 await page.waitForFunction(s=>
  document.querySelector("#map")?.dataset.detailReady==="true" &&
  document.querySelector("#map")?.dataset.displaySize===String(s),
  size,{timeout:90000});
};
const captureEvidence=async page=>page.evaluate(()=>({
 subtitle:document.querySelector("#result-subtitle")?.textContent,
 area:document.querySelector("#area-value")?.textContent,
 coverage:document.querySelector("#coverage-value")?.textContent,
 land:document.querySelector("#land-cover")?.textContent,
 water:document.querySelector("#water-summary")?.textContent,
 context:document.querySelector("#receptor-summary")?.textContent,
 caveats:document.querySelector("#warnings")?.textContent
}));
let browser;
try{
 await serverReady();
 browser=await chromium.launch({headless:true,args:[
   "--enable-webgl","--use-gl=angle","--use-angle=swiftshader",
   "--disable-dev-shm-usage"]});
 await mkdir("petroscreen-ng/artifacts_stage21",{recursive:true});
 const manifest=await(await fetch(ORIGIN+"data/manifest.json")).json();
 const delta=manifest.state_sources.find(s=>s.state==="Delta");
 assert.ok(delta?.qa_example_lon_lat);
 const sourceCount=delta.source_files.length;
 for(const testCase of [{width:390,height:844,slow:true},
                         {width:1440,height:900,slow:false}]){
  const {width,height,slow}=testCase;
  const context=await browser.newContext({
    viewport:{width,height},deviceScaleFactor:slow?2:1,hasTouch:slow,
    isMobile:slow,acceptDownloads:true});
  const page=await context.newPage();
  const errors=[],tiffRequests=[],external=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",req=>{
    const u=req.url();
    if(/\.tif(?:\?|$)/i.test(u))tiffRequests.push(u);
    if(u.startsWith("http")&&!u.startsWith(ORIGIN))external.push(u);
  });
  if(slow){
    const cdp=await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate",{rate:3});
  }
  const loadStart=Date.now();
  await page.goto(ORIGIN,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#data-status")?.dataset.state==="ready",
    null,{timeout:90000});
  const loadMs=Date.now()-loadStart;
  assert.equal(await page.locator("#lightweight-map").isChecked(),slow);
  assert.equal(tiffRequests.length,0,"No source TIFF before the first screening");
  const screenStart=Date.now();
  assert.match(await runScreen(page,...delta.qa_example_lon_lat),
    /Screening completed/);
  const screenMs=Date.now()-screenStart;
  const firstSize=slow?512:1024;
  await waitDetail(page,firstSize);
  const original=await captureEvidence(page);
  assert.equal(tiffRequests.length,sourceCount,
    "Only current state's SHA256-verified source TIFFs may download");
  const status=await page.locator("#map-legend-status").textContent();
  assert.ok(status.includes("resampled to "+firstSize+" px"));
  assert.equal(external.length,0,"No network telemetry or third-party map tiles");
  await page.locator("#map-legend summary").click();
  await page.locator("#lightweight-map").setChecked(!slow);
  const secondSize=slow?1024:512;
  await waitDetail(page,secondSize);
  assert.deepEqual(await captureEvidence(page),original,
    "Display mode must not modify numerical reports or field observations");
  assert.equal(tiffRequests.length,sourceCount,
    "Re-rendering map must never download new scientific TIFFs");
  await page.locator("#lightweight-map").setChecked(slow);
  await waitDetail(page,firstSize);
  assert.equal(tiffRequests.length,sourceCount);
  assert.deepEqual(await captureEvidence(page),original);
  const result=(await new AxeBuilder({page})
   .withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze());
  assert.deepEqual(result.violations.map(v=>({
    rule:v.id,target:v.nodes.slice(0,2).map(n=>n.target)
  })),[],"Lightweight/full display selection must meet automated WCAG rules");
  await page.screenshot({path:"petroscreen-ng/artifacts_stage21/"+
    (slow?"mobile-lightweight-selected.png":"desktop-full-detail.png")});
  console.log("STAGE21_RENDER_"+width+"="+JSON.stringify({
    profile:slow?"chromium_mobile_cpu3x":"chromium_desktop",
    initialDataReadyMs:loadMs,screenMs,
    sizeA:firstSize,sizeB:secondSize,
    newTiffRequestsOnToggle:0,sourceTiffRequests:sourceCount,
    alteredMeasurements:false,axeViolations:0
  }));
  assert.deepEqual(errors,[],"No uncaught browser errors");
  await context.close();
 }
 // Failure/retry: reject one source TIFF once, verify there is no stale report,
 // then use intact SHA256 originals on the very next user attempt.
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();
 await page.goto(ORIGIN,{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#data-status")?.dataset.state==="ready",
    null,{timeout:90000});
 let intercepted=0;
 await page.route(/\.tif\?sha256=/,async route=>{
   if(intercepted===0){intercepted++;await route.fulfill({
     status:503,contentType:"text/plain",body:"Simulated unavailable source file"
   });}
   else await route.continue();
 });
 assert.match(await runScreen(page,...delta.qa_example_lon_lat),/Screening failed/);
 assert.equal(intercepted,1);
 assert.equal(await page.locator("#results").isVisible(),false,
   "Partial or failed source acquisition must never display an accepted screen");
 await page.waitForFunction(()=>document.querySelector("#screen-btn")?.disabled===false,
   null,{timeout:10000});
 await page.locator("#screen-btn").click();
 await page.waitForFunction(()=>/Screening completed|Screening failed/.test(
   document.querySelector("#form-feedback")?.textContent||""),
   null,{timeout:120000});
 assert.match(await page.locator("#form-feedback").textContent(),/Screening completed/);
 await waitDetail(page,512);
 assert.equal(await page.locator("#results").isVisible(),true);
 console.log("STAGE21_SOURCE_DOWNLOAD_FAILURE_RETRY_PASS");
 await context.close();
 console.log("STAGE21_CHROMIUM_MOBILE_RESILIENCE_QA=PASS");
}finally{
 await browser?.close();
 server.kill("SIGTERM");
}
