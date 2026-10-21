import test from "node:test";
import assert from "node:assert/strict";
import {createCaseFile} from "../src/exports.js";
import {circleGeometry} from "../src/engine.js";
import {preflightSavedBatch,recheckSavedComparisonBatch} from "../src/batch_saved_comparison.js";
import {captureCandidate,comparisonTable} from "../src/candidate_comparison.js";
import {exportComparisonPdf} from "../src/comparison_report.js";

const sha="a".repeat(64);
const manifest={region:"Niger Delta nine-state research pilot",
  states:["Delta","Rivers"],
  state_sources:["Delta","Rivers"].map(state=>({state,source_files:[
    {file:state+"_SYNTHETIC_WC.tif",kind:"worldcover",sha256:sha},
    {file:state+"_SYNTHETIC_JRC.tif",kind:"water",sha256:"b".repeat(64)}
  ]}))};
const coverage={type:"Polygon",coordinates:[[[4,3],[8,3],[8,6],[4,6],[4,3]]]};
const features=["Delta","Rivers"].map((state,i)=>({type:"Feature",properties:{state},
  geometry:{type:"Polygon",coordinates:[[[
    5+i,4],[6+i,4],[6+i,5],[5+i,5],[5+i,4]]]}}));
function fixture(state,lon,radius=1){
  const latitude=4.5;
  return {site_state:state,radius_km:radius,
    location_wgs84:{longitude:lon,latitude},
    buffer_area_km2_approx:Math.PI*radius*radius,
    circle:circleGeometry(lon,latitude,radius),
    coverage_status:"sufficient",warnings:[],method_limitations:[],
    land_cover_2021:{classes:[{code:10,class:"Tree cover",area_km2_approx:2,
      share_of_valid_classified_pct:100}],coverage:{whole_buffer_coverage_pct_approx:99.8}},
    surface_water_occurrence_1984_2024:{threshold_areas:[1,50,90].map(threshold_pct=>({
      threshold_pct,area_km2_approx:.1})),
      coverage:{whole_buffer_coverage_pct_approx:99.3}},
    mapped_context_2021:{indicators:[80,90,95,50].map(code=>({
      code,label:"Synthetic pixel centre "+code,status:"not_mapped_in_available_pixels",
      nearest_pixel_centre_m_approx:null,area_km2_approx:0}))}
  };
}
const byState={Delta:fixture("Delta",5.4),Rivers:fixture("Rivers",6.4)};
function saved(state){
  const f=byState[state];
  return JSON.stringify(createCaseFile({result:f,manifest,
    fieldRecord:{observer:"SENSITIVE OBSERVER",notes:"SENSITIVE field notes"},
    facilityContext:{facility_type:"pipeline",project_reference:"SENSITIVE SITE"},
    generatedAt:"2026-10-21T11:00:00.000Z"}));
}
function args(texts,existing=[],override={}){
  return {texts,manifest,candidates:existing,coverage,stateFeatures:features,
    loadRasters:async state=>({worldcoverImages:[{state}],waterImage:{state}}),
    screen:async opts=>byState[opts.lon===5.4?"Delta":"Rivers"],
    ...override};
}
test("two saved cases rerun independently before a single atomic commit",async()=>{
  const progress=[],calls=[];
  const original=[];
  const results=await recheckSavedComparisonBatch(args([saved("Delta"),saved("Rivers")],original,{
    loadRasters:async state=>{calls.push(state);
      return {worldcoverImages:[{state}],waterImage:{state}};},
    onProgress:x=>progress.push(x)
  }));
  assert.equal(original.length,0);
  assert.equal(results.length,2);
  assert.deepEqual(calls,["Delta","Rivers"]);
  assert.equal(progress.at(-1).completed,2);
  assert.ok(comparisonTable(results).some(x=>x.label.includes("ESA 2021")));
  assert.ok(!JSON.stringify(results).includes("SENSITIVE"));
});
test("wrong saved source or radius is rejected before any raster download",async()=>{
  let calls=0;
  const tampered=JSON.parse(saved("Rivers"));
  tampered.source_provenance.source_file_sha256[0].sha256="f".repeat(64);
  await assert.rejects(()=>recheckSavedComparisonBatch(args(
    [saved("Delta"),JSON.stringify(tampered)],[],{
      loadRasters:async()=>{calls++;throw Error("MUST NOT CALL");}
    })),/File 2 preflight failed.*different or unverified/);
  assert.equal(calls,0);
  const threeKm=JSON.parse(saved("Rivers"));threeKm.site.radius_km=3;
  await assert.rejects(()=>recheckSavedComparisonBatch(args([
    saved("Delta"),JSON.stringify(threeKm)],[],{
    loadRasters:async()=>{calls++;throw Error("MUST NOT CALL");}
  })),/radius/);
  assert.equal(calls,0);
});
test("re-screen mismatch in file 2 rejects entire batch and leaves original candidate list",async()=>{
  const old=[captureCandidate(fixture("Delta",5.7),manifest)];
  const before=JSON.stringify(old);
  let calls=0;
  const changed={...byState.Rivers,
    land_cover_2021:{...byState.Rivers.land_cover_2021,
      classes:[{...byState.Rivers.land_cover_2021.classes[0],area_km2_approx:99}]}};
  await assert.rejects(()=>recheckSavedComparisonBatch(args(
    [saved("Delta"),saved("Rivers")],old,{
      screen:async opts=>{calls++;return opts.lon===6.4?changed:byState.Delta;}
    })),/File 2 of 2.*rejected.*No candidates from this batch were added/);
  assert.equal(calls,2);
  assert.equal(JSON.stringify(old),before);
});
test("duplicate locations and fifth candidate are refused before raster loading",()=>{
  assert.throws(()=>preflightSavedBatch({texts:[saved("Delta"),saved("Delta")],
    manifest,candidates:[]}),/File 2/);
  const existing=Array.from({length:3},(_,i)=>({
    longitude:5.01+i*.05,latitude:4.5,radius_km:1,state:"Delta"}));
  assert.throws(()=>preflightSavedBatch({
    texts:[saved("Delta"),saved("Rivers")],manifest,candidates:existing}),/four-site/);
  assert.throws(()=>preflightSavedBatch({
    texts:[],manifest,candidates:[]}),/Choose 1 to 4/);
});
test("mapped-descriptive PDF retains pages and 4-column layout without new dependencies",()=>{
  const two=[captureCandidate(byState.Delta,manifest),
    captureCandidate(byState.Rivers,manifest)];
  const pdf=exportComparisonPdf(two,{download:false});
  assert.ok(pdf.getNumberOfPages()>=2);
  const raw=new Uint8Array(pdf.output("arraybuffer"));
  assert.ok(raw.length>6000);
  assert.equal(new TextDecoder().decode(raw.slice(0,5)),"%PDF-");
  assert.throws(()=>exportComparisonPdf([two[0]],{download:false}),/At least two/);
  const four=[...two,captureCandidate(fixture("Delta",5.6),manifest),
    captureCandidate(fixture("Rivers",6.6),manifest)];
  const p4=exportComparisonPdf(four,{download:false});
  assert.ok(p4.getNumberOfPages()>=2);
  assert.ok(new Uint8Array(p4.output("arraybuffer")).length>6000);
});
