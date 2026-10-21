/** Stage 22: actual browser UX gate for compact nested legend, map extent
 * navigation and preservation of original numeric screening evidence.
 * Uses source-hash verified regional TIFFs, with no environmental scoring.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir} from "node:fs/promises";
import {chromium} from "playwright";
import AxeBuilder from "@axe-core/playwright";
const ORIGIN="http://127.0.0.1:4192/";
const server=spawn(process.execPath,["node_modules/vite/bin/vite.js","preview",
  "--host","127.0.0.1","--port","4192","--strictPort"],{
    cwd:"petroscreen-ng/web",stdio:"pipe"});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function readyServer(){
  for(let n=0;n<100;n++){
    try{if((await fetch(ORIGIN)).ok)return;}catch{}
    await wait(250);
  }
  throw Error("Stage22 preview server did not start");
}
let browser;
try{
  await readyServer();
  browser=await chromium.launch({headless:true,args:[
    "--enable-webgl","--use-gl=angle","--use-angle=swiftshader",
    "--disable-dev-shm-usage"]});
  const manifest=await (await fetch(ORIGIN+"data/manifest.json")).json();
  const delta=manifest.state_sources.find(s=>s.state==="Delta");
  assert.ok(delta?.qa_example_lon_lat,"Verified Delta sample site missing");
  await mkdir("petroscreen-ng/artifacts_stage22",{recursive:true});
  for(const {width,height} of [{width:375,height:812},{width:1440,height:900}]){
    const context=await browser.newContext({viewport:{width,height}});
    const page=await context.newPage();
    const tiffRequests=[],errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    page.on("request",r=>{if(/\.tif(?:\?|$)/i.test(r.url()))tiffRequests.push(r.url());});
    await page.goto(ORIGIN,{waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>
      document.querySelector("#data-status")?.dataset.state==="ready" &&
      !document.querySelector("#map-fit-pilot")?.disabled,
      null,{timeout:90000});
    assert.equal(await page.locator("#map-legend").getAttribute("open"),null);
    await page.locator("#map-legend > summary").click();
    assert.equal(await page.locator("#map-color-options").getAttribute("open"),null);
    assert.equal(await page.locator("#map-view-options").getAttribute("open"),null);
    assert.equal(await page.locator("#map-source-info").getAttribute("open"),null);
    assert.equal(await page.locator("#map-legend-native").isVisible(),false);
    assert.match(await page.locator("#map-legend-status").textContent(),
      /Generalized regional overview/);
    const legendBox=await page.locator("#map-legend").boundingBox();
    assert.ok(legendBox.height<=330,
      "First expanded map key should occupy under 330 CSS pixels: "+legendBox.height);
    const mapHeight=(await page.locator(".map-panel").boundingBox()).height;
    assert.ok(legendBox.height<=mapHeight,
      "Map key must be internally scrollable, not taller than entire map");
    assert.equal(tiffRequests.length,0);
    await page.locator("#map-fit-pilot").click();
    assert.equal(tiffRequests.length,0,
      "Pilot map navigation must not download scientific rasters");
    assert.equal(await page.locator("#longitude").inputValue(),"");
    assert.equal(await page.locator("#latitude").inputValue(),"");
    await page.locator("#map-color-options > summary").click();
    assert.equal(await page.locator("#map-color-unavailable").isVisible(),true);
    assert.equal(await page.locator("#map-legend-native").isVisible(),false);
    assert.equal(await page.locator("#map-legend-classes li").count(),11);
    await page.locator("#map-color-options > summary").click();
    await page.locator("#map-view-options > summary").click();
    assert.equal(await page.locator("#lightweight-map").isChecked(),width===375);
    await page.locator("#map-view-options > summary").click();
    await page.locator("#map-source-info > summary").click();
    assert.match(await page.locator("#map-source-info").textContent(),/JRC observations/);
    await page.locator("#map-source-info > summary").click();
    const coords=delta.qa_example_lon_lat;
    await page.locator("#longitude").fill(String(coords[0]));
    await page.locator("#latitude").fill(String(coords[1]));
    await page.locator("#screen-btn").click();
    await page.waitForFunction(()=>
      /Screening completed|Screening failed/.test(
        document.querySelector("#form-feedback")?.textContent||""),
      null,{timeout:120000});
    assert.match(await page.locator("#form-feedback").textContent(),/Screening completed/);
    await page.waitForFunction(()=>
      document.querySelector("#map")?.dataset.detailReady==="true",
      null,{timeout:90000});
    const measurements=await page.evaluate(()=>({
      subtitle:document.querySelector("#result-subtitle")?.textContent,
      area:document.querySelector("#area-value")?.textContent,
      coverage:document.querySelector("#coverage-value")?.textContent,
      land:document.querySelector("#land-cover")?.textContent,
      water:document.querySelector("#water-summary")?.textContent,
      context:document.querySelector("#receptor-summary")?.textContent,
      notes:document.querySelector("#warnings")?.textContent,
      lon:document.querySelector("#longitude")?.value,
      lat:document.querySelector("#latitude")?.value
    }));
    assert.equal(await page.locator("#map-color-unavailable").isVisible(),false);
    await page.locator("#map-color-options > summary").click();
    assert.equal(await page.locator("#map-legend-native").isVisible(),true);
    assert.equal(await page.locator(".legend-class-item").count(),11);
    await page.locator("#map-color-options > summary").click();
    const firstTiffs=tiffRequests.length;
    assert.equal(firstTiffs,delta.source_files.length);
    await page.locator("#map-fit-pilot").click();
    const after=await page.evaluate(()=>({
      subtitle:document.querySelector("#result-subtitle")?.textContent,
      area:document.querySelector("#area-value")?.textContent,
      coverage:document.querySelector("#coverage-value")?.textContent,
      land:document.querySelector("#land-cover")?.textContent,
      water:document.querySelector("#water-summary")?.textContent,
      context:document.querySelector("#receptor-summary")?.textContent,
      notes:document.querySelector("#warnings")?.textContent,
      lon:document.querySelector("#longitude")?.value,
      lat:document.querySelector("#latitude")?.value
    }));
    assert.deepEqual(after,measurements,
      "Map view reset must leave active site and all measured evidence unchanged");
    assert.equal(tiffRequests.length,firstTiffs,
      "Map view reset must not trigger any additional TIFF downloads");
    assert.equal(await page.locator("#results").isVisible(),true);
    const scan=await new AxeBuilder({page}).withTags([
      "wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
    assert.deepEqual(scan.violations.map(v=>({
      rule:v.id,target:v.nodes.slice(0,3).map(n=>n.target)})),[],
      "Compact map controls must pass automated WCAG 2.1 A/AA rules");
    await page.screenshot({path:"petroscreen-ng/artifacts_stage22/"+
      (width===375?"mobile-compact-map.png":"desktop-compact-map.png")});
    assert.deepEqual(errors,[],"No JavaScript runtime failures");
    console.log("STAGE22_COMPACT_MAP_"+width+"="+JSON.stringify({
      legendInitialHeight:Math.round(legendBox.height),
      mapHeight:Math.round(mapHeight),nativeClassCount:11,
      sameStateNewTiffRequests:0,measurementsUnchanged:true,
      axeViolations:0
    }));
    await context.close();
  }
  console.log("STAGE22_MAP_NAVIGATION_AND_SCREENING_INTEGRITY=PASS");
}finally{
  await browser?.close();
  server.kill("SIGTERM");
}
