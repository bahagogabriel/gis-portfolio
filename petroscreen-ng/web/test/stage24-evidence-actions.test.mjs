import test from "node:test";
import assert from "node:assert/strict";
import {buildEvidenceActions,evidenceActionsCsv,ACTION_PLAN_SCHEMA} from "../src/evidence_actions.js";
const ids=["surface_water","wetland","mangrove","built_up","land_tenure","protected_status","existing_issues"];
const fixture=()=>({
 schema:"PetroScreenNG/ScreeningCase/1.0",
 created_at_utc:"2026-10-21T00:00:00.000Z",
 site:{state:"Delta",longitude:5.5,latitude:5.2,radius_km:1},
 source_provenance:{source_file_sha256:[{
  name:"unit-test-only.tif",sha256:"a".repeat(64),kind:"worldcover"
 }]},
 measurements:{
  land_cover_2021:{classes:[{code:10,class:"Tree cover",share_of_valid_classified_pct:100}],
    coverage:{whole_buffer_coverage_pct_approx:100}},
  historical_surface_water_1984_2024:{threshold_areas:[],
    coverage:{whole_buffer_coverage_pct_approx:100}},
  mapped_landscape_proximity_2021:{indicators:[
   {code:80,label:"Mapped permanent water",status:"not_mapped_in_available_pixels",
    nearest_pixel_centre_m_approx:null}]}
 },
 qa:{warnings:[]},
 field_verification:{visit_date:"",observer:"Private Person",notes:"Confidential field notes",
  checklist:ids.map(id=>({id,title:id,status:"not_checked"}))},
 petroleum_scope:{facility_type:"not_specified",facility_label:"General environmental screening",tasks:[
  {id:"scope_baseline",title:"Current environmental baseline",
   evidence_to_check:"Document seasonal conditions",prompt_basis:"General desktop-review prompt"}
 ]}
});
test("default: 7 unverified field requests, current scope prompts and independent professional review",()=>{
 const plan=buildEvidenceActions(fixture());
 assert.equal(plan.schema,ACTION_PLAN_SCHEMA);
 assert.equal(plan.summary.field_not_checked,7);
 assert.equal(plan.summary.categories.field_verification,7);
 assert.equal(plan.summary.categories.petroleum_scoping_prompt,1);
 assert.equal(plan.summary.categories.professional_review,1);
 assert.equal(plan.summary.categories.source_coverage,0);
 assert.equal(plan.summary.total_actions,9);
 assert.equal(plan.summary.no_field_authentication,true);
 assert.equal(plan.summary.no_regulatory_determination,true);
 assert.equal(plan.summary.no_action_priority_or_risk_score,true);
 assert.equal(plan.summary.no_new_scientific_measurements,true);
 assert.ok(plan.actions.every(x=>x.evidence_to_request&&x.limitations));
 assert.ok(plan.actions.some(x=>x.review_status==="not_checked"));
 assert.ok(!JSON.stringify(plan).includes("Private Person"));
 assert.ok(!JSON.stringify(plan).includes("Confidential field notes"));
});
test("entered field status remains explicitly unverified, even with an ISO visit date",()=>{
 const c=fixture();
 c.field_verification.visit_date="2026-10-21";
 c.field_verification.checklist[0].status="field_observed";
 c.field_verification.checklist[1].status="not_observed";
 c.field_verification.checklist[2].status="requires_follow_up";
 const plan=buildEvidenceActions(c);
 assert.equal(plan.summary.field_not_checked,4);
 assert.equal(plan.summary.field_follow_up,1);
 assert.equal(plan.summary.field_user_reported,2);
 assert.equal(plan.actions.find(x=>x.id==="field_surface_water").review_status,
  "user_reported_unverified_field_observed");
 assert.equal(plan.actions.find(x=>x.id==="field_wetland").review_status,
  "user_reported_unverified_not_observed");
 assert.equal(plan.actions.find(x=>x.id==="field_mangrove").review_status,
  "user_requested_specialist_follow_up");
 assert.equal(plan.summary.no_field_authentication,true);
});
test("coverage and study-boundary flags produce requests, never invented risks",()=>{
 const c=fixture();
 c.measurements.land_cover_2021.coverage.whole_buffer_coverage_pct_approx=71;
 c.measurements.historical_surface_water_1984_2024.coverage.whole_buffer_coverage_pct_approx=80;
 c.qa.warnings=["BUFFER_CROSSES_SUPPORTED_BOUNDARY: outside verified source area unknown"];
 const p=buildEvidenceActions(c);
 assert.equal(p.summary.categories.source_coverage,3);
 assert.deepEqual(p.actions.filter(x=>x.category==="source_coverage").map(x=>x.id),
  ["source_esa_coverage","source_jrc_coverage","source_boundary"]);
 assert.match(p.actions[0].mapped_or_declared_basis,/71%/);
 assert.equal(p.summary.no_action_priority_or_risk_score,true);
 assert.ok(p.actions.every(x=>!("risk_score" in x)&&!("priority" in x)&&!("site_rank" in x)));
});
test("project context remains an unreviewed request; no asset inventory inference",()=>{
 const c=fixture();
 c.petroleum_scope.facility_type="pipeline";
 c.petroleum_scope.tasks.push({
  id:"pipe_crossings",title:"Crossing and alignment survey",
  evidence_to_check:"Obtain surveyed route",prompt_basis:"User-declared activity; no asset existence verified"
 });
 const p=buildEvidenceActions(c);
 assert.equal(p.summary.scope_tasks_not_reviewed,2);
 assert.equal(p.actions.find(x=>x.id==="scope_pipe_crossings").review_status,"not_reviewed");
 assert.match(p.actions.find(x=>x.id==="scope_pipe_crossings").limitations,/not a verified asset/);
});
test("CSV neutralizes formula injection and avoids private notes and observers",()=>{
 const c=fixture();
 c.petroleum_scope.tasks[0].title="\t=HYPERLINK(1)";
 c.petroleum_scope.tasks[0].evidence_to_check="+PAYLOAD";
 const csv=evidenceActionsCsv(buildEvidenceActions(c));
 assert.ok(csv.startsWith("\ufeff"));
 assert.match(csv,/'\t=HYPERLINK/);
 assert.match(csv,/'\+PAYLOAD/);
 assert.doesNotMatch(csv,/Private Person|Confidential field notes/);
 assert.match(csv,/source_case_created_utc/);
 assert.match(csv,/not_checked/);
});
test("invalid source case, missing tasks and bad statuses are rejected",()=>{
 assert.throws(()=>buildEvidenceActions({}),/complete SHA-referenced/);
 const broken=fixture();broken.field_verification.checklist.pop();
 assert.throws(()=>buildEvidenceActions(broken),/Missing field checklist item/);
 const status=fixture();status.field_verification.checklist[0].status="officially_cleared";
 assert.throws(()=>buildEvidenceActions(status),/Invalid field record status/);
 assert.throws(()=>evidenceActionsCsv({}),/Invalid evidence action register/);
});
