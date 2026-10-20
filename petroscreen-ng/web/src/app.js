import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import {fromArrayBuffer} from "geotiff";
import {exportReportPdf} from "./report.js";
import {renderSiteDetail} from "./site_detail.js";
import {screeningNotes} from "./insights.js";
import {FIELD_TASKS,FIELD_STATUSES,createCaseFile,screeningCsv,fieldChecklistCsv,downloadText} from "./exports.js";
import {screenBrowser,inPolygon} from "./engine.js";
import "./style.css";

// MapLibre 6 uses an external ESM worker. Vite must bundle that worker explicitly.
maplibregl.setWorkerUrl(workerUrl);
const $=id=>document.getElementById(id);
const ui={form:$("screen-form"),lon:$("longitude"),lat:$("latitude"),
  button:$("screen-btn"),feedback:$("form-feedback"),empty:$("empty-state"),
  results:$("results"),subtitle:$("result-subtitle"),pdf:$("download-pdf"),
  dataStatus:$("data-status"),retry:$("retry-data")};
let lastResult=null, coverage=null, layers=null, site=null, mapReady=false, overview=null;
let verifiedStates=[];
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
});
function addOverview(){
  if(!mapReady||!overview||map.getSource("landcover-overview"))return;
  const [west,south,east,north]=overview.bounds_lon_lat;
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
    ui.feedback.textContent="Choose a site inside the highlighted verified regional boundary.";
    return;
  }
  invalidatePrevious();
  site=[lon,lat];ui.lon.value=lon.toFixed(6);ui.lat.value=lat.toFixed(6);
  drawSite();
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
  const form=$("field-record");
  if(form){
    form.open=false;
    $("field-observer").value="";
    $("field-visit-date").value="";
    $("field-notes").value="";
    for(const select of document.querySelectorAll("#field-checklist select"))select.value="not_checked";
  }
  ui.results.hidden=true;
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
  ui.button.textContent=state==="ready"?"Run environmental screening ↗":
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
function display(result){
  lastResult=result;
  ui.empty.hidden=true;ui.results.hidden=false;
  ui.subtitle.textContent=`Screening at ${fmt(site[1],5)}°N, ${fmt(site[0],5)}°E · ${result.radius_km} km radius`+
    (result.site_state?" · "+result.site_state:"");
  $("area-value").textContent=fmt(result.buffer_area_km2_approx,3)+" km²";
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
  drawSite(result.circle);
  const ring=result.circle.geometry.coordinates[0];
  const west=Math.min(...ring.map(p=>p[0])),east=Math.max(...ring.map(p=>p[0]));
  const south=Math.min(...ring.map(p=>p[1])),north=Math.max(...ring.map(p=>p[1]));
  map.fitBounds([[west,south],[east,north]],{
    padding:{top:95,bottom:85,left:65,right:65},maxZoom:14.5,duration:450
  });
  // Upgrade the visible background using the VERIFIED native 10m cells.
  // This layer does not participate in screening arithmetic or the PDF.
  const request=++detailRequestId;
  Promise.resolve().then(()=>renderSiteDetail(layers.worldcoverImages,
    result.location_wgs84.longitude,result.location_wgs84.latitude,result.radius_km))
    .then(detail=>{
      if(request!==detailRequestId || !mapReady || !lastResult)return;
      if(map.getLayer("native-site-detail")){
        map.removeLayer("native-site-detail");map.removeSource("native-site-detail");
      }
      map.addSource("native-site-detail",{type:"image",url:detail.url,
        coordinates:detail.coordinates});
      map.addLayer({id:"native-site-detail",type:"raster",source:"native-site-detail",
        paint:{"raster-opacity":1,"raster-resampling":"nearest"}},"pilot-fill");
      $("map").dataset.detailReady="true";
    })
    .catch(error=>{
      console.warn("Detailed site view unavailable; verified overview retained:",error.message);
      $("map").dataset.detailReady="fallback";
    });
}
ui.form.addEventListener("submit",async e=>{
  e.preventDefault();if(!layers){ui.feedback.textContent="Data not ready";return;}
  const lon=Number(ui.lon.value),lat=Number(ui.lat.value);
  const radiusKm=Number(document.querySelector("input[name=radius]:checked").value);
  ui.button.disabled=true;ui.feedback.textContent="Calculating locally from verified geospatial files…";
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
    site=[lon,lat];
    display(result);ui.feedback.textContent="Screening completed in your browser.";
  }catch(error){
    site=null;drawSite();
    ui.feedback.textContent="Screening failed: "+error.message;
  }finally{
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
  return createCaseFile({result:lastResult,manifest:layers.manifest,
    fieldRecord:currentFieldDraft()});
}
for(const [id,format] of [["download-data-json","json"],
                         ["download-data-csv","screening_csv"],
                         ["download-field-csv","field_csv"]]){
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
ui.pdf.addEventListener("click",async()=>{
  if(!lastResult)return;
  ui.pdf.disabled=true;
  ui.pdf.textContent="Preparing mapped screening PDF…";
  try{
    await exportReportPdf({result:lastResult,worldcoverImages:layers.worldcoverImages});
    ui.feedback.textContent="Mapped screening PDF downloaded.";
  }catch(error){
    ui.feedback.textContent="PDF report could not be completed: "+error.message;
  }finally{
    ui.pdf.disabled=false;
    ui.pdf.textContent="Download screening PDF ↓";
  }
});
$("methods-link").addEventListener("click",e=>{e.preventDefault();$("methods-dialog").showModal();});
$("close-methods").addEventListener("click",()=>$("methods-dialog").close());
setLoadState("loading","Preparing local satellite data…");loadData();
