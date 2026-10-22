/** Stage 19: REAL rendered UX review on desktop/tablet/mobile.
 * WCAG 2.1 A/AA automated rules are a necessary subset, not a certificate.
 * The audit also tests keyboard flow, findability and no horizontal clipping.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir} from "node:fs/promises";
import {chromium} from "playwright";
import AxeBuilder from "@axe-core/playwright";
const ORIGIN="http://127.0.0.1:4187/";
const server=spawn(process.execPath,["node_modules/vite/bin/vite.js","preview",
  "--host","127.0.0.1","--port","4187","--strictPort"],
  {cwd:"petroscreen-ng/web",stdio:"pipe"});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(){
  for(let i=0;i<100;i++){
    try{const r=await fetch(ORIGIN);if(r.ok)return;}catch{}
    await sleep(250);
  }
  throw Error("UX audit preview did not start");
}
async function ready(page){
  await page.goto(ORIGIN,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#data-status")?.dataset.state==="ready",
    null,{timeout:90000});
}
async function auditAxe(page,label){
  const res=await new AxeBuilder({page})
    .withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
  const issues=res.violations.map(v=>({
    rule:v.id,impact:v.impact,description:v.help,
    affected:v.nodes.slice(0,5).map(x=>x.target.join(" "))
  }));
  console.log("UX_A11Y_"+label+"="+JSON.stringify({
    passes:res.passes.length,violations:issues
  }));
  assert.deepEqual(issues,[],label+" has automated WCAG A/AA violations");
}
async function dimensions(page,label){
  const v=await page.evaluate(()=>({
    viewport:document.documentElement.clientWidth,
    doc:document.documentElement.scrollWidth,
    body:document.body.scrollWidth,
    map:document.getElementById("map").getBoundingClientRect().width,
    primaryButton:document.getElementById("screen-btn").getBoundingClientRect().height,
    controlWidth:document.querySelector(".control-panel").getBoundingClientRect().width,
    resultsWidth:document.querySelector(".results-panel").getBoundingClientRect().width
  }));
  console.log("UX_LAYOUT_"+label+"="+JSON.stringify(v));
  assert.ok(v.doc<=v.viewport+1,label+": page has horizontal overflow");
  assert.ok(v.body<=v.viewport+1,label+": body has horizontal overflow");
  assert.ok(v.primaryButton>=43,label+": screening tap target undersized");
  assert.ok(v.controlWidth<=v.viewport+1&&v.resultsWidth<=v.viewport+1);
}
let browser;
try{
  await wait();
  browser=await chromium.launch({headless:true,args:[
    "--enable-webgl","--use-gl=angle","--use-angle=swiftshader","--disable-dev-shm-usage"]});
  await mkdir("petroscreen-ng/artifacts_stage19",{recursive:true});
  const desktopContext=await browser.newContext({viewport:{width:1440,height:900}});
  const desktop=await desktopContext.newPage();
  await ready(desktop);
  assert.equal(await desktop.locator("#facility-options").getAttribute("open"),null);
  assert.equal(await desktop.locator("#secondary-tools").getAttribute("open"),null);
  assert.equal(await desktop.locator("#view-findings").isVisible(),false);
  await desktop.screenshot({path:"petroscreen-ng/artifacts_stage19/desktop-first-visit.png"});
  await desktop.keyboard.press("Tab");
  assert.equal(await desktop.locator(".skip-link").evaluate(el=>document.activeElement===el),true,
    "Skip navigation must be keyboard-first");
  await dimensions(desktop,"DESKTOP_FIRST");
  await auditAxe(desktop,"DESKTOP_FIRST");
  await desktop.locator("#facility-options summary").click();
  assert.equal(await desktop.locator("#facility-type").isVisible(),true);
  await desktop.locator("#facility-options summary").click();
  await desktop.locator("#secondary-tools summary").click();
  assert.equal(await desktop.locator("#verify-package-btn").isVisible(),true);
  await desktop.locator("#secondary-tools summary").click();
  for(const width of [1024,768,390,375]){
    const context=await browser.newContext({viewport:{width,height:width<=390?812:850}});
    const page=await context.newPage();
    await ready(page);
    assert.equal(await page.locator("#secondary-tools").getAttribute("open"),null);
    assert.equal(await page.locator("#facility-options").getAttribute("open"),null);
    assert.equal(await page.locator("#view-findings").isVisible(),false);
    await dimensions(page,"WIDTH_"+width);
    if(width===375){
      await page.screenshot({path:"petroscreen-ng/artifacts_stage19/mobile-first-visit.png"});
      const firstFold=await page.locator("#screen-btn").boundingBox();
      assert.ok(firstFold && firstFold.y+firstFold.height<=812,
        "Mobile first visit must show the primary Run screening action without scrolling");
      await auditAxe(page,"MOBILE_FIRST");
      assert.equal(await page.locator("#map-continue").isVisible(),false);
      await page.locator("#jump-to-map").click();
      await page.waitForTimeout(550);
      const mapBounds=await page.locator("#map").boundingBox();
      assert.ok(mapBounds && mapBounds.y < 812 && mapBounds.y+mapBounds.height>0,
        "Map shortcut must reveal the map on mobile");
      const m=await (await fetch(ORIGIN+"data/manifest.json")).json();
      const delta=m.state_sources.find(x=>x.state==="Delta");
      assert.ok(delta?.qa_example_lon_lat);
      await page.locator("#longitude").fill(String(delta.qa_example_lon_lat[0]));
      await page.locator("#latitude").fill(String(delta.qa_example_lon_lat[1]));
      await page.locator("#screen-btn").click();
      await page.waitForFunction(()=>{
        const t=document.querySelector("#form-feedback")?.textContent||"";
        return /Screening completed|Screening failed/.test(t);
      },null,{timeout:120000});
      assert.match(await page.locator("#form-feedback").textContent(),/Screening completed/);
      assert.equal(await page.locator("#view-findings").isVisible(),true);
      assert.match(await page.locator("#view-findings").textContent(),/Delta/);
      await page.locator("#view-findings").click();
      assert.equal(await page.locator("#findings-title").evaluate(
        el=>document.activeElement===el),true);
      assert.equal(await page.locator("#results").isVisible(),true);
      assert.equal(await page.locator("#export-options").getAttribute("open"),null);
      await dimensions(page,"MOBILE_REPORT");
      await page.screenshot({path:"petroscreen-ng/artifacts_stage19/mobile-findings.png"});
      await auditAxe(page,"MOBILE_RESULTS");
      await page.locator("#advanced-results > summary").click();
      await page.locator("#export-options summary").click();
      assert.equal(await page.locator("#download-data-json").isVisible(),true);
      assert.equal(await page.locator("#reopen-case").isVisible(),true);
      await page.locator("#export-options summary").click();
      assert.equal(await page.locator("#open-comparison").isEnabled(),false,
        "Comparison opens only after a candidate has been added");
      await page.locator("#add-candidate").click();
      await page.locator("#open-comparison").click();
      assert.equal(await page.locator("#comparison-dialog").isVisible(),true);
      await auditAxe(page,"MOBILE_COMPARISON");
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#comparison-dialog").isVisible(),false);
    }
    await context.close();
  }
  await desktopContext.close();
  console.log("STAGE19_RESPONSIVE_KEYBOARD_A11Y_QA=PASS");
}finally{
  await browser?.close();
  server.kill("SIGTERM");
}
