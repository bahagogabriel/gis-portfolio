/**
 * PetroScreen NG Stage 03 - browser-side environmental baseline engine.
 * The calculated statistics are source descriptions, not petroleum hazard probabilities.
 * Works in Node tests and in the web app; no server endpoint or coordinate transmission.
 */
export const ENGINE_VERSION = "stage03.1";
export const ESA = {
  10:"Tree cover",20:"Shrubland",30:"Grassland",40:"Cropland",
  50:"Built-up",60:"Bare/sparse vegetation",70:"Snow and ice",
  80:"Permanent water bodies",90:"Herbaceous wetland",95:"Mangroves",
  100:"Moss and lichen"
};
export const JRC_THRESHOLDS=[1,50,90];
/** Satellite-derived *context* classes, not verified legally sensitive receptors. */
export const MAPPED_CONTEXT_CLASSES=[
  {code:80,label:"Mapped permanent water",verification:"Verify actual waterbody extent, tidal or seasonal conditions."},
  {code:90,label:"Mapped herbaceous wetland",verification:"Check wetland type, hydrology and present-day extent."},
  {code:95,label:"Mapped mangroves",verification:"Confirm mangrove presence and any habitat protection requirements."},
  {code:50,label:"Mapped built-up",verification:"Check whether any occupied settlements or public facilities are present."}
];
const DEG=Math.PI/180;
const A=6378137;
const ECC_SQ=0.0066943799901413165;
const ECC=Math.sqrt(ECC_SQ);

function primeIntegral(s) {
  return s/(2*(1-ECC_SQ*s*s)) + Math.atanh(ECC*s)/(2*ECC);
}
/** Exact ellipsoidal lat-lon *parallel bounded* pixel area (m²). */
export function pixelArea(latTop,latBottom,lonStep) {
  const a=Math.sin(latTop*DEG), b=Math.sin(latBottom*DEG);
  return Math.abs(lonStep*DEG*A*A*(1-ECC_SQ)*(primeIntegral(a)-primeIntegral(b)));
}
export function metersPerDegree(lat) {
  const p=lat*DEG;
  return {
    east:111412.84*Math.cos(p)-93.5*Math.cos(3*p)+0.118*Math.cos(5*p),
    north:111132.92-559.82*Math.cos(2*p)+1.175*Math.cos(4*p)-0.0023*Math.cos(6*p)
  };
}
export function approxDistanceMeters(lon1,lat1,lon2,lat2) {
  const scale=metersPerDegree((lat1+lat2)/2);
  return Math.hypot((lon2-lon1)*scale.east,(lat2-lat1)*scale.north);
}
export function validateLocation(lon,lat,radiusKm) {
  if (![lon,lat,radiusKm].every(Number.isFinite) || Math.abs(lon)>180 ||
      Math.abs(lat)>90 || ![1,3,5].includes(radiusKm))
    throw new Error("Enter valid WGS84 coordinates and select a 1, 3 or 5 km radius.");
}
export function inPolygon(point,geo) {
  const g=geo.type==="FeatureCollection" ? geo.features[0].geometry
        : geo.type==="Feature" ? geo.geometry : geo;
  if(!g || !["Polygon","MultiPolygon"].includes(g.type))throw new Error("Unsupported coverage geometry");
  function ringTest(ring) {
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const [xi,yi]=ring[i],[xj,yj]=ring[j];
      if((yi>point[1])!==(yj>point[1]) &&
         point[0]<(xj-xi)*(point[1]-yi)/(yj-yi)+xi)inside=!inside;
    }
    return inside;
  }
  function polygonTest(poly) {return ringTest(poly[0]) && !poly.slice(1).some(ringTest);}
  return g.type==="Polygon" ? polygonTest(g.coordinates) : g.coordinates.some(polygonTest);
}
export function circleGeometry(lon,lat,radiusKm,steps=256) {
  const scale=metersPerDegree(lat);
  const coords=[];
  for(let i=0;i<=steps;i++){
    const angle=i*2*Math.PI/steps;
    coords.push([lon+radiusKm*1000*Math.cos(angle)/scale.east,
                 lat+radiusKm*1000*Math.sin(angle)/scale.north]);
  }
  return {type:"Feature",properties:{radius_km:radiusKm},
    geometry:{type:"Polygon",coordinates:[coords]}};
}
function geoBBox(lon,lat,radiusKm){
  const s=metersPerDegree(lat),m=radiusKm*1000+60;
  return [lon-m/s.east,lat-m/s.north,lon+m/s.east,lat+m/s.north];
}
function numericalGrid(image) {
  const [originX,originY]=image.getOrigin();
  const [dx,dy]=image.getResolution();
  if (!(dx>0 && dy<0)) throw new Error("Unsupported rotated or reversed raster grid");
  return {originX,originY,dx,dy,width:image.getWidth(),height:image.getHeight()};
}
/** Read only a compact geographic window from one GeoTIFF, not a whole regional grid. */
export async function countImage(image,lon,lat,radiusKm,type){
  const g=numericalGrid(image);
  const [xmin,ymin,xmax,ymax]=geoBBox(lon,lat,radiusKm);
  const x0=Math.max(0,Math.floor((xmin-g.originX)/g.dx));
  const x1=Math.min(g.width,Math.ceil((xmax-g.originX)/g.dx));
  const y0=Math.max(0,Math.floor((ymax-g.originY)/g.dy));
  const y1=Math.min(g.height,Math.ceil((ymin-g.originY)/g.dy));
  if(x1<=x0 || y1<=y0)return {areas:{},validPixels:0,maskedPixels:0,nearestByCode:{}};
  const raster=await image.readRasters({window:[x0,y0,x1,y1],samples:[0]});
  const values=raster[0],width=x1-x0,height=y1-y0;
  const rawNoData=image.getGDALNoData();
  const nodata=rawNoData===null ? (type==="wc" ? 0:255) : Number(rawNoData);
  const areas={},nearestByCode={};let validPixels=0,maskedPixels=0;
  const maxDistance=radiusKm*1000;
  for(let r=0;r<height;r++){
    const globalRow=y0+r;
    const latTop=g.originY+globalRow*g.dy;
    const latBottom=latTop+g.dy;
    const latCenter=(latTop+latBottom)/2;
    const cellArea=pixelArea(latTop,latBottom,g.dx);
    for(let c=0;c<width;c++){
      const globalCol=x0+c;
      const pixelLon=g.originX+(globalCol+.5)*g.dx;
      const distance=approxDistanceMeters(lon,lat,pixelLon,latCenter);
      if(distance>maxDistance)continue;
      const value=values[r*width+c];
      if(value===nodata){maskedPixels++;continue;}
      if(type==="wc" && !(value in ESA))throw new Error("Unsupported ESA class code "+value);
      if(type==="jrc" && (value<0 || value>100))throw new Error("Invalid JRC occurrence code "+value);
      areas[value]=(areas[value]||0)+cellArea;
      if(type==="wc" && MAPPED_CONTEXT_CLASSES.some(item=>item.code===value)){
        nearestByCode[value]=Math.min(nearestByCode[value]??Infinity,distance);
      }
      validPixels++;
    }
  }
  return {areas,validPixels,maskedPixels,nearestByCode};
}
export function summarizeCount(count,kind,bufferAreaKm2){
  const total=Object.values(count.areas).reduce((a,b)=>a+b,0);
  const coveragePct=Math.min(100,100*(total/1e6)/bufferAreaKm2);
  const coverage={valid_area_km2_approx:+(total/1e6).toFixed(5),
    whole_buffer_coverage_pct_approx:+coveragePct.toFixed(3),
    valid_pixel_count:count.validPixels};
  if(kind==="wc"){
    return {coverage,classes:Object.keys(count.areas).map(Number).sort((a,b)=>a-b)
      .map(code=>({code,class:ESA[code],area_km2_approx:+(count.areas[code]/1e6).toFixed(5),
        share_of_valid_classified_pct:+(100*count.areas[code]/total).toFixed(3)}))};
  }
  return {coverage,threshold_areas:JRC_THRESHOLDS.map(threshold=>{
    const area=Object.entries(count.areas).reduce(
      (s,[value,a])=>s+(Number(value)>=threshold ? a:0),0);
    return {threshold_pct:threshold,area_km2_approx:+(area/1e6).toFixed(5),
      share_of_valid_jrc_area_pct:+(100*area/total||0).toFixed(3)};
  })};
}
/** Target area is geodesic circle approximation, not clipped political boundary area. */
export async function screenBrowser({lon,lat,radiusKm,coverage,worldcoverImages,waterImage,regionName="Bayelsa"}){
  validateLocation(lon,lat,radiusKm);
  if(!inPolygon([lon,lat],coverage))throw new Error("This point is outside the verified "+regionName+" screening area.");
  if(!worldcoverImages.length || !waterImage)throw new Error("Mandatory environmental rasters unavailable.");
  const circle=circleGeometry(lon,lat,radiusKm);
  const outside=circle.geometry.coordinates[0].some(p=>!inPolygon(p,coverage));
  const bufferAreaKm2=Math.PI*radiusKm**2;
  const wcAreas={},wcNearest={};let wcPixels=0;
  for(const image of worldcoverImages){
    const result=await countImage(image,lon,lat,radiusKm,"wc");
    wcPixels+=result.validPixels;
    for(const [k,a] of Object.entries(result.areas))wcAreas[k]=(wcAreas[k]||0)+a;
    for(const [k,d] of Object.entries(result.nearestByCode||{}))
      wcNearest[k]=Math.min(wcNearest[k]??Infinity,d);
  }
  const waterCount=await countImage(waterImage,lon,lat,radiusKm,"jrc");
  const wc=summarizeCount({areas:wcAreas,validPixels:wcPixels},"wc",bufferAreaKm2);
  const jrc=summarizeCount(waterCount,"jrc",bufferAreaKm2);
  const warnings=[];
  if(outside) warnings.push("BUFFER_CROSSES_SUPPORTED_BOUNDARY: outside the verified source coverage is unknown.");
  if(wc.coverage.whole_buffer_coverage_pct_approx<98)warnings.push("LAND_COVER_INCOMPLETE");
  if(jrc.coverage.whole_buffer_coverage_pct_approx<98)warnings.push("SURFACE_WATER_INCOMPLETE");
  if(wc.coverage.whole_buffer_coverage_pct_approx>101 || jrc.coverage.whole_buffer_coverage_pct_approx>101)
    throw new Error("Inconsistent raster tile overlap or pixel-area accounting.");
  return {
    engine_version:ENGINE_VERSION,scope:"preliminary_environmental_baseline",
    location_wgs84:{longitude:lon,latitude:lat},radius_km:radiusKm,
    buffer_area_km2_approx:+bufferAreaKm2.toFixed(5),
    coverage_region:regionName+" (verified pilot)",
    land_cover_2021:{source:"ESA WorldCover 2021 v200",...wc},
    mapped_context_2021:{
      source:"ESA WorldCover 2021 v200",
      method:"nearest mapped class pixel centre to site point (approximate WGS84 metres); within requested study radius only",
      search_radius_km:radiusKm,
      coverage_pct_approx:wc.coverage.whole_buffer_coverage_pct_approx,
      indicators:MAPPED_CONTEXT_CLASSES.map(({code,label,verification})=>{
        const cls=wc.classes.find(x=>x.code===code);
        const detected=Number.isFinite(wcNearest[code]);
        return {code,label,verification,status:detected?"mapped_in_study_buffer":"not_mapped_in_available_pixels",
          nearest_pixel_centre_m_approx:detected?+wcNearest[code].toFixed(1):null,
          area_km2_approx:cls?.area_km2_approx??0};
      })
    },
    surface_water_occurrence_1984_2024:{source:"JRC GSW v1.5, 1984-2024",...jrc},
    coverage_status:warnings.length?"partial":"sufficient",warnings,
    method_limitations:[
      "No claim of pollution, exposure, spill risk, flood probability or EIA approval",
      "Area estimates use pixel-centre inclusion and WGS84 row-area approximation",
      "Water occurrence is historical, not a measurement of present water",
      "Near-boundary buffers may extend into unprepared source coverage",
      "The browser engine requires parity validation against the independent Python reference"
    ],
    circle
  };
}
