/** Consolidated v3.0 launch gate: 27 ACTUAL source-backed screenings.
 * Not just synthetic geometry. All nine verified states x 1/3/5 km,
 * with signed-off WGS84 example location for each state. The source data
 * remains the exact existing SHA256-manifest TIFFs.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {readFile,mkdir} from "node:fs/promises";
import {chromium} from "playwright";
import AxeBuilder from "@axe-core/playwright";
const ORIGIN="http://127.0.0.1:4195/";
const server=spawn(process.execPath,["node_modules/vite/bin/vite.js","preview",
 "--host","127.0.0.1","--port","4195","--strictPort"],
 {cwd:"petroscreen-ng/web",stdio:"pipe"});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function readyServer(){
 for(let n=0;n<100;n++){
  try{if((await fetch(ORIGIN)).ok)return;}catch{}
  await pause(250);
 }
 throw Error("v3.0 browser release gate server did not start");
}
let browser;
try{
 await readyServer();
 browser=await chromium.launch({headless:true,args:[
  "--enable-webgl","--use-gl=angle","--use-angle=swiftshader",
  "--disable-dev-shm-usage"]});
 await mkdir("petroscreen-ng/artifacts_release_candidate",{recursive:true});
 const manifest=await(await fetch(ORIGIN+"data/manifest.json")).json();
 assert.equal(manifest.states.length,9);
 assert.equal(manifest.state_sources.length,9);
 const expectedFiles=manifest.state_sources.reduce((n,x)=>n+x.source_files.length,0);
 assert.equal(expectedFiles,31,"All original 31 state-owned TIFFs must be indexed");
 const context=await browser.newContext({viewport:{width:1440,height:900},
  acceptDownloads:true});
 const page=await context.newPage();
 const errors=[],tiffs=[];
 page.on("pageerror",e=>errors.push(e.message));
 page.on("request",r=>{if(/\.tif(?:\?|$)/i.test(r.url()))tiffs.push(r.url());});
 await page.goto(ORIGIN,{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#data-status")?.dataset.state==="ready",
  null,{timeout:90000});
 assert.equal(tiffs.length,0,"No TIFF before any screening");
 // Optional support check: local only, no sensitive data or source TIFF download.
 await page.locator("#secondary-tools").evaluate(el=>{el.open=true});
 await page.locator("#check-browser-readiness").click();
 assert.match(await page.locator("#readiness-result").textContent(),/Indexed states: 9/);
 assert.match(await page.locator("#readiness-result").textContent(),/indexed TIFFs: 31/);
 assert.match(await page.locator("#readiness-result").textContent(),/currently SHA-256-verified state: none/);
 assert.equal(tiffs.length,0);
 const before=page.waitForEvent("download",{timeout:45000});
 await page.locator("#download-readiness-report").click();
 const first=await before;
 assert.equal(first.suggestedFilename(),"PetroScreenNG_v3_BrowserReadiness.txt");
 const diagPath="petroscreen-ng/artifacts_release_candidate/browser-readiness-before.txt";
 await first.saveAs(diagPath);
 const diag=await readFile(diagPath,"utf8");
 assert.match(diag,/Indexed state source TIFFs: 31/);
 assert.doesNotMatch(diag,/^(latitude|longitude|observer|field_notes)\\s*[:=]/im);
 // Specialist CSV/JSON downloads live in the intentionally collapsed
 // export disclosure, as verified by the original nine-state browser smoke.
 await page.locator("#export-options").evaluate(el=>{el.open=true});
 let cases=0;
 for(const entry of manifest.state_sources){
  const [lon,lat]=entry.qa_example_lon_lat;
  assert.ok(Number.isFinite(lon)&&Number.isFinite(lat));
  let perStateRequests=0;
  for(const radius of [1,3,5]){
   await page.locator("#longitude").fill(String(lon));
   await page.locator("#latitude").fill(String(lat));
   await page.locator('input[name="radius"][value="'+radius+'"]').check();
   const start=Date.now();
   await page.locator("#screen-btn").click();
   await page.waitForFunction(()=>/Screening completed|Screening failed/.test(
    document.querySelector("#form-feedback")?.textContent||""),
    null,{timeout:120000});
   const feedback=await page.locator("#form-feedback").textContent();
   assert.match(feedback,/Screening completed/,
    entry.state+" "+radius+"km: "+feedback);
   await page.waitForFunction(()=>document.querySelector("#screen-form")?.getAttribute("aria-busy")!=="true",
    null,{timeout:25000});
   assert.match(await page.locator("#result-subtitle").textContent(),new RegExp(entry.state));
   assert.match(await page.locator("#result-subtitle").textContent(),
    new RegExp(radius+" km radius"));
   const displayedCoverage=await page.locator("#coverage-value").textContent();
   assert.match(displayedCoverage,/^\d+(?:\.\d+)?%$/);
   assert.match(await page.locator("#interpretation").textContent(),/ESA WorldCover 2021/);
   assert.equal(await page.locator("#receptor-summary .receptor-item").count(),4);
   assert.equal(await page.locator("#results").isVisible(),true);
   assert.match(await page.locator("#action-summary").textContent(),/No field evidence is authenticated here/);
   const actualRequests=tiffs.filter(url=>
    entry.source_files.some(file=>url.includes("/"+file.file+"?sha256="))).length;
   assert.equal(actualRequests,entry.source_files.length,
    "Only first screening of "+entry.state+" fetches original SHA256 TIFFs; changing radius must reuse them");
   perStateRequests=actualRequests;
   if(radius===5){
    const d=page.waitForEvent("download",{timeout:90000});
    await page.locator("#download-data-json").click();
    const dl=await d;
    const destination="petroscreen-ng/artifacts_release_candidate/"+
      entry.state+"_5km_source_case.json";
    await dl.saveAs(destination);
    const saved=JSON.parse(await readFile(destination,"utf8"));
    assert.equal(saved.schema,"PetroScreenNG/ScreeningCase/1.0");
    assert.equal(saved.site.state,entry.state);
    assert.equal(saved.site.radius_km,radius);
    assert.equal(saved.site.longitude,lon);
    assert.equal(saved.site.latitude,lat);
    assert.equal(saved.source_provenance.source_file_sha256.length,entry.source_files.length);
    assert.deepEqual(saved.source_provenance.source_file_sha256.map(x=>({
       name:x.name,sha256:x.sha256,kind:x.kind})).sort((a,b)=>a.name.localeCompare(b.name)),
      entry.source_files.map(x=>({
       name:x.file,sha256:x.sha256,kind:x.kind})).sort((a,b)=>a.name.localeCompare(b.name)));
    assert.ok(saved.measurements.land_cover_2021.classes.length>0);
    assert.ok(saved.measurements.historical_surface_water_1984_2024.threshold_areas.length===3);
    assert.equal(saved.evidence_review.review.no_field_authentication,true);
   }
   cases++;
   console.log("V3_VERIFIED_SCREEN="+entry.state+":"+radius+"km: "+
     Math.round(Date.now()-start)+"ms; coverage="+displayedCoverage);
  }
  console.log("V3_STATE_CHECK="+entry.state+": PASS, TIFF_files="+perStateRequests);
 }
 assert.equal(cases,27);
 assert.equal(tiffs.length,31,"Each of the 31 source TIFFs must be downloaded once and only once");
 await page.locator("#check-browser-readiness").click();
 assert.match(await page.locator("#readiness-result").textContent(),/currently SHA-256-verified state: /);
 assert.match(await page.locator("#readiness-result").textContent(),new RegExp(manifest.state_sources.at(-1).state));
 const finalDiag=page.waitForEvent("download",{timeout:45000});
 await page.locator("#download-readiness-report").click();
 const dl=await finalDiag;
 const finalPath="petroscreen-ng/artifacts_release_candidate/browser-readiness-after.txt";
 await dl.saveAs(finalPath);
 const finalTxt=await readFile(finalPath,"utf8");
 assert.doesNotMatch(finalTxt,/^(latitude|longitude|observer|field_notes)\\s*[:=]/im);
 const axe=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
 assert.deepEqual(axe.violations.map(x=>({id:x.id,target:x.nodes.slice(0,2).map(y=>y.target)})),[]);
 assert.deepEqual(errors,[]);
 await page.screenshot({path:"petroscreen-ng/artifacts_release_candidate/final-27-case-desktop.png"});
 console.log("V3_RELEASE_ACCEPTANCE_27_REAL_CASES_9_STATES_3_RADII=PASS");
}finally{
 await browser?.close();
 server.kill("SIGTERM");
}
