import test from "node:test";
import assert from "node:assert/strict";
import {captureCandidate,addCandidate,comparisonTable,comparisonCsv,COMPARISON_SCHEMA}
  from "../src/candidate_comparison.js";
import {ESA,JRC_THRESHOLDS,MAPPED_CONTEXT_CLASSES} from "../src/engine.js";

const manifest={
  states:["Delta","Rivers"],
  state_sources:["Delta","Rivers"].map(state=>({
    state,source_files:[
      {file:state+"_WorldCover_TEST.tif",kind:"worldcover",sha256:"a".repeat(64)},
      {file:state+"_JRC_TEST.tif",kind:"water",sha256:"b".repeat(64)}
    ]
  }))
};
// Invented values are SYNTHETIC unit fixtures, not published site evidence.
function fixture(state="Delta",longitude=5.5,radius_km=1){
  return {
    site_state:state,location_wgs84:{longitude,latitude:5.1},radius_km,
    buffer_area_km2_approx:radius_km*radius_km*3.1415,
    warnings:[],land_cover_2021:{
      classes:[{code:10,class:ESA[10],area_km2_approx:1,share_of_valid_classified_pct:50},
        {code:50,class:ESA[50],area_km2_approx:1,share_of_valid_classified_pct:50}],
      coverage:{whole_buffer_coverage_pct_approx:99.1}
    },
    surface_water_occurrence_1984_2024:{
      threshold_areas:JRC_THRESHOLDS.map((threshold_pct,i)=>({
        threshold_pct,area_km2_approx:.06/(i+1)})),
      coverage:{whole_buffer_coverage_pct_approx:98.9}
    },
    mapped_context_2021:{
      indicators:MAPPED_CONTEXT_CLASSES.map(({code},i)=>({
        code,status:i===0?"mapped_in_study_buffer":"not_mapped_in_available_pixels",
        nearest_pixel_centre_m_approx:i===0?73:null
      }))
    }
  };
}
test("captures each validated 2021/1984-2024 measure and source references without user data",()=>{
  const item=captureCandidate(fixture(),manifest);
  assert.equal(item.state,"Delta");
  assert.equal(item.classes[10].share,50);
  assert.equal(item.historical_water_km2[50],.03);
  assert.equal(item.nearest_mapped_pixel_centre_m[80],73);
  assert.equal(item.nearest_mapped_pixel_centre_m[95],null);
  assert.equal(item.esa_coverage_pct_approx,99.1);
  assert.equal(item.jrc_coverage_pct_approx,98.9);
  assert.equal(item.source_file_sha256.length,2);
  assert.equal(JSON.stringify(item).includes("field_verification"),false);
});
test("max four, same-radius only, no duplicate within a metre",()=>{
  const first=captureCandidate(fixture(),manifest);
  const second=captureCandidate(fixture("Rivers",6),manifest);
  const both=addCandidate(addCandidate([],first),second);
  assert.equal(both.length,2);
  assert.throws(()=>addCandidate(both,first),/already/);
  assert.throws(()=>addCandidate(both,captureCandidate(fixture("Delta",7,3),manifest)),/same/);
  let all=both;
  all=addCandidate(all,captureCandidate(fixture("Delta",7),manifest));
  all=addCandidate(all,captureCandidate(fixture("Delta",8),manifest));
  assert.throws(()=>addCandidate(all,captureCandidate(fixture("Delta",9),manifest)),/four/);
});
test("table preserves measured 0 versus not mapped, and names dated source snapshots",()=>{
  const first=captureCandidate(fixture(),manifest);
  const second=captureCandidate(fixture("Rivers",6),manifest);
  const lines=comparisonTable([first,second]);
  assert.ok(lines.length>20);
  const mapped=lines.find(x=>x.label.includes("nearest classified pixel centre")&&x.label.includes("mangroves"));
  assert.ok(mapped.values.every(x=>x==="Not mapped in 2021 source"));
  const zero=lines.find(x=>x.label.includes("Herbaceous wetland")&&x.label.includes("share"));
  assert.deepEqual(zero.values,["0.00","0.00"]);
  const water=lines.find(x=>x.label.includes("occurrence ≥90%"));
  assert.equal(water.values[0],"0.0200");
  assert.ok(lines.some(x=>x.label.includes("Source raster reference")&&x.values[0].includes("a".repeat(64))));
});
test("CSV has consistent dimensional columns, neutralized cells, source hashes and no rank",()=>{
  const a=captureCandidate(fixture(),manifest),b=captureCandidate(fixture("Rivers",6),manifest);
  const csv=comparisonCsv([a,b]);
  assert.match(csv,/Candidate A","Candidate B/);
  assert.match(csv,/ESA WorldCover 2021/);
  assert.match(csv,/1984-2024/);
  assert.match(csv,/mapped share of valid class pixels/);
  assert.match(csv,/a{64}/);
  assert.doesNotMatch(csv,/"risk_score"/i);
  assert.match(csv,/No environmental risk ranking/);
  assert.equal(csv.trim().split("\r\n").every(s=>s.split('","').length===4),true);
});
test("unsupported or incomplete source-backed values reject capture rather than fill with guesses",()=>{
  const f=fixture();
  f.land_cover_2021.coverage.whole_buffer_coverage_pct_approx=104;
  assert.throws(()=>captureCandidate(f,manifest),/coverage/);
  const second=fixture();
  second.surface_water_occurrence_1984_2024.threshold_areas.pop();
  assert.throws(()=>captureCandidate(second,manifest),/threshold/);
  const third=fixture();
  third.mapped_context_2021.indicators[0].nearest_pixel_centre_m_approx=null;
  assert.throws(()=>captureCandidate(third,manifest),/proximity/);
  const fourth=fixture("Unverified");
  assert.throws(()=>captureCandidate(fourth,manifest),/verified screened/);
});
