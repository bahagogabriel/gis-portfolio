import test from "node:test";
import assert from "node:assert/strict";
import {createHash,webcrypto} from "node:crypto";
import {buildStoredZip,makeCaseBundle,BUNDLE_SCHEMA} from "../src/case_bundle.js";
import {createCaseFile} from "../src/exports.js";
import {buildEvidenceReview} from "../src/evidence_review.js";
import {circleGeometry} from "../src/engine.js";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
// All coordinates and "PDF" bytes here are SYNTHETIC TEST FIXTURES, not public evidence.
const fixture=(facility_type="not_specified")=>{
  const result={
    site_state:"Delta",location_wgs84:{longitude:5.5,latitude:5.1},
    radius_km:1,buffer_area_km2_approx:3.14159,
    coverage_status:"sufficient",warnings:[],method_limitations:[],
    land_cover_2021:{coverage:{whole_buffer_coverage_pct_approx:99},classes:[
      {code:10,class:"Tree cover",area_km2_approx:1,share_of_valid_classified_pct:100}]},
    surface_water_occurrence_1984_2024:{coverage:{whole_buffer_coverage_pct_approx:98},
      threshold_areas:[1,50,90].map(threshold_pct=>({
        threshold_pct,area_km2_approx:.02,share_of_valid_jrc_area_pct:1}))},
    mapped_context_2021:{indicators:[80,90,95,50].map(code=>({
      code,label:"Mapped "+code,status:"not_mapped_in_available_pixels",
      nearest_pixel_centre_m_approx:null,area_km2_approx:0}))},
    circle:circleGeometry(5.5,5.1,1)
  };
  const source_files=[{file:"SYNTHETIC_TEST_ONLY.tif",kind:"worldcover",sha256:"0".repeat(64)}];
  const manifest={states:["Delta"],state_sources:[{state:"Delta",source_files}]};
  const casefile=createCaseFile({result,manifest,
    facilityContext:{facility_type,project_stage:"planning",project_reference:"SYNTHETIC TEST"},
    fieldRecord:{notes:"Synthetic testing only"},generatedAt:"2026-10-21T00:00:00.000Z"});
  casefile.evidence_review=buildEvidenceReview(casefile);
  const pdf=new Uint8Array(6000);
  pdf.set(new TextEncoder().encode("%PDF-1.4\nFAKE UNIT TEST, NOT A REAL PDF\n"));
  return {result,casefile,pdf};
};
function storedEntries(zip){
  const view=new DataView(zip.buffer,zip.byteOffset,zip.byteLength);
  let p=0;const files=new Map();
  while(p<zip.length&&view.getUint32(p,true)===0x04034b50){
    const flags=view.getUint16(p+6,true),method=view.getUint16(p+8,true);
    assert.equal(flags,0x800);assert.equal(method,0);
    const length=view.getUint32(p+18,true),nameLen=view.getUint16(p+26,true);
    const extra=view.getUint16(p+28,true);
    const name=new TextDecoder().decode(zip.subarray(p+30,p+30+nameLen));
    const start=p+30+nameLen+extra;
    files.set(name,zip.subarray(start,start+length));
    p=start+length;
  }
  assert.equal(view.getUint32(p,true),0x02014b50);
  assert.equal(view.getUint32(zip.length-22,true),0x06054b50);
  return files;
}
test("ZIP32 protects filename traversal, duplicates and oversize files",()=>{
  assert.throws(()=>buildStoredZip([{name:"../abc.txt",data:"a"}]),/Unsafe/);
  assert.throws(()=>buildStoredZip([{name:"a.txt",data:"1"},{name:"a.txt",data:"2"}]),/Duplicate/);
  assert.throws(()=>buildStoredZip([{name:"large.bin",data:new Uint8Array(33*1024*1024)}]),/oversized/);
  const zip=buildStoredZip([{name:"hello.txt",data:"hello"}]);
  assert.equal(new TextDecoder().decode(storedEntries(zip).get("hello.txt")),"hello");
});
test("general site bundle contains 3-page report, seven evidence files and valid SHA256 manifest",async()=>{
  const f=fixture();const p=await makeCaseBundle({casefile:f.casefile,
    result:f.result,pdfBytes:f.pdf,pdfPageCount:3});
  assert.equal(p.filename,"PetroScreenNG_Delta_CasePackage.zip");
  assert.equal(p.manifest.schema,BUNDLE_SCHEMA);
  const parts=storedEntries(p.data);
  assert.equal(parts.size,8); // seven payloads + manifest
  assert.equal(p.manifest.files.length,7);
  assert.ok(!parts.has("PetroleumEvidencePlan.csv"));
  assert.equal(p.manifest.pdf_pages,3);
  for(const entry of p.manifest.files){
    const payload=parts.get(entry.name);
    assert.ok(payload,entry.name);
    assert.equal(payload.length,entry.bytes);
    assert.equal(createHash("sha256").update(payload).digest("hex"),entry.sha256);
  }
  assert.match(new TextDecoder().decode(parts.get("README.txt")),/not.*survey/i);
  assert.equal(JSON.parse(new TextDecoder().decode(parts.get("MANIFEST.json"))).schema,BUNDLE_SCHEMA);
});
test("petroleum bundle includes facility scope and four-page PDF; source hashes remain separate",async()=>{
  const f=fixture("pipeline");const p=await makeCaseBundle({casefile:f.casefile,
    result:f.result,pdfBytes:f.pdf,pdfPageCount:4});
  const parts=storedEntries(p.data);
  assert.equal(parts.size,9);
  assert.match(new TextDecoder().decode(parts.get("PetroleumEvidencePlan.csv")),/pipeline/);
  assert.equal(p.manifest.pdf_pages,4);
  assert.equal(p.manifest.source_file_sha256[0].sha256,"0".repeat(64));
  assert.match(new TextDecoder().decode(parts.get("README.txt")),/not independently signed/);
});
test("mismatched site, missing real PDF and wrong page counts must abort",async()=>{
  const f=fixture(),pdf=f.pdf;
  await assert.rejects(()=>makeCaseBundle({casefile:f.casefile,result:{...f.result,radius_km:3},
    pdfBytes:pdf,pdfPageCount:3}),/matching/);
  await assert.rejects(()=>makeCaseBundle({casefile:f.casefile,result:f.result,
    pdfBytes:new Uint8Array([1,2,3]),pdfPageCount:3}),/valid mapped PDF/);
  await assert.rejects(()=>makeCaseBundle({casefile:f.casefile,result:f.result,
    pdfBytes:pdf,pdfPageCount:4}),/three-page/);
});
