import * as maplibregl from "maplibre-gl";
import {fromArrayBuffer} from "geotiff";
import {jsPDF} from "jspdf";
import {screenBrowser,inPolygon} from "./engine.js";
import "./style.css";

const $=id=>document.getElementById(id);
const ui={form:$("screen-form"),lon:$("longitude"),lat:$("latitude"),
  button:$("screen-btn"),feedback:$("form-feedback"),empty:$("empty-state"),
  results:$("results"),subtitle:$("result-subtitle"),pdf:$("download-pdf")};
let lastResult=null, coverage=null, layers=null, site=null, mapReady=false;
const map=new maplibregl.Map({container:"map",
  style:"https://tiles.openfreemap.org/styles/positron",
  center:[6.02,4.83],zoom:8.35,attributionControl:true,
  pitchWithRotate:false,dragRotate:false});
map.addControl(new maplibregl.NavigationControl({showCompass:false}),"bottom-right");

const emptyGeo={type:"FeatureCollection",features:[]};
map.on("load",()=>{
  mapReady=true;
  for(const [id,type,paint] of [
    ["coverage-outline","line",{"line-color":"#276e55","line-width":2.7}],
    ["buffer","fill",{"fill-color":"#247a58","fill-opacity":0.16}],
    ["buffer-line","line",{"line-color":"#17704f","line-width":2,"line-dasharray":[2,1]}],
    ["selected-site","circle",{"circle-radius":7,"circle-color":"#123c2d",
                               "circle-stroke-color":"#fff","circle-stroke-width":3}]
  ]){
    const source=id==="coverage-outline"?"pilot":id.startsWith("buffer")?"study":"site";
    if(!map.getSource(source))map.addSource(source,{type:"geojson",data:emptyGeo});
    map.addLayer({id,type,source,paint});
  }
  if(coverage)map.getSource("pilot").setData(coverage);
});
map.on("click",e=>{
  const [lon,lat]=[e.lngLat.lng,e.lngLat.lat];
  if(!coverage || !inPolygon([lon,lat],coverage)){
    ui.feedback.textContent="Choose a site inside the highlighted Bayelsa pilot boundary.";
    return;
  }
  site=[lon,lat];ui.lon.value=lon.toFixed(6);ui.lat.value=lat.toFixed(6);
  drawSite();
  ui.feedback.textContent="Site selected. Choose a radius and run screening.";
});
function drawSite(circle=null) {
  if(!mapReady||!site)return;
  map.getSource("site").setData({type:"FeatureCollection",features:[
    {type:"Feature",properties:{},geometry:{type:"Point",coordinates:site}}]});
  map.getSource("study").setData(circle||emptyGeo);
}
const fmt=(v,d=2)=>Number(v).toLocaleString("en-NG",{maximumFractionDigits:d,minimumFractionDigits:d});
async function loadRaster(url,expectedHash){
  const res=await fetch(url,{cache:"force-cache"});
  if(!res.ok)throw new Error("Unable to load "+url+" (HTTP "+res.status+")");
  const binary=await res.arrayBuffer();
  if(expectedHash && crypto?.subtle){
    const digest=await crypto.subtle.digest("SHA-256",binary);
    const hash=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
    if(hash!==expectedHash)throw new Error("A geospatial data file failed SHA-256 integrity verification.");
  }
  return (await fromArrayBuffer(binary)).getImage();
}
async function loadData(){
  try{
    const response=await fetch("./data/manifest.json");
    if(!response.ok)throw new Error("No verified local data bundle is available yet.");
    const manifest=await response.json();
    if(manifest.region!=="Bayelsa" || manifest.stage!=="research-preview")
      throw new Error("Unexpected data bundle manifest.");
    const boundaryResponse=await fetch("./data/coverage.geojson");
    if(!boundaryResponse.ok)throw new Error("Boundary data could not be loaded.");
    coverage=await boundaryResponse.json();
    if(mapReady)map.getSource("pilot").setData(coverage);
    const images=await Promise.all(manifest.worldcover.map(
      item=>loadRaster("./data/"+item.file,item.sha256)));
    const water=await loadRaster("./data/"+manifest.water.file,manifest.water.sha256);
    layers={worldcoverImages:images,waterImage:water,manifest};
    ui.button.disabled=false;
    ui.feedback.textContent="Verified satellite data loaded. Click the map or enter coordinates.";
  }catch(error){
    ui.button.disabled=true;
    ui.feedback.textContent="Data could not be loaded: "+error.message;
  }
}
function display(result){
  lastResult=result;
  ui.empty.hidden=true;ui.results.hidden=false;
  ui.subtitle.textContent=`Screening at ${fmt(site[1],5)}°N, ${fmt(site[0],5)}°E · ${result.radius_km} km radius`;
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
  $("warnings").textContent=result.warnings.length?
    "Coverage caution: "+result.warnings.join(" | "):
    "Source coverage is sufficient for this preliminary buffer calculation.";
  drawSite(result.circle);
}
ui.form.addEventListener("submit",async e=>{
  e.preventDefault();if(!layers){ui.feedback.textContent="Data not ready";return;}
  const lon=Number(ui.lon.value),lat=Number(ui.lat.value);
  const radiusKm=Number(document.querySelector("input[name=radius]:checked").value);
  ui.button.disabled=true;ui.feedback.textContent="Calculating locally from verified geospatial files…";
  try{
    site=[lon,lat];
    const result=await screenBrowser({lon,lat,radiusKm,coverage,
      worldcoverImages:layers.worldcoverImages,waterImage:layers.waterImage});
    display(result);ui.feedback.textContent="Screening completed in your browser.";
  }catch(error){ui.feedback.textContent="Screening failed: "+error.message;}
  finally{ui.button.disabled=false;}
});
ui.pdf.addEventListener("click",()=>{
  if(!lastResult)return;
  const doc=new jsPDF({unit:"mm",format:"a4"});
  let y=20;const left=18;
  function line(text,size=10,step=7){
    doc.setFontSize(size);
    const segments=doc.splitTextToSize(String(text),173);
    if(y+segments.length*step>275){doc.addPage();y=20;}
    doc.text(segments,left,y);y+=segments.length*step;
  }
  line("PETROSCREEN NG",19,9);
  line("PRELIMINARY ENVIRONMENTAL SITE SCREENING — RESEARCH PREVIEW",9,8);
  line("Bayelsa, Nigeria  |  "+new Date().toISOString().slice(0,10),10,8);
  line("WGS84 longitude: "+lastResult.location_wgs84.longitude+", latitude: "+
    lastResult.location_wgs84.latitude+"; radius: "+lastResult.radius_km+" km",10);
  line("Buffer area: "+fmt(lastResult.buffer_area_km2_approx,5)+" km2 (approximately)",10);
  line("ESA WorldCover 2021 v200 — mapped land-cover composition",13);
  for(const c of lastResult.land_cover_2021.classes)line(
    c.class+": "+fmt(c.area_km2_approx,5)+" km2 ("+fmt(c.share_of_valid_classified_pct,2)+"% of valid classes)",9,5.5);
  y+=5;line("JRC Global Surface Water 1984–2024 — historical occurrence",13);
  for(const w of lastResult.surface_water_occurrence_1984_2024.threshold_areas)line(
    "Occurrence >= "+w.threshold_pct+"%: "+fmt(w.area_km2_approx,5)+" km2",9,6);
  line("Mapped land-cover coverage: "+fmt(lastResult.land_cover_2021.coverage.whole_buffer_coverage_pct_approx,2)+"%",9);
  line("Water raster coverage: "+fmt(lastResult.surface_water_occurrence_1984_2024.coverage.whole_buffer_coverage_pct_approx,2)+"%",9);
  if(lastResult.warnings.length)line("WARNINGS: "+lastResult.warnings.join("; "),9);
  y+=5;line("SOURCES AND CONDITIONS",12);
  line("ESA WorldCover 2021 v200, Zanaga et al. (2022), DOI:10.5281/zenodo.7254221; CC BY 4.0.",9,5);
  line("© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium.",8,5);
  line("European Commission Joint Research Centre, Global Surface Water v1.5 (1984–2024), CC BY 4.0.",8,5);
  line("Bayelsa boundary: geoBoundaries gbOpen Nigeria ADM1 (2022), CC BY 4.0.",8,5);
  line("LIMITATIONS: Preliminary satellite-derived screening only. Not a regulatory EIA, contamination map, spill prediction, flood-hazard assessment or field verification. Pixel-centre area approximations and coastline uncertainty apply.",9,6);
  doc.save("PetroScreenNG_Bayelsa_Preliminary_Screening.pdf");
});
$("methods-link").addEventListener("click",e=>{e.preventDefault();$("methods-dialog").showModal();});
$("close-methods").addEventListener("click",()=>$("methods-dialog").close());
ui.button.disabled=true;loadData();
