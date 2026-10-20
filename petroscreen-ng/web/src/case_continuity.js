/**
 * Offline case continuity and GIS interchange.
 *
 * Imported JSON is UNTRUSTED user-owned content. A saved case is never used
 * as new scientific screening evidence: coordinates are screened again against
 * the installed SHA256-verified source rasters. Field notes are restored only
 * if the full mapped measurement comparison passes.
 *
 * This is NOT a tamper-proof signature and it does not authenticate fieldwork.
 */
import {CASE_SCHEMA,normalizeFieldRecord} from "./exports.js";
const MAX_CASE_BYTES=2*1024*1024;
const real=n=>typeof n==="number"&&Number.isFinite(n);
const close=(a,b,tol)=>real(a)&&real(b)&&Math.abs(a-b)<=tol;
const sameClass=(a,b)=>Number(a?.code)===Number(b?.code);
const assert=(test,message)=>{if(!test)throw new Error(message);};
export function parseCaseText(source,manifest){
  assert(typeof source==="string"&&source.length<=MAX_CASE_BYTES,
    "Case JSON exceeds the 2 MB local import limit.");
  let candidate;
  try{candidate=JSON.parse(source);}catch{throw new Error("Not a valid JSON screening case.");}
  assert(candidate?.schema===CASE_SCHEMA,"Unsupported screening case format.");
  const site=candidate.site||{};
  assert(typeof site.state==="string"&&manifest?.states?.includes(site.state),
    "Saved site is outside the current verified nine-state domain.");
  assert(site.crs==="EPSG:4326","Saved coordinates are not WGS84 longitude/latitude.");
  assert(real(site.longitude)&&site.longitude>=-180&&site.longitude<=180&&
    real(site.latitude)&&site.latitude>=-90&&site.latitude<=90,
    "Saved site coordinates are invalid.");
  assert([1,3,5].includes(site.radius_km),"Saved radius is not supported.");
  const entry=manifest.state_sources?.find(s=>s.state===site.state);
  assert(entry&&entry.source_files.length>0,"No verified files for saved state.");
  const actual=candidate.source_provenance?.source_file_sha256;
  assert(Array.isArray(actual)&&actual.length===entry.source_files.length,
    "Saved raster provenance does not match this release.");
  for(const file of entry.source_files){
    const matching=actual.filter(x=>x?.name===file.file&&x?.kind===file.kind&&
      x?.sha256===file.sha256);
    assert(matching.length===1,"Saved case was made using different or unverified source files.");
  }
  assert(candidate.measurements?.land_cover_2021?.classes&&
    candidate.measurements?.historical_surface_water_1984_2024?.threshold_areas&&
    candidate.measurements?.mapped_landscape_proximity_2021?.indicators,
    "The saved case does not include complete scientific measurements.");
  const field=normalizeFieldRecord(candidate.field_verification||{});
  return {source:candidate,site,field};
}
export function confirmRescreenedCase(imported,result){
  assert(imported?.source?.schema===CASE_SCHEMA&&result,
    "No verified imported baseline exists.");
  const old=imported.source,site=old.site;
  assert(result.site_state===site.state&&result.radius_km===site.radius_km&&
    close(result.location_wgs84?.longitude,site.longitude,1e-8)&&
    close(result.location_wgs84?.latitude,site.latitude,1e-8),
    "Re-screened location is not the same saved site.");
  assert(close(result.buffer_area_km2_approx,site.study_area_km2_approx,.001),
    "Study buffer area changed since the original screening.");
  const former=old.measurements.land_cover_2021.classes;
  const now=result.land_cover_2021.classes;
  assert(Array.isArray(former)&&former.length===now.length,
    "Mapped land-cover classes differ from saved source results.");
  for(const previous of former){
    const latest=now.find(x=>sameClass(x,previous));
    assert(latest&&close(latest.area_km2_approx,previous.area_km2_approx,.0005),
      "Mapped land-cover measurement differs from the previous screening.");
  }
  const oldWater=old.measurements.historical_surface_water_1984_2024.threshold_areas;
  assert(Array.isArray(oldWater)&&oldWater.length===result.surface_water_occurrence_1984_2024.threshold_areas.length,
    "Saved historical water thresholds differ.");
  for(const prior of oldWater){
    const current=result.surface_water_occurrence_1984_2024.threshold_areas.find(
      x=>x.threshold_pct===prior.threshold_pct);
    assert(current&&close(current.area_km2_approx,prior.area_km2_approx,.0005),
      "Historical water measurement differs from the previous screening.");
  }
  const oldIndicators=old.measurements.mapped_landscape_proximity_2021.indicators;
  const newIndicators=result.mapped_context_2021.indicators;
  assert(oldIndicators.length===4&&newIndicators.length===4,
    "Mapped proximity set differs from saved scientific evidence.");
  for(const previous of oldIndicators){
    const current=newIndicators.find(x=>x.code===previous.code);
    assert(current&&current.status===previous.status,
      "Mapped landscape indicator status differs.");
    const a=current.nearest_pixel_centre_m_approx;
    const b=previous.nearest_pixel_centre_m_approx;
    assert((a===null&&b===null)||(close(a,b,.2)),
      "Saved pixel-centre proximity differs from the rescreened source.");
  }
  return true;
}
/** Browser-native geographic interchange, EPSG:4326: a point plus an approximate study polygon. */
export function caseGeoJSON(result){
  const site=result?.location_wgs84,geometry=result?.circle?.geometry;
  assert(real(site?.longitude)&&real(site?.latitude)&&
    [1,3,5].includes(result?.radius_km)&&
    geometry?.type==="Polygon"&&Array.isArray(geometry.coordinates?.[0]),
    "Complete WGS84 screening polygon and point required.");
  const ring=geometry.coordinates[0];
  assert(ring.length>=16&&ring.length<=1500&&
    ring.every(p=>Array.isArray(p)&&p.length===2&&p.every(real)),
    "Study boundary is incomplete.");
  const shared={source:"PetroScreen NG research preview",
    state:result.site_state||"Unspecified",radius_km:result.radius_km,
    crs:"EPSG:4326",source_dates:"ESA WorldCover 2021; JRC GSW 1984-2024",
    use_limitation:"Approximate desk-screening only; not surveyed geometry, setbacks or EIA"};
  return {type:"FeatureCollection",features:[
    {type:"Feature",id:"site",properties:{...shared,feature_role:"screening_point"},
      geometry:{type:"Point",coordinates:[site.longitude,site.latitude]}},
    {type:"Feature",id:"buffer",properties:{...shared,feature_role:"approximate_screening_buffer",
      area_km2_approx:result.buffer_area_km2_approx},
      geometry:{type:"Polygon",coordinates:[ring.map(p=>[p[0],p[1]])]}}
  ]};
}
