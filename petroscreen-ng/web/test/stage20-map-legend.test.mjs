import test from "node:test";
import assert from "node:assert/strict";
import {ESA} from "../src/engine.js";
import {WORLD_COVER_DISPLAY_COLORS} from "../src/site_detail.js";
import {landCoverLegendRows,nativeLegendStatus} from "../src/landcover_legend.js";

test("native map swatch definitions exactly match all existing 11 ESA renderer class codes",()=>{
 const rows=landCoverLegendRows();
 const sourceCodes=Object.keys(ESA).map(Number).sort((a,b)=>a-b);
 assert.deepEqual(rows.map(row=>row.code),sourceCodes);
 assert.deepEqual(Object.keys(WORLD_COVER_DISPLAY_COLORS).map(Number).sort((a,b)=>a-b),sourceCodes);
 assert.equal(rows.length,11);
 for(const row of rows){
   assert.equal(row.label,ESA[row.code]);
   assert.deepEqual(row.rgb,WORLD_COVER_DISPLAY_COLORS[row.code]);
   assert.match(row.hex,/^#[0-9a-f]{6}$/);
   assert.equal(row.hex,"#"+row.rgb.map(v=>v.toString(16).padStart(2,"0")).join(""));
 }
 assert.deepEqual(WORLD_COVER_DISPLAY_COLORS[80],[103,164,197]);
 assert.deepEqual(WORLD_COVER_DISPLAY_COLORS[95],[39,142,111]);
});
test("overview is never falsely presented as the native color-matched class layer",()=>{
 const overview=nativeLegendStatus("overview");
 assert.match(overview,/Generalized regional overview/);
 assert.match(overview,/after a successful detailed site map/);
 const native=nativeLegendStatus("native");
 assert.match(native,/Native 10 m ESA WorldCover 2021/);
 assert.match(native,/not risk/);
 const fallback=nativeLegendStatus("fallback");
 assert.match(fallback,/Native detail unavailable/);
 assert.match(fallback,/do NOT apply to that overview/);
 assert.notEqual(fallback,native);
});
