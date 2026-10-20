/** Stage 06 real native GeoTIFF parity: Bayelsa, Rivers and shared seam, 1/3/5km. */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {fromArrayBuffer} from "geotiff";
import {screenBrowser,inPolygon} from "../src/engine.js";

const dir=new URL("../../artifacts_two_state/",import.meta.url);
async function image(name){
  const bytes=await readFile(new URL(name,dir));
  const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  return (await fromArrayBuffer(buffer)).getImage();
}
const coverage=JSON.parse(await readFile(new URL("two_state_eligible_domain.geojson",dir),"utf8"));
const oracle=JSON.parse(await readFile(new URL("two_state_engine_acceptance.json",dir),"utf8"));
assert.equal(oracle.status,"PASS");
assert.equal(oracle.cases.length,12);
const [west,east,water]=await Promise.all([
 image("ESA_WorldCover_2021_v200_Bayelsa_Rivers_N03E003.tif"),
 image("ESA_WorldCover_2021_v200_Bayelsa_Rivers_N03E006.tif"),
 image("JRC_GSW_1984_2024_Bayelsa_Rivers.tif")
]);
const results=[];
const rel=(a,b)=>Math.abs(a-b)/Math.max(0.01,Math.abs(b));
for(const item of oracle.cases){
  const python=item.result;
  const {longitude:lon,latitude:lat}=python.location_wgs84;
  assert.equal(inPolygon([lon,lat],coverage),true,"Reference site outside combined boundary");
  const js=await screenBrowser({
    lon,lat,radiusKm:item.radius_km,coverage,
    worldcoverImages:[west,east],waterImage:water,regionName:"Bayelsa and Rivers"
  });
  const landError=rel(js.land_cover_2021.coverage.valid_area_km2_approx,
                      python.land_cover_2021.coverage.valid_area_km2_approx);
  const waterError=rel(js.surface_water_occurrence_1984_2024.coverage.valid_area_km2_approx,
                       python.surface_water_occurrence_1984_2024.coverage.valid_area_km2_approx);
  if(landError>.02)throw new Error("Land-area parity fails "+item.state+" "+item.kind+" "+item.radius_km+" "+landError);
  if(waterError>.03)throw new Error("Water-area parity fails "+item.state+" "+item.kind+" "+item.radius_km+" "+waterError);
  for(const row of python.land_cover_2021.classes){
    const actual=js.land_cover_2021.classes.find(x=>x.code===row.code)?.area_km2_approx||0;
    if(Math.abs(actual-row.area_km2_approx)>Math.max(.006,row.area_km2_approx*.04))
      throw new Error("ESA class mismatch "+item.state+"/"+item.radius_km+"/"+row.code+": "+actual+" vs "+row.area_km2_approx);
  }
  if(item.kind==="interstate" && item.radius_km>=3){
    assert.ok(item.other_state_overlap_km2>.05,"Boundary test not genuinely cross-state");
    // State-boundary crossing is NOT missing *regional* data.
    assert.equal(js.coverage_status,python.coverage_status,
      "Region-partial warning mismatches Python for interstate case");
  }
  results.push({state:item.state,kind:item.kind,radius_km:item.radius_km,
      land_diff_pct:+(landError*100).toFixed(3),
      jrc_diff_pct:+(waterError*100).toFixed(3),
      overlap_other_state_km2:item.other_state_overlap_km2,
      coverage_status:js.coverage_status});
}
await assert.rejects(()=>screenBrowser({
    lon:4.1,lat:7.1,radiusKm:1,coverage,worldcoverImages:[west,east],
    waterImage:water,regionName:"Bayelsa and Rivers"
}),/outside the verified Bayelsa and Rivers screening area/);
console.log(JSON.stringify({status:"PASS",parity_cases:results.length,results},null,2));
