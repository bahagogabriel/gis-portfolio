import test from "node:test";
import assert from "node:assert/strict";
import {FACILITIES,STAGES,normalizeFacilityContext,buildPetroleumScope,
  petroleumScopeCsv} from "../src/petroleum_scope.js";
const site={state:"Delta",longitude:6.307695,latitude:5.689863,radius_km:3};
const result={radius_km:3,mapped_context_2021:{indicators:[
  {code:80,status:"mapped_in_study_buffer"},
  {code:90,status:"not_mapped_in_available_pixels"},
  {code:95,status:"mapped_in_study_buffer"},
  {code:50,status:"not_mapped_in_available_pixels"}
]}};
test("six legitimate petroleum contexts; fixed advice never fabricates a verified asset",()=>{
  assert.equal(FACILITIES.length,6);
  assert.equal(STAGES.length,4);
  for(const item of FACILITIES){
    const s=buildPetroleumScope(result,{facility_type:item.id,project_stage:"planning"});
    assert.equal(s.facility_type,item.id);
    assert.equal(s.mapped_asset_locations_used,false);
    assert.equal(s.regulatory_compliance_determined,false);
    assert.equal(s.official_authority_reviewed,false);
    assert.equal(s.scope_status,"UNVERIFIED_DESKTOP_SCOPING_PROMPTS");
    assert.ok(s.tasks.length>=2);
    assert.ok(s.tasks.every(t=>t.review_state==="not_reviewed"));
    assert.ok(s.tasks.every(t=>/desktop-review|User-declared|WorldCover/.test(t.prompt_basis)));
  }
});
test("mapped cue addenda are informational, not risk scoring or proof of absence",()=>{
  const plan=buildPetroleumScope(result,{facility_type:"pipeline",
    project_stage:"decommissioning"});
  const ids=plan.tasks.map(t=>t.id);
  for(const code of ["pipe_crossings","pipe_integrity","pipe_response",
    "stage_restoration","water_site","mangrove_site"])
    assert.ok(ids.includes(code),code);
  assert.ok(!ids.includes("wetland_site"));
  assert.ok(!ids.includes("built_site"));
  assert.match(plan.limitations,/not an environmental risk rank/i);
  assert.match(plan.tasks.find(t=>t.id==="water_site").prompt_basis,/2021/);
  assert.equal(plan.reference_links.length,3);
  assert.ok(plan.reference_links.every(x=>x.url.startsWith("https://www.nuprc.gov.ng/")));
});
test("invalid or untrusted facility values cannot manufacture arbitrary plan content",()=>{
  assert.throws(()=>normalizeFacilityContext({facility_type:"unknown_well"}),/Unrecognized/);
  assert.throws(()=>normalizeFacilityContext({project_stage:"certified"}),/Unrecognized/);
  const plan=normalizeFacilityContext({facility_type:"flare",project_stage:"operations",
    project_reference:"A".repeat(120)});
  assert.equal(plan.project_reference.length,80);
  assert.deepEqual(normalizeFacilityContext(),{facility_type:"not_specified",
    project_stage:"not_specified",project_reference:""});
});
test("CSV is Unicode-friendly, provenance marked and formula-safe",()=>{
  const s=buildPetroleumScope(result,{facility_type:"storage",
    project_stage:"operations",project_reference:'=HYPERLINK("malicious")'});
  const csv=petroleumScopeCsv(s,site);
  assert.match(csv,/tank_bunds/);
  assert.match(csv,/not_reviewed/);
  assert.match(csv,/WorldCover 2021/);
  assert.match(csv,/"'=HYPERLINK\(""malicious""\)"/);
  assert.ok(csv.startsWith("\ufeff"));
});
