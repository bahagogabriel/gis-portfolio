/** Independent geodesic Python reference v browser numeric QA on real state tiles. */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {fromArrayBuffer} from "geotiff";
import {screenBrowser} from "../src/engine.js";

const root="petroscreen-ng/web/public/data/";
const manifest=JSON.parse(await readFile(root+"manifest.json","utf8"));
const oracle=JSON.parse(await readFile("petroscreen-ng/artifacts_stage10/proximity_geodesic_oracle.json","utf8"));
assert.equal(oracle.cases.length,27);
const group=new Map();
for(const item of oracle.cases){
  if(!group.has(item.state))group.set(item.state,[]);
  group.get(item.state).push(item);
}
const coverage=JSON.parse(await readFile(root+"coverage.geojson","utf8"));
let cases=0,comparisons=0,maxError=0;
async function open(name){
  const buffer=await readFile(root+name);
  const bytes=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
  return (await fromArrayBuffer(bytes)).getImage();
}
for(const state of manifest.state_sources){
  const refs=group.get(state.state);
  assert.equal(refs.length,3);
  const images=await Promise.all(state.source_files.filter(s=>s.kind==="worldcover").map(s=>open(s.file)));
  const water=await open(state.source_files.find(s=>s.kind==="water").file);
  for(const r of refs){
    const actual=await screenBrowser({lon:r.longitude,lat:r.latitude,
      radiusKm:r.radius_km,coverage,worldcoverImages:images,waterImage:water,
      regionName:manifest.region});
    assert.equal(actual.mapped_context_2021.indicators.length,4);
    for(const item of actual.mapped_context_2021.indicators){
      const expected=r.geodesic_nearest_pixel_centre_m[String(item.code)];
      if(expected===null){
        assert.equal(item.nearest_pixel_centre_m_approx,null,
          r.state+"/"+r.radius_km+" km ESA "+item.code+" unexpected mapped class");
      }else{
        const reported=item.nearest_pixel_centre_m_approx;
        assert.ok(reported!==null, r.state+"/"+r.radius_km+" missing mapped class "+item.code);
        const delta=Math.abs(reported-expected);
        maxError=Math.max(maxError,delta);
        assert.ok(delta<=Math.max(3,expected*0.003),
          r.state+"/"+r.radius_km+" km class "+item.code+
          " Python WGS84 geodesic="+expected+" m, JS="+reported+" m, diff="+delta);
      }
      comparisons++;
    }
    cases++;
  }
}
assert.equal(cases,27);
assert.equal(comparisons,108);
console.log(JSON.stringify({status:"PASS",method:"Independent Python WGS84 Geod versus JavaScript",
  states:group.size,cases,indicator_comparisons:comparisons,
  max_absolute_error_metres:+maxError.toFixed(4)},null,2));
