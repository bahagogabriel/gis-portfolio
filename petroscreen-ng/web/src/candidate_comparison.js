/** Stage 16: descriptive, source-bounded same-radius candidate comparison.
 * Session-only. No field records, user project identifiers, scoring or uploads.
 * Every candidate must come from a freshly completed source-hash-verified screen.
 */
import {ESA,JRC_THRESHOLDS,MAPPED_CONTEXT_CLASSES,approxDistanceMeters} from "./engine.js";
export const COMPARISON_SCHEMA="PetroScreenNG/CandidateComparison/1.0";
const ESA_CODES=Object.keys(ESA).map(Number).sort((a,b)=>a-b);
const n=v=>Number.isFinite(v)?v:null;
const finite=(v,a,b)=>Number.isFinite(v)&&v>=a&&v<=b;
function safePct(v){if(!finite(v,0,100))throw Error("Invalid source coverage");return v;}
function sourceRefs(state,manifest){
  const match=manifest?.state_sources?.find(s=>s.state===state);
  if(!match||!Array.isArray(match.source_files)||!match.source_files.length)
    throw Error("Verified state source references unavailable.");
  return match.source_files.map(s=>{
    if(typeof s.file!=="string"||!["worldcover","water"].includes(s.kind)||
       !/^[0-9a-f]{64}$/.test(s.sha256))throw Error("Invalid state source SHA-256 reference");
    return {name:s.file,kind:s.kind,sha256:s.sha256};
  });
}
export function captureCandidate(result,manifest){
  const site=result?.location_wgs84;
  const state=result?.site_state,radius=result?.radius_km;
  if(!manifest?.states?.includes(state)||!site ||
     !finite(site.longitude,-180,180)||!finite(site.latitude,-90,90)||
     ![1,3,5].includes(radius))throw Error("A verified screened site is needed.");
  const lc=result.land_cover_2021,water=result.surface_water_occurrence_1984_2024;
  const context=result.mapped_context_2021;
  if(!Array.isArray(lc?.classes)||!lc.classes.length||
     !Array.isArray(water?.threshold_areas)||!Array.isArray(context?.indicators)||
     context.indicators.length!==4)throw Error("Mapped scientific measures incomplete.");
  const cover=safePct(lc.coverage?.whole_buffer_coverage_pct_approx);
  const waterCover=safePct(water.coverage?.whole_buffer_coverage_pct_approx);
  const areas={};
  for(const row of lc.classes){
    if(!ESA_CODES.includes(row.code)||areas[row.code]!==undefined||
      !finite(row.area_km2_approx,0,1000)||!finite(row.share_of_valid_classified_pct,0,100))
      throw Error("Invalid mapped land-cover class measurement.");
    areas[row.code]={km2:row.area_km2_approx,share:row.share_of_valid_classified_pct};
  }
  const historic={};
  for(const row of water.threshold_areas){
    if(!JRC_THRESHOLDS.includes(row.threshold_pct)||historic[row.threshold_pct]!==undefined||
       !finite(row.area_km2_approx,0,1000))throw Error("Invalid historical water threshold.");
    historic[row.threshold_pct]=row.area_km2_approx;
  }
  if(JRC_THRESHOLDS.some(x=>historic[x]===undefined))
    throw Error("Historical water thresholds incomplete.");
  const nearest={};
  for(const row of context.indicators){
    if(!MAPPED_CONTEXT_CLASSES.some(x=>x.code===row.code)||nearest[row.code]!==undefined)
      throw Error("Invalid mapped context indicator.");
    const mapped=row.status==="mapped_in_study_buffer";
    if(!(mapped||row.status==="not_mapped_in_available_pixels")||
       (mapped&&!finite(row.nearest_pixel_centre_m_approx,0,6000)))
      throw Error("Mapped proximity status or distance invalid.");
    nearest[row.code]=mapped?row.nearest_pixel_centre_m_approx:null;
  }
  if(MAPPED_CONTEXT_CLASSES.some(x=>nearest[x.code]===undefined))
    throw Error("Mapped context class incomplete.");
  const area=result.buffer_area_km2_approx;
  if(!finite(area,0,100))throw Error("Invalid buffer area.");
  const warnings=result.warnings;
  if(!Array.isArray(warnings)||warnings.some(x=>typeof x!=="string"))
    throw Error("Invalid coverage warnings.");
  return {
    state,longitude:site.longitude,latitude:site.latitude,radius_km:radius,
    area_km2_approx:area,esa_coverage_pct_approx:cover,
    jrc_coverage_pct_approx:waterCover,
    classes:areas,historical_water_km2:historic,nearest_mapped_pixel_centre_m:nearest,
    has_coverage_warnings:warnings.length>0,
    source_file_sha256:sourceRefs(state,manifest)
  };
}
export function addCandidate(existing,item){
  if(!Array.isArray(existing)||existing.length>4||!item?.source_file_sha256?.length)
    throw Error("Invalid candidate comparison.");
  if(existing.length>=4)throw Error("Comparison is limited to four screened sites.");
  if(existing.some(x=>x.radius_km!==item.radius_km))
    throw Error("Use the same 1, 3 or 5 km radius for every comparison site. Clear the comparison to switch radius.");
  if(existing.some(x=>approxDistanceMeters(x.longitude,x.latitude,item.longitude,item.latitude)<1))
    throw Error("This site is already in the comparison (within 1 metre).");
  return [...existing,item];
}
function number(v,d=2){return n(v)===null?"Not measured":v.toFixed(d);}
function formatNearest(v){return v===null?"Not mapped in 2021 source":number(v,1);}
export function comparisonTable(items){
  if(!Array.isArray(items)||items.length<1||items.length>4)
    throw Error("Screen at least one site to create the comparison.");
  if(items.some(x=>x.radius_km!==items[0].radius_km))
    throw Error("Cannot compare differing screening radii.");
  const rows=[];
  const add=(label,unit,fn)=>rows.push({label,unit,values:items.map(fn)});
  add("State","","state" in items[0]?x=>x.state:()=>"-");
  add("WGS84 longitude","degrees",x=>number(x.longitude,6));
  add("WGS84 latitude","degrees",x=>number(x.latitude,6));
  add("Screening radius","km",x=>String(x.radius_km));
  add("Approximate buffer area","km2",x=>number(x.area_km2_approx,4));
  add("ESA WorldCover 2021 valid buffer coverage","%",x=>number(x.esa_coverage_pct_approx,2));
  add("JRC GSW 1984-2024 valid buffer coverage","%",x=>number(x.jrc_coverage_pct_approx,2));
  add("Source coverage warning","",x=>x.has_coverage_warnings?"See individual report":"None reported");
  for(const code of ESA_CODES){
    add("ESA 2021 "+ESA[code]+" ("+code+") mapped share of valid class pixels","%",
      x=>number(x.classes[code]?.share??0,2));
  }
  for(const threshold of JRC_THRESHOLDS){
    add("JRC 1984-2024 occurrence ≥"+threshold+"% mapped area","km2",
      x=>number(x.historical_water_km2[threshold],4));
  }
  for(const c of MAPPED_CONTEXT_CLASSES){
    add(c.label+" nearest classified pixel centre in chosen buffer","metres",
      x=>formatNearest(x.nearest_mapped_pixel_centre_m[c.code]));
  }
  const maxRefs=Math.max(...items.map(x=>x.source_file_sha256.length));
  for(let i=0;i<maxRefs;i++){
    add("Source raster reference "+(i+1)+" (filename: SHA-256)","",
      x=>x.source_file_sha256[i]?
        x.source_file_sha256[i].name+": "+x.source_file_sha256[i].sha256:"—");
  }
  return rows;
}
const csvCell=v=>'"'+String(v??"").replaceAll('"','""')
  .replace(/^[\s\uFEFF]*([=+\-@])/,"'$1")+'"';
export function comparisonCsv(items){
  const rows=[["metric","unit",...items.map((_,i)=>"Candidate "+String.fromCharCode(65+i))]];
  for(const line of comparisonTable(items))
    rows.push([line.label,line.unit,...line.values]);
  rows.push(["Interpretation","",...items.map(()=>
    "Descriptive mapped baseline only. No environmental risk ranking, field verification, legal setback or selection recommendation.")]);
  rows.push(["Data source","",...items.map(()=> "ESA WorldCover 2021 v200; JRC GSW v1.5 1984-2024.")]);
  return "\ufeff"+rows.map(r=>r.map(csvCell).join(",")).join("\r\n")+"\r\n";
}
