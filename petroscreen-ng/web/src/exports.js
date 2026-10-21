/** Structured, reproducible screening export; no network, storage or user tracking. */
import {normalizeFacilityContext,buildPetroleumScope} from "./petroleum_scope.js";
export const CASE_SCHEMA="PetroScreenNG/ScreeningCase/1.0";
export const FIELD_STATUSES=Object.freeze([
  {value:"not_checked",label:"Not checked"},
  {value:"field_observed",label:"Observed during visit"},
  {value:"not_observed",label:"Not observed during visit"},
  {value:"requires_follow_up",label:"Needs specialist follow-up"}
]);
export const FIELD_TASKS=Object.freeze([
  {id:"surface_water",title:"Surface water and drainage",detail:"Check mapped waterways, seasonal drains and tides"},
  {id:"wetland",title:"Wetland conditions",detail:"Confirm wetland extent, vegetation and hydroperiod"},
  {id:"mangrove",title:"Mangrove habitat",detail:"Confirm mangroves and habitat management requirements"},
  {id:"built_up",title:"Occupied receptors",detail:"Distinguish housing, schools, healthcare and industrial facilities"},
  {id:"land_tenure",title:"Land use and access",detail:"Confirm current access, land-use and community stakeholders"},
  {id:"protected_status",title:"Protected/sensitive sites",detail:"Check official conservation designations and cultural locations"},
  {id:"existing_issues",title:"Existing environmental conditions",detail:"Document observed erosion, waste, disturbance and pre-existing impacts"}
]);
const statuses=new Set(FIELD_STATUSES.map(x=>x.value));
const ids=new Set(FIELD_TASKS.map(x=>x.id));
const limited=(s,max)=>{
  if(typeof s!=="string")return "";
  return s.trim().slice(0,max);
};
export function normalizeFieldRecord(record={}){
  const input=(record && typeof record==="object")?record:{};
  const tasks={};
  for(const task of FIELD_TASKS){
    const value=input.statuses?.[task.id]||"not_checked";
    if(!statuses.has(value))throw new Error("Unsupported field-verification status: "+task.id);
    tasks[task.id]=value;
  }
  const date=limited(input.visit_date,10);
  if(date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error("Invalid ISO field visit date");
  return {visit_date:date,observer:limited(input.observer,90),
    notes:limited(input.notes,2000),statuses:tasks};
}
export function createCaseFile({result,manifest,fieldRecord={},facilityContext={},generatedAt}){
  if(!result?.mapped_context_2021?.indicators || !result?.land_cover_2021?.classes ||
      !result?.surface_water_occurrence_1984_2024?.threshold_areas)
    throw new Error("A completed mapped site-screening result is required");
  const state=result.site_state;
  if(!manifest?.states?.includes(state))
    throw new Error("Source state not present in the verified manifest");
  const entry=manifest.state_sources?.find(x=>x.state===state);
  if(!entry?.source_files?.length)throw new Error("Missing verified state source manifest");
  const date=generatedAt||new Date().toISOString();
  if(!Number.isFinite(Date.parse(date)))throw new Error("Invalid export date");
  const verified=normalizeFieldRecord(fieldRecord);
  return {
    schema:CASE_SCHEMA,
    created_at_utc:date,
    output_type:"preliminary_satellite_environmental_site_context",
    scope:"research_preview; not a regulatory EIA or impact/risk prediction",
    site:{state,crs:"EPSG:4326",longitude:result.location_wgs84.longitude,
      latitude:result.location_wgs84.latitude,radius_km:result.radius_km,
      study_area_km2_approx:result.buffer_area_km2_approx},
    source_provenance:{
      land_cover:{provider:"ESA WorldCover 2021 v200",year:2021,classification_not_field_verified:true},
      surface_water:{provider:"JRC Global Surface Water v1.5",period:"1984–2024",
        historical_observation_not_flood_risk:true},
      boundary:"geoBoundaries gbOpen NGA ADM1 2022; original GRID3; CC BY 4.0",
      source_file_sha256:entry.source_files.map(x=>({name:x.file,sha256:x.sha256,kind:x.kind}))
    },
    measurements:{
      land_cover_2021:result.land_cover_2021,
      historical_surface_water_1984_2024:result.surface_water_occurrence_1984_2024,
      mapped_landscape_proximity_2021:result.mapped_context_2021
    },
    qa:{coverage_status:result.coverage_status,warnings:[...result.warnings],
      method_limitations:[...result.method_limitations]},
    petroleum_scope:buildPetroleumScope(result,normalizeFacilityContext(facilityContext)),
    field_verification:{
      method:"User-entered observations; not auto-populated from satellite classification",
      ...verified,
      checklist:FIELD_TASKS.map(task=>({...task,status:verified.statuses[task.id]}))
    },
    privacy_notice:"This file includes the selected coordinates and any manually entered field notes. Share only where authorized; no site coordinates or form inputs are intentionally uploaded by the app."
  };
}
function safeCell(value){
  if(value===null||value===undefined)return "";
  let s=String(value);
  // Neutralize spreadsheet formula injection, including leading whitespace.
  if(/^[\s\uFEFF]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
}
function makeCsv(rows){
  return "\ufeff"+rows.map(row=>row.map(safeCell).join(",")).join("\r\n")+"\r\n";
}
export function screeningCsv(casefile){
  if(casefile?.schema!==CASE_SCHEMA)throw new Error("Unsupported PetroScreen case");
  const h=["record_type","state","longitude","latitude","radius_km",
    "source_date","code","parameter","value","unit","interpretation"];
  const s=casefile.site,rows=[h];
  const add=(type,date,code,label,value,unit,note)=>rows.push([
    type,s.state,s.longitude,s.latitude,s.radius_km,date,code,label,value,unit,note
  ]);
  for(const c of casefile.measurements.land_cover_2021.classes)
    add("mapped_landcover",2021,c.code,c.class,c.area_km2_approx,"km2",
      "Classified mapped land-cover area, not field observation");
  for(const c of casefile.measurements.historical_surface_water_1984_2024.threshold_areas)
    add("historical_water","1984-2024",c.threshold_pct,"occurrence >= "+c.threshold_pct+"%",
      c.area_km2_approx,"km2","Historical observed occurrence; not flood risk");
  for(const c of casefile.measurements.mapped_landscape_proximity_2021.indicators)
    add("nearest_mapped_pixel_centre",2021,c.code,c.label,
      c.nearest_pixel_centre_m_approx,"metres",
      c.status==="mapped_in_study_buffer"?
        "Approximate point-to-pixel-centre; not regulatory setback":
        "Not mapped in available source; absence not established");
  add("metadata",2021,"","ESA valid coverage",
    casefile.measurements.land_cover_2021.coverage.whole_buffer_coverage_pct_approx,
    "percent","Approximate valid mapped pixel coverage");
  add("metadata","1984-2024","","JRC valid coverage",
    casefile.measurements.historical_surface_water_1984_2024.coverage.whole_buffer_coverage_pct_approx,
    "percent","Approximate historical water raster pixel coverage");
  return makeCsv(rows);
}
export function fieldChecklistCsv(casefile){
  if(casefile?.schema!==CASE_SCHEMA)throw new Error("Unsupported PetroScreen case");
  const s=casefile.site,f=casefile.field_verification;
  const rows=[["state","longitude","latitude","radius_km","visit_date","observer",
    "check_id","check","field_status","field_instruction","general_field_notes"]];
  for(const item of f.checklist){
    rows.push([s.state,s.longitude,s.latitude,s.radius_km,f.visit_date,f.observer,
      item.id,item.title,item.status,item.detail,f.notes]);
  }
  return makeCsv(rows);
}
export function downloadText(filename,contents,mimetype){
  const file=new Blob([contents],{type:mimetype});
  const url=URL.createObjectURL(file);
  const link=document.createElement("a");
  link.href=url;link.download=filename;
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
}
