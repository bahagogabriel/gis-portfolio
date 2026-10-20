/** Real nine-state lazy browser engine compared with frozen independent Python QA. */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {fromArrayBuffer} from "geotiff";
import {screenBrowser,inPolygon} from "../src/engine.js";
import {matchingSiteTiles,VerifiedTileCache} from "../src/tile-index.js";

const dir=new URL("../public/data/",import.meta.url);
const root=new URL("../../artifacts_nine_state/",import.meta.url);
const manifest=JSON.parse(await readFile(new URL("manifest.json",dir),"utf8"));
const coverage=JSON.parse(await readFile(new URL("coverage.geojson",dir),"utf8"));
const oracle=JSON.parse(await readFile(new URL("nine_state_reference_acceptance.json",root),"utf8"));
assert.equal(oracle.cases.length,42);
assert.equal(manifest.states.length,9);
assert.equal(manifest.data_mode,"regional_chunk_index");
const cache=new VerifiedTileCache(async item=>{
 const bytes=await readFile(new URL(item.file,dir));
 const hash=createHash("sha256").update(bytes).digest("hex");
 if(hash!==item.sha256)throw new Error("Source delivery tile SHA256 discrepancy");
 const buf=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
 return (await fromArrayBuffer(buf)).getImage();
},28);
const cases=[
 ...oracle.cases.filter(x=>x.kind==="interior"&&x.radius_km===3),
 ...oracle.cases.filter(x=>x.kind==="interstate"&&x.radius_km===5)
];
assert.equal(cases.length,14);
const results=[];
for(const item of cases){
 const [lon,lat]=item.site_wgs84;
 assert.equal(inPolygon([lon,lat],coverage),true);
 const wcIndex=matchingSiteTiles(manifest.worldcover_index,lon,lat,item.radius_km);
 const waterIndex=matchingSiteTiles(manifest.water_index,lon,lat,item.radius_km);
 if(!wcIndex.length||!waterIndex.length)throw new Error("No tile selected at "+item.state);
 const [wc,water]=await Promise.all([cache.preload(wcIndex),cache.preload(waterIndex)]);
 const browser=await screenBrowser({lon,lat,radiusKm:item.radius_km,coverage,
   worldcoverImages:wc,waterImages:water,regionName:manifest.region});
 const wcPy=item.land_valid_km2,waterPy=item.water_valid_km2;
 const wcJs=browser.land_cover_2021.coverage.valid_area_km2_approx;
 const jrcJs=browser.surface_water_occurrence_1984_2024.coverage.valid_area_km2_approx;
 const wcErr=Math.abs(wcJs-wcPy)/Math.max(0.01,wcPy);
 const jrcErr=Math.abs(jrcJs-waterPy)/Math.max(.01,waterPy);
 assert.ok(wcErr<.02,`${item.state} ${item.kind} land area ${wcErr}`);
 assert.ok(jrcErr<.03,`${item.state} ${item.kind} historical water ${jrcErr}`);
 results.push({state:item.state,kind:item.kind,radius_km:item.radius_km,
   wc_diff_pct:+(wcErr*100).toFixed(3),jrc_diff_pct:+(jrcErr*100).toFixed(3),
   loaded_tiles:wcIndex.length+waterIndex.length,
   regional_coverage:browser.coverage_status});
}
await assert.rejects(()=>screenBrowser({lon:4.0,lat:9.0,radiusKm:1,coverage,
 worldcoverImages:[],waterImages:[],regionName:manifest.region}),/outside the verified/);
console.log(JSON.stringify({status:"PASS",nine_state_browser_python_checks:results.length,
  available_states:manifest.states.length,cached_tile_objects:cache.cache.size,
  checks:results},null,2));
