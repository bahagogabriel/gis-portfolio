import test from "node:test";
import assert from "node:assert/strict";
import {matchingSiteTiles,VerifiedTileCache} from "../src/tile-index.js";
const sample=[
 {file:"west",sha256:"a",bounds_lon_lat:[5,4,6,5]},
 {file:"east",sha256:"b",bounds_lon_lat:[6,4,7,5]},
 {file:"remote",sha256:"c",bounds_lon_lat:[8,4,9,5]}
];
test("tile boundary selects both neighbours but no remote raster",()=>{
 const list=matchingSiteTiles(sample,6,4.5,1);
 assert.deepEqual(list.map(x=>x.file),["west","east"]);
});
test("5km window includes adjacent source tiles when needed",()=>{
 const list=matchingSiteTiles(sample,6.97,4.5,5);
 assert.deepEqual(list.map(x=>x.file),["east"]);
});
test("metadata malformed boundaries fail closed",()=>{
 assert.throws(()=>matchingSiteTiles([{bounds_lon_lat:[NaN,0,1,1]}],6,5,1));
});
test("cache deduplicates concurrent raster reads and bounds residency",async()=>{
 let loads=0;
 const cache=new VerifiedTileCache(async item=>{loads++;return item.file;},2);
 const [a,b]=await Promise.all([cache.get(sample[0]),cache.get(sample[0])]);
 assert.equal(a,"west");assert.equal(b,"west");assert.equal(loads,1);
 await cache.get(sample[1]);await cache.get(sample[2]);
 assert.equal(cache.cache.size,2);
 await cache.get(sample[0]);
 assert.equal(loads,4);
});
test("source tile bounds must be complete and arrays cannot be omitted",()=>{
 assert.throws(()=>matchingSiteTiles([],NaN,4.5,1));
 assert.throws(()=>matchingSiteTiles(sample,6,4.5,7));
});
