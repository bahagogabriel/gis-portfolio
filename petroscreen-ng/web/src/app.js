import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import {fromArrayBuffer} from "geotiff";
import {exportReportPdf} from "./report.js";
import {appendDeskReviewHandoff} from "./handoff_report.js";
import {browserReadinessReport,readinessText} from "./browser_readiness.js";
import {renderSiteDetail} from "./site_detail.js";
import {renderMapLegend,updateMapLegend} from "./landcover_legend.js";
import {screeningNotes} from "./insights.js";
import {parseCaseText,confirmRescreenedCase,caseGeoJSON} from "./case_continuity.js";
import {buildPetroleumScope,normalizeFacilityContext,petroleumScopeCsv} from "./petroleum_scope.js";
import {FIELD_TASKS,FIELD_STATUSES,createCaseFile,screeningCsv,fieldChecklistCsv,downloadText} from "./exports.js";
import {buildEvidenceReview,evidenceReviewCsv} from "./evidence_review.js";
import {buildEvidenceActions,evidenceActionsCsv} from "./evidence_actions.js";
import {makeCaseBundle,downloadBundle} from "./case_bundle.js";
import {verifyCasePackage} from "./case_verifier.js";
import {captureCandidate,addCandidate,comparisonTable,comparisonCsv} from "./candidate_comparison.js";
import {recheckSavedComparison} from "./saved_case_comparison.js";
import {recheckSavedComparisonBatch} from "./batch_saved_comparison.js";
import {exportComparisonPdf} from "./comparison_report.js";
import {screenBrowser,inPolygon} from "./engine.js";
import "./style.css";

// MapLibre 6 uses an external ESM worker. Vite must bundle that worker explicitly.
maplibregl.setWorkerUrl(workerUrl);
const $=id=>document.getElementById(id);
renderMapLegend($("map-legend-classes"),$("map-legend-status"),$("map-legend-native"));
const setNativeLegend=(state,displaySize=1024)=>{
  updateMapLegend($("map-legend-status"),$("map-legend-native"),state,displaySize);
  $("map-color-unavailable").hidden=state==="native";
};
function setMapGuide(message,warning=false){
  $("map-tip-text").textContent=message;
  $("map-guide").dataset.state=warning?"warning":"hint";
}
function resetMapGuide(){
  if($("map-guide").dataset.state==="warning"){
    setMapGuide(site
      ?"Location already selected. Run screening or choose a different point."
      :"Click inside the outlined nine-state pilot area, or enter WGS84 coordinates.");
  }
}
const lightweightMap=$("lightweight-map");
lightweightMap.checked=window.matchMedia("(max-width: 600px)").matches;

const ui={form:$("screen-form"),lon:$("longitude"),lat:$("latitude"),
  button:$("screen-btn"),feedback:$("form-feedback"),empty:$("empty-state"),
  results:$("results"),subtitle:$("result-subtitle"),pdf:$("download-pdf"),
  dataStatus:$("data-status"),retry:$("retry-data")};
let lastResult=null, coverage=null, layers=null, site=null, mapReady=false, overview=null;
let candidates=[];
let comparisonImportBusy=false;
let verifiedStates=[];
let pendingImportedCase=null;
const regionalCache=new Map();
let detailRequestId=0;
let loadState="loading",loadStage="Preparing local satellite data…",loadError=null;
const map=new maplibregl.Map({container:"map",
  // Self-contained map style: essential geographic context must work without a tile provider.
  style:{version:8,sources:{},layers:[{id:"background",type:"background",
    paint:{"background-color":"#e6eee8"}}]},
  center:[6.02,4.83],zoom:8.35,attributionControl:false,
  pitchWithRotate:false,dragRotate:false});
map.addControl(new maplibregl.NavigationControl({showCompass:false}),"bottom-right");
window.addEventListener("resize",()=>map.resize());
map.on("movestart",resetMapGuide);
$("map-fit-pilot").addEventListener("click",()=>{
  if(!mapReady||!overview?.bounds_lon_lat)return;
  const [west,south,east,north]=overview.bounds_lon_lat;
  map.fitBounds([[west,south],[east,north]],{padding:32,maxZoom:9.5,duration:0});
  resetMapGuide();
});
$("jump-to-map").addEventListener("click",e=>{
  e.preventDefault();
  $("map").scrollIntoView({block:"center",behavior:"smooth"});
  map.resize();
});
$("map-continue").addEventListener("click",()=>{
  document.querySelector("fieldset.radius").scrollIntoView({block:"center",behavior:"smooth"});
  ui.button.focus({preventScroll:true});
});

const emptyGeo={type:"FeatureCollection",features:[]};
map.on("load",()=>{
  mapReady=true;
  for(const [id,type,paint] of [
    ["pilot-fill","fill",{"fill-color":"#a5cbb5","fill-opacity":0.12}],
    ["coverage-outline","line",{"line-color":"#276e55","line-width":2.7}],
    ["buffer","fill",{"fill-color":"#247a58","fill-opacity":0.16}],
    ["buffer-line","line",{"line-color":"#17704f","line-width":2,"line-dasharray":[2,1]}],
    ["selected-site","circle",{"circle-radius":7,"circle-color":"#123c2d",
                               "circle-stroke-color":"#fff","circle-stroke-width":3}]
  ]){
    const source=id.startsWith("pilot")||id==="coverage-outline"?"pilot":id.startsWith("buffer")?"study":"site";
    if(!map.getSource(source))map.addSource(source,{type:"geojson",data:emptyGeo});
    map.addLayer({id,type,source,paint});
  }
  if(coverage)map.getSource("pilot").setData(coverage);
  if(overview)addOverview();
  $("map-fit-pilot").disabled=!overview?.bounds_lon_lat;
});
function addOverview(){
  if(!mapReady||!overview||map.getSource("landcover-overview"))return;
  const [west,south,east,north]=overview.bounds_lon_lat;
  $("map-fit-pilot").disabled=false;
  map.addSource("landcover-overview",{type:"image",
    url:"./data/"+overview.file+"?sha256="+encodeURIComponent(overview.sha256),
    coordinates:[[west,north],[east,north],[east,south],[west,south]]});
  map.addLayer({id:"landcover-overview",type:"raster",source:"landcover-overview",
    paint:{"raster-opacity":0.9}},"pilot-fill");
  map.fitBounds([[west,south],[east,north]],{padding:45,maxZoom:9.5,duration:0});
}
map.on("idle",()=>{
  if(map.getSource("landcover-overview")&&map.isSourceLoaded("landcover-overview")){
    $("map").dataset.overviewReady="true";
  }
});
map.on("click",e=>{
  const [lon,lat]=[e.lngLat.lng,e.lngLat.lat];
  if(!coverage || !inPolygon([lon,lat],coverage)){
    const kept=lastResult?" Your previous screening remains valid.":
      site?" Your selected location remains unchanged.":"";
    ui.feedback.textContent="Map click outside verified nine-state coverage."+kept;
    setMapGuide("Outside verified pilot area. Use Show full pilot area, or choose a point inside the outlined region."+kept,true);
    return;
  }
  invalidatePrevious();
  site=[lon,lat];ui.lon.value=lon.toFixed(6);ui.lat.value=lat.toFixed(6);
  drawSite();
  setMapGuide("Site selected · Choose a radius and run environmental screening.");
  $("map-continue").hidden=false;
  ui.feedback.textContent=loadState==="ready"?
    "Site selected. Choose a radius and run screening.":
    "Site selected. Screening will unlock once satellite data are ready.";
  if(loadState==="loading")ui.dataStatus.textContent=loadStage;
});
function drawSite(circle=null) {
  if(!mapReady)return;
  map.getSource("site").setData(site ? {type:"FeatureCollection",features:[
    {type:"Feature",properties:{},geometry:{type:"Point",coordinates:site}}]} : emptyGeo);
  map.getSource("study").setData(circle||emptyGeo);
}
/** A changed or rejected location must never leave an old report presented as current. */
function invalidatePrevious(){
  lastResult=null;
  setNativeLegend("overview");
  $("map").dataset.detailReady="pending";
  updateComparisonButtons();
  const form=$("field-record");
  if(form){
    form.open=false;
    $("field-observer").value="";
    $("field-visit-date").value="";
    $("field-notes").value="";
    for(const select of document.querySelectorAll("#field-checklist select"))select.value="not_checked";
  }
  ui.results.hidden=true;
  $("view-findings").hidden=true;
  $("map-continue").hidden=true;
  setMapGuide("Click inside the outlined pilot area to set a site, or use WGS84 coordinates.");
  ui.empty.hidden=false;
  ui.subtitle.textContent="Your site assessment appears here after analysis.";
  detailRequestId++;
  if(mapReady && map.getLayer("native-site-detail")){
    map.removeLayer("native-site-detail");map.removeSource("native-site-detail");
  }
  if(mapReady && map.getSource("study"))map.getSource("study").setData(emptyGeo);
}
for(const input of [ui.lon,ui.lat]){
  input.addEventListener("input",()=>{
    invalidatePrevious();site=null;drawSite();
    ui.feedback.textContent="Location changed. Run a new environmental screening.";
  });
}
document.querySelectorAll('input[name="radius"]').forEach(input=>{
  input.addEventListener("change",()=>{
    invalidatePrevious();
    ui.feedback.textContent="Screening radius changed. Run a new analysis.";
  });
});
const fmt=(v,d=2)=>Number(v).toLocaleString("en-NG",{maximumFractionDigits:d,minimumFractionDigits:d});
function setLoadState(state,message){
  loadState=state;
  loadStage=message;
  ui.dataStatus.dataset.state=state;
  ui.dataStatus.textContent=message;
  ui.button.disabled=state!=="ready";
  ui.button.textContent=state==="ready"?"Run site screening ↗":
    state==="failed"?"Screening unavailable — data error":
    "Loading environmental data…";
  ui.retry.hidden=state!=="failed";
}
function setLoadProgress(message){
  if(loadState==="loading"){
    loadStage=message;ui.dataStatus.textContent=message;
  }
}
async function loadRaster(url,expectedHash){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),120000);
  let res;
  try{
    // Preview versions use the same localhost URL; never reuse a prior version's TIFF.
    res=await fetch(url,{cache:"no-store",signal:controller.signal});
    if(!res.ok)throw new Error("Unable to load "+url+" (HTTP "+res.status+")");
    const binary=await res.arrayBuffer();
    if(!globalThis.crypto?.subtle)throw new Error("Browser SHA-256 is unavailable for "+url);
    const digest=await crypto.subtle.digest("SHA-256",binary);
    const hash=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
    if(!expectedHash || hash!==expectedHash)throw new Error("Satellite file failed integrity verification: "+url);
    return (await fromArrayBuffer(binary)).getImage();
  }catch(e){
    if(e.name==="AbortError")throw new Error("Timed out loading "+url+"; check the local server and retry.");
    throw e;
  }finally{clearTimeout(timeout);}
}
async function loadData(){
  setLoadState("loading","Reading the verified Bayelsa–Rivers data manifest…");
  ui.retry.hidden=true;
  loadError=null;
  try{
    const response=await fetch("./data/manifest.json",{cache:"no-store"});
    if(!response.ok)throw new Error("No local data manifest (HTTP "+response.status+").");
    const manifest=await response.json();
    if(!["Bayelsa","Bayelsa and Rivers","Niger Delta nine-state research pilot"].includes(manifest.region) ||
       manifest.stage!=="research-preview")
      throw new Error("Unexpected research-preview data manifest.");
    setLoadProgress("Loading the verified state boundaries…");
    const boundaryResponse=await fetch("./data/coverage.geojson",{cache:"no-store"});
    if(!boundaryResponse.ok)throw new Error("Verified geographic boundary could not be loaded.");
    coverage=await boundaryResponse.json();
    verifiedStates=manifest.states||["Bayelsa"];
    const statesFile=manifest.original_states?.file;
    const stateFeatures=statesFile?await (async()=>{
      const r=await fetch("./data/"+statesFile,{cache:"no-store"});
      if(!r.ok)throw new Error("Original state boundaries not found (HTTP "+r.status+").");
      const geo=await r.json();
      if(!Array.isArray(geo.features)||geo.features.length!==verifiedStates.length)
        throw new Error("State polygons do not match the regional manifest.");
      return geo.features;
    })():null;
    const badge=document.querySelector(".status-pill");
    if(badge)badge.textContent="RESEARCH PREVIEW · "+manifest.region.toUpperCase();
    const regionLegend=$("region-coverage-text");
    if(regionLegend)regionLegend.textContent="Current screened coverage: "+manifest.region+
      ". Other Nigerian states remain outside the verified preview.";
    overview=manifest.overview;
    if(!overview?.file)throw new Error("Regional map overview is missing.");
    if(mapReady)map.getSource("pilot").setData(coverage);
    addOverview();
    if(manifest.state_sources){
      if(manifest.states?.length!==9 || manifest.state_sources.length!==9)
        throw new Error("Nine-state source index is incomplete.");
      layers={manifest,stateGeometries:stateFeatures,worldcoverImages:[],waterImage:null};
      setLoadState("ready","Ready to choose a site · nine verified state datasets load only when selected.");
      ui.feedback.textContent="Select a site and run screening. Its state-specific data load automatically.";
      return;
    }
    const images=[];
    for(let i=0;i<manifest.worldcover.length;i++){
      const source=manifest.worldcover[i];
      setLoadProgress("Verifying land-cover raster "+(i+1)+"/"+manifest.worldcover.length+"…");
      images.push(await loadRaster("./data/"+source.file+"?sha256="+encodeURIComponent(source.sha256),source.sha256));
    }
    setLoadProgress("Verifying historical surface-water data (final layer)…");
    const water=await loadRaster("./data/"+manifest.water.file+"?sha256="+encodeURIComponent(manifest.water.sha256),manifest.water.sha256);
    layers={stateGeometries:stateFeatures,worldcoverImages:images,waterImage:water,manifest};
    setLoadState("ready","Ready to screen · "+images.length+" land-cover tiles and historical water verified.");
    ui.feedback.textContent=site?
      "Site selected. Choose a radius and run screening.":
      "Environmental data ready. Click the map or enter coordinates.";
  }catch(error){
    layers=null;
    loadError=error;
    const message=error?.message||String(error);
    setLoadState("failed","Data loading failed: "+message+" · Select Retry to reload the satellite layers.");
    ui.feedback.textContent=site?
      "Your selected site is preserved, but screening is unavailable until data load successfully.":
      "The screening engine has not loaded. Use Retry after checking the local server.";
  }
}
ui.retry.addEventListener("click",()=>loadData());
/** Run strictly local capability checks with intentionally non-identifying data.
 * A ready MANIFEST is not evidence that all TIFF files have been downloaded.
 */
let readinessSnapshot=null;
function currentReadiness(){
  let canvas2D=false;
  try{canvas2D=!!document.createElement("canvas").getContext("2d");}catch{}
  return browserReadinessReport({
    secure_context:window.isSecureContext,
    webcrypto_sha256:!!window.crypto?.subtle?.digest,
    canvas_2d:canvas2D,
    interactive_map_initialized:mapReady,
    browser_download_supported:!!window.Blob && !!window.URL?.createObjectURL
  },loadState,layers?.manifest,regionalCache.keys().next().value||null);
}
$("check-browser-readiness").addEventListener("click",()=>{
  try{
    readinessSnapshot=currentReadiness();
    $("readiness-result").textContent=
      (readinessSnapshot.blockers.length?
        "Check identified "+readinessSnapshot.blockers.length+" browser/data issue(s). ":
        "Limited browser capability checks passed. ")+
      "Indexed states: "+readinessSnapshot.index.pilot_states_listed+
      " · indexed TIFFs: "+readinessSnapshot.index.source_tiff_files_listed+
      " · currently SHA-256-verified state: "+
      (readinessSnapshot.index.currently_sha256_verified_state||"none")+". "+
      readinessSnapshot.blockers.join(" ");
    $("download-readiness-report").disabled=false;
  }catch(error){
    readinessSnapshot=null;
    $("download-readiness-report").disabled=true;
    $("readiness-result").textContent="Browser check unavailable: "+error.message;
  }
});
$("download-readiness-report").addEventListener("click",()=>{
  if(!readinessSnapshot)return;
  downloadText("PetroScreenNG_v3_BrowserReadiness.txt",
    readinessText(readinessSnapshot),"text/plain;charset=utf-8");
});

async function getStateData(stateName){
  const manifest=layers?.manifest;
  const entry=manifest?.state_sources?.find(s=>s.state===stateName);
  if(!entry)throw new Error("No verified raster index for "+stateName);
  if(regionalCache.has(stateName))return regionalCache.get(stateName);
  const worldcover=[];
  const files=entry.source_files.filter(s=>s.kind==="worldcover");
  const water=entry.source_files.filter(s=>s.kind==="water");
  if(!files.length || water.length!==1)
    throw new Error("Incomplete mandatory state source files for "+stateName);
  for(let i=0;i<files.length;i++){
    const source=files[i];
    setLoadProgress("Verifying "+stateName+" land-cover tile "+(i+1)+"/"+files.length+"…");
    worldcover.push(await loadRaster("./data/"+source.file+"?sha256="+source.sha256,source.sha256));
  }
  setLoadProgress("Verifying "+stateName+" historical water…");
  const source=water[0];
  const waterImage=await loadRaster("./data/"+source.file+"?sha256="+source.sha256,source.sha256);
  const dataset={worldcoverImages:worldcover,waterImage};
  regionalCache.clear(); // cap memory to the most recently screened state
  regionalCache.set(stateName,dataset);
  return dataset;
}
function resolveSiteState(lon,lat){
  const names=layers?.manifest?.states||[];
  const matches=(layers?.stateGeometries||[]).filter(f=>inPolygon([lon,lat],f));
  if(matches.length!==1)throw new Error(
    "Site must lie unambiguously inside one verified state; boundary points need field verification.");
  const values=Object.values(matches[0].properties||{}).filter(v=>typeof v==="string");
  const name=names.find(n=>values.some(value=>value.toLowerCase()===n.toLowerCase()));
  if(!name)throw new Error("Cannot verify the selected state's source boundary.");
  return name;
}
/** Select only a manifest-provided QA example, NOT a synthetic petroleum site. */
function chooseManifestExample(stateName="Delta"){
  if(loadState!=="ready"||!layers?.manifest?.state_sources)
    throw new Error("Verified pilot manifest is not ready yet.");
  if(lastResult||pendingImportedCase||ui.form.getAttribute("aria-busy")==="true")
    throw new Error("A screening or saved-case task is already open. Save that case before switching to a demonstration coordinate.");
  const source=layers.manifest.state_sources.find(x=>x.state===stateName);
  if(!source||!Array.isArray(source.qa_example_lon_lat)||source.qa_example_lon_lat.length!==2)
    throw new Error("No verified published demonstration coordinate for "+stateName+".");
  const [longitude,latitude]=source.qa_example_lon_lat;
  if(!Number.isFinite(longitude)||!Number.isFinite(latitude)||
      !inPolygon([longitude,latitude],coverage)||
      resolveSiteState(longitude,latitude)!==stateName)
    throw new Error("Published example failed its current nine-state boundary check.");
  invalidatePrevious();
  site=[longitude,latitude];
  ui.lon.value=longitude.toFixed(6);
  ui.lat.value=latitude.toFixed(6);
  drawSite();
  $("map-continue").hidden=false;
  setMapGuide("Delta demonstration point selected. Choose a radius and run screening.");
  ui.feedback.textContent="Delta example coordinates entered from the verified manifest. No analysis has run yet.";
  map?.easeTo({center:site,zoom:10,duration:0});
  return {state:stateName,longitude,latitude};
}
$("try-example").addEventListener("click",()=>{
  try{
    const example=chooseManifestExample();
    $("example-status").textContent=example.state+" demonstration coordinates selected: "+
      example.longitude.toFixed(6)+", "+example.latitude.toFixed(6)+
      ". Choose 1, 3 or 5 km, then run site screening. This is not a mapped facility.";
    $("screen-btn").focus({preventScroll:true});
  }catch(error){
    $("example-status").textContent="Example not selected: "+error.message;
  }
});
function facilityContext(){
  return normalizeFacilityContext({facility_type:$("facility-type").value,
    project_stage:$("project-stage").value,
    project_reference:$("project-reference").value});
}
function updatePetroleumPlan(result=lastResult){
  if(!result)return;
  const plan=buildPetroleumScope(result,facilityContext());
  $("scope-summary").textContent=plan.facility_label+" · "+plan.stage_label+" · "+
    plan.tasks.length+" unreviewed evidence prompts. The site was not matched to any verified petroleum asset inventory.";
  const root=$("scope-tasks");root.replaceChildren();
  for(const task of plan.tasks){
    const node=document.createElement("div");node.className="scope-task";
    const title=document.createElement("strong");title.textContent=task.title;
    const detail=document.createElement("p");detail.textContent=task.evidence_to_check;
    const source=document.createElement("small");source.textContent=task.prompt_basis;
    node.append(title,detail,source);root.append(node);
  }
}
for(const field of ["facility-type","project-stage","project-reference"]){
  $(field).addEventListener(field==="project-reference"?"input":"change",()=>{
    if(lastResult){updatePetroleumPlan();renderEvidenceReview();}
  });
}
function refreshVisualDetail(result){
  const request=++detailRequestId;
  const displaySize=lightweightMap.checked?512:1024;
  setNativeLegend("overview");
  $("map").dataset.detailReady="pending";
  Promise.resolve().then(()=>renderSiteDetail(layers.worldcoverImages,
    result.location_wgs84.longitude,result.location_wgs84.latitude,result.radius_km,
    {displaySize}))
    .then(detail=>{
      if(request!==detailRequestId || !mapReady || lastResult!==result)return;
      if(map.getLayer("native-site-detail")){
        map.removeLayer("native-site-detail");map.removeSource("native-site-detail");
      }
      map.addSource("native-site-detail",{type:"image",url:detail.url,
        coordinates:detail.coordinates});
      map.addLayer({id:"native-site-detail",type:"raster",source:"native-site-detail",
        paint:{"raster-opacity":1,"raster-resampling":"nearest"}},"pilot-fill");
      $("map").dataset.detailReady="true";
      $("map").dataset.displaySize=String(detail.displaySizePx);
      setNativeLegend("native",detail.displaySizePx);
    })
    .catch(error=>{
      // Superseded async draws must NEVER revert a newer render to fallback.
      if(request!==detailRequestId || lastResult!==result)return;
      console.warn("Detailed site view unavailable; verified overview retained:",error.message);
      $("map").dataset.detailReady="fallback";
      setNativeLegend("fallback");
    });
}
lightweightMap.addEventListener("change",()=>{
  // Presentation-only rerender. Never rerun geospatial arithmetic, restore
  // previous field records, download TIFFs, or change saved/CSV/PDF measurements.
  if(lastResult)refreshVisualDetail(lastResult);
});
function display(result){
  lastResult=result;
  ui.empty.hidden=true;ui.results.hidden=false;
  ui.subtitle.textContent=`Screening at ${fmt(site[1],5)}°N, ${fmt(site[0],5)}°E · ${result.radius_km} km radius`+
    (result.site_state?" · "+result.site_state:"");
  $("area-value").textContent=fmt(result.buffer_area_km2_approx,3)+" km²";
  $("view-findings").hidden=false;
  $("map-continue").hidden=true;
  $("view-findings").textContent="View "+(result.site_state||"site")+
    " screening findings · "+result.radius_km+" km ↓";
  setMapGuide((result.site_state||"Selected site")+
    " · "+result.radius_km+" km screened. ESA land cover is from 2021.");
  document.querySelector(".results-panel")?.scrollTo({top:0,behavior:"instant"});
  const c=Math.min(result.land_cover_2021.coverage.whole_buffer_coverage_pct_approx,
    result.surface_water_occurrence_1984_2024.coverage.whole_buffer_coverage_pct_approx);
  $("coverage-value").textContent=fmt(c,1)+"%";
  const land=$("land-cover");land.replaceChildren();
  for(const item of [...result.land_cover_2021.classes].sort((a,b)=>b.area_km2_approx-a.area_km2_approx)){
    const wrap=document.createElement("div");wrap.className="bar-item";
    const header=document.createElement("div");header.className="bar-top";
    const label=document.createElement("span");label.textContent=item.class;
    const percent=document.createElement("strong");percent.textContent=fmt(item.share_of_valid_classified_pct,1)+"%";
    header.append(label,percent);
    const track=document.createElement("div");track.className="bar-track";
    const fill=document.createElement("div");fill.className="bar-fill";
    fill.style.width=Math.max(0,Math.min(100,item.share_of_valid_classified_pct))+"%";
    track.append(fill);wrap.append(header,track);land.append(wrap);
  }
  const water=$("water-summary");water.replaceChildren();
  for(const item of result.surface_water_occurrence_1984_2024.threshold_areas){
    const node=document.createElement("div");
    const b=document.createElement("b");b.textContent=fmt(item.area_km2_approx,3);
    const name=document.createElement("span");name.textContent="km² · ≥"+item.threshold_pct+"% historical occurrence";
    node.append(b,name);water.append(node);
  }
  const status=$("warnings");
  status.classList.toggle("coverage-ok",result.warnings.length===0);
  status.classList.toggle("coverage-caution",result.warnings.length>0);
  status.textContent=result.warnings.length?
    "Coverage caution: "+result.warnings.join(" | "):
    "Source coverage is sufficient for this preliminary buffer calculation.";
  const receptorPanel=$("receptor-summary");
  receptorPanel.replaceChildren();
  for(const item of result.mapped_context_2021.indicators){
    const line=document.createElement("div");line.className="receptor-item";
    const label=document.createElement("span");label.textContent=item.label;
    const detail=document.createElement("strong");
    detail.textContent=item.status==="mapped_in_study_buffer"
      ?fmt(item.nearest_pixel_centre_m_approx,0)+" m · "+fmt(item.area_km2_approx,3)+" km² mapped"
      :"Not mapped in buffer";
    line.append(label,detail);receptorPanel.append(line);
  }
  const checklist=$("field-checklist");
  checklist.replaceChildren();
  for(const task of FIELD_TASKS){
    const label=document.createElement("label");
    label.className="field-task";
    const title=document.createElement("span");
    title.textContent=task.title;
    title.title=task.detail;
    const select=document.createElement("select");
    select.dataset.fieldTask=task.id;
    select.setAttribute("aria-label",task.title+" field verification status");
    for(const option of FIELD_STATUSES){
      const item=document.createElement("option");
      item.value=option.value;item.textContent=option.label;select.append(item);
    }
    label.append(title,select);checklist.append(label);
  }
  const notes=$("interpretation");
  notes.replaceChildren();
  const heading=document.createElement("strong");
  heading.textContent="Desk-review findings and verification";
  notes.append(heading);
  for(const message of screeningNotes(result)){
    const line=document.createElement("p");
    line.textContent=message;
    notes.append(line);
  }
  updatePetroleumPlan(result);
  renderEvidenceReview();
  updateComparisonButtons();
  drawSite(result.circle);
  const ring=result.circle.geometry.coordinates[0];
  const west=Math.min(...ring.map(p=>p[0])),east=Math.max(...ring.map(p=>p[0]));
  const south=Math.min(...ring.map(p=>p[1])),north=Math.max(...ring.map(p=>p[1]));
  map.fitBounds([[west,south],[east,north]],{
    padding:{top:95,bottom:85,left:65,right:65},maxZoom:14.5,duration:450
  });
  // Upgrade the visible background using the VERIFIED native 10m cells.
  // This layer does not participate in screening arithmetic or the PDF.
  refreshVisualDetail(result);
}
ui.form.addEventListener("submit",async e=>{
  e.preventDefault();
  if(comparisonImportBusy){ui.feedback.textContent="Wait for saved-case comparison screening to finish.";return;}
  if(!layers){ui.feedback.textContent="Data not ready";return;}
  const lon=Number(ui.lon.value),lat=Number(ui.lat.value);
  const radiusKm=Number(document.querySelector("input[name=radius]:checked").value);
  ui.button.disabled=true;ui.feedback.textContent="Calculating locally from verified geospatial files…";
  ui.form.setAttribute("aria-busy","true");
  const importToRestore=pendingImportedCase;
  pendingImportedCase=null;
  invalidatePrevious();
  try{
    let stateName=null;
    if(layers.manifest.state_sources){
      if(!inPolygon([lon,lat],coverage))
        throw new Error("Site is outside the verified nine-state screening area.");
      stateName=resolveSiteState(lon,lat);
      setLoadState("loading","Loading verified "+stateName+" environmental data…");
      const selected=await getStateData(stateName);
      layers.worldcoverImages=selected.worldcoverImages;
      layers.waterImage=selected.waterImage;
    }
    const result=await screenBrowser({lon,lat,radiusKm,coverage,
      worldcoverImages:layers.worldcoverImages,waterImage:layers.waterImage,
      regionName:layers.manifest.region});
    if(layers.manifest.state_sources){
      result.site_state=stateName;
    }else if(layers.stateGeometries){
      const names=layers.manifest.states;
      const matched=layers.stateGeometries.find(feature=>inPolygon([lon,lat],feature));
      if(!matched)throw new Error("Site not within an individual supported state boundary.");
      const values=Object.values(matched.properties||{}).filter(v=>typeof v==="string");
      result.site_state=names.find(name=>values.some(v=>v.toLowerCase()===name.toLowerCase()))||null;
      if(!result.site_state)throw new Error("Site state attribution could not be verified.");
    }else result.site_state="Bayelsa";
    if(importToRestore)confirmRescreenedCase(importToRestore,result);
    site=[lon,lat];
    display(result);
    if(importToRestore){
      const previous=importToRestore.field;
      $("field-visit-date").value=previous.visit_date;
      $("field-observer").value=previous.observer;
      $("field-notes").value=previous.notes;
      for(const select of document.querySelectorAll("#field-checklist select"))
        select.value=previous.statuses[select.dataset.fieldTask]||"not_checked";
      $("field-record").open=true;
      const savedScope=importToRestore.source.petroleum_scope;
      if(savedScope){
        const restored=normalizeFacilityContext(savedScope);
        $("facility-type").value=restored.facility_type;
        $("project-stage").value=restored.project_stage;
        $("project-reference").value=restored.project_reference;
        $("facility-options").open=restored.facility_type!=="not_specified";
        updatePetroleumPlan(result);
      }
      renderEvidenceReview();
      $("case-import-status").textContent="Reopened case: current source hashes and screening measurements agree. Saved field notes restored as unverified user entries.";
      ui.feedback.textContent="Saved case re-screened and matched against current source data.";
    }else ui.feedback.textContent="Screening completed in your browser.";
  }catch(error){
    site=null;drawSite();
    if(importToRestore)$("case-import-status").textContent="Saved case was NOT restored: "+error.message;
    ui.feedback.textContent="Screening failed: "+error.message;
  }finally{
    ui.form.removeAttribute("aria-busy");
    if(loadState==="loading" && layers?.manifest?.state_sources)
      setLoadState("ready","Ready to screen · state datasets are verified on demand.");
    ui.button.disabled=loadState!=="ready";
  }
});
function currentFieldDraft(){
  const statuses={};
  for(const input of document.querySelectorAll("#field-checklist select"))
    statuses[input.dataset.fieldTask]=input.value;
  return {visit_date:$("field-visit-date").value,
    observer:$("field-observer").value,
    notes:$("field-notes").value,statuses};
}
function exportCase(){
  if(!lastResult)throw new Error("Complete a screening first");
  const item=createCaseFile({result:lastResult,manifest:layers.manifest,
    fieldRecord:currentFieldDraft(),facilityContext:facilityContext()});
  // Additive case property: the Stage 11 source-and-measurement re-screening
  // remains authoritative. Review flags are not accepted as scientific evidence.
  item.evidence_review=buildEvidenceReview(item);
  return item;
}
function renderEvidenceReview(){
  if(!lastResult)return;
  try{
    const summary=exportCase().evidence_review.review;
    const f=summary.field_tasks;
    $("review-summary").textContent=f.not_checked+" of "+f.total+
      " field checks not checked · "+f.user_reported+" user-reported statuses · "+
      f.follow_up+" follow-up flags. No environmental safety or compliance rating.";
    const root=$("review-flags");root.replaceChildren();
    for(const code of summary.unresolved_flags){
      const item=document.createElement("li");
      item.textContent=code.replaceAll("_"," ").toLowerCase();
      root.append(item);
    }
    renderEvidenceActions();
  }catch(error){
    $("review-summary").textContent="Evidence review unavailable: "+error.message;
    $("review-flags").replaceChildren();
    $("action-summary").textContent="Evidence requests unavailable: "+error.message;
    $("action-list").replaceChildren();
    $("download-actions-csv").disabled=true;
  }
}
const actionCategoryLabels={
  source_coverage:"Source coverage to review",
  field_verification:"Field observations to verify",
  petroleum_scoping_prompt:"Project evidence to request",
  professional_review:"Qualified review to arrange"
};
/** Plain-language requests from the SAME current provenance-checked case.
 * This renders suggestions only; not independent field verification.
 */
function renderEvidenceActions(){
  if(!lastResult)return;
  const plan=buildEvidenceActions(exportCase());
  const count=plan.summary;
  $("action-summary").textContent=
    count.field_not_checked+" field checks not checked · "+
    count.field_user_reported+" user-reported field statuses · "+
    count.field_follow_up+" user-requested follow-ups · "+
    count.scope_tasks_not_reviewed+" unreviewed project prompts · "+
    count.source_coverage_cautions+" source-coverage cautions. "+
    "No field evidence is authenticated here.";
  const root=$("action-list");root.replaceChildren();
  for(const [category,label] of Object.entries(actionCategoryLabels)){
    const selected=plan.actions.filter(a=>a.category===category);
    if(!selected.length)continue;
    const group=document.createElement("section");group.className="action-group";
    const heading=document.createElement("h4");
    heading.textContent=label+" ("+selected.length+")";
    group.append(heading);
    for(const entry of selected){
      const item=document.createElement("div");item.className="action-item";
      const title=document.createElement("strong");title.textContent=entry.title;
      const state=document.createElement("span");state.className="action-review-status";
      state.textContent=entry.review_status.replaceAll("_"," ");
      const prompt=document.createElement("p");prompt.textContent=entry.evidence_to_request;
      const basis=document.createElement("small");basis.textContent=
        "Why listed: "+entry.mapped_or_declared_basis;
      item.append(title,state,prompt,basis);group.append(item);
    }
    root.append(group);
  }
  $("download-actions-csv").disabled=false;
}
$("download-actions-csv").addEventListener("click",()=>{
  try{
    const casefile=exportCase();
    const plan=buildEvidenceActions(casefile);
    const slug=casefile.site.state.replace(/[^A-Za-z0-9_-]/g,"_");
    downloadText("PetroScreenNG_"+slug+"_EvidenceToCollect.csv",
      evidenceActionsCsv(plan),"text/csv;charset=utf-8");
    ui.feedback.textContent="Evidence-to-collect CSV downloaded locally. "+
      "Review site coordinates and user-entered field statuses before sharing.";
  }catch(error){
    ui.feedback.textContent="Evidence checklist download not completed: "+error.message;
  }
});
/** Keep the candidate evidence in volatile browser memory, never in a server,
 * persistent store or saved field record. Comparing results is NOT re-scoring.
 */
function updateComparisonButtons(){
  const add=$("add-candidate"),view=$("open-comparison");
  if(!add||!view)return;
  const already=lastResult&&candidates.some(x=>
    Math.hypot(x.longitude-lastResult.location_wgs84.longitude,
      x.latitude-lastResult.location_wgs84.latitude)<0.000001 &&
      x.radius_km===lastResult.radius_km);
  const different=lastResult&&candidates.length>0&&
    candidates[0].radius_km!==lastResult.radius_km;
  add.disabled=comparisonImportBusy||!lastResult||candidates.length>=4||Boolean(already||different);
  view.textContent="View comparison ("+candidates.length+")";
  view.disabled=candidates.length===0;
  add.textContent=already?"Already added to comparison":
    different?"Change radius or clear comparison":
    candidates.length>=4?"Comparison full (4 sites)":
      "Add current site to comparison";
}
function updateComparisonModal(){
  const target=$("comparison-table-holder"),actions=$("comparison-site-actions");
  target.replaceChildren();actions.replaceChildren();
  $("download-comparison-csv").disabled=candidates.length<2;
  $("download-comparison-pdf").disabled=candidates.length<2;
  $("comparison-intro").textContent=candidates.length+
    " screened site"+(candidates.length===1?"":"s")+
    (candidates.length?" · "+candidates[0].radius_km+" km shared radius.":" · Screen and add your first site.");
  if(!candidates.length){
    const note=document.createElement("p");
    note.textContent="No sites in this comparison. Close this dialog and add a completed screening.";
    target.append(note);return;
  }
  const table=document.createElement("table");table.className="comparison-data-table";
  const head=document.createElement("thead"),header=document.createElement("tr");
  for(const name of ["Mapped indicator","Unit",...candidates.map((_,i)=>
      "Site "+String.fromCharCode(65+i))]){
    const th=document.createElement("th");th.textContent=name;th.scope="col";header.append(th);
  }
  head.append(header);table.append(head);
  const body=document.createElement("tbody");
  for(const line of comparisonTable(candidates)){
    const tr=document.createElement("tr");
    const field=document.createElement("th");field.scope="row";field.textContent=line.label;
    const unit=document.createElement("td");unit.textContent=line.unit;
    tr.append(field,unit);
    for(const value of line.values){
      const cell=document.createElement("td");cell.textContent=value;tr.append(cell);
    }
    body.append(tr);
  }
  table.append(body);target.append(table);
  candidates.forEach((item,i)=>{
    const button=document.createElement("button");button.type="button";
    button.textContent="Remove "+String.fromCharCode(65+i)+" ("+item.state+")";
    button.setAttribute("aria-label","Remove comparison candidate "+String.fromCharCode(65+i)+", "+item.state);
    button.disabled=comparisonImportBusy;
    button.addEventListener("click",()=>{
      if(comparisonImportBusy)return;
      candidates=candidates.filter((_,j)=>j!==i);
      updateComparisonButtons();updateComparisonModal();
    });
    actions.append(button);
  });
}
$("add-candidate").addEventListener("click",()=>{
  try{
    if(comparisonImportBusy)throw Error("Wait for the saved-case batch to finish.");
    if(!lastResult||loadState!=="ready")throw Error("Complete screening before adding a site.");
    const item=captureCandidate(lastResult,layers.manifest);
    candidates=addCandidate(candidates,item);
    updateComparisonButtons();updateComparisonModal();
    $("comparison-status").textContent="Added "+item.state+" site to comparison ("+
      candidates.length+"/4). Choose a new point and screen at the same radius.";
  }catch(error){
    $("comparison-status").textContent="Comparison not changed: "+error.message;
  }
});
$("open-comparison").addEventListener("click",()=>{
  updateComparisonModal();
  if(!$("comparison-dialog").open)$("comparison-dialog").showModal();
});
$("open-saved-comparison").addEventListener("click",()=>{
  updateComparisonModal();
  if(!$("comparison-dialog").open)$("comparison-dialog").showModal();
});
$("close-comparison").addEventListener("click",()=>$("comparison-dialog").close());
$("comparison-case-file").addEventListener("change",async()=>{
  const input=$("comparison-case-file"),files=Array.from(input.files||[]);
  input.value=""; // Allow the same batch to be retried after a failure.
  if(!files.length||comparisonImportBusy)return;
  const status=$("comparison-import-status");
  try{
    if(loadState!=="ready"||!layers?.manifest?.state_sources||!layers?.stateGeometries)
      throw new Error("Wait for the verified nine-state data manifest and state boundaries.");
    if(files.length>4||files.length+candidates.length>4)
      throw new Error("Choose at most four cases including existing comparison sites.");
    if(files.some(f=>f.size>2*1024*1024||f.size===0))
      throw new Error("Every saved JSON file must be nonempty and no larger than 2 MB.");
    comparisonImportBusy=true;
    input.disabled=true;ui.button.disabled=true;
    updateComparisonButtons();updateComparisonModal();
    status.dataset.state="working";
    status.textContent="Prechecking "+files.length+" case file(s) before source-raster re-screening…";
    const sourceList=await Promise.all(files.map(f=>f.text()));
    const original=candidates;
    const verified=files.length===1
      ?[await recheckSavedComparison({
        text:sourceList[0],manifest:layers.manifest,candidates:[...candidates],
        coverage,stateFeatures:layers.stateGeometries,
        loadRasters:getStateData,screen:screenBrowser
      })]
      :await recheckSavedComparisonBatch({
        texts:sourceList,manifest:layers.manifest,candidates:[...candidates],
        coverage,stateFeatures:layers.stateGeometries,
        loadRasters:getStateData,screen:screenBrowser,
        onProgress:({completed,total,state})=>{
          status.textContent=completed===total
            ? "Every saved case passed independent re-screening; preparing the comparison…"
            : "Independently re-screening "+state+" case "+(completed+1)+
              " of "+total+" with current SHA-256-verified source TIFFs…";
        }
      });
    if(candidates!==original)
      throw Error("Comparison changed during verification. Please retry; nothing was imported.");
    const freshList=files.length===1?addCandidate(candidates,verified[0]):verified;
    // COMMIT ONLY HERE: every file passed; never leave partial batch additions.
    candidates=freshList;
    updateComparisonButtons();updateComparisonModal();
    status.dataset.state="passed";
    if(files.length===1){
      const fresh=verified[0];
      status.textContent="Re-screened "+fresh.state+" "+fresh.radius_km+
        " km case against currently verified source rasters; original saved measurements match. "+
        "Added as site "+String.fromCharCode(64+candidates.length)+
        ". Field notes and declared facility context were NOT imported.";
    }else{
      status.textContent="Batch accepted: all "+files.length+
        " saved cases independently re-screened against current verified raster data. "+
        "Every original measurement matched; "+files.length+
        " sites added atomically. Field notes and facility context were NOT imported.";
    }
  }catch(error){
    status.dataset.state="failed";
    status.textContent="Saved case NOT added: "+error.message+
      " Existing comparison unchanged.";
  }finally{
    comparisonImportBusy=false;
    input.disabled=false;
    ui.button.disabled=loadState!=="ready";
    updateComparisonButtons();updateComparisonModal();
  }
});
$("clear-comparison").addEventListener("click",()=>{
  if(comparisonImportBusy)return;
  candidates=[];updateComparisonButtons();updateComparisonModal();
  $("comparison-status").textContent="Comparison cleared. No candidate data are stored.";
});
$("download-comparison-pdf").addEventListener("click",()=>{
  if(candidates.length<2)return;
  const button=$("download-comparison-pdf");
  button.disabled=true;
  try{
    exportComparisonPdf(candidates);
  }catch(error){
    $("comparison-intro").textContent="Comparison PDF not completed: "+error.message;
  }finally{button.disabled=false;}
});
$("download-comparison-csv").addEventListener("click",()=>{
  if(candidates.length<2)return;
  try{
    downloadText("PetroScreenNG_SiteComparison_"+candidates[0].radius_km+"km.csv",
      comparisonCsv(candidates),"text/csv;charset=utf-8");
  }catch(error){
    $("comparison-intro").textContent="Comparison export unavailable: "+error.message;
  }
});
updateComparisonButtons();
$("view-findings").addEventListener("click",()=>{
  if(!lastResult)return;
  $("findings-title").scrollIntoView({block:"start",behavior:"instant"});
  $("findings-title").focus({preventScroll:true});
});
for(const id of ["field-visit-date","field-observer","field-notes"]){
  $(id).addEventListener("input",renderEvidenceReview);
}
$("field-checklist").addEventListener("change",renderEvidenceReview);
for(const [id,format] of [["download-data-json","json"],
                         ["download-data-csv","screening_csv"],
                         ["download-field-csv","field_csv"],
                         ["download-site-geojson","geojson"],
                         ["download-scope-csv","scope_csv"],
                         ["download-evidence-csv","evidence_csv"]]){
  $(id).addEventListener("click",()=>{
    try{
      const item=exportCase();
      const slug=item.site.state.replace(/[^A-Za-z0-9_-]/g,"_");
      if(format==="json"){
        downloadText("PetroScreenNG_"+slug+"_ScreeningCase.json",
          JSON.stringify(item,null,2)+"\n","application/json;charset=utf-8");
      }else if(format==="screening_csv"){
        downloadText("PetroScreenNG_"+slug+"_ScreeningData.csv",
          screeningCsv(item),"text/csv;charset=utf-8");
      }else if(format==="scope_csv"){
        downloadText("PetroScreenNG_"+slug+"_PetroleumEvidencePlan.csv",
          petroleumScopeCsv(item.petroleum_scope,item.site),
          "text/csv;charset=utf-8");
      }else if(format==="evidence_csv"){
        downloadText("PetroScreenNG_"+slug+"_EvidenceRegister.csv",
          evidenceReviewCsv(item.evidence_review),"text/csv;charset=utf-8");
      }else if(format==="geojson"){
        downloadText("PetroScreenNG_"+slug+"_Site_Buffer.geojson",
          JSON.stringify(caseGeoJSON(lastResult),null,2)+"\n",
          "application/geo+json;charset=utf-8");
      }else{
        downloadText("PetroScreenNG_"+slug+"_FieldChecklist.csv",
          fieldChecklistCsv(item),"text/csv;charset=utf-8");
      }
      ui.feedback.textContent="Local "+format.replaceAll("_"," ")+" file downloaded. Review coordinates and notes before sharing.";
    }catch(error){
      ui.feedback.textContent="Export not completed: "+error.message;
    }
  });
}
$("reopen-case").addEventListener("click",()=>$("case-file").click());
$("case-file").addEventListener("change",async()=>{
  const input=$("case-file"),file=input.files?.[0];
  input.value=""; // allow selecting the same file again after an error
  if(!file)return;
  try{
    if(!layers?.manifest || loadState!=="ready")
      throw new Error("Wait until the verified environmental data are ready.");
    if(file.size>2*1024*1024)
      throw new Error("Case file exceeds the 2 MB local import limit.");
    const imported=parseCaseText(await file.text(),layers.manifest);
    // Set these without dispatching input events. The actual submit path below
    // runs the geospatial engine independently and controls any field restoration.
    ui.lon.value=String(imported.site.longitude);
    ui.lat.value=String(imported.site.latitude);
    const radius=document.querySelector('input[name="radius"][value="'+imported.site.radius_km+'"]');
    if(!radius)throw new Error("Unsupported radius in saved case.");
    radius.checked=true;
    $("case-import-status").textContent="Rechecking saved screening with current local satellite data…";
    pendingImportedCase=imported;
    ui.form.requestSubmit();
  }catch(error){
    pendingImportedCase=null;
    $("case-import-status").textContent="Saved case not loaded: "+error.message;
    ui.feedback.textContent="Saved case import rejected: "+error.message;
  }
});
$("download-case-bundle").addEventListener("click",async()=>{
  if(!lastResult)return;
  const control=$("download-case-bundle");
  control.disabled=true;control.textContent="Preparing mapped PDF and case package…";
  try{
    // Use the identical accepted PDF renderer as the standalone download.
    // Only the output destination differs: bytes instead of saving a second PDF.
    const item=exportCase();
    const report=await exportReportPdf({result:lastResult,
      worldcoverImages:layers.worldcoverImages,
      petroleumScope:buildPetroleumScope(lastResult,facilityContext()),
      download:false});
    const bundle=await makeCaseBundle({casefile:item,result:lastResult,
      pdfBytes:report.output("arraybuffer"),pdfPageCount:report.getNumberOfPages()});
    downloadBundle(bundle);
    ui.feedback.textContent="Complete ZIP case package downloaded locally. Review its coordinates and notes before sharing.";
  }catch(error){
    ui.feedback.textContent="Case package not completed: "+error.message;
  }finally{
    control.disabled=false;control.textContent="Download complete case package · ZIP ↓";
  }
});
$("download-handoff-pdf").addEventListener("click",async()=>{
  if(!lastResult)return;
  const button=$("download-handoff-pdf");
  button.disabled=true;button.textContent="Preparing mapped professional handoff…";
  try{
    const item=exportCase();
    const pdf=await exportReportPdf({result:lastResult,
      worldcoverImages:layers.worldcoverImages,
      petroleumScope:buildPetroleumScope(lastResult,facilityContext()),
      download:false});
    const info=appendDeskReviewHandoff(pdf,item);
    if(info.base_pdf_pages<3||info.total_pdf_pages<=info.base_pdf_pages)
      throw new Error("Professional handoff is missing mapped or evidence pages.");
    const slug=item.site.state.replace(/[^a-z0-9_-]/gi,"_");
    pdf.save("PetroScreenNG_"+slug+"_Professional_DeskReview_Handoff.pdf");
    ui.feedback.textContent="Professional desk-review handoff PDF downloaded. "+
      "It contains user-entered statuses but no personal observer names or free-text field notes.";
  }catch(error){
    ui.feedback.textContent="Professional handoff could not be completed: "+error.message;
  }finally{
    button.disabled=false;button.textContent="Download professional desk-review handoff · PDF ↓";
  }
});
ui.pdf.addEventListener("click",async()=>{
  if(!lastResult)return;
  ui.pdf.disabled=true;
  ui.pdf.textContent="Preparing mapped screening PDF…";
  try{
    await exportReportPdf({result:lastResult,worldcoverImages:layers.worldcoverImages,
      petroleumScope:buildPetroleumScope(lastResult,facilityContext())});
    ui.feedback.textContent="Mapped screening PDF downloaded.";
  }catch(error){
    ui.feedback.textContent="PDF report could not be completed: "+error.message;
  }finally{
    ui.pdf.disabled=false;
    ui.pdf.textContent="Download screening PDF ↓";
  }
});
// Stage 15: package verification is independent from screening and saved-case reopening.
let pendingVerificationZip=null,verifiedReceipt=null;
const verifyInput=$("verify-zip-file"),verifyButton=$("verify-package-btn");
const verifyStatus=$("verify-package-status"),verifyDetails=$("verify-package-details");
const receiptButton=$("download-verification-receipt");
function resetVerification(){
  verifiedReceipt=null;verifyDetails.hidden=true;verifyDetails.replaceChildren();
  receiptButton.hidden=true;verifyButton.disabled=!pendingVerificationZip;
}
verifyInput.addEventListener("change",()=>{
  pendingVerificationZip=verifyInput.files?.[0]||null;
  resetVerification();
  verifyStatus.textContent=pendingVerificationZip?
    "Ready to check the selected ZIP locally.": "Select a case package ZIP.";
});
verifyButton.addEventListener("click",async()=>{
  if(!pendingVerificationZip)return;
  const chosen=pendingVerificationZip;
  resetVerification();
  verifyButton.disabled=true;
  verifyStatus.dataset.state="working";
  verifyStatus.textContent="Checking ZIP structure, CRC32 and SHA-256 locally…";
  try{
    if(chosen.size>50*1024*1024 || chosen.size<22)
      throw new Error("Invalid ZIP size; maximum supported package is 50 MiB.");
    const result=await verifyCasePackage(await chosen.arrayBuffer(),{
      sourceManifest:layers?.manifest||null});
    if(chosen!==pendingVerificationZip)return; // a different ZIP was selected
    verifiedReceipt=result.receipt;
    const status=result.summary.source_reference_status;
    verifyStatus.dataset.state=status==="matches_current_manifest"?"passed":"caution";
    verifyStatus.textContent="ZIP integrity checks PASSED: "+
      result.summary.sha256_files+" enclosed files match their SHA-256 manifest.";
    const rows=[
      "Archive SHA-256: "+result.receipt.archive_sha256,
      "ZIP entries: "+result.summary.entry_count+
        " · Declared PDF pages: "+result.summary.pdf_pages_declared,
      status==="matches_current_manifest"
        ?"Recorded source SHA-256 references match the currently published state manifest (source rasters NOT rechecked)."
        :status==="differs_from_current_manifest"
        ?"CAUTION: Recorded source hashes differ from the current published state manifest. This archive may come from another release."
        :"Source hashes were NOT compared to the currently published manifest.",
      "Integrity only. This is NOT evidence of authorship, true site conditions, fieldwork, or compliance."
    ];
    verifyDetails.replaceChildren();
    for(const line of rows){
      const p=document.createElement("p");p.textContent=line;verifyDetails.append(p);
    }
    verifyDetails.hidden=false;receiptButton.hidden=false;
  }catch(error){
    if(chosen!==pendingVerificationZip)return;
    verifyStatus.dataset.state="failed";
    verifyStatus.textContent="ZIP verification FAILED: "+error.message;
  }finally{
    verifyButton.disabled=!pendingVerificationZip;
  }
});
receiptButton.addEventListener("click",()=>{
  if(!verifiedReceipt)return;
  downloadText("PetroScreenNG_VerificationReceipt.json",
    JSON.stringify(verifiedReceipt,null,2)+"\n","application/json;charset=utf-8");
});
$("methods-link").addEventListener("click",e=>{e.preventDefault();$("methods-dialog").showModal();});
$("close-methods").addEventListener("click",()=>$("methods-dialog").close());
setLoadState("loading","Preparing local satellite data…");loadData();
