import test from "node:test";
import assert from "node:assert/strict";
import {DETAIL_DISPLAY_SIZES,displayPixelBudget,WORLD_COVER_DISPLAY_COLORS} from "../src/site_detail.js";
import {nativeLegendStatus} from "../src/landcover_legend.js";

test("map render sizes have exact predictable RGBA working buffers",()=>{
 assert.deepEqual(DETAIL_DISPLAY_SIZES,[512,1024]);
 assert.deepEqual(displayPixelBudget(512),{width:512,height:512,rgbaBytes:1048576});
 assert.deepEqual(displayPixelBudget(1024),{width:1024,height:1024,rgbaBytes:4194304});
 assert.equal(displayPixelBudget(512).rgbaBytes/displayPixelBudget(1024).rgbaBytes,0.25);
 for(const size of [0,128,256,768,2048,NaN,-512,"512",null]){
  assert.throws(()=>displayPixelBudget(size),/Unsupported visual display size/);
 }
});
test("legend accurately distinguishes display pixel sampling and nominal satellite resolution",()=>{
 for(const displaySize of DETAIL_DISPLAY_SIZES){
  const text=nativeLegendStatus("native",displaySize);
  assert.match(text,/nominal 10 m source pixels/);
  assert.match(text,new RegExp("resampled to "+displaySize+" px"));
  assert.match(text,/not risk/);
 }
 assert.match(nativeLegendStatus("fallback",512),/do NOT apply to that overview/);
});
test("lightweight display changes no accepted ESA class-code palette",()=>{
 assert.deepEqual(Object.keys(WORLD_COVER_DISPLAY_COLORS).map(Number).sort((a,b)=>a-b),
  [10,20,30,40,50,60,70,80,90,95,100]);
});
