/** Stage24: real byte-verified TIFF / in-browser evidence planning QA.
 * No risk ranking, no mock scientific measurements, no field authentication.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {readFile,mkdir} from "node:fs/promises";
import {chromium} from "playwright";
import AxeBuilder from "@axe-core/playwright";
const ORIGIN="http://127.0.0.1:4194/";
const server=spawn(process.execPath,["node_modules/vite/bin/vite.js",
 "preview","--host","127.0.0.1","--port","4194","--strictPort"],{
  cwd:"petroscreen-ng/web",stdio:"pipe"});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function ready(){
 for(let i=0;i<100;i++){
  try{if((await fetch(ORIGIN)).ok)return;}catch{}
  await sleep(250);
 }
 throw Error("Stage24 preview unavailable");
}
let browser;
try{
 await ready();
 browser=await chromium.launch({headless:true,args:[
  "--enable-webgl","--use-gl=angle","--use-angle=swiftshader",
  "--disable-dev-shm-usage"]});
 await mkdir("petroscreen-ng/artifacts_stage24",{recursive:true});
 const manifest=await(await fetch(ORIGIN+"data/manifest.json")).json();
 const delta=manifest.state_sources.find(x=>x.state==="Delta");
 assert.ok(delta?.qa_example_lon_lat);
 for(const width of [375,1440]){
  const context=await browser.newContext({
   viewport:{width,height:width===375?812:900},acceptDownloads:true});
  const page=await context.newPage();
  const requests=[],errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{if(/\.tif(?:\?|$)/i.test(r.url()))requests.push(r.url());});
  await page.goto(ORIGIN,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#data-status")?.dataset.state==="ready",
   null,{timeout:90000});
  assert.equal(await page.locator("#results").isVisible(),false);
  assert.equal(await page.locator("#evidence-actions").isVisible(),false);
  const [lon,lat]=delta.qa_example_lon_lat;
  await page.locator("#longitude").fill(String(lon));
  await page.locator("#latitude").fill(String(lat));
  await page.locator("#screen-btn").click();
  await page.waitForFunction(()=>/Screening completed|Screening failed/.test(
    document.querySelector("#form-feedback")?.textContent||""),
    null,{timeout:120000});
  assert.match(await page.locator("#form-feedback").textContent(),/Screening completed/);
  assert.equal(requests.length,delta.source_files.length);
  assert.equal(await page.locator("#evidence-actions").isVisible(),true);
  assert.match(await page.locator("#action-summary").textContent(),/7 field checks not checked/);
  assert.match(await page.locator("#action-summary").textContent(),/0 user-reported field statuses/);
  assert.match(await page.locator("#action-summary").textContent(),/No field evidence is authenticated here/);
  assert.equal(await page.locator("#action-list-toggle").getAttribute("open"),null);
  await page.locator("#action-list-toggle > summary").click();
  assert.equal(await page.locator("#action-list .action-group").count(),3);
  assert.equal(await page.locator("#action-list .action-review-status").count()>=10,true);
  assert.match(await page.locator("#action-list").textContent(),/Qualified review to arrange/);
  assert.match(await page.locator("#action-list").textContent(),/not checked/);
  await page.locator("#field-record").evaluate(el=>{el.open=true;});
  await page.locator('[data-field-task="surface_water"]').selectOption("field_observed");
  await page.locator('[data-field-task="mangrove"]').selectOption("requires_follow_up");
  await page.locator("#field-observer").fill("Private Researcher");
  await page.locator("#field-notes").fill("CONFIDENTIAL_NOTES_TEST_ONLY");
  assert.match(await page.locator("#action-summary").textContent(),/5 field checks not checked/);
  assert.match(await page.locator("#action-summary").textContent(),/1 user-reported field statuses/);
  assert.match(await page.locator("#action-summary").textContent(),/1 user-requested follow-ups/);
  assert.match(await page.locator("#action-list").textContent(),/user reported unverified field observed/);
  assert.match(await page.locator("#action-list").textContent(),/user requested specialist follow up/);
  await page.locator("#facility-options").evaluate(el=>{el.open=true;});
  await page.locator("#facility-type").selectOption("pipeline");
  assert.match(await page.locator("#action-list").textContent(),/Crossing and alignment survey/);
  assert.match(await page.locator("#action-summary").textContent(),/unreviewed project prompts/);
  const current=await page.evaluate(()=>({
   area:document.querySelector("#area-value").textContent,
   coverage:document.querySelector("#coverage-value").textContent,
   land:document.querySelector("#land-cover").textContent,
   water:document.querySelector("#water-summary").textContent
  }));
  const pending=page.waitForEvent("download",{timeout:90000});
  await page.locator("#download-actions-csv").click();
  const download=await pending;
  assert.equal(download.suggestedFilename(),"PetroScreenNG_Delta_EvidenceToCollect.csv");
  const file="petroscreen-ng/artifacts_stage24/stage24-"+width+".csv";
  await download.saveAs(file);
  const csv=await readFile(file,"utf8");
  assert.match(csv,/current_review_state/);
  assert.match(csv,/field_surface_water/);
  assert.match(csv,/user_reported_unverified_field_observed/);
  assert.match(csv,/user_requested_specialist_follow_up/);
  assert.match(csv,/scope_pipe_crossings/);
  assert.match(csv,/qualified_review/);
  assert.match(csv,/2026/);
  assert.doesNotMatch(csv,/Private Researcher|CONFIDENTIAL_NOTES_TEST_ONLY/);
  assert.doesNotMatch(csv,/risk_score|suitability_score|certified_safe/);
  assert.equal(requests.length,delta.source_files.length,
    "Changing statuses/declarations and exporting does not repeat TIFF downloads");
  assert.deepEqual(await page.evaluate(()=>({
   area:document.querySelector("#area-value").textContent,
   coverage:document.querySelector("#coverage-value").textContent,
   land:document.querySelector("#land-cover").textContent,
   water:document.querySelector("#water-summary").textContent
  })),current);
  const audit=await new AxeBuilder({page}).withTags([
    "wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
  assert.deepEqual(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],
    "Evidence action panel must pass automated WCAG 2.1 A/AA");
  await page.screenshot({path:"petroscreen-ng/artifacts_stage24/"+
   (width===375?"mobile-evidence-plan.png":"desktop-evidence-plan.png")});
  assert.deepEqual(errors,[],"Uncaught browser errors");
  console.log("STAGE24_SOURCE_BACKED_EVIDENCE_PLAN_"+width+"=PASS");
  await context.close();
 }
}finally{
 await browser?.close();
 server.kill("SIGTERM");
}
