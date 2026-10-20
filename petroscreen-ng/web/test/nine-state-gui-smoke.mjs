/** Chromium 9-state on-demand browser validation with no raster startup preload. */
import assert from "node:assert/strict";
import {readFile,mkdir} from "node:fs/promises";
import {spawn} from "node:child_process";
import {chromium} from "playwright";

const SERVER="http://127.0.0.1:4175/";
const OUT="petroscreen-ng/artifacts_nine_state_web";
const oracle=JSON.parse(await readFile(
 "petroscreen-ng/artifacts_nine_state/nine_state_reference_acceptance.json","utf8"));
const cases=[
 oracle.cases.find(x=>x.state==="Ondo"&&x.kind==="interior"&&x.radius_km===3),
 oracle.cases.find(x=>x.state==="Akwa Ibom"&&x.kind==="interior"&&x.radius_km===3),
 oracle.cases.find(x=>x.kind==="interstate"&&x.radius_km===5)
];
assert.ok(cases.every(Boolean));
const process=spawn(globalThis.process.execPath,["node_modules/vite/bin/vite.js",
 "preview","--host","127.0.0.1","--port","4175","--strictPort"],
 {cwd:"petroscreen-ng/web",stdio:"pipe"});
async function wait(){
 for(let i=0;i<90;i++){
  try{let r=await fetch(SERVER);if(r.ok)return;}catch{}
  await new Promise(r=>setTimeout(r,300));
 }
 throw Error("Nine-state local preview server not responding");
}
let browser;
try{
 await mkdir(OUT,{recursive:true});
 await wait();
 browser=await chromium.launch({headless:true,args:[
   "--enable-webgl","--use-gl=angle","--use-angle=swiftshader","--disable-dev-shm-usage"
 ]});
 const page=await browser.newPage({viewport:{width:1450,height:940},acceptDownloads:true});
 const requested=[],errors=[];
 page.on("request",request=>requested.push(request.url()));
 page.on("pageerror",error=>errors.push(error.message));
 await page.goto(SERVER,{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#data-status")?.dataset.state==="ready",
   null,{timeout:120000});
 assert.match(await page.locator(".status-pill").textContent(),/NIGER DELTA NINE-STATE PILOT/);
 assert.equal(await page.locator("#screen-btn").isEnabled(),true);
 assert.equal(requested.filter(x=>/\.tif(?:\?|$)/.test(x)).length,0,
   "No analytical rasters should download at startup in regional mode");
 for(let i=0;i<cases.length;i++){
  const t=cases[i];
  await page.locator("#longitude").fill(String(t.site_wgs84[0]));
  await page.locator("#latitude").fill(String(t.site_wgs84[1]));
  await page.locator(".radius label").nth([1,3,5].indexOf(t.radius_km)).click();
  await page.locator("#screen-btn").click();
  await page.waitForFunction(()=>{
    const v=document.querySelector("#form-feedback")?.textContent||"";
    return v.includes("Screening completed")||v.includes("Screening failed");
  },null,{timeout:120000});
  const feedback=await page.locator("#form-feedback").textContent();
  assert.match(feedback,/Screening completed/,feedback);
  assert.equal(await page.locator("#map").getAttribute("data-detail-ready"),"true");
  if(t.kind==="interior")assert.match(await page.locator("#result-subtitle").textContent(),
    new RegExp(t.state));
  const download=page.waitForEvent("download",{timeout:90000});
  await page.locator("#download-pdf").click();
  const pdf=await download;
  assert.match(pdf.suggestedFilename(),/NigerDelta_NineStates/);
  await pdf.saveAs(`${OUT}/nine_state_${i+1}.pdf`);
  if(i===0)await page.screenshot({path:OUT+"/nine_state_ondo_desktop.png",fullPage:true});
 }
 await page.locator("#longitude").fill("4.1");
 await page.locator("#latitude").fill("9.1");
 await page.locator("#screen-btn").click();
 await page.waitForFunction(()=>document.querySelector("#form-feedback")?.textContent.includes(
    "Screening failed"),null,{timeout:30000});
 assert.equal(await page.locator("#results").isVisible(),false);
 const mobile=await browser.newPage({viewport:{width:390,height:844}});
 mobile.on("pageerror",e=>errors.push(e.message));
 await mobile.goto(SERVER,{waitUntil:"domcontentloaded"});
 await mobile.waitForFunction(()=>document.querySelector("#map")?.dataset.overviewReady==="true",
  null,{timeout:120000});
 await mobile.screenshot({path:OUT+"/nine_state_mobile.png",fullPage:true});
 assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>
    window.innerWidth+3),false);
 const tiffRequests=requested.filter(x=>/\.tif(?:\?|$)/.test(x));
 assert.ok(tiffRequests.length>=3,"No on-demand raster tiles fetched");
 assert.ok(tiffRequests.every(x=>new URL(x).searchParams.has("sha256")),
   "Regional raster requests must have integrity-addressed source hashes");
 const external=requested.filter(x=>/^https?:/.test(x) &&
   new URL(x).origin!==new URL(SERVER).origin);
 assert.deepEqual(external,[],"No external traffic expected for local screening");
 assert.deepEqual(errors,[],"No unhandled browser errors allowed");
 console.log(JSON.stringify({status:"PASS",states:9,screens:cases.length,
    mapped_pdf_reports:cases.length,
    raster_requests:tiffRequests.length,external_http_requests:0,mobile:"PASS"},null,2));
}finally{
 await browser?.close();
 process.kill("SIGTERM");
}
