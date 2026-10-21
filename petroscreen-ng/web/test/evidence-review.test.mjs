import test from "node:test";
import assert from "node:assert/strict";
import {buildEvidenceReview,evidenceReviewCsv,EVIDENCE_REGISTER_SCHEMA} from "../src/evidence_review.js";
/* Synthetic TEST FIXTURE ONLY: never publish these values as environmental evidence. */
const fixture=()=>({
  schema:"PetroScreenNG/ScreeningCase/1.0",created_at_utc:"2026-10-21T00:00:00.000Z",
  site:{state:"Delta",longitude:5.5,latitude:5.2,radius_km:1},
  source_provenance:{source_file_sha256:[{name:"test-only.tif",sha256:"f".repeat(64),kind:"worldcover"}]},
  measurements:{
    land_cover_2021:{coverage:{whole_buffer_coverage_pct_approx:99},classes:[]},
    historical_surface_water_1984_2024:{coverage:{whole_buffer_coverage_pct_approx:98.5},threshold_areas:[]},
    mapped_landscape_proximity_2021:{indicators:[{code:80,label:"Mapped permanent water",status:"not_mapped_in_available_pixels",nearest_pixel_centre_m_approx:null}]}
  },
  qa:{warnings:[]},
  petroleum_scope:{facility_type:"not_specified",facility_label:"General environmental screening",tasks:[]},
  field_verification:{visit_date:"",observer:"",notes:"",
    checklist:["surface_water","wetland","mangrove","built_up","land_tenure","protected_status","existing_issues"].map(
      id=>({id,title:id,status:"not_checked"}))}
});
test("all field answers default to not checked; no site rating or field authentication",()=>{
  const record=buildEvidenceReview(fixture());
  assert.equal(record.schema,EVIDENCE_REGISTER_SCHEMA);
  assert.equal(record.review.field_tasks.total,7);
  assert.equal(record.review.field_tasks.not_checked,7);
  assert.equal(record.review.field_tasks.user_reported,0);
  assert.equal(record.review.no_field_authentication,true);
  assert.equal(record.review.no_regulatory_approval,true);
  assert.match(record.review.interpretation,/never a safety, risk/);
  assert.ok(record.records.some(x=>x.category==="mapped_2021"));
  assert.ok(record.records.some(x=>x.category==="historical_1984_2024"));
  assert.ok(record.records.some(x=>x.category==="user_declaration"));
  assert.ok(record.records.every(x=>x.limitations));
});
test("mapped absence does not become proven feature absence",()=>{
  const record=buildEvidenceReview(fixture());
  const mapped=record.records.find(x=>x.id==="mapped_80");
  assert.equal(mapped.status,"not_mapped_in_available_pixels");
  assert.match(mapped.limitations,/proof of absence/);
});
test("user-reported status and petroleum declaration are not independently verified",()=>{
  const a=fixture();
  a.field_verification.checklist[0].status="field_observed";
  a.field_verification.observer="Test person";
  a.petroleum_scope={facility_type:"pipeline",facility_label:"Pipeline",tasks:[
    {id:"pipe_crossings",title:"Crossings",prompt_basis:"User declaration",evidence_to_check:"Check real alignment"}
  ]};
  const review=buildEvidenceReview(a);
  assert.equal(review.review.field_tasks.user_reported,1);
  assert.equal(review.review.field_tasks.not_checked,6);
  assert.ok(review.review.unresolved_flags.includes("USER_REPORTED_FIELD_STATUS_WITHOUT_VISIT_DATE"));
  assert.ok(review.review.unresolved_flags.includes("DECLARED_PETROLEUM_ACTIVITY_NOT_INDEPENDENTLY_VERIFIED"));
  assert.equal(review.records.find(x=>x.id==="scope_pipe_crossings").status,"not_reviewed");
});
test("incomplete raster coverage and border alerts are review flags, never fabricated metrics",()=>{
  const a=fixture();
  a.measurements.land_cover_2021.coverage.whole_buffer_coverage_pct_approx=72.5;
  a.qa.warnings=["BUFFER_CROSSES_SUPPORTED_BOUNDARY: outside the verified source coverage is unknown."];
  const review=buildEvidenceReview(a);
  assert.ok(review.review.unresolved_flags.includes("ESA_2021_VALID_COVERAGE_INCOMPLETE"));
  assert.ok(review.review.unresolved_flags.includes("BUFFER_CROSSES_ADMINISTRATIVE_STUDY_BOUNDARY"));
  assert.equal(review.review.land_cover_valid_coverage_pct_approx,72.5);
  assert.equal(review.review.no_new_scientific_measurements,true);
});
test("CSV spreadsheet formula injection is neutralized in user-supplied fields",()=>{
  const a=fixture();
  a.field_verification.observer="=HYPERLINK(1)";
  a.petroleum_scope.facility_label="\t+MALICIOUS";
  const csv=evidenceReviewCsv(buildEvidenceReview(a));
  assert.match(csv,/'=HYPERLINK/);
  assert.match(csv,/'\t\+MALICIOUS/);
  assert.ok(csv.startsWith("\ufeff"));
});
test("malformed evidence and statuses are rejected",()=>{
  assert.throws(()=>buildEvidenceReview({}),/complete SHA-referenced/);
  const a=fixture();a.field_verification.checklist[0].status="certified_safe";
  assert.throws(()=>buildEvidenceReview(a),/Invalid field record status/);
});
