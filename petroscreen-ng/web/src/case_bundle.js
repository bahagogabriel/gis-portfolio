/** Stage 14: offline, dependency-free ZIP (STORE method) + SHA-256 case package.
 * Only files already generated from the same verified screening are bundled.
 * Checksums detect post-export changes, NOT authorship, field authenticity, or custody.
 */
import {screeningCsv,fieldChecklistCsv,CASE_SCHEMA} from "./exports.js";
import {petroleumScopeCsv} from "./petroleum_scope.js";
import {evidenceReviewCsv} from "./evidence_review.js";
import {caseGeoJSON} from "./case_continuity.js";

export const BUNDLE_SCHEMA="PetroScreenNG/CaseBundle/1.0";
const encoder=new TextEncoder();
const MAX_FILE=32*1024*1024,MAX_TOTAL=48*1024*1024;
const bytes=v=>typeof v==="string"?encoder.encode(v):
  v instanceof Uint8Array?v:
  v instanceof ArrayBuffer?new Uint8Array(v):null;
function checkName(name){
  if(typeof name!=="string"||!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,100}$/.test(name)||
      name==="."||name===".."||name.includes(".."))
    throw new Error("Unsafe case package entry filename");
}
function crc32(data){
  let crc=0xffffffff;
  for(const b of data){
    crc^=b;
    for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function write16(view,n,v){view.setUint16(n,v,true);}
function write32(view,n,v){view.setUint32(n,v>>>0,true);}
function join(chunks){
  const length=chunks.reduce((s,a)=>s+a.length,0);
  const result=new Uint8Array(length);let pos=0;
  for(const item of chunks){result.set(item,pos);pos+=item.length;}
  return result;
}
/** Standard ZIP32, UTF-8 names, CRC32 headers, no compression or third-party library. */
export function buildStoredZip(entries){
  if(!Array.isArray(entries)||entries.length<1||entries.length>18)
    throw new Error("Invalid number of package entries");
  const seen=new Set(),local=[],central=[];
  let offset=0,total=0;
  for(const entry of entries){
    checkName(entry?.name);
    if(seen.has(entry.name))throw new Error("Duplicate package entry");
    seen.add(entry.name);
    const data=bytes(entry.data),name=encoder.encode(entry.name);
    if(!data||data.length>MAX_FILE)throw new Error("Invalid or oversized case package entry");
    total+=data.length;
    if(total>MAX_TOTAL)throw new Error("Case package exceeds the local size limit");
    const crc=crc32(data);
    const localHeader=new Uint8Array(30+name.length),h=new DataView(localHeader.buffer);
    write32(h,0,0x04034b50);write16(h,4,20);write16(h,6,0x0800);
    write16(h,8,0);write16(h,10,0);write16(h,12,0);
    write32(h,14,crc);write32(h,18,data.length);write32(h,22,data.length);
    write16(h,26,name.length);write16(h,28,0);
    localHeader.set(name,30);
    const centralHeader=new Uint8Array(46+name.length),c=new DataView(centralHeader.buffer);
    write32(c,0,0x02014b50);write16(c,4,20);write16(c,6,20);
    write16(c,8,0x0800);write16(c,10,0);write16(c,12,0);write16(c,14,0);
    write32(c,16,crc);write32(c,20,data.length);write32(c,24,data.length);
    write16(c,28,name.length);write16(c,30,0);write16(c,32,0);
    write16(c,34,0);write16(c,36,0);write32(c,38,0);write32(c,42,offset);
    centralHeader.set(name,46);
    local.push(localHeader,data);central.push(centralHeader);
    offset+=localHeader.length+data.length;
  }
  const directory=join(central);
  const end=new Uint8Array(22),e=new DataView(end.buffer);
  write32(e,0,0x06054b50);write16(e,4,0);write16(e,6,0);
  write16(e,8,seen.size);write16(e,10,seen.size);
  write32(e,12,directory.length);write32(e,16,offset);write16(e,20,0);
  return join([...local,directory,end]);
}
async function sha256(data){
  if(!globalThis.crypto?.subtle)throw new Error("SHA-256 is unavailable in this secure browser context");
  const value=await crypto.subtle.digest("SHA-256",data);
  return Array.from(new Uint8Array(value),v=>v.toString(16).padStart(2,"0")).join("");
}
function readme(casefile,pages){
  const s=casefile.site;
  return [
    "PETROSCREEN NG | PRELIMINARY SCREENING CASE PACKAGE | v1.4",
    "Generated UTC: "+casefile.created_at_utc,
    "Location: "+s.state+" State | WGS84 longitude "+s.longitude+" latitude "+s.latitude,
    "Screening radius: "+s.radius_km+" km | Mapped PDF pages: "+pages,
    "",
    "PURPOSE: Reproducible preliminary DESK SCREENING ONLY.",
    "ESA WorldCover v200: land cover mapped in 2021, not an onsite survey.",
    "JRC GSW v1.5: historical water occurrence 1984-2024, not flood risk or contamination.",
    "Mapped feature distances: approximate classified PIXEL CENTRES, not legal setbacks.",
    "User-declared facility and field entries are NOT verified by PetroScreen.",
    "No petroleum asset location, hazard score, regulatory EIA, approval or field authenticity is established.",
    "",
    "CONTENTS: ScreeningCase.json, ScreeningData.csv, FieldChecklist.csv,",
    "EvidenceRegister.csv, Site_Buffer.geojson, Preliminary_Screening.pdf",
    "and optional PetroleumEvidencePlan.csv (only for a selected petroleum activity).",
    "MANIFEST.json contains exact SHA-256 hashes and byte counts of all other files.",
    "The manifest is not independently signed. Hashes detect later byte changes,",
    "not who created a record, whether a field inspection happened, or chain of custody.",
    "",
    "REOPEN A CASE: extract ScreeningCase.json and import it through PetroScreen NG.",
    "The browser re-screens against current verified source rasters before restoring notes.",
    "GeoJSON is approximate WGS84 point and circular study geometry (not cadastral).",
    "",
    "PRIVACY: Exact coordinates, facility context, observer and notes may be sensitive.",
    "The package is generated locally and downloaded; review and protect it before sharing.",
    "Hosting access logs may contain IP and requested public asset paths.",
    "",
    "SOURCE PROVENANCE: Full state-specific GeoTIFF SHA-256 digests are recorded",
    "in ScreeningCase.json and MANIFEST.json. Source rasters are NOT distributed in ZIP.",
    ""
  ].join("\n");
}
export async function makeCaseBundle({casefile,result,pdfBytes,pdfPageCount}){
  if(casefile?.schema!==CASE_SCHEMA||!casefile.evidence_review||
      !result||casefile.site?.state!==result.site_state||
      casefile.site?.radius_km!==result.radius_km||
      casefile.site?.longitude!==result.location_wgs84?.longitude||
      casefile.site?.latitude!==result.location_wgs84?.latitude)
    throw new Error("Case package needs a matching completed site screening and provenance record");
  if(!Number.isInteger(pdfPageCount)||pdfPageCount<3||pdfPageCount>8)
    throw new Error("Unexpected screening PDF page count");
  if(casefile.petroleum_scope?.facility_type==="not_specified"&&pdfPageCount!==3)
    throw new Error("General screening must preserve the three-page PDF");
  if(casefile.petroleum_scope?.facility_type!=="not_specified"&&pdfPageCount<4)
    throw new Error("Petroleum screening must include its evidence appendix");
  const pdf=bytes(pdfBytes);
  if(!pdf||pdf.length<5000||String.fromCharCode(...pdf.slice(0,5))!=="%PDF-")
    throw new Error("No valid mapped PDF available for package");
  const entries=[
    {name:"README.txt",data:readme(casefile,pdfPageCount),role:"package_instructions"},
    {name:"ScreeningCase.json",data:JSON.stringify(casefile,null,2)+"\n",role:"reopenable_case_with_raster_hashes"},
    {name:"ScreeningData.csv",data:screeningCsv(casefile),role:"screening_numeric_table"},
    {name:"FieldChecklist.csv",data:fieldChecklistCsv(casefile),role:"unverified_user_field_entries"},
    {name:"EvidenceRegister.csv",data:evidenceReviewCsv(casefile.evidence_review),role:"source_and_completeness_register"},
    {name:"Site_Buffer.geojson",data:JSON.stringify(caseGeoJSON(result),null,2)+"\n",role:"approximate_wgs84_gis_features"},
    {name:"Preliminary_Screening.pdf",data:pdf,role:"source_attributed_mapped_pdf"}
  ];
  if(casefile.petroleum_scope?.facility_type!=="not_specified")
    entries.push({name:"PetroleumEvidencePlan.csv",
      data:petroleumScopeCsv(casefile.petroleum_scope,casefile.site),
      role:"user_declared_unverified_planning_prompts"});
  const fingerprints=[];
  for(const e of entries){
    const raw=bytes(e.data);
    fingerprints.push({name:e.name,role:e.role,bytes:raw.length,sha256:await sha256(raw)});
  }
  const manifest={
    schema:BUNDLE_SCHEMA,created_at_utc:casefile.created_at_utc,
    package_version:"1.4",site:{...casefile.site},
    source_file_sha256:casefile.source_provenance.source_file_sha256.map(x=>({...x})),
    pdf_pages:pdfPageCount,files:fingerprints,
    protection:"SHA-256 detects changed files; this local manifest is unsigned and cannot authenticate author, fieldwork, or custody",
    scientific_limitations:"Source-dated preliminary mapping, not contamination detection, petroleum asset validation, regulatory EIA, legal setbacks or environmental risk score",
    privacy_notice:"Package includes exact coordinates and may contain project reference, observer and notes. Review before sharing."
  };
  entries.push({name:"MANIFEST.json",data:JSON.stringify(manifest,null,2)+"\n"});
  const zip=buildStoredZip(entries);
  const state=casefile.site.state.replace(/[^A-Za-z0-9_-]/g,"_");
  return {filename:"PetroScreenNG_"+state+"_CasePackage.zip",data:zip,manifest};
}
export function downloadBundle(bundle){
  if(!bundle?.data||!bundle?.filename)throw new Error("Missing ZIP");
  const blob=new Blob([bundle.data],{type:"application/zip"});
  const url=URL.createObjectURL(blob),anchor=document.createElement("a");
  anchor.href=url;anchor.download=bundle.filename;document.body.append(anchor);
  anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
}
