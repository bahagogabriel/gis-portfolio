/** Real Chromium smoke QA: load static site, calculate and save user PDF. */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir} from "node:fs/promises";
import {chromium} from "playwright";

const OUTPUT="petroscreen-ng/artifacts_web";
const endpoint="http://127.0.0.1:4173/";
const server=spawn(process.execPath,["node_modules/vite/bin/vite.js","preview",
  "--host","127.0.0.1","--port","4173","--strictPort"],
  {cwd:"petroscreen-ng/web",stdio:["ignore","pipe","pipe"]});
let browser;
async function waitForServer(){
  for(let i=0;i<80;i++){
    try{const r=await fetch(endpoint);if(r.ok)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  throw new Error("Local site preview server did not become available.");
}
try {
  await waitForServer();
  await mkdir(OUTPUT,{recursive:true});
  browser=await chromium.launch({headless:true,args:[
    "--enable-webgl","--use-gl=angle","--use-angle=swiftshader",
    "--disable-dev-shm-usage"
  ]});
  const page=await browser.newPage({viewport:{width:1440,height:900},
    deviceScaleFactor:1,acceptDownloads:true});
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("console",message=>{if(message.type()==="error")errors.push("console: "+message.text());});
  await page.goto(endpoint,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#map")?.dataset.overviewReady==="true",null,{timeout:14000}).catch(async error=>{
    await page.screenshot({path:OUTPUT+"/map_debug_desktop.png",fullPage:true});
    console.error("Map readiness failure",{
      text:await page.locator("#form-feedback").textContent(),
      mapReady:await page.locator("#map").getAttribute("data-overview-ready"),
      errors
    });
    throw error;
  });
  await page.waitForFunction(()=>document.querySelector("#form-feedback")?.textContent.includes(
    "Verified satellite data loaded") ||
    document.querySelector("#form-feedback")?.textContent.includes("could not be loaded"),
    {timeout:120000});
  let notice=await page.locator("#form-feedback").textContent();
  assert.match(notice,/Verified satellite data loaded/,notice);
  await page.locator("#longitude").fill("6");
  await page.locator("#latitude").fill("4.7286535");
  await page.locator("#screen-btn").click();
  await page.waitForFunction(()=>{
    const status=document.querySelector("#form-feedback").textContent;
    return status.includes("Screening completed") || status.includes("Screening failed");
  },{timeout:120000});
  notice=await page.locator("#form-feedback").textContent();
  assert.match(notice,/Screening completed/,notice);
  assert.equal(await page.locator("#results").isVisible(),true);
  assert.ok((await page.locator("#land-cover .bar-item").count())>=2);
  assert.equal(await page.locator("#water-summary div").count(),3);
  assert.match(await page.locator("#warnings").getAttribute("class"),/coverage-ok/);
  // The map camera should finish zooming to the selected 1-km buffer.
  await page.waitForTimeout(900);
  await page.screenshot({path:OUTPUT+"/petroscreen_desktop_screening.png",fullPage:true});
  const downloadPromise=page.waitForEvent("download",{timeout:60000});
  await page.locator("#download-pdf").click();
  const download=await downloadPromise;
  assert.match(download.suggestedFilename(),/PetroScreenNG.*\.pdf$/);
  await download.saveAs(OUTPUT+"/petroscreen_sample_report.pdf");

  const mobile=await browser.newPage({viewport:{width:390,height:844},
    deviceScaleFactor:1});
  mobile.on("pageerror",e=>errors.push(e.message));
  await mobile.goto(endpoint,{waitUntil:"domcontentloaded"});
  await mobile.waitForFunction(()=>document.querySelector("#map")?.dataset.overviewReady==="true",null,{timeout:14000});
  await mobile.waitForFunction(()=>document.querySelector("#form-feedback")?.textContent.includes(
    "Verified satellite data loaded"),{timeout:120000});
  await mobile.screenshot({path:OUTPUT+"/petroscreen_mobile_initial.png",fullPage:true});
  const horizontalOverflow=await mobile.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+3);
  assert.equal(horizontalOverflow,false,"Unexpected mobile horizontal overflow");
  assert.deepEqual(errors,[],"Uncaught browser errors");
  console.log(JSON.stringify({status:"PASS",
    desktop:"real Bayelsa 1km screening completed",
    pdf:download.suggestedFilename(),
    land_cover_rows:await page.locator("#land-cover .bar-item").count(),
    mobile:"layout loaded without horizontal overflow",
    screenshots:["petroscreen_desktop_screening.png","petroscreen_mobile_initial.png"]
  },null,2));
}finally{
  if(browser)await browser.close();
  server.kill("SIGTERM");
}
