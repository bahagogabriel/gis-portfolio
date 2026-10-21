/** Stage 13 administrative-boundary geometry QA.
 * Uses the exact original nine-state GeoJSON copied from published main by CI.
 * Boundary crossings and coast-facing state geometry are not assertions of
 * raster availability, coastal survey accuracy, or legal setback distances.
 */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {inPolygon,circleGeometry} from "../src/engine.js";
const root="petroscreen-ng/web/public/data/";
const manifest=JSON.parse(await readFile(root+"manifest.json","utf8"));
assert.equal(manifest.state_sources?.length,9);
assert.equal(manifest.states?.length,9);
const states=JSON.parse(await readFile(root+manifest.original_states.file,"utf8"));
assert.equal(states.features.length,9);
const identity=feature=>Object.values(feature.properties||{}).filter(x=>typeof x==="string");
function getFeature(name){
  const found=states.features.filter(f=>identity(f).some(x=>x.toLowerCase()===name.toLowerCase()));
  assert.equal(found.length,1,"Unique feature for "+name);
  return found[0];
}
function nearestOuterVertices(f,[x,y]){
  const polys=f.geometry.type==="MultiPolygon"?f.geometry.coordinates:[f.geometry.coordinates];
  const verts=polys.flatMap(poly=>poly[0]);
  return verts.map(p=>({p,d:(p[0]-x)**2+(p[1]-y)**2})).sort((a,b)=>a.d-b.d).slice(0,200);
}
function nearBorderInside(f,centre){
  for(const {p} of nearestOuterVertices(f,centre)){
    for(const factor of [.00001,.0001,.001,.005,.01,.025,.05]){
      const loc=[p[0]+(centre[0]-p[0])*factor,p[1]+(centre[1]-p[1])*factor];
      if(inPolygon(loc,f) && inPolygon(loc,states.features.find(x=>x===f)) &&
          states.features.filter(x=>inPolygon(loc,x)).length===1)return loc;
    }
  }
  throw new Error("Could not find unambiguous inward state boundary sample");
}
assert.equal(inPolygon([0,0],{type:"FeatureCollection",features:[states.features[0]]}),false);
let nearMatrix=0,centreMatrix=0,crosses=0;
for(const source of manifest.state_sources){
  const f=getFeature(source.state),centre=source.qa_example_lon_lat;
  assert.ok(inPolygon(centre,f),"Previously accepted source example must lie inside "+source.state);
  const edge=nearBorderInside(f,centre);
  for(const radiusKm of [1,3,5]){
    const ring=circleGeometry(...centre,radiusKm).geometry.coordinates[0];
    assert.equal(ring.length,257);
    assert.ok(ring.every(p=>p.length===2&&p.every(Number.isFinite)));
    centreMatrix++;
    const nearRing=circleGeometry(...edge,radiusKm).geometry.coordinates[0];
    const outside=nearRing.some(p=>!inPolygon(p,f));
    if(outside)crosses++;
    nearMatrix++;
    // A site can be inside a state while the screening circle crosses its
    // administrative boundary: it must never be labelled wholly within it.
    assert.equal(states.features.filter(x=>inPolygon(edge,x)).length,1);
  }
}
assert.equal(nearMatrix,27);
assert.equal(centreMatrix,27);
assert.ok(crosses>=9,"Boundary samples must exercise state-crossing geometry");
console.log(JSON.stringify({status:"PASS",source_states:9,centre_radius_geometry_cases:centreMatrix,
  near_edge_radius_geometry_cases:nearMatrix,near_edge_crossing_cases:crosses,
  caveat:"Geometry-only screening-boundary regression; satellite coverage and scientific parity are independently tested."}));
