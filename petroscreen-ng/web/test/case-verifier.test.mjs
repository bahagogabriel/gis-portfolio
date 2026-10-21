import test from "node:test";
import assert from "node:assert/strict";
import {createHash,webcrypto} from "node:crypto";
import {makeCaseBundle,buildStoredZip} from "../src/case_bundle.js";
import {verifyCasePackage,VERIFIER_SCHEMA} from "../src/case_verifier.js";
import {createCaseFile} from "../src/exports.js";
import {buildEvidenceReview} from "../src/evidence_review.js";
import {circleGeometry} from "../src/engine.js";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
// SYNTHETIC fixtures only. Not real petroleum sites or actual mapped evidence.
const sourceFiles=[{file:"SYNTHETIC_UNIT_FIXTURE.tif",kind:"worldcover",sha256:"a".repeat(64)}];
const sourceManifest={states:["Delta"],state_sources:[{state:"Delta",source_files:sourceFiles}]};
function fixture(facility="not_specified"){
 const result={site_state:"Delta",location_wgs84:{longitude:5.5,latitude:5.1},radius_km:1,
   buffer_area_km2_approx:3.14159,coverage_status:"sufficient",warnings:[],method_limitations:[],
   land_cover_2021:{coverage:{whole_buffer_coverage_pct_approx:99},classes:[
     {code:10,class:"Tree cover",area_km2_approx:2,share_of_valid_classified_pct:100}]},
   surface_water_occurrence_1984_2024:{coverage:{whole_buffer_coverage_pct_approx:98},
     threshold_areas:[1,50,90].map(threshold_pct=>({threshold_pct,area_km2_approx:0,
       share_of_valid_jrc_area_pct:0}))},
   mapped_context_2021:{indicators:[80,90,95,50].map(code=>({
     code,label:"Mapped "+code,status:"not_mapped_in_available_pixels",
     nearest_pixel_centre_m_approx:null,area_km2_approx:0}))},
   circle:circleGeometry(5.5,5.1,1)};
 const casefile=createCaseFile({result,manifest:sourceManifest,
   facilityContext:{facility_type:facility,project_stage:"planning",project_reference:"SYNTHETIC ONLY"},
   fieldRecord:{},generatedAt:"2026-10-21T00:00:00.000Z"});
 casefile.evidence_review=buildEvidenceReview(casefile);
 const pdf=new Uint8Array(6000);
 pdf.set(new TextEncoder().encode("%PDF-1.4\nSYNTHETIC PDF TEST FIXTURE\n"));
 return {casefile,result,pdf};
}
async function packageFor(facility="not_specified"){
 const f=fixture(facility);
 return makeCaseBundle({casefile:f.casefile,result:f.result,
   pdfBytes:f.pdf,pdfPageCount:facility==="not_specified"?3:4});
}
/** Minimal test-only local-header reader, independent from the Stage15 central-directory parser. */
function unpackStore(zip){
 const dv=new DataView(zip.buffer,zip.byteOffset,zip.byteLength);
 const out=[];let pos=0;
 while(pos+30<zip.length&&dv.getUint32(pos,true)===0x04034b50){
   const length=dv.getUint32(pos+18,true),nameLen=dv.getUint16(pos+26,true);
   const name=new TextDecoder().decode(zip.subarray(pos+30,pos+30+nameLen));
   const begin=pos+30+nameLen;
   out.push({name,data:new Uint8Array(zip.subarray(begin,begin+length))});
   pos=begin+length;
 }
 return out;
}
test("independent verifier checks real ZIP32 metadata, CRC, file SHA and manifest",async()=>{
 const p=await packageFor();
 const x=await verifyCasePackage(p.data,{sourceManifest});
 assert.equal(x.receipt.schema,VERIFIER_SCHEMA);
 assert.equal(x.summary.status,"internal_integrity_pass");
 assert.equal(x.summary.entry_count,8);
 assert.equal(x.summary.sha256_files,7);
 assert.equal(x.summary.pdf_pages_declared,3);
 assert.equal(x.summary.source_reference_status,"matches_current_manifest");
 assert.equal(x.receipt.authenticated_author_or_fieldwork,false);
 assert.equal(x.receipt.scientific_validation,"not_performed");
 assert.equal(x.receipt.archive_sha256,createHash("sha256").update(p.data).digest("hex"));
 assert.ok(!JSON.stringify(x.receipt).includes("5.5"),"Receipt must not include sensitive site coordinates");
});
test("petroleum appendix passes, while changed source references are clearly flagged",async()=>{
 const p=await packageFor("pipeline");
 const different={states:["Delta"],state_sources:[{state:"Delta",
   source_files:[{...sourceFiles[0],sha256:"b".repeat(64)}]}]};
 const v=await verifyCasePackage(p.data,{sourceManifest:different});
 assert.equal(v.summary.entry_count,9);
 assert.equal(v.summary.pdf_pages_declared,4);
 assert.equal(v.summary.source_reference_status,"differs_from_current_manifest");
 assert.equal((await verifyCasePackage(p.data)).summary.source_reference_status,"not_compared");
});
test("single changed PDF byte with old ZIP CRC is rejected",async()=>{
 const p=await packageFor();const arr=new Uint8Array(p.data);
 const utf8=new TextEncoder().encode("SYNTHETIC PDF TEST");
 let hit=-1;
 for(let i=0;i<arr.length-utf8.length;i++){
   if(utf8.every((v,j)=>arr[i+j]===v)){hit=i;break;}
 }
 assert.ok(hit>=0);arr[hit]^=1;
 await assert.rejects(()=>verifyCasePackage(arr,{sourceManifest}),/CRC mismatch/);
});
test("attacker-repacked PDF with fresh CRC but unchanged manifest SHA is rejected",async()=>{
 const p=await packageFor();
 const items=unpackStore(p.data);
 const pdf=items.find(x=>x.name==="Preliminary_Screening.pdf");
 pdf.data[100]^=1;
 const rezipped=buildStoredZip(items);
 await assert.rejects(()=>verifyCasePackage(rezipped,{sourceManifest}),/SHA-256 mismatch/);
});
test("ZIP with trailing bytes, missing entries, duplicate names or huge size is refused",async()=>{
 const p=await packageFor();
 const trailing=new Uint8Array(p.data.length+1);trailing.set(p.data);
 await assert.rejects(()=>verifyCasePackage(trailing),/ZIP end record/);
 const removed=unpackStore(p.data).filter(x=>x.name!=="FieldChecklist.csv");
 await assert.rejects(()=>verifyCasePackage(buildStoredZip(removed)),/required evidence|entry count/);
 const oversized=new Uint8Array(50*1024*1024+1);
 await assert.rejects(()=>verifyCasePackage(oversized),/oversized ZIP/);
});
test("unsigned self-consistent rewritten archives cannot prove authorship",async()=>{
 const p=await packageFor();
 const parts=unpackStore(p.data);
 const item=parts.find(x=>x.name==="README.txt");
 item.data=new TextEncoder().encode("An altered README, not field evidence\n");
 const manifestPart=parts.find(x=>x.name==="MANIFEST.json");
 const manifest=JSON.parse(new TextDecoder().decode(manifestPart.data));
 const entry=manifest.files.find(x=>x.name==="README.txt");
 entry.bytes=item.data.length;
 entry.sha256=createHash("sha256").update(item.data).digest("hex");
 manifestPart.data=new TextEncoder().encode(JSON.stringify(manifest)+"\n");
 const repacked=buildStoredZip(parts);
 const checked=await verifyCasePackage(repacked,{sourceManifest});
 assert.equal(checked.summary.status,"internal_integrity_pass");
 assert.match(checked.receipt.verification_scope,/rewritten unsigned manifest/);
 assert.equal(checked.receipt.authenticated_author_or_fieldwork,false);
});
