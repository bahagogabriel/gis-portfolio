/** Actual nine-state browser QA: one independently checked site per state.
 * Every run requires fetching native state-owned rasters. No overlapping state
 * source TIFFs are ever loaded/combined in one calculation.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir,readFile,writeFile} from "node:fs/promises";
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
  await mkdir("petroscreen-ng/artifacts_nine_state",{recursive:true});
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
    await page.locator("#facility-type").selectOption("not_specified");
    await page.locator("#project-stage").selectOption("not_specified");
    await page.locator("#project-reference").fill("");
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
    assert.match(await page.locator("#interpretation").textContent(),/ESA WorldCover 2021/);
    assert.match(await page.locator("#interpretation").textContent(),/not a flood-risk/);
    const receptorRows=page.locator("#receptor-summary .receptor-item");
    assert.equal(await receptorRows.count(),4,"All four ESA landscape indicator classes required");
    const text=await page.locator("#receptor-summary").textContent();
    assert.match(text,/Mapped permanent water/);
    assert.match(text,/Mapped herbaceous wetland/);
    assert.match(text,/Mapped mangroves/);
    assert.match(text,/Mapped built-up/);
    assert.match(await page.locator(".receptors").textContent(),/not confirmed absent/i);
    // Every state has a complete downloadable provenance record. The
    // field verification defaults must never imply field observation.
    const jsonPending=page.waitForEvent("download",{timeout:90000});
    await page.locator("#download-data-json").click();
    const jsonDownload=await jsonPending;
    assert.equal(jsonDownload.suggestedFilename(),
      "PetroScreenNG_"+entry.slug+"_ScreeningCase.json");
    const jsonPath="petroscreen-ng/artifacts_nine_state/"+entry.slug+"_case.json";
    await jsonDownload.saveAs(jsonPath);
    const exported=JSON.parse(await readFile(jsonPath,"utf8"));
    assert.equal(exported.site.state,entry.state);
    assert.equal(exported.source_provenance.source_file_sha256.length,
      entry.source_files.length);
    assert.ok(exported.field_verification.checklist.every(c=>c.status==="not_checked"),
      "Field statuses must reset between separate site screenings");
    assert.equal(exported.measurements.mapped_landscape_proximity_2021.indicators.length,4);
    assert.equal(exported.petroleum_scope.scope_status,"UNVERIFIED_DESKTOP_SCOPING_PROMPTS");
    assert.equal(exported.petroleum_scope.mapped_asset_locations_used,false);
    assert.equal(exported.evidence_review.review.field_tasks.not_checked,7);
    assert.equal(exported.evidence_review.review.no_field_authentication,true);
    assert.match(await page.locator("#review-summary").textContent(),/7 of 7 field checks not checked/);
    assert.match(await page.locator("#review-flags").textContent(),/current field and regulatory review not established/);
    if(entry.state==="Delta"){
      await page.locator("#facility-type").selectOption("pipeline");
      await page.locator("#project-stage").selectOption("planning");
      await page.locator("#project-reference").fill("Test Corridor");
      assert.match(await page.locator("#scope-summary").textContent(),/Pipeline \/ flowline/);
      assert.match(await page.locator("#scope-tasks").textContent(),/Crossing and alignment survey/);
      assert.match(await page.locator("#scope-tasks").textContent(),/WorldCover 2021/);
      const planPending=page.waitForEvent("download",{timeout:90000});
      await page.locator("#download-scope-csv").click();
      const planDownload=await planPending;
      assert.equal(planDownload.suggestedFilename(),"PetroScreenNG_Delta_PetroleumEvidencePlan.csv");
      const planPath="petroscreen-ng/artifacts_nine_state/Delta_petroleum_scope.csv";
      await planDownload.saveAs(planPath);
      const planText=await readFile(planPath,"utf8");
      assert.match(planText,/pipe_crossings/);
      assert.match(planText,/Test Corridor/);
      assert.match(planText,/not_reviewed/);
      await page.locator("#field-record summary").click();
      assert.equal(await page.locator("#field-record").getAttribute("open"),"");
      await page.locator('[data-field-task="surface_water"]').selectOption("field_observed");
      await page.locator("#field-observer").fill("Field Team");
      await page.locator("#field-notes").fill("Needs tidal check");
      assert.match(await page.locator("#review-summary").textContent(),
        /6 of 7 field checks not checked/);
      const evidencePending=page.waitForEvent("download",{timeout:90000});
      await page.locator("#download-evidence-csv").click();
      const evidenceDownload=await evidencePending;
      assert.equal(evidenceDownload.suggestedFilename(),
        "PetroScreenNG_Delta_EvidenceRegister.csv");
      const evidencePath="petroscreen-ng/artifacts_nine_state/Delta_evidence_register.csv";
      await evidenceDownload.saveAs(evidencePath);
      const evidenceText=await readFile(evidencePath,"utf8");
      assert.match(evidenceText,/historical_1984_2024/);
      assert.match(evidenceText,/user_reported_field_record/);
      assert.match(evidenceText,/field_observed/);
      assert.match(evidenceText,/not_reviewed/);
      const fieldPending=page.waitForEvent("download",{timeout:90000});
      await page.locator("#download-field-csv").click();
      const fieldDownload=await fieldPending;
      assert.equal(fieldDownload.suggestedFilename(),
        "PetroScreenNG_Delta_FieldChecklist.csv");
      const checklistPath="petroscreen-ng/artifacts_nine_state/Delta_checklist.csv";
      await fieldDownload.saveAs(checklistPath);
      const fieldText=await readFile(checklistPath,"utf8");
      assert.match(fieldText,/field_observed/);
      assert.match(fieldText,/Field Team/);
      const csvPending=page.waitForEvent("download",{timeout:90000});
      await page.locator("#download-data-csv").click();
      const csvDownload=await csvPending;
      assert.equal(csvDownload.suggestedFilename(),
        "PetroScreenNG_Delta_ScreeningData.csv");
      const csvPath="petroscreen-ng/artifacts_nine_state/Delta_data.csv";
      await csvDownload.saveAs(csvPath);
      assert.match(await readFile(csvPath,"utf8"),/nearest_mapped_pixel_centre/);
      const geoPending=page.waitForEvent("download",{timeout:90000});
      await page.locator("#download-site-geojson").click();
      const geoDownload=await geoPending;
      assert.equal(geoDownload.suggestedFilename(),"PetroScreenNG_Delta_Site_Buffer.geojson");
      const geoPath="petroscreen-ng/artifacts_nine_state/Delta_site_buffer.geojson";
      await geoDownload.saveAs(geoPath);
      const geometry=JSON.parse(await readFile(geoPath,"utf8"));
      assert.deepEqual(geometry.features.map(x=>x.geometry.type),["Point","Polygon"]);
      assert.deepEqual(geometry.features[0].geometry.coordinates,[lon,lat]);
      assert.equal(geometry.features[1].properties.radius_km,1);
      const reviewedPending=page.waitForEvent("download",{timeout:90000});
      await page.locator("#download-data-json").click();
      const reviewedDownload=await reviewedPending;
      await reviewedDownload.saveAs("petroscreen-ng/artifacts_nine_state/Delta_reviewed_case.json");
    }
    if(entry.state==="Rivers" || entry.state==="Delta"){
      const pending=page.waitForEvent("download",{timeout:90000});
      await page.locator("#download-pdf").click();
      const dl=await pending;
      assert.equal(dl.suggestedFilename(),
        "PetroScreenNG_"+entry.state+"_Preliminary_Screening.pdf");
      await dl.saveAs("petroscreen-ng/artifacts_nine_state/"+entry.state+"_review.pdf");
      // Stage 14 end-to-end: ZIP contains the same real mapped PDF, JSON,
      // GIS context, CSV registers and unsigned integrity manifest.
      const packagePending=page.waitForEvent("download",{timeout:90000});
      await page.locator("#download-case-bundle").click();
      const packageDownload=await packagePending;
      assert.equal(packageDownload.suggestedFilename(),
        "PetroScreenNG_"+entry.state+"_CasePackage.zip");
      await packageDownload.saveAs("petroscreen-ng/artifacts_nine_state/"+
        entry.state+"_case_bundle.zip");
      assert.match(await page.locator("#form-feedback").textContent(),
        /Complete ZIP case package downloaded locally/);
      // Stage16: only independently screened, same-radius sites enter comparison.
      assert.equal(await page.locator("#add-candidate").isEnabled(),true);
      await page.locator("#add-candidate").click();
      assert.match(await page.locator("#comparison-status").textContent(),
        new RegExp("Added "+entry.state+" site to comparison"));
      assert.equal(await page.locator("#add-candidate").isEnabled(),false);
      assert.match(await page.locator("#add-candidate").textContent(),/Already added/);

    }
  }
  // Stage16 compares live, source-verified sites without field observations,
  // project names, subjective scores, or mixed buffer radii.
  assert.match(await page.locator("#open-comparison").textContent(),/\(2\)/);
  await page.locator("#open-comparison").click();
  assert.equal(await page.locator("#comparison-dialog").isVisible(),true);
  assert.equal(await page.locator(".comparison-data-table thead th").count(),4);
  const tableBody=await page.locator(".comparison-data-table tbody").textContent();
  assert.match(tableBody,/ESA WorldCover 2021/);
  assert.match(tableBody,/JRC GSW 1984-2024/);
  assert.match(tableBody,/Source raster reference/);
  assert.match(tableBody,/Delta/);
  assert.match(tableBody,/Rivers/);
  assert.doesNotMatch(tableBody,/Test Corridor|Field Team|Needs tidal check/);
  const comparePending=page.waitForEvent("download",{timeout:90000});
  await page.locator("#download-comparison-csv").click();
  const compareDownload=await comparePending;
  assert.equal(compareDownload.suggestedFilename(),"PetroScreenNG_SiteComparison_1km.csv");
  const comparePath="petroscreen-ng/artifacts_nine_state/Stage16_TwoSites.csv";
  await compareDownload.saveAs(comparePath);
  const compareCsv=await readFile(comparePath,"utf8");
  assert.match(compareCsv,/Candidate A/);
  assert.match(compareCsv,/Delta/);
  assert.match(compareCsv,/Rivers/);
  assert.match(compareCsv,/Source raster reference/);
  assert.doesNotMatch(compareCsv,/Needs tidal check|Field Team|Test Corridor/);
  assert.doesNotMatch(compareCsv,/risk_score|overall suitability score/i);
  await page.locator("#close-comparison").click();
  // Stage 15 uses a dedicated independent ZIP reader: no screening is
  // needed to inspect files, and the user's ZIP must never go to the server.
  await page.locator("#verify-zip-file").setInputFiles(
    "petroscreen-ng/artifacts_nine_state/Delta_case_bundle.zip");
  await page.locator("#verify-package-btn").click();
  await page.waitForFunction(()=>{
    const t=document.querySelector("#verify-package-status")?.textContent||"";
    return /verification FAILED|integrity checks PASSED/.test(t);
  },null,{timeout:60000});
  assert.match(await page.locator("#verify-package-status").textContent(),/integrity checks PASSED/);
  assert.match(await page.locator("#verify-package-details").textContent(),
    /match the currently published state manifest/);
  const receiptPending=page.waitForEvent("download",{timeout:90000});
  await page.locator("#download-verification-receipt").click();
  const receiptDownload=await receiptPending;
  assert.equal(receiptDownload.suggestedFilename(),"PetroScreenNG_VerificationReceipt.json");
  const receiptPath="petroscreen-ng/artifacts_nine_state/Delta_verification_receipt.json";
  await receiptDownload.saveAs(receiptPath);
  const receipt=JSON.parse(await readFile(receiptPath,"utf8"));
  assert.equal(receipt.schema,"PetroScreenNG/LocalVerificationReceipt/1.0");
  assert.equal(receipt.source_reference_status,"matches_current_manifest");
  assert.equal(receipt.authenticated_author_or_fieldwork,false);
  assert.equal(receipt.scientific_validation,"not_performed");
  assert.match(receipt.archive_sha256,/^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(receipt).includes("Needs tidal check"),false);
  // Corruption test checks that the browser rejects altered PDF bytes even
  // when the original valid ZIP has already passed independent audit.
  const corrupted=Buffer.from(await readFile(
    "petroscreen-ng/artifacts_nine_state/Delta_case_bundle.zip"));
  const pdfOffset=corrupted.indexOf(Buffer.from("%PDF-"));
  assert.ok(pdfOffset>=0,"real generated PDF bytes must be inside ZIP");
  corrupted[pdfOffset+50]^=1;
  const tamperedPath="petroscreen-ng/artifacts_nine_state/Delta_tampered_test_only.zip";
  await writeFile(tamperedPath,corrupted);
  await page.locator("#verify-zip-file").setInputFiles(tamperedPath);
  await page.locator("#verify-package-btn").click();
  await page.waitForFunction(()=>/verification FAILED/.test(
    document.querySelector("#verify-package-status")?.textContent||""),
    null,{timeout:60000});
  assert.match(await page.locator("#verify-package-status").textContent(),/CRC mismatch/);
  assert.equal(await page.locator("#download-verification-receipt").isVisible(),false);
  // Reopen a saved Delta field record after switching to other regions.
  // The app must rerun current ESA/JRC calculations before restoring notes.
  await page.locator("#case-file").setInputFiles(
    "petroscreen-ng/artifacts_nine_state/Delta_reviewed_case.json");
  await page.waitForFunction(()=>{
    const t=document.querySelector("#case-import-status")?.textContent||"";
    return /Reopened case|NOT restored|not loaded/.test(t);
  },null,{timeout:120000});
  assert.match(await page.locator("#case-import-status").textContent(),/Reopened case:/);
  assert.equal(Number(await page.locator("#longitude").inputValue()),
    manifest.state_sources.find(x=>x.state==="Delta").qa_example_lon_lat[0]);
  assert.equal(await page.locator('[data-field-task="surface_water"]').inputValue(),"field_observed");
  assert.equal(await page.locator("#field-observer").inputValue(),"Field Team");
  assert.equal(await page.locator("#field-notes").inputValue(),"Needs tidal check");
  assert.equal(await page.locator("#facility-type").inputValue(),"pipeline");
  assert.equal(await page.locator("#project-stage").inputValue(),"planning");
  assert.equal(await page.locator("#project-reference").inputValue(),"Test Corridor");
  assert.match(await page.locator("#scope-tasks").textContent(),/Crossing and alignment survey/);
  assert.match(await page.locator("#result-subtitle").textContent(),/Delta/);
  // The imported metadata is not treated as a field verification certificate.
  assert.match(await page.locator("#case-import-status").textContent(),/unverified user entries/);
  assert.match(await page.locator("#review-summary").textContent(),/6 of 7 field checks not checked/);
  // Additional real browser-source coverage checks for 3 km and 5 km at
  // two contrasting Niger Delta test sites; 9-state 1 km already completed.
  for(const state of ["Delta","Rivers"]){
    const entry=manifest.state_sources.find(s=>s.state===state);
    await page.locator("#longitude").fill(String(entry.qa_example_lon_lat[0]));
    await page.locator("#latitude").fill(String(entry.qa_example_lon_lat[1]));
    for(const radius of [3,5]){
      await page.locator('input[name="radius"][value="'+radius+'"]').check();
      await page.locator("#screen-btn").click();
      await page.waitForFunction(()=>{
        const t=document.querySelector("#form-feedback")?.textContent||"";
        return /Screening completed|Screening failed/.test(t);
      },null,{timeout:120000});
      assert.match(await page.locator("#form-feedback").textContent(),/Screening completed/,
        state+" real "+radius+" km QA");
      const cov=parseFloat(await page.locator("#coverage-value").textContent());
      assert.ok(Number.isFinite(cov)&&cov>=0&&cov<=100,
        "Rasters must not report impossible valid coverage");
      assert.match(await page.locator("#review-summary").textContent(),/field checks not checked/);
      assert.match(await page.locator("#result-subtitle").textContent(),
        new RegExp(radius+" km radius"));
      assert.equal(await page.locator("#add-candidate").isEnabled(),false,
        "Changed radius must be rejected while 1 km candidates remain");
      assert.match(await page.locator("#add-candidate").textContent(),/Change radius/);
    }
  }

  // Clear comparison without modifying the last screening, source rasters or notes.
  await page.locator("#open-comparison").click();
  assert.equal(await page.locator("#clear-comparison").isEnabled(),true);
  await page.locator("#clear-comparison").click();
  assert.equal(await page.locator("#download-comparison-csv").isEnabled(),false);
  await page.locator("#close-comparison").click();
  assert.match(await page.locator("#open-comparison").textContent(),/\(0\)/);
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
