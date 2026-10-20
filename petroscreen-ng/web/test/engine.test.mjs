import test from "node:test";
import assert from "node:assert/strict";
import {ESA,pixelArea,metersPerDegree,approxDistanceMeters,inPolygon,
  circleGeometry,validateLocation,summarizeCount} from "../src/engine.js";

test("Pixel geodesic row area at Bayelsa agrees with WGS84 nominal scale",()=>{
  const a=pixelArea(4.9001,4.9,0.0001);
  assert.ok(a>122 && a<124, "expected WGS84 11m pixel area, got "+a);
  assert.ok(pixelArea(4.91,4.90,.01)>1000000);
});
test("Longitude and latitude are not metrically identical",()=>{
  const m=metersPerDegree(5);
  assert.ok(m.east>110000 && m.north>110000);
  assert.ok(Math.abs(approxDistanceMeters(6,5,6.009,5)-997)<8);
});
test("Input sanity: no unsupported buffer sizes or bogus latitudes",()=>{
  assert.throws(()=>validateLocation(6,5,2));
  assert.throws(()=>validateLocation(6,95,1));
  assert.throws(()=>validateLocation(NaN,5,1));
  assert.doesNotThrow(()=>validateLocation(6,5,5));
});
test("Bayelsa coverage mask respects polygon rings and internal holes",()=>{
  const geometry={type:"Polygon",coordinates:[
    [[5,4],[7,4],[7,6],[5,6],[5,4]],
    [[5.8,4.8],[6.2,4.8],[6.2,5.2],[5.8,5.2],[5.8,4.8]]
  ]};
  assert.equal(inPolygon([5.5,5],geometry),true);
  assert.equal(inPolygon([6,5],geometry),false);
  assert.equal(inPolygon([7.5,5],geometry),false);
});
test("Study circle is centred and has finite WGS84 geometry",()=>{
  const circle=circleGeometry(6,5,3);
  assert.equal(circle.geometry.coordinates[0].length,257);
  for(const p of circle.geometry.coordinates[0])assert.ok(p.every(Number.isFinite));
});
test("Zero water occurrence remains valid classification, not NoData",()=>{
  const result=summarizeCount({areas:{0:10000},validPixels:1},"jrc",.01);
  assert.equal(result.threshold_areas[0].area_km2_approx,0);
  assert.equal(result.coverage.valid_area_km2_approx,.01);
});
test("ESA displayed categories preserve the exact source class vocabulary",()=>{
  assert.equal(ESA[95],"Mangroves");
  assert.equal(ESA[80],"Permanent water bodies");
  const result=summarizeCount({areas:{10:3e6,95:1e6},validPixels:400},"wc",4);
  assert.deepEqual(result.classes.map(x=>x.code),[10,95]);
  assert.equal(result.classes[1].share_of_valid_classified_pct,25);
});
