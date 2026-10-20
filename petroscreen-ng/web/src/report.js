/** Local, source-attributed A4 environmental baseline report for PetroScreen NG.
 * This is a preliminary screening record. Never claim EIA/regulatory conclusions.
 */
import {jsPDF} from "jspdf";
import {metersPerDegree} from "./engine.js";

const GREEN=[24,76,56], INK=[24,51,48], MUTED=[90,110,102], PALE=[237,245,238];
const fmt=(n,d=2)=>Number(n).toLocaleString("en-NG",{minimumFractionDigits:d,maximumFractionDigits:d});
function text(pdf,value,x,y,size=10,color=INK,weight="normal"){
  pdf.setFont("helvetica",weight);pdf.setFontSize(size);pdf.setTextColor(...color);
  pdf.text(String(value),x,y);
}
function wrapped(pdf,value,x,y,maxWidth,size=8.5,leading=4.8,color=MUTED){
  pdf.setFont("helvetica","normal");pdf.setTextColor(...color);pdf.setFontSize(size);
  const lines=pdf.splitTextToSize(String(value),maxWidth);
  for(const ln of lines){pdf.text(ln,x,y);y+=leading;}
  return y;
}
function section(pdf,label,y){
  pdf.setDrawColor(215,229,219);pdf.line(18,y+2,192,y+2);
  text(pdf,label.toUpperCase(),18,y,10,GREEN,"bold");
  return y+10;
}
function header(pdf,tag){
  pdf.setFillColor(...GREEN);pdf.rect(0,0,210,29,"F");
  text(pdf,"PETROSCREEN NG",18,13,19,[255,255,255],"bold");
  text(pdf,"ENVIRONMENTAL INTELLIGENCE",18,20,8,[201,226,205],"bold");
  pdf.setFont("helvetica","normal");pdf.setFontSize(8);pdf.setTextColor(222,240,225);
  pdf.text(tag,190,18,{align:"right"});
}
function footer(pdf,page){
  pdf.setDrawColor(220,227,222);pdf.line(18,282,192,282);
  text(pdf,"RESEARCH PREVIEW  |  Not a regulatory EIA or field inspection",18,287,8,MUTED);
  text(pdf,String(page),190,287,8,MUTED,"bold");
}
function rows(pdf,items,startY){
  let y=startY;
  for(const [left,right] of items){
    if(y>268)throw new Error("PDF layout requires another page");
    text(pdf,left,19,y,9,INK);
    pdf.setFont("helvetica","bold");pdf.setFontSize(9);pdf.setTextColor(...GREEN);
    pdf.text(right,190,y,{align:"right"});
    pdf.setDrawColor(237,240,237);pdf.line(19,y+2,190,y+2);
    y+=8;
  }
  return y;
}
function drawCover(pdf,result,mapData){
  header(pdf,"BAYELSA PILOT");
  text(pdf,"Preliminary environmental site screening",18,38,14,INK,"bold");
  text(pdf,"Evidence-based site context, not petroleum impact or risk prediction",18,45,8,MUTED);
  pdf.setFillColor(...PALE);pdf.roundedRect(18,51,174,25,3,3,"F");
  const site=result.location_wgs84;
  const cols=[
    ["LONGITUDE",fmt(site.longitude,6)+" E"],
    ["LATITUDE",fmt(site.latitude,6)+" N"],
    ["SCREENING RADIUS",result.radius_km+" km"]
  ];
  for(let i=0;i<cols.length;i++){
    const x=24+i*57;
    text(pdf,cols[i][0],x,59,7,MUTED,"bold");
    text(pdf,cols[i][1],x,69,12,INK,"bold");
  }
  text(pdf,"01   SITE CONTEXT MAP",18,85,10,GREEN,"bold");
  pdf.setDrawColor(220,230,221);
  pdf.roundedRect(18,89,174,95,2,2,"S");
  pdf.addImage(mapData,"PNG",19,90,172,93,"map","FAST");
  text(pdf,"Illustrative ESA WorldCover 2021 map; circular boundary outlines the screening buffer.",18,190,8,MUTED);
  text(pdf,"WGS84 point and study buffer are approximate. Map is NOT a site survey.",18,196,8,MUTED);
  pdf.setFillColor(...PALE);pdf.roundedRect(18,204,174,27,3,3,"F");
  const coverage=Math.min(
    result.land_cover_2021.coverage.whole_buffer_coverage_pct_approx,
    result.surface_water_occurrence_1984_2024.coverage.whole_buffer_coverage_pct_approx
  );
  const measurements=[
    ["BUFFER AREA",fmt(result.buffer_area_km2_approx,3)+" km2"],
    ["RASTER COVERAGE",fmt(coverage,1)+"%"],
    ["DATA SNAPSHOTS","2021 / 2024"]
  ];
  for(let i=0;i<measurements.length;i++){
    const x=23+i*57;
    text(pdf,measurements[i][0],x,212,7,MUTED,"bold");
    text(pdf,measurements[i][1],x,223,13,INK,"bold");
  }
  let y=241;
  y=wrapped(pdf,"SCREENING SUMMARY: This report quantifies mapped land-cover composition and historical satellite-observed surface-water occurrence. Neither statistic measures contamination, likelihood of petroleum incidents, biodiversity harm, or legal compliance.",19,y,169,8,5);
  if(result.warnings.length){
    pdf.setTextColor(155,84,30);
    wrapped(pdf,"Coverage notes: "+result.warnings.join("; "),19,y+2,169,7.8,4.5,[155,84,30]);
  }
  footer(pdf,1);
}
function drawDetails(pdf,result){
  pdf.addPage();header(pdf,"METHODS AND RESULTS");
  let y=39;
  y=section(pdf,"02  ESA WorldCover 2021 - mapped land cover",y);
  const classes=[...result.land_cover_2021.classes]
    .sort((a,b)=>b.area_km2_approx-a.area_km2_approx);
  y=rows(pdf,classes.map(c=>[
    c.class+" ("+c.code+")",
    fmt(c.area_km2_approx,4)+" km2  |  "+fmt(c.share_of_valid_classified_pct,1)+"%"]),y);
  y+=6;y=section(pdf,"03  JRC historical surface-water occurrence",y);
  y=rows(pdf,result.surface_water_occurrence_1984_2024.threshold_areas.map(a=>[
    "Historical occurrence at or above "+a.threshold_pct+"%",
    fmt(a.area_km2_approx,4)+" km2"]),y);
  y+=5;
  y=wrapped(pdf,"Interpretation: JRC occurrence summarizes the share of valid historical Landsat observations classified as water from 1984 to 2024. It is not a present-day water map, flood hazard assessment or pollution measurement.",19,y,170,8,4.8);
  y+=6;y=section(pdf,"04  Coverage and methods",y);
  const wc=result.land_cover_2021.coverage.whole_buffer_coverage_pct_approx;
  const water=result.surface_water_occurrence_1984_2024.coverage.whole_buffer_coverage_pct_approx;
  y=wrapped(pdf,
    "Approximate data coverage: ESA "+fmt(wc,2)+"%; JRC "+fmt(water,2)+"%. Ellipsoidal row pixel areas, pixel-centre buffer selection; EPSG:4326 (WGS84). Data gaps and region-boundary intersections must not be treated as zero values.",19,y,170,8,4.7);
  if(result.warnings.length)y=wrapped(pdf,"Warnings: "+result.warnings.join("; "),19,y+2,170,8,4.7,[155,84,30]);
  y+=5;y=section(pdf,"05  Sources and professional limitations",y);
  const citations=[
    "ESA WorldCover 2021 v200; Zanaga et al. (2022), DOI:10.5281/zenodo.7254221; CC BY 4.0.",
    "Copyright ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium.",
    "European Commission Joint Research Centre, Global Surface Water v1.5, 1984-2024; source terms and cautions apply.",
    "geoBoundaries gbOpen Nigeria ADM1 2022, Bayelsa boundary, CC BY 4.0.",
    "Interpretation: preliminary desk screening only. Verify sensitive habitats, receptors, site conditions and project-specific regulatory requirements in field studies."
  ];
  for(const c of citations)y=wrapped(pdf,"- "+c,19,y+1,171,7.2,4.1);
  footer(pdf,2);
}
const COLORS={
  10:[65,123,91],20:[151,165,97],30:[198,192,124],40:[230,188,111],
  50:[217,128,104],60:[192,166,130],70:[228,235,230],80:[93,156,192],
  90:[116,173,158],95:[32,144,112],100:[178,168,148]
};
/** Render an independently sourced, TRUE location-centred report figure.
 * Reads the native WorldCover GeoTIFF data already loaded into the browser.
 * We never capture a potentially blank WebGL buffer or fake a site map.
 */
async function nativeSiteMap(result,worldcoverImages){
  if(!worldcoverImages?.length)throw new Error("Screening rasters not ready for map");
  const W=900,H=486,MAP_H=420,canvas=document.createElement("canvas");
  canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext("2d",{willReadFrequently:false});
  ctx.fillStyle="#e9eee7";ctx.fillRect(0,0,W,H);
  const lon=result.location_wgs84.longitude,lat=result.location_wgs84.latitude;
  const radiusM=result.radius_km*1000;
  const m=metersPerDegree(lat);
  const lonHalf=2.4*radiusM/m.east;
  const latHalf=1.3*radiusM/m.north;
  const left=lon-lonHalf,right=lon+lonHalf,top=lat+latHalf,bottom=lat-latHalf;
  let dataPixels=0;
  const dx=(right-left)/W,dy=(top-bottom)/MAP_H;
  for(const image of worldcoverImages){
    const [ox,oy]=image.getOrigin();
    const [rx,ry]=image.getResolution();
    if(!(rx>0&&ry<0))throw new Error("Unexpected native raster grid");
    const x0=Math.max(0,Math.floor((left-ox)/rx));
    const x1=Math.min(image.getWidth(),Math.ceil((right-ox)/rx));
    const y0=Math.max(0,Math.floor((top-oy)/ry));
    const y1=Math.min(image.getHeight(),Math.ceil((bottom-oy)/ry));
    if(x0>=x1||y0>=y1)continue;
    const lon0=ox+x0*rx,lon1=ox+x1*rx;
    const lat0=oy+y0*ry,lat1=oy+y1*ry;
    const drawX0=Math.max(0,Math.floor((lon0-left)/dx));
    const drawX1=Math.min(W,Math.ceil((lon1-left)/dx));
    const drawY0=Math.max(0,Math.floor((top-lat0)/dy));
    const drawY1=Math.min(MAP_H,Math.ceil((top-lat1)/dy));
    const outW=drawX1-drawX0,outH=drawY1-drawY0;
    if(outW<=0||outH<=0)continue;
    const sampled=await image.readRasters({
      window:[x0,y0,x1,y1],samples:[0],
      width:outW,height:outH,resampleMethod:"nearest"
    });
    const values=sampled[0];
    const tile=document.createElement("canvas");tile.width=outW;tile.height=outH;
    const imageCtx=tile.getContext("2d");
    const img=imageCtx.createImageData(outW,outH);
    for(let i=0;i<values.length;i++){
      const color=COLORS[values[i]];
      if(!color)continue;
      dataPixels++;
      const z=4*i;img.data[z]=color[0];img.data[z+1]=color[1];
      img.data[z+2]=color[2];img.data[z+3]=255;
    }
    imageCtx.putImageData(img,0,0);
    ctx.drawImage(tile,drawX0,drawY0,outW,outH);
  }
  if(dataPixels<300)throw new Error("Insufficient real source pixels for report map");
  const cx=W/2,cy=MAP_H/2;
  const radiusX=radiusM/(m.east*dx),radiusY=radiusM/(m.north*dy);
  ctx.beginPath();ctx.ellipse(cx,cy,radiusX,radiusY,0,0,2*Math.PI);
  ctx.fillStyle="rgba(243,250,237,0.10)";ctx.fill();
  ctx.lineWidth=5;ctx.strokeStyle="#173a2b";ctx.stroke();
  ctx.beginPath();ctx.ellipse(cx,cy,radiusX,radiusY,0,0,2*Math.PI);
  ctx.lineWidth=2;ctx.strokeStyle="#ffffff";ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,9,0,2*Math.PI);
  ctx.fillStyle="#153c30";ctx.fill();ctx.lineWidth=3;ctx.strokeStyle="#ffffff";ctx.stroke();
  ctx.fillStyle="rgba(15,52,40,0.90)";ctx.fillRect(12,12,308,49);
  ctx.font="bold 18px Arial";ctx.fillStyle="#ffffff";
  ctx.fillText("SITE SCREENING BUFFER",25,32);
  ctx.font="16px Arial";ctx.fillText(result.radius_km+" km radius  |  WGS84",25,52);
  // Scale bar uses local geographic metres at centre latitude, not arbitrary pixels.
  const barMeters=result.radius_km===1?500:result.radius_km===3?1000:2000;
  const barPx=barMeters/(m.east*dx);
  const bx=W-28-barPx,by=MAP_H-32;
  ctx.lineWidth=7;ctx.strokeStyle="#ffffff";ctx.beginPath();
  ctx.moveTo(bx,by);ctx.lineTo(bx+barPx,by);ctx.stroke();
  ctx.lineWidth=3;ctx.strokeStyle="#17372c";ctx.beginPath();
  ctx.moveTo(bx,by);ctx.lineTo(bx+barPx,by);ctx.stroke();
  ctx.font="bold 15px Arial";ctx.fillStyle="#17372c";
  ctx.fillText(barMeters>=1000?(barMeters/1000)+" km":barMeters+" m",bx,by-10);
  ctx.fillStyle="#ffffff";ctx.fillRect(0,MAP_H,W,H-MAP_H);
  const items=[[10,"Trees"],[95,"Mangroves"],[80,"Water"],[90,"Wetlands"],[50,"Built-up"],[40,"Cropland"]];
  ctx.font="15px Arial";ctx.fillStyle="#203d33";
  let px=25;const legendY=MAP_H+22;
  for(const [code,label] of items){
    ctx.fillStyle="rgb("+COLORS[code].join(",")+")";ctx.fillRect(px,legendY,18,13);
    ctx.fillStyle="#203d33";ctx.fillText(label,px+25,legendY+12);
    px+=label.length*9+58;
  }
  ctx.fillStyle="#547168";ctx.font="13px Arial";
  ctx.fillText("Mapped 2021 land cover  |  Source: ESA WorldCover v200  |  Pixel-centre study buffer",25,H-12);
  return canvas.toDataURL("image/png");
}
export async function exportReportPdf({result,worldcoverImages,download=true}){
  if(!result)throw new Error("Complete the screening before requesting a report");
  const mapData=await nativeSiteMap(result,worldcoverImages);
  if(mapData.length<5000)throw new Error("Raster report map is unexpectedly empty");
  const pdf=new jsPDF({unit:"mm",format:"a4",compress:true});
  drawCover(pdf,result,mapData);
  drawDetails(pdf,result);
  if(download)pdf.save("PetroScreenNG_Bayelsa_Preliminary_Screening.pdf");
  return pdf;
}
