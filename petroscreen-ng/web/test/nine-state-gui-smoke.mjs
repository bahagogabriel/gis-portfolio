/** Actual nine-state browser QA: one independently checked site per state.
 * Every run requires fetching native state-owned rasters. No overlapping state
 * source TIFFs are ever loaded/combined in one calculation.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {chromium} from "playwright";
const ORIGIN="http://127.0.0.1:4175/";
const server=spawn(process.execPath,["node_modules/vite/bin/vite.js","preview",
  "--host","127.0.0.1","--port","4175","--strictPort"],
  {cwd:"petroscreen-ng/web",stdio:"pipe"});
async function wait(){
  for(let i=0;i<80;i++){
    try{const r=await fetch(ORIGIN);if(r.ok)return;}catch{}
    await new Promise(r=>setTimeout(r,300));
  }
  throw Error("Static research preview could not start");
}
let browser;
try{
  await wait();
  const manifest=await (await fetch(ORIGIN+"data/manifest.json")).json();
  assert.equal(manifest.state_sources.length,9);
  browser=await chromium.launch({headless:true,args:[
    "--enable-webgl","--use-gl=angle","--use-angle=swiftshader","--disable-dev-shm-usage"]});
  const page=await browser.newPage({viewport:{width:1440,height:900},
    acceptDownloads:true});
  const requestUrls=[],exceptions=[];
  page.on("pageerror",e=>exceptions.push(e.message));
  page.on("request",r=>requestUrls.push(r.url()));
  await page.goto(ORIGIN,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#data-status")?.dataset.state==="ready",
    null,{timeout:90000});
  assert.match(await page.locator("#data-status").textContent(),/nine verified state datasets/i);
  const reports=[];
  for(const entry of manifest.state_sources){
    const [lon,lat]=entry.qa_example_lon_lat;
    await page.locator("#longitude").fill(String(lon));
    await page.locator("#latitude").fill(String(lat));
    await page.locator("#screen-btn").click();
    await page.waitForFunction(()=>{
      const t=document.querySelector("#form-feedback")?.textContent||"";
      return /Screening completed|Screening failed/.test(t);
    },null,{timeout:120000});
    const notice=await page.locator("#form-feedback").textContent();
    assert.match(notice,/Screening completed/,entry.state+": "+notice);
    assert.match(await page.locator("#result-subtitle").textContent(),new RegExp(entry.state));
    assert.equal(await page.locator("#results").isVisible(),true);
    await page.waitForFunction(()=>["true","fallback"].includes(
      document.querySelector("#map")?.dataset.detailReady),null,{timeout:40000});
    assert.equal(await page.locator("#map").getAttribute("data-detail-ready"),"true");
    reports.push({state:entry.state,site_lon_lat:[lon,lat]});
    if(entry.state==="Rivers"){
      const pending=page.waitForEvent("download",{timeout:90000});
      await page.locator("#download-pdf").click();
      const dl=await pending;
      assert.match(dl.suggestedFilename(),/Preliminary_Screening\.pdf/);
    }
  }
  // No raster should be requested without its version checksum query.
  const rasters=requestUrls.filter(x=>/\.tif(?:\?|$)/.test(x));
  assert.ok(rasters.length>=19,"Missing real per-state raster requests");
  assert.ok(rasters.every(x=>new URL(x).searchParams.has("sha256")));
  const external=requestUrls.filter(x=>/^https?:/.test(x)&&new URL(x).origin!==new URL(ORIGIN).origin);
  assert.deepEqual(external,[],"Unexpected outside network requests");
  assert.deepEqual(exceptions,[],"JS errors in nine-state browser QA");
  console.log(JSON.stringify({status:"PASS",tested_states:reports.length,
    raster_request_count:rasters.length,external_requests:0,reports},null,2));
}finally{
  await browser?.close();server.kill("SIGTERM");
}
