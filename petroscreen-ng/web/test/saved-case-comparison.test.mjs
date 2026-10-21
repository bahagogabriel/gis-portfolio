import test from "node:test";
import assert from "node:assert/strict";
import {preflightSavedComparison,recheckSavedComparison} from "../src/saved_case_comparison.js";
import {createCaseFile} from "../src/exports.js";
import {circleGeometry} from "../src/engine.js";
// These locations, sources and measurements are SYNTHETIC test fixtures.
const states=["Delta","Rivers"],sha="a".repeat(64);
const manifest={region:"Niger Delta nine-state research pilot",states,
  state_sources:states.map(state=>({state,source_files:[
    {file:state+"_synthetic_landcover.tif",kind:"worldcover",sha256:sha},
    {file:state+"_synthetic_water.tif",kind:"water",sha256:"b".repeat(64)}
  ]}))};
const square=(lo,la)=>({type:"Feature",properties:{state:lo===5?"Delta":"Rivers"},
  geometry:{type:"Polygon",coordinates:[[
    [lo,la],[lo+1,la],[lo+1,la+1],[lo,la+1],[lo,la]
  ]]}});
const stateFeatures=[square(5,4),square(6,4)];
const coverage={type:"Polygon",coordinates:[[[4.5,3.5],[8,3.5],[8,6],[4.5,6],[4.5,3.5]]]};
function result(state="Delta",radius=1){
  const lon=state==="Delta"?5.5:6.5,lat=4.5;
  return {
    site_state:state,radius_km:radius,location_wgs84:{longitude:lon,latitude:lat},
    buffer_area_km2_approx:radius*radius*3.1416,
    circle:circleGeometry(lon,lat,radius),
    coverage_status:"sufficient",warnings:[],method_limitations:[],
    land_cover_2021:{classes:[
      {code:10,class:"Tree cover",area_km2_approx:2,share_of_valid_classified_pct:90},
      {code:50,class:"Built-up",area_km2_approx:.2,share_of_valid_classified_pct:10}
    ],coverage:{whole_buffer_coverage_pct_approx:99.98}},
    surface_water_occurrence_1984_2024:{threshold_areas:[1,50,90].map(t=>({
      threshold_pct:t,area_km2_approx:t/1000
    })),coverage:{whole_buffer_coverage_pct_approx:98.8}},
    mapped_context_2021:{indicators:[80,90,95,50].map((code,i)=>({
      code,label:"Synthetic class "+code,status:i===0?"mapped_in_study_buffer":"not_mapped_in_available_pixels",
      nearest_pixel_centre_m_approx:i===0?60:null,area_km2_approx:i===0?.03:0
    }))}
  };
}
function saved(state="Delta",radius=1){
  return createCaseFile({result:result(state,radius),manifest,
    generatedAt:"2026-10-21T10:00:00Z",
    fieldRecord:{observer:"Sensitive field team",notes:"Private field notes - never compare",
      statuses:{surface_water:"field_observed"}},
    facilityContext:{facility_type:"pipeline",project_stage:"planning",project_reference:"Secret Corridor"}});
}
const sample=JSON.stringify(saved());
function opts(text=sample,candidates=[],changes={}){
  return {text,manifest,candidates,coverage,stateFeatures,
    loadRasters:async()=>({worldcoverImages:[{}],waterImage:{}}),
    screen:async()=>result(),...changes};
}
test("imports a real-schema case only after current-source screen and full measurement agreement",async()=>{
  let rasterCalls=0,screenCalls=0;
  const item=await recheckSavedComparison(opts(sample,[],{
    loadRasters:async state=>{rasterCalls++;assert.equal(state,"Delta");
      return {worldcoverImages:[{}],waterImage:{}};},
    screen:async args=>{screenCalls++;assert.equal(args.lon,5.5);
      assert.equal(args.radiusKm,1);return result();}
  }));
  assert.equal(rasterCalls,1);assert.equal(screenCalls,1);
  assert.equal(item.state,"Delta");assert.equal(item.classes[10].share,90);
  const json=JSON.stringify(item);
  assert.doesNotMatch(json,/Sensitive field team|Private field notes|Secret Corridor|pipeline/);
});
test("a changed recorded ESA result is rejected even with matching source hash",async()=>{
  const forged=saved();forged.measurements.land_cover_2021.classes[0].area_km2_approx=100;
  await assert.rejects(()=>recheckSavedComparison(opts(JSON.stringify(forged))),/land-cover measurement differs/);
});
test("a changed saved source SHA rejects BEFORE downloading any raster",async()=>{
  const forged=saved();forged.source_provenance.source_file_sha256[0].sha256="f".repeat(64);
  await assert.rejects(()=>recheckSavedComparison(opts(JSON.stringify(forged),[],{
    loadRasters:async()=>{throw Error("Not supposed to load!");}
  })),/different or unverified source/);
});
test("rejects state polygon misattribution even if exported file says another state",async()=>{
  const forged=saved("Rivers");forged.site.longitude=5.5;
  await assert.rejects(()=>recheckSavedComparison(opts(JSON.stringify(forged))),/state boundary/);
});
test("same radius, duplicate, and four-candidate limits run before loading rasters",async()=>{
  const old={longitude:5.5,latitude:4.5,radius_km:1};
  assert.throws(()=>preflightSavedComparison(sample,manifest,[old]),/already/);
  assert.throws(()=>preflightSavedComparison(sample,manifest,[{...old,longitude:7,radius_km:3}]),/radius/);
  assert.throws(()=>preflightSavedComparison(sample,manifest,
    Array.from({length:4},(_,i)=>({...old,longitude:6+i}))),/four/);
});
test("missing source raster callback or changed current measurement aborts",async()=>{
  await assert.rejects(()=>recheckSavedComparison(opts(sample,[],{
    loadRasters:async()=>({worldcoverImages:[],waterImage:null})
  })),/rasters did not load/);
  await assert.rejects(()=>recheckSavedComparison(opts(sample,[],{
    screen:async()=>({...result(),radius_km:3})
  })),/incomplete/);
  await assert.rejects(()=>recheckSavedComparison(opts(sample,[],{
    screen:async()=>({...result(),surface_water_occurrence_1984_2024:{
      ...result().surface_water_occurrence_1984_2024,
      threshold_areas:[{threshold_pct:1,area_km2_approx:4000}]}})
  })),/water measurement differs|water thresholds differ/);
});
test("rejects a saved coordinate outside the presently verified boundary",async()=>{
  const f=saved();f.site.longitude=7.9;f.site.latitude=7.9;
  await assert.rejects(()=>recheckSavedComparison(opts(JSON.stringify(f))),/outside the verified/);
});
