/** Compare browser GeoTIFF calculator against the independently tested Python oracle. */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {fromArrayBuffer} from "geotiff";
import {screenBrowser} from "../src/engine.js";

const root=new URL("../../artifacts_bayelsa/",import.meta.url);
async function image(filename){
  const bytes=await readFile(new URL(filename,root));
  const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  return (await fromArrayBuffer(buffer)).getImage();
}
const [west,east,water]=await Promise.all([
  image("ESA_WorldCover_2021_v200_Bayelsa_N03E003.tif"),
  image("ESA_WorldCover_2021_v200_Bayelsa_N03E006.tif"),
  image("JRC_GSW_1984_2024_Occurrence_Bayelsa.tif"),
]);
const coverage=JSON.parse(await readFile(new URL("bayelsa_gbopen_adm1.geojson",root),"utf8"));
const oracle=JSON.parse(await readFile(new URL("stage03_python_oracle.json",root),"utf8"));
assert.equal(oracle.cases.length,9);
const results=[];
function relativeAbs(a,b){return Math.abs(a-b)/Math.max(.01,Math.abs(b));}
for(const item of oracle.cases){
  const py=item.result;
  const browser=await screenBrowser({lon:py.location_wgs84.longitude,
    lat:py.location_wgs84.latitude,radiusKm:py.radius_km,coverage,
    worldcoverImages:[west,east],waterImage:water});
  const wcB=browser.land_cover_2021, wcP=py.land_cover_2021;
  const jB=browser.surface_water_occurrence_1984_2024,jP=py.surface_water_occurrence_1984_2024;
  // Hard tolerances set before observing results: 1% area and 2% historical water area.
  const wcError=relativeAbs(wcB.coverage.valid_area_km2_approx,wcP.coverage.valid_area_km2_approx);
  const jrcError=relativeAbs(jB.coverage.valid_area_km2_approx,jP.coverage.valid_area_km2_approx);
  assert.ok(wcError<.01,`${item.scenario}/${item.radius_km}: land area difference ${wcError}`);
  assert.ok(jrcError<.02,`${item.scenario}/${item.radius_km}: water raster area difference ${jrcError}`);
  for(const cls of wcP.classes){
    const actual=wcB.classes.find(x=>x.code===cls.code)?.area_km2_approx||0;
    // Absolute tolerance limits tiny boundary classes; not a claimed thematic validation.
    assert.ok(Math.abs(actual-cls.area_km2_approx)<Math.max(.005,cls.area_km2_approx*.035),
      `${item.scenario}/${item.radius_km}: ESA code ${cls.code} area ${actual} != ${cls.area_km2_approx}`);
  }
  for(const t of jP.threshold_areas){
    const actual=jB.threshold_areas.find(x=>x.threshold_pct===t.threshold_pct).area_km2_approx;
    assert.ok(Math.abs(actual-t.area_km2_approx)<Math.max(.005,t.area_km2_approx*.05),
      `${item.scenario}/${item.radius_km}: JRC threshold ${t.threshold_pct} discrepancy`);
  }
  results.push({scenario:item.scenario,radius_km:item.radius_km,
    worldcover_diff_pct:+(wcError*100).toFixed(3),
    jrc_diff_pct:+(jrcError*100).toFixed(3),
    browser_status:browser.coverage_status});
}
console.log(JSON.stringify({status:"PASS",tests:results.length,cases:results},null,2));
