/** Stage 25. Additive professional desk-review PDF pages.
 * Existing mapped PDF is rendered unchanged first, then this source-limited
 * handoff is appended. All facts derive from the current verified case.
 * No field/asset authentication, site ranking or legal conclusions.
 */
import {buildEvidenceActions,ACTION_PLAN_SCHEMA} from "./evidence_actions.js";

export const HANDOFF_SCHEMA="PetroScreenNG/ProfessionalHandoff/1.0";
const INK=[28,58,47],GREEN=[25,91,60],MUTED=[66,91,76],PALE=[237,247,240];
const W=174,LEFT=18,BOTTOM=269;
const safe=value=>String(value??"").replace(/[\u2010-\u2015]/g,"-")
  .replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"')
  .replace(/[^\x20-\x7e]/g," ").replace(/\s+/g," ").trim();
const digits=value=>typeof value==="number"&&Number.isFinite(value)
  ?value.toLocaleString("en-NG",{maximumFractionDigits:4})
  :"not established";
export function handoffModel(casefile){
 const plan=buildEvidenceActions(casefile);
 if(plan.schema!==ACTION_PLAN_SCHEMA)throw Error("Missing validated action plan");
 const site=casefile.site;
 if(!Number.isFinite(site.longitude)||!Number.isFinite(site.latitude)||
   ![1,3,5].includes(site.radius_km))throw Error("Invalid source site geometry");
 const land=casefile.measurements.land_cover_2021;
 const water=casefile.measurements.historical_surface_water_1984_2024;
 if(!Array.isArray(land.classes)||!Array.isArray(water.threshold_areas))
   throw Error("Source case measurements incomplete");
 return {schema:HANDOFF_SCHEMA,plan,
   site:{...site},
   documented:{
    land_cover_year:2021,water_period:"1984-2024",
    esa_coverage_pct:land.coverage.whole_buffer_coverage_pct_approx,
    jrc_coverage_pct:water.coverage.whole_buffer_coverage_pct_approx,
    mapped_class_count:land.classes.length,
    water_threshold_count:water.threshold_areas.length},
   limitations:"Desktop source-dated context and user-reported field statuses only. Not an EIA, regulatory approval, environmental risk ranking, spill prediction, asset confirmation or independently verified field report.",
   privacy:"Includes coordinates, source references and field status labels. Omits free-text field notes and observer names. Review before sharing."
 };
}
function layout(pdf){
 let y=38,part="",page=pdf.getNumberOfPages();
 const txt=(value,x,yy,size=8.5,bold=false,color=INK)=>{
  pdf.setFont("helvetica",bold?"bold":"normal");
  pdf.setFontSize(size);pdf.setTextColor(...color);
  pdf.text(safe(value),x,yy);
 };
 const footer=()=>{
  pdf.setDrawColor(203,222,207);pdf.line(LEFT,282,192,282);
  txt("DESK REVIEW ONLY | Not a field inspection or regulatory clearance",LEFT,287,7,false,MUTED);
  txt("Page "+page,179,287,7,true,GREEN);
 };
 const pageStart=(tag)=>{
  pdf.addPage();page=pdf.getNumberOfPages();part=tag;y=39;
  pdf.setFillColor(...GREEN);pdf.rect(0,0,210,27,"F");
  txt("PETROSCREEN NG",LEFT,13,17,true,[255,255,255]);
  txt("PROFESSIONAL DESK-REVIEW HANDOFF",LEFT,20,7.8,true,[235,247,237]);
  pdf.setFillColor(...PALE);pdf.rect(LEFT,30,W,8,"F");
  txt(tag,LEFT+3,35.5,8.2,true,GREEN);
 };
 const ensure=n=>{
  if(y+n>BOTTOM){footer();pageStart(part+" (continued)");}
 };
 const lines=(value,size=8.2,maxWidth=W)=>{
  pdf.setFont("helvetica","normal");pdf.setFontSize(size);
  const arr=pdf.splitTextToSize(safe(value),maxWidth);
  return arr.length?arr:[""];
 };
 const para=(value,{size=8.2,lead=4.65,color=MUTED,x=LEFT,maxWidth=W,after=3}={})=>{
  let ln=lines(value,size,maxWidth),total=ln.length*lead+after;
  ensure(total);
  pdf.setFont("helvetica","normal");pdf.setFontSize(size);pdf.setTextColor(...color);
  for(const one of ln){pdf.text(one,x,y);y+=lead;}
  y+=after;
 };
 const heading=value=>{
  const ln=lines(value,10,W);
  ensure(ln.length*5.7+6);
  pdf.setFont("helvetica","bold");pdf.setFontSize(10);pdf.setTextColor(...GREEN);
  for(const l of ln){pdf.text(l,LEFT,y);y+=5.7;}
  pdf.setDrawColor(215,231,217);pdf.line(LEFT,y-2,192,y-2);y+=3;
 };
 const item=(title,status,request,basis)=>{
  const sections=[
   {v:safe(title)+" ["+safe(status).replaceAll("_"," ")+"]",size:8.3,lead:4.55,bold:true,c:INK},
   {v:"Evidence to request: "+request,size:7.7,lead:4.25,c:MUTED},
   {v:"Why listed: "+basis,size:7.5,lead:4.0,c:MUTED}
  ];
  let size=3;for(const s of sections)size+=lines(s.v,s.size).length*s.lead+1;
  ensure(size+3);
  for(const s of sections){
   const ls=lines(s.v,s.size);
   pdf.setFont("helvetica",s.bold?"bold":"normal");pdf.setFontSize(s.size);
   pdf.setTextColor(...s.c);
   for(const l of ls){pdf.text(l,LEFT+2,y);y+=s.lead;}
   y+=1;
  }
  pdf.setDrawColor(228,236,229);pdf.line(LEFT+2,y,190,y);y+=4;
 };
 return {pageStart,heading,para,item,footer,getY:()=>y};
}
/** Mutates the existing jsPDF instance only by APPENDING pages.
 * Original 3/4 mapped pages and original case ZIP remain exactly unchanged.
 */
export function appendDeskReviewHandoff(pdf,casefile){
 if(!pdf||typeof pdf.addPage!=="function"||typeof pdf.getNumberOfPages!=="function")
  throw Error("Existing mapped PDF required");
 const m=handoffModel(casefile),original=pdf.getNumberOfPages();
 if(original<3)throw Error("Base PDF is missing mapped scientific pages");
 const d=layout(pdf);
 d.pageStart("DECISION SUPPORT BOUNDARIES AND SOURCE-DATED FACTS");
 d.heading("Desk-review handoff | Preliminary mapped evidence");
 d.para("For professional assessment only. The mapped baseline was calculated from verified satellite source files. No petroleum facility, observed damage, legal compliance, safe site or actual field conditions are inferred.");
 d.heading("01 | Site and evidence provenance");
 d.para("Verified pilot state: "+m.site.state+" | WGS84 longitude: "+digits(m.site.longitude)+
  " | latitude: "+digits(m.site.latitude)+" | "+m.site.radius_km+" km radius.");
 d.para("Approximate buffer area: "+digits(m.site.study_area_km2_approx)+
  " km2. Case created: "+safe(casefile.created_at_utc)+
  ". This standalone handoff is generated in the visitor's browser.");
 d.para("ESA WorldCover 2021 v200 valid study-circle coverage: "+
  digits(m.documented.esa_coverage_pct)+"%. JRC Global Surface Water v1.5 (1984-2024) valid coverage: "+
  digits(m.documented.jrc_coverage_pct)+"%. Coverage is NOT model confidence or safety.");
 d.heading("02 | What the mapped baseline supports");
 d.para("Mapped ESA land-cover distribution represents 2021 classified pixels. Percentages use valid classified source pixels. JRC threshold areas represent historical water occurrence in valid 1984-2024 observations. Nearest-class distances refer to pixel centres within the chosen radius.");
 d.para("The original mapped map, complete numerical land-cover classes, water-threshold values, coverage methods and landscape context remain on the preceding unchanged pages.");
 d.heading("03 | What this desk review cannot establish");
 d.para("No present-day water quality, contamination, habitat verification, current occupied receptors, petroleum incidents, operational asset locations, legal setbacks, spill likelihood, site suitability or permit status are determined. Missing mapped pixels are NOT proof that real-world features are absent.");
 d.heading("04 | Status of supporting evidence");
 d.para(m.plan.summary.field_not_checked+" of 7 field checks remain not checked; "+
  m.plan.summary.field_user_reported+" statuses are user-reported (NOT authenticated); "+
  m.plan.summary.field_follow_up+" specialist follow-ups were selected by the user.");
 d.para(m.plan.summary.source_coverage_cautions+
  " source-coverage/boundary review requests; "+
  m.plan.summary.scope_tasks_not_reviewed+
  " petroleum/project evidence prompts remain unreviewed.");
 d.para("Any selected facility type is USER-DECLARED ONLY. Field observer names and free-text notes are deliberately excluded from this PDF; they may still be present in the separate local JSON case export.");
 d.footer();
 d.pageStart("EVIDENCE GAPS AND PROFESSIONAL VERIFICATION REQUESTS");
 d.heading("05 | Source caveats and field-verification status");
 const categories=[
  ["source_coverage","Source data and mapped coverage"],
  ["field_verification","Field observations awaiting independent review"],
  ["petroleum_scoping_prompt","Project evidence and engineering scoping prompts"],
  ["professional_review","Contemporary qualified review"]
 ];
 for(const [code,label] of categories){
  const selected=m.plan.actions.filter(x=>x.category===code);
  if(!selected.length)continue;
  d.heading(label+" ("+selected.length+" items)");
  for(const a of selected){
   d.item(a.title,a.review_status,a.evidence_to_request,a.mapped_or_declared_basis);
  }
 }
 d.heading("06 | Provenance: currently verified source raster references");
 for(const ref of m.plan.source_file_sha256){
  d.para("Source: "+safe(ref.name)+" | "+safe(ref.kind),{size:7.3,lead:4.1,after:1});
  const sha=safe(ref.sha256);
  if(!/^[0-9a-f]{64}$/i.test(sha))throw Error("Source checksum missing");
  d.para("SHA256: "+sha.slice(0,32)+" "+sha.slice(32),{size:7.1,lead:4.1,after:5});
 }
 d.heading("07 | Professional handoff conditions");
 d.para("Review site/source dates, data-coverage limitations and every user-reported status. Qualified field, ecological, engineering and regulatory personnel determine what additional evidence is appropriate and what current project-specific requirements apply.");
 d.para("The action register is NOT prioritized or risk scored. Listing an action does not prove a problem exists, establish a statutory requirement or constitute inspection completion.");
 d.para(m.privacy,{size:7.7});
 d.footer();
 return {schema:HANDOFF_SCHEMA,base_pdf_pages:original,
   total_pdf_pages:pdf.getNumberOfPages(),
   included_evidence_actions:m.plan.actions.length,
   no_new_scientific_measurements:true,no_field_authentication:true};
}
