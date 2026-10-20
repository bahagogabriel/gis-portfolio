import test from "node:test";
import assert from "node:assert/strict";
import {createCaseFile} from "../src/exports.js";
import {parseCaseText,confirmRescreenedCase,caseGeoJSON} from "../src/case_continuity.js";
const state="Delta";
const entry=[{file:"regions/Delta/wc_N03E006.tif",sha256:"a".repeat(64),kind:"worldcover"},
             {file:"regions/Delta/occurrence.tif",sha256:"b".repeat(64),kind:"water"}];
const manifest={states:[state],state_sources:[{state,source_files:entry}]};
const lon=6.307695,lat=5.689863;
const ring=Array.from({length:65},(_,i)=>[
  lon+.009*Math.cos(2*Math.PI*i/64),
  lat+.009*Math.sin(2*Math.PI*i/64)
]);
const result={
  site_state:state,radius_km:1,buffer_area_km2_approx:3.1416,
  location_wgs84:{longitude:lon,latitude:lat},
  circle:{type:"Feature",geometry:{type:"Polygon",coordinates:[ring]},properties:{}},
  coverage_status:"sufficient",warnings:[],method_limitations:["Desk screening only"],
  land_cover_2021:{classes:[
    {code:95,class:"Mangroves",area_km2_approx:2.001,share_of_valid_classified_pct:66}
  ],coverage:{whole_buffer_coverage_pct_approx:100}},
  surface_water_occurrence_1984_2024:{threshold_areas:[
    {threshold_pct:1,area_km2_approx:0.0567},
    {threshold_pct:50,area_km2_approx:0.025}
  ],coverage:{whole_buffer_coverage_pct_approx:100}},
  mapped_context_2021:{indicators:[
    {code:80,label:"Mapped permanent water",status:"mapped_in_study_buffer",nearest_pixel_centre_m_approx:231.1},
    {code:90,label:"Mapped herbaceous wetland",status:"not_mapped_in_available_pixels",nearest_pixel_centre_m_approx:null},
    {code:95,label:"Mapped mangroves",status:"mapped_in_study_buffer",nearest_pixel_centre_m_approx:6.6},
    {code:50,label:"Mapped built-up",status:"not_mapped_in_available_pixels",nearest_pixel_centre_m_approx:null}
  ]}
};
const saved=createCaseFile({result,manifest,generatedAt:"2026-10-20T14:00:00Z",
  fieldRecord:{observer:"Survey Team",notes:"Observed mangroves at edge of footpath",
    visit_date:"2026-10-19",statuses:{mangrove:"field_observed"}}});
test("reopening a legitimate saved case verifies SHA manifest, region and measurements",()=>{
  const reopened=parseCaseText(JSON.stringify(saved),manifest);
  assert.equal(reopened.site.state,"Delta");
  assert.equal(reopened.field.statuses.mangrove,"field_observed");
  assert.equal(reopened.field.statuses.surface_water,"not_checked");
  assert.ok(confirmRescreenedCase(reopened,result));
});
test("changed provider source hash, site, radius and data area are rejected",()=>{
  const tamper=structuredClone(saved);
  tamper.source_provenance.source_file_sha256[0].sha256="f".repeat(64);
  assert.throws(()=>parseCaseText(JSON.stringify(tamper),manifest),/different or unverified/);
  const changed=structuredClone(saved);changed.site.longitude=500;
  assert.throws(()=>parseCaseText(JSON.stringify(changed),manifest),/coordinates/);
  const badRadius=structuredClone(saved);badRadius.site.radius_km=10;
  assert.throws(()=>parseCaseText(JSON.stringify(badRadius),manifest),/radius/);
  const altered=structuredClone(saved);altered.measurements.land_cover_2021.classes[0].area_km2_approx=55;
  assert.throws(()=>confirmRescreenedCase(parseCaseText(JSON.stringify(altered),manifest),result),
    /land-cover measurement/);
  const proximity=structuredClone(saved);
  proximity.measurements.mapped_landscape_proximity_2021.indicators[0].nearest_pixel_centre_m_approx=888;
  assert.throws(()=>confirmRescreenedCase(parseCaseText(JSON.stringify(proximity),manifest),result),
    /proximity differs/);
});
test("untrusted source oversized or wrong field status is not restored",()=>{
  assert.throws(()=>parseCaseText("{broken",manifest),/valid JSON/);
  assert.throws(()=>parseCaseText(" ".repeat(2*1024*1024+1),manifest),/2 MB/);
  const suspicious=structuredClone(saved);
  suspicious.field_verification.statuses.mangrove="verified_by_satellite";
  assert.throws(()=>parseCaseText(JSON.stringify(suspicious),manifest),/Unsupported/);
});
test("GIS GeoJSON is WGS84 point plus source-dated approximate study polygon",()=>{
  const a=caseGeoJSON(result);
  assert.equal(a.type,"FeatureCollection");
  assert.equal(a.features.length,2);
  assert.deepEqual(a.features[0].geometry.coordinates,[lon,lat]);
  assert.equal(a.features[1].geometry.type,"Polygon");
  assert.equal(a.features[1].geometry.coordinates[0].length,65);
  assert.equal(a.features[0].properties.crs,"EPSG:4326");
  assert.match(a.features[1].properties.use_limitation,/not surveyed/);
  assert.throws(()=>caseGeoJSON({}),/Complete WGS84/);
});
