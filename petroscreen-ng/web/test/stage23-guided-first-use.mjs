/** Stage 23: browser-backed walkthrough and scientific literacy acceptance.
 * Manifest-published QA points are illustrations, never identified facilities.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir} from "node:fs/promises";
import {chromium} from "playwright";
import AxeBuilder from "@axe-core/playwright";
const ORIGIN="http://127.0.0.1:4193/";
const server=spawn(process.execPath,["node_modules/vite/bin/vite.js","preview",
  "--host","127.0.0.1","--port","4193","--strictPort"],
  {cwd:"petroscreen-ng/web",stdio:"pipe"});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitServer(){
 for(let i=0;i<100;i++){try{if((await fetch(ORIGIN)).ok)return;}catch{}
  await sleep(250);}
 throw Error("First-use preview not running");
}
let browser;
try{
 await waitServer();
 browser=await chromium.launch({headless:true,args:[
   "--enable-webgl","--use-gl=angle","--use-angle=swiftshader",
   "--disable-dev-shm-usage"]});
 await mkdir("petroscreen-ng/artifacts_stage23",{recursive:true});
 const manifest=await (await fetch(ORIGIN+"data/manifest.json")).json();
 assert.equal(manifest.state_sources.length,9);
 const entry=manifest.state_sources.find(s=>s.state==="Delta");
 assert.ok(entry?.qa_example_lon_lat);
 for(const {width,height} of [{width:375,height:812},{width:1440,height:900}]){
  const ctx=await browser.newContext({viewport:{width,height},acceptDownloads:true});
  const page=await ctx.newPage(),requests=[],jsErrors=[];
  page.on("request",req=>{if(/\.tif(?:\?|$)/i.test(req.url()))requests.push(req.url());});
  page.on("pageerror",error=>jsErrors.push(error.message));
  await page.goto(ORIGIN,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>
    document.querySelector("#data-status")?.dataset.state==="ready",
    null,{timeout:90000});
  assert.equal(await page.locator("#quick-start").getAttribute("open"),null);
  assert.equal(await page.locator("#try-example").isVisible(),false);
  assert.equal(await page.locator("#results").isVisible(),false);
  assert.equal(requests.length,0,"No state TIFF fetched before screening");
  await page.locator("#quick-start > summary").click();
  assert.equal(await page.locator("#try-example").isVisible(),true);
  assert.match(await page.locator("#quick-start").textContent(),/not identify petroleum facilities/i);
  const initial=await new AxeBuilder({page}).withTags([
   "wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
  assert.deepEqual(initial.violations.map(v=>v.id),[],
    "Initial expanded guide must be A/AA accessible");
  await page.locator("#try-example").click();
  const [lon,lat]=entry.qa_example_lon_lat;
  assert.equal(await page.locator("#longitude").inputValue(),Number(lon).toFixed(6));
  assert.equal(await page.locator("#latitude").inputValue(),Number(lat).toFixed(6));
  assert.match(await page.locator("#example-status").textContent(),/not a mapped facility/i);
  assert.match(await page.locator("#form-feedback").textContent(),/No analysis has run yet/);
  assert.equal(await page.locator("#results").isVisible(),false);
  assert.equal(requests.length,0,"Example selection alone must not load state TIFFs");
  assert.equal(await page.locator("#facility-type").inputValue(),"not_specified");
  const docBefore=await page.evaluate(()=>document.documentElement.scrollWidth);
  assert.ok(docBefore<=width+1,"No horizontal overflow in guide");
  await page.screenshot({path:"petroscreen-ng/artifacts_stage23/"+
    (width===375?"mobile-guide.png":"desktop-guide.png")});
  await page.locator("#screen-btn").click();
  await page.waitForFunction(()=>/Screening completed|Screening failed/.test(
    document.querySelector("#form-feedback")?.textContent||""),
    null,{timeout:120000});
  assert.match(await page.locator("#form-feedback").textContent(),/Screening completed/);
  assert.equal(await page.locator("#results").isVisible(),true);
  assert.equal(await page.locator("#advanced-results").getAttribute("open"),null);
  assert.equal(await page.locator("#download-pdf").isVisible(),true);
  assert.equal(await page.locator("#download-case-bundle").isVisible(),true);
  assert.equal(await page.locator("#main-cover").isVisible(),true);
  assert.match(await page.locator("#main-cover").textContent(),/Largest mapped land type:.*classified pixels/);
  assert.equal(await page.locator("#water-summary .water-level").count(),3);
  const waterWords=await page.locator("#water-summary").textContent();
  assert.match(waterWords,/at least 1% of valid satellite observations/);
  assert.match(waterWords,/at least half of valid satellite observations/);
  assert.match(waterWords,/at least 90% of valid satellite observations/);
  assert.doesNotMatch(waterWords,/historical occurrence/i);
  assert.equal(await page.locator("#finding-meaning").getAttribute("open"),null);
  const primary=await page.locator("#download-pdf").boundingBox();
  const summary=await page.locator("#summary-heading").boundingBox();
  assert.ok(primary.y>summary.y&&primary.y-summary.y<410,
    "Primary download should be within the first compact findings section");
  assert.match(await page.locator("#result-subtitle").textContent(),/Delta/);
  assert.equal(requests.length,entry.source_files.length);
  assert.match(await page.locator(".findings-orientation").textContent(),/ESA WorldCover/);
  assert.match(await page.locator(".findings-orientation").textContent(),/not a site safety verdict/i);
  assert.equal(await page.locator("#reading-guide").getAttribute("open"),null);
  await page.locator("#reading-guide > summary").click();
  assert.match(await page.locator("#reading-guide").textContent(),/valid classified ESA 2021 pixels/);
  assert.match(await page.locator("#reading-guide").textContent(),/not flood probability/);
  assert.match(await page.locator("#reading-guide").textContent(),/not scientific confidence or site safety/);
  assert.match(await page.locator("#reading-guide").textContent(),/Not mapped/);
  assert.match(await page.locator("#interpretation").textContent(),/JRC 1984/);
  await page.locator("#field-record").evaluate(el=>{el.open=true;});
  await page.locator("#field-observer").fill("Owner QA field note (unverified)");
  const saved=await page.evaluate(()=>({
   lat:document.querySelector("#latitude").value,
   lon:document.querySelector("#longitude").value,
   area:document.querySelector("#area-value").textContent,
   coverage:document.querySelector("#coverage-value").textContent,
   subtitle:document.querySelector("#result-subtitle").textContent,
   notes:document.querySelector("#field-observer").value
  }));
  await page.locator("#try-example").click();
  assert.match(await page.locator("#example-status").textContent(),
    /Example not selected: A screening or saved-case task is already open/);
  assert.deepEqual(await page.evaluate(()=>({
   lat:document.querySelector("#latitude").value,
   lon:document.querySelector("#longitude").value,
   area:document.querySelector("#area-value").textContent,
   coverage:document.querySelector("#coverage-value").textContent,
   subtitle:document.querySelector("#result-subtitle").textContent,
   notes:document.querySelector("#field-observer").value
  })),saved,"Guide must not overwrite accepted data or private user notes");
  assert.equal(requests.length,entry.source_files.length);
  const audit=await new AxeBuilder({page}).withTags([
    "wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
  assert.deepEqual(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],
    "Expanded result glossary must pass WCAG A/AA automated audit");
  await page.screenshot({path:"petroscreen-ng/artifacts_stage23/"+
    (width===375?"mobile-explained-findings.png":"desktop-explained-findings.png")});
  assert.deepEqual(jsErrors,[],"No page runtime errors");
  console.log("STAGE23_FIRST_USE_"+width+"="+JSON.stringify({
    exampleFromManifest:true,noRastersBeforeAction:true,
    screenVerifiedState:"Delta",glossaryAccessible:true,
    acceptedScreenUnchanged:true,fieldNotesPreserved:true,axeViolations:0
  }));
  await ctx.close();
 }
 console.log("STAGE23_GUIDED_FIRST_RUN_AND_SOURCE_LITERACY=PASS");
}finally{
 await browser?.close();
 server.kill("SIGTERM");
}
