/** Stage 06 true browser site selection, two-state PDF and privacy smoke QA. */
import assert from "node:assert/strict";
import {readFile,mkdir} from "node:fs/promises";
import {spawn} from "node:child_process";
import {chromium} from "playwright";

const ORIGIN="http://127.0.0.1:4174/";
const OUT="petroscreen-ng/artifacts_two_state_web";
const ORACLE=JSON.parse(await readFile(
  "petroscreen-ng/artifacts_two_state/two_state_engine_acceptance.json","utf8"));
const tests=[
  ORACLE.cases.find(x=>x.state==="Rivers"&&x.kind==="interior"&&x.radius_km===3),
  ORACLE.cases.find(x=>x.state==="Bayelsa"&&x.kind==="interstate"&&x.radius_km===5),
  ORACLE.cases.find(x=>x.state==="Rivers"&&x.kind==="interstate"&&x.radius_km===1)
];
if(tests.some(x=>!x))throw Error("Missing two-state real screening fixtures");
const server=spawn(process.execPath,["node_modules/vite/bin/vite.js","preview",
  "--host","127.0.0.1","--port","4174","--strictPort"],
  {cwd:"petroscreen-ng/web",stdio:"pipe"});
async function waitServer(){
  for(let i=0;i<80;i++){
    try{let r=await fetch(ORIGIN);if(r.ok)return;}catch{}
    await new Promise(r=>setTimeout(r,300));
  }
  throw Error("Local two-state preview server did not start");
}
let browser;
try{
  await mkdir(OUT,{recursive:true});
  await waitServer();
  browser=await chromium.launch({headless:true,args:[
    "--enable-webgl","--use-gl=angle","--use-angle=swiftshader","--disable-dev-shm-usage"
  ]});
  const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
  const errors=[],requests=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>requests.push(r.url()));
  await page.goto(ORIGIN,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#map")?.dataset.overviewReady==="true",
    null,{timeout:90000});
  await page.waitForFunction(()=>document.querySelector("#form-feedback")?.textContent.includes(
    "Verified satellite data loaded"),null,{timeout:90000});
  assert.match(await page.locator(".status-pill").textContent(),/BAYELSA AND RIVERS/);
  for(let i=0;i<tests.length;i++){
    const t=tests[i],point=t.result.location_wgs84;
    await page.locator("#longitude").fill(String(point.longitude));
    await page.locator("#latitude").fill(String(point.latitude));
    const radius=t.radius_km;
    await page.locator(".radius label").nth([1,3,5].indexOf(radius)).click();
    assert.equal(await page.locator("#results").isVisible(),false,
      "Changing site or radius must invalidate previous screening");
    await page.locator("#screen-btn").click();
    await page.waitForFunction(()=>{
      const v=document.querySelector("#form-feedback")?.textContent||"";
      return /Screening completed|Screening failed/.test(v);
    },null,{timeout:90000});
    let feedback=await page.locator("#form-feedback").textContent();
    assert.match(feedback,/Screening completed/,feedback);
    assert.match(await page.locator("#result-subtitle").textContent(),new RegExp(t.state));
    const text=await page.locator("#warnings").textContent();
    if(t.kind==="interstate"&&t.result.coverage_status==="sufficient")
      assert.doesNotMatch(text,/BUFFER_CROSSES_SUPPORTED_BOUNDARY/);
    const dl=page.waitForEvent("download",{timeout:90000});
    await page.locator("#download-pdf").click();
    const result=await dl;
    assert.match(result.suggestedFilename(),/PetroScreenNG_Bayelsa_Rivers_Preliminary_Screening\.pdf$/);
    await result.saveAs(`${OUT}/two_state_${t.state}_${t.kind}_${radius}km.pdf`);
    if(i===1){
      await page.waitForTimeout(650);
      await page.screenshot({path:OUT+"/two_state_cross_border_desktop.png",fullPage:true});
    }
  }
  await page.locator("#longitude").fill("4.1");
  await page.locator("#latitude").fill("7.1");
  assert.equal(await page.locator("#results").isVisible(),false);
  await page.locator("#screen-btn").click();
  await page.waitForFunction(()=>document.querySelector("#form-feedback")?.textContent.includes(
    "Screening failed"),null,{timeout:20000});
  assert.match(await page.locator("#form-feedback").textContent(),
    /outside the verified Bayelsa and Rivers screening area/);
  const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  mobile.on("pageerror",e=>errors.push(e.message));
  await mobile.goto(ORIGIN,{waitUntil:"domcontentloaded"});
  await mobile.waitForFunction(()=>document.querySelector("#map")?.dataset.overviewReady==="true",
    null,{timeout:90000});
  await mobile.screenshot({path:OUT+"/two_state_mobile_map.png",fullPage:true});
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>
      window.innerWidth+3),false,"Mobile page overflows horizontally");

  // Regression: selecting a site while an HTTP raster is still loading must
  // NOT hide the data-readiness indicator or imply the Run button is usable.
  const slow=await browser.newPage();
  await slow.route("**/data/wc_west.tif",async route=>{
    await new Promise(resolve=>setTimeout(resolve,2500));
    await route.continue();
  });
  await slow.goto(ORIGIN,{waitUntil:"domcontentloaded"});
  await slow.waitForFunction(()=>document.querySelector("#data-status")?.textContent.includes(
    "Verifying land-cover raster"),null,{timeout:30000});
  await slow.locator("#longitude").fill("6.066211");
  await slow.locator("#latitude").fill("4.755211");
  assert.equal(await slow.locator("#screen-btn").isDisabled(),true);
  assert.equal(await slow.locator("#data-status").getAttribute("data-state"),"loading");
  assert.match(await slow.locator("#data-status").textContent(),/Verifying land-cover raster/);
  await slow.waitForFunction(()=>document.querySelector("#data-status")?.dataset.state==="ready",
    null,{timeout:120000});
  assert.equal(await slow.locator("#screen-btn").isEnabled(),true);
  await slow.close();

  // Regression: browser-local server failure must leave an explicit visible
  // error and a real retry path; map/coordinate interaction cannot hide it.
  const failed=await browser.newPage();
  await failed.route("**/data/water_occurrence.tif",route=>route.abort("failed"));
  await failed.goto(ORIGIN,{waitUntil:"domcontentloaded"});
  await failed.waitForFunction(()=>document.querySelector("#data-status")?.dataset.state==="failed",
    null,{timeout:120000});
  assert.equal(await failed.locator("#screen-btn").isDisabled(),true);
  assert.equal(await failed.locator("#retry-data").isVisible(),true);
  await failed.locator("#longitude").fill("6.066211");
  await failed.locator("#latitude").fill("4.755211");
  assert.match(await failed.locator("#data-status").textContent(),/Data loading failed/);
  await failed.unroute("**/data/water_occurrence.tif");
  await failed.locator("#retry-data").click();
  await failed.waitForFunction(()=>document.querySelector("#data-status")?.dataset.state==="ready",
    null,{timeout:120000});
  assert.equal(await failed.locator("#screen-btn").isEnabled(),true);
  await failed.close();
  const external=requests.filter(x=>/^https?:/.test(x)&&new URL(x).origin!==new URL(ORIGIN).origin);
  assert.deepEqual(external,[],"External network requests would expose information");
  assert.deepEqual(errors,[],"Unexpected browser JavaScript errors");
  console.log(JSON.stringify({status:"PASS",screening_cases:tests.length,
    states:["Bayelsa","Rivers"],pdfs:tests.length,mobile:"PASS",
    external_requests:0,readiness_late_raster:"PASS",retry_after_failure:"PASS"},null,2));
}finally{
  await browser?.close();
  server.kill("SIGTERM");
}
