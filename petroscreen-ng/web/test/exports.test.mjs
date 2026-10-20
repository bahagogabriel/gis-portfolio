import test from "node:test";
import assert from "node:assert/strict";
import {CASE_SCHEMA,FIELD_TASKS,normalizeFieldRecord,createCaseFile,
  screeningCsv,fieldChecklistCsv} from "../src/exports.js";

const manifest={states:["Delta"],state_sources:[{state:"Delta",source_files:[
  {file:"regions/Delta/wc_N03E006.tif",sha256:"a".repeat(64),kind:"worldcover"},
  {file:"regions/Delta/occurrence.tif",sha256:"b".repeat(64),kind:"water"}
]}]};
const screening={
  site_state:"Delta",radius_km:5,buffer_area_km2_approx:78.53982,
  location_wgs84:{longitude:6.307695,latitude:5.689863},
  coverage_status:"sufficient",warnings:[],method_limitations:["No EIA approval"],
  land_cover_2021:{coverage:{whole_buffer_coverage_pct_approx:100},
    classes:[{code:10,class:"Tree cover",area_km2_approx:46,share_of_valid_classified_pct:58.7}]},
  surface_water_occurrence_1984_2024:{
    coverage:{whole_buffer_coverage_pct_approx:100},
    threshold_areas:[{threshold_pct:1,area_km2_approx:0.0191}]
  },
  mapped_context_2021:{indicators:[
    {code:80,label:"Mapped permanent water",status:"mapped_in_study_buffer",
      nearest_pixel_centre_m_approx:420.4,area_km2_approx:0.3},
    {code:90,label:"Mapped herbaceous wetland",status:"not_mapped_in_available_pixels",
      nearest_pixel_centre_m_approx:null,area_km2_approx:0},
  ]}
};
test("structured case includes verified sources and all unchecked default field tasks",()=>{
  const r=createCaseFile({result:screening,manifest,generatedAt:"2026-10-20T12:00:00Z"});
  assert.equal(r.schema,CASE_SCHEMA);
  assert.equal(r.site.longitude,6.307695);
  assert.equal(r.source_provenance.source_file_sha256.length,2);
  assert.equal(r.field_verification.checklist.length,FIELD_TASKS.length);
  assert.ok(r.field_verification.checklist.every(x=>x.status==="not_checked"));
  assert.match(r.scope,/not a regulatory EIA/);
  assert.match(r.privacy_notice,/coordinates/);
  const csv=screeningCsv(r);
  assert.match(csv,/nearest_mapped_pixel_centre/);
  assert.match(csv,/Mapped permanent water/);
  assert.match(csv,/0\.0191/);
  assert.match(csv,/historical_water/);
  assert.ok(csv.startsWith("\ufeff"));
  assert.match(csv,/"Mapped herbaceous wetland",,"metres"/);
  const checklist=fieldChecklistCsv(r);
  assert.match(checklist,/not_checked/);
  assert.equal(checklist.split("\r\n").filter(Boolean).length,8);
});
test("manual field notes never change satellite-provided measurements",()=>{
  const copy=structuredClone(screening);
  const r=createCaseFile({result:screening,manifest,
    fieldRecord:{visit_date:"2026-10-19",observer:"Inspector",notes:"Check tide",
      statuses:{surface_water:"field_observed",mangrove:"requires_follow_up"}}});
  assert.equal(r.field_verification.visit_date,"2026-10-19");
  assert.equal(r.field_verification.statuses.surface_water,"field_observed");
  assert.equal(r.field_verification.statuses.mangrove,"requires_follow_up");
  assert.deepEqual(screening,copy);
  assert.equal(r.measurements.land_cover_2021,screening.land_cover_2021);
});
test("unsafe spreadsheet formulas and multiline notes are inert CSV text",()=>{
  const r=createCaseFile({result:screening,manifest,fieldRecord:{
    observer:'=HYPERLINK("evil")',notes:'-cmd|"/C"\r\nsecond line'}});
  const csv=fieldChecklistCsv(r);
  assert.match(csv,/"'=HYPERLINK\(""evil""\)"/);
  assert.match(csv,/"'-cmd\|""/);
  assert.ok(csv.includes("second line"));
});
test("unsupported field status, bad state, or incomplete analysis cannot be exported",()=>{
  assert.throws(()=>normalizeFieldRecord({statuses:{mangrove:"automatically_verified"}}),/Unsupported/);
  assert.throws(()=>createCaseFile({result:{...screening,site_state:"Atlantis"},manifest}),/state/);
  assert.throws(()=>createCaseFile({result:{site_state:"Delta"},manifest}),/completed/);
});
