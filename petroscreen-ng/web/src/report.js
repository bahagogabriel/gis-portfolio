/** Local, source-attributed A4 environmental baseline report for PetroScreen NG.
 * This is a preliminary screening record. Never claim EIA/regulatory conclusions.
 */
import {jsPDF} from "jspdf";

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
  text(pdf,tag,192,18,8,[222,240,225],"normal");
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
    text(pdf,right,190,y,9,GREEN,"bold");
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
export async function exportReportPdf({result,map,download=true}){
  if(!result || !map)throw new Error("Completed screening and rendered map are required");
  // Wait for recent fitBounds animation before taking a graphic of the study buffer.
  if(map.isMoving() || !map.areTilesLoaded()){
    await Promise.race([
      new Promise(resolve=>map.once("idle",resolve)),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error("Map did not finish rendering")),10000))
    ]);
  }
  const canvas=map.getCanvas();
  if(!canvas || canvas.width<10 || canvas.height<10)
    throw new Error("Missing map canvas; cannot create mapped screening PDF");
  const mapData=canvas.toDataURL("image/png");
  if(!mapData || mapData.length<1500)
    throw new Error("Map image capture failed; refusing a map-less PDF");
  const pdf=new jsPDF({unit:"mm",format:"a4",compress:true});
  drawCover(pdf,result,mapData);
  drawDetails(pdf,result);
  if(download)pdf.save("PetroScreenNG_Bayelsa_Preliminary_Screening.pdf");
  return pdf;
}
