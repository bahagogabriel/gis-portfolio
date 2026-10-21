/** Stage20 actual-source legend and in-browser performance smoke.
 * Uses published self-hosted data and Chromium; no new imagery or calculations.
 * Timing is diagnostic (CI CPU/network is not a real mobile device).
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir} from "node:fs/promises";
import {chromium} from "playwright";
import AxeBuilder from "@axe-core/playwright";
const ORIGIN="http://127.0.0.1:4189/";
const server=spawn(process.execPath,["node_modules/vite/bin/vite.js","preview",
 "--host","127.0.0.1","--port","4189","--strictPort"],{
 cwd:"petroscreen-ng/web",stdio:"pipe"
});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function waitServer(){
 for(let i=0;i<100;i++){
  try{if((await fetch(ORIGIN)).ok)return;}catch{}
  await wait(250);
 }
 throw Error("Map visual QA preview unavailable");
}
let browser;
try{
 await waitServer();
 browser=await chromium.launch({headless:true,args:[
   "--enable-webgl","--use-gl=angle","--use-angle=swiftshader",
   "--disable-dev-shm-usage"]});
 await mkdir("petroscreen-ng/artifacts_stage20",{recursive:true});
 const manifest=await(await fetch(ORIGIN+"data/manifest.json")).json();
 assert.equal(manifest.states.length,9);
 const delta=manifest.state_sources.find(x=>x.state==="Delta");
 assert.ok(delta?.qa_example_lon_lat);
 for(const width of [375,1440]){
  const mobile=width===375;
  const context=await browser.newContext({
    viewport:{width,height:mobile?812:900},acceptDownloads:true
  });
  const page=await context.newPage();
  const requests=[],errors=[];
  page.on("request",r=>requests.push(r.url()));
  page.on("pageerror",e=>errors.push(e.message));
  const started=Date.now();
  await page.goto(ORIGIN,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#data-status")?.dataset.state==="ready",
    null,{timeout:90000});
  const readyMs=Date.now()-started;
  assert.equal(await page.locator("#map-legend").isVisible(),true);
  assert.equal(await page.locator("#map-legend").getAttribute("open"),null);
  assert.equal(await page.locator("#map-legend-native").isVisible(),false);
  assert.match(await page.locator("#map-legend-status").textContent(),/Generalized regional overview/);
  await page.locator("#map-legend summary").click();
  assert.match(await page.locator("#map-symbols").count().catch(()=>0),/^0$/); // actual symbol group is semantic CSS class
  assert.match(await page.locator(".map-symbols").textContent(),/Verified state coverage outline/);
  assert.match(await page.locator(".map-symbols").textContent(),/Selected screening point/);
  assert.match(await page.locator(".map-symbols").textContent(),/Chosen 1, 3 or 5 km buffer/);
  assert.equal(await page.locator("#map-legend-classes li").count(),11);
  const before=requests.filter(x=>/\.tif(?:\?|$)/i.test(x));
  assert.equal(before.length,0,"Do not fetch any state TIFF before a screening");
  if(mobile)
    await page.screenshot({path:"petroscreen-ng/artifacts_stage20/mobile-overview-map-key.png"});
  else
    await page.screenshot({path:"petroscreen-ng/artifacts_stage20/desktop-overview-map-key.png"});
  const [lon,lat]=delta.qa_example_lon_lat;
  await page.locator("#longitude").fill(String(lon));
  await page.locator("#latitude").fill(String(lat));
  const screeningStart=Date.now();
  await page.locator("#screen-btn").click();
  await page.waitForFunction(()=>/Screening completed|Screening failed/.test(
    document.querySelector("#form-feedback")?.textContent||""),
    null,{timeout:120000});
  assert.match(await page.locator("#form-feedback").textContent(),/Screening completed/);
  const screenMs=Date.now()-screeningStart;
  await page.waitForFunction(()=>["true","fallback"].includes(
    document.querySelector("#map")?.dataset.detailReady),
    null,{timeout:45000});
  assert.equal(await page.locator("#map").getAttribute("data-detail-ready"),"true",
    "Real native ESA display must be available for legend acceptance");
  assert.equal(await page.locator("#map-legend-native").isVisible(),true);
  assert.match(await page.locator("#map-legend-status").textContent(),/Native 10 m ESA WorldCover 2021/);
  const chips=await page.locator(".legend-class-swatch").evaluateAll(els=>
    els.map(el=>getComputedStyle(el).backgroundColor));
  assert.equal(chips.length,11);
  // 10 = tree cover, 80 = ESA mapped water. Exact original rendering colors.
  assert.equal(chips[0],"rgb(48, 110, 75)");
  assert.equal(chips[7],"rgb(103, 164, 197)");
  const sourceFiles=delta.source_files.map(x=>x.file);
  const fetched=requests.filter(x=>/\.tif(?:\?|$)/i.test(x));
  assert.equal(fetched.length,sourceFiles.length);
  assert.ok(sourceFiles.every(file=>fetched.some(url=>url.includes("/"+file+"?sha256="))));
  assert.ok(requests.filter(x=>x.startsWith("https://")&&
    !x.startsWith(ORIGIN)).length===0,"No external map tiles or telemetry requests");
  assert.ok(errors.length===0,"Uncaught browser errors: "+errors.join(" | "));
  const contrast=(await new AxeBuilder({page}).withTags([
    "wcag2a","wcag2aa","wcag21a","wcag21aa"
  ]).analyze()).violations.map(v=>({rule:v.id,target:v.nodes[0]?.target}));
  assert.deepEqual(contrast,[],"Map open-legend view must meet automated WCAG checks");
  if(mobile)
    await page.screenshot({path:"petroscreen-ng/artifacts_stage20/mobile-native-map-key.png"});
  else
    await page.screenshot({path:"petroscreen-ng/artifacts_stage20/desktop-native-map-key.png"});
  const existingRequestCount=fetched.length;
  await page.locator('input[name="radius"][value="3"]').check();
  await page.locator("#screen-btn").click();
  await page.waitForFunction(()=>/Screening completed|Screening failed/.test(
    document.querySelector("#form-feedback")?.textContent||""),
    null,{timeout:120000});
  assert.match(await page.locator("#form-feedback").textContent(),/Screening completed/);
  const after=requests.filter(x=>/\.tif(?:\?|$)/i.test(x));
  assert.equal(after.length,existingRequestCount,
    "Same-state second screening must reuse byte-verified TIFFs without refetching");
  assert.equal(await page.locator("#map-legend-native").isVisible(),false,
    "Native map key stays disabled while new detailed image renders");
  await page.waitForFunction(()=>document.querySelector("#map")?.dataset.detailReady==="true",
    null,{timeout:45000});
  assert.equal(await page.locator("#map-legend-native").isVisible(),true);
  console.log("STAGE20_MAP_PERF_"+width+"="+JSON.stringify({
    readyMs,screenMs,firstScreenTiffFiles:existingRequestCount,
    secondScreenNewTiffFiles:0,externalMapRequests:0,legendColors:11
  }));
  await context.close();
 }
 console.log("STAGE20_REAL_SOURCE_MAP_LEGEND_PERFORMANCE_PASS");
}finally{
 await browser?.close();
 server.kill("SIGTERM");
}
