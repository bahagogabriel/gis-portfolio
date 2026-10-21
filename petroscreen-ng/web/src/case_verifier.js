/** Stage 15: independent read-only verification of PetroScreen v1.4 case ZIP files.
 *
 * Independent of the package writer: parses ZIP32 central/local structures,
 * validates CRC32 and SHA-256, then audits manifest/case/GIS coherence.
 * This is internal integrity checking, NOT a digital signature, independent
 * satellite validation, regulatory approval or authentication of fieldwork.
 * No requests, eval, storage, script execution, or extraction to disk.
 */
export const VERIFIER_SCHEMA="PetroScreenNG/LocalVerificationReceipt/1.0";
const MAX_ARCHIVE=50*1024*1024,MAX_ENTRY=32*1024*1024,
  MAX_PAYLOAD=48*1024*1024,MAX_MANIFEST=256*1024,MAX_CASE=2*1024*1024;
const EXPECTED=[
  "README.txt","ScreeningCase.json","ScreeningData.csv","FieldChecklist.csv",
  "EvidenceRegister.csv","Site_Buffer.geojson","Preliminary_Screening.pdf"
];
const SAFE_NAME=/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,100}$/;
const HEX64=/^[0-9a-f]{64}$/;
const utf8=new TextDecoder("utf-8",{fatal:true});
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const readUtf8=b=>utf8.decode(b);
const compare=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sha256=async b=>{
  check(Boolean(globalThis.crypto?.subtle),"SHA-256 unavailable in this secure browser.");
  const sum=new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256",b));
  return Array.from(sum,v=>v.toString(16).padStart(2,"0")).join("");
};
function crc32(buf){
  let checksum=0xffffffff;
  for(const octet of buf){
    checksum^=octet;
    for(let k=0;k<8;k++){
      checksum=checksum&1?(checksum>>>1)^0xedb88320:checksum>>>1;
    }
  }
  return (checksum^0xffffffff)>>>0;
}
function parseZip(raw){
  const data=raw instanceof Uint8Array?raw:
    raw instanceof ArrayBuffer?new Uint8Array(raw):null;
  check(data && data.byteLength>=22 && data.byteLength<=MAX_ARCHIVE,
    "Invalid or oversized ZIP; maximum 50 MiB.");
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength),len=data.byteLength;
  const ensure=(p,n)=>check(Number.isSafeInteger(p)&&p>=0&&p+n<=len,
    "Truncated or malformed ZIP structure.");
  const u16=p=>{ensure(p,2);return view.getUint16(p,true);};
  const u32=p=>{ensure(p,4);return view.getUint32(p,true);};
  const end=len-22;
  check(u32(end)===0x06054b50,"ZIP end record missing or archive contains extra data.");
  check(u16(end+4)===0&&u16(end+6)===0&&u16(end+20)===0,
    "Multi-disk or commented ZIP is unsupported.");
  const n=u16(end+10),dirLen=u32(end+12),dirStart=u32(end+16);
  check(n>=8&&n<=9&&n===u16(end+8)&&dirStart+dirLen===end,
    "Unexpected ZIP entry count or central directory.");
  let cursor=dirStart,total=0;
  const entries=[];
  const seen=new Set();
  for(let i=0;i<n;i++){
    check(u32(cursor)===0x02014b50,"Invalid ZIP central directory.");
    ensure(cursor,46);
    const flags=u16(cursor+8),method=u16(cursor+10),crc=u32(cursor+16);
    const compressed=u32(cursor+20),uncompressed=u32(cursor+24);
    const nameLen=u16(cursor+28),extraLen=u16(cursor+30),commentLen=u16(cursor+32);
    const localAt=u32(cursor+42);
    check(flags===0x0800&&method===0&&compressed===uncompressed,
      "Only locally written UTF-8 STORE ZIP entries are supported.");
    check(u16(cursor+34)===0&&u32(cursor+38)===0,
      "Unsupported ZIP disk or external file metadata.");
    check(nameLen>0&&extraLen===0&&commentLen===0,
      "ZIP entry metadata not supported.");
    ensure(cursor+46,nameLen);
    const name=readUtf8(data.subarray(cursor+46,cursor+46+nameLen));
    check(SAFE_NAME.test(name)&&!name.includes("..")&&!seen.has(name),
      "Unsafe, repeated or unsupported ZIP filename.");
    check(uncompressed<=MAX_ENTRY,"Oversized ZIP entry.");
    total+=uncompressed;
    check(total<=MAX_PAYLOAD,"ZIP payload size limit exceeded.");
    seen.add(name);
    entries.push({name,localAt,size:uncompressed,crc,encodedName:data.subarray(cursor+46,cursor+46+nameLen)});
    cursor+=46+nameLen;
  }
  check(cursor===end,"Unexpected trailing central-directory data.");
  const results=new Map();
  let next=0;
  for(const e of entries.sort((a,b)=>a.localAt-b.localAt)){
    const p=e.localAt;
    check(p===next&&u32(p)===0x04034b50,"ZIP local entries overlap or have gaps.");
    ensure(p,30);
    check(u16(p+6)===0x0800&&u16(p+8)===0&&u16(p+26)===e.encodedName.length
      &&u16(p+28)===0,"ZIP local header differs from central directory.");
    check(u32(p+14)===e.crc&&u32(p+18)===e.size&&u32(p+22)===e.size,
      "ZIP size or CRC metadata mismatch.");
    const start=p+30,stop=start+e.encodedName.length;
    ensure(start,e.encodedName.length);
    check(data.subarray(start,stop).every((v,i)=>v===e.encodedName[i]),
      "ZIP central/local filename mismatch.");
    const endPayload=stop+e.size;
    check(endPayload<=dirStart,"ZIP entry overlaps central directory.");
    const payload=data.subarray(stop,endPayload);
    check(crc32(payload)===e.crc,"ZIP entry CRC mismatch: "+e.name);
    results.set(e.name,payload);
    next=endPayload;
  }
  check(next===dirStart,"ZIP contains extra or overlapping data.");
  return results;
}
function strictJson(bytes,max,name){
  check(bytes && bytes.length<=max,"Missing or oversized "+name);
  try{return JSON.parse(readUtf8(bytes));}
  catch{throw new Error("Invalid UTF-8 JSON in "+name);}
}
function validateRefs(refs){
  check(Array.isArray(refs)&&refs.length>=1&&refs.length<=12,"Missing state source references.");
  const ids=new Set();
  for(const r of refs){
    check(typeof r?.name==="string"&&typeof r?.kind==="string"&&HEX64.test(r?.sha256||"")&&!ids.has(r.name),
      "Invalid or duplicated source SHA-256 reference.");
    ids.add(r.name);
  }
}
function inspect(files){
  const man=strictJson(files.get("MANIFEST.json"),MAX_MANIFEST,"MANIFEST.json");
  const casefile=strictJson(files.get("ScreeningCase.json"),MAX_CASE,"ScreeningCase.json");
  check(man?.schema==="PetroScreenNG/CaseBundle/1.0"&&man.package_version==="1.4",
    "Unsupported case package schema/version.");
  check(casefile?.schema==="PetroScreenNG/ScreeningCase/1.0",
    "Unsupported screening case schema.");
  const petroleum=casefile.petroleum_scope?.facility_type!=="not_specified";
  check(typeof casefile.petroleum_scope?.facility_type==="string",
    "Incomplete facility declaration.");
  const required=[...EXPECTED,...(petroleum?["PetroleumEvidencePlan.csv"]:[]),"MANIFEST.json"];
  check(files.size===required.length&&required.every(x=>files.has(x)),
    "Package missing required evidence or containing unexpected files.");
  check(Array.isArray(man.files)&&man.files.length===required.length-1,
    "Incomplete file hash register.");
  const hashes=new Map();
  for(const f of man.files){
    check(typeof f?.name==="string"&&typeof f.role==="string"&&f.role.length<100&&
      Number.isInteger(f.bytes)&&f.bytes>=0&&HEX64.test(f.sha256)&&
      files.has(f.name)&&f.name!=="MANIFEST.json"&&!hashes.has(f.name),
      "Invalid or duplicated SHA-256 manifest entry.");
    check(f.bytes===files.get(f.name).length,"Manifest file-size mismatch: "+f.name);
    hashes.set(f.name,f.sha256);
  }
  check(hashes.size===required.length-1,"Incomplete manifest checksums.");
  check(typeof casefile.created_at_utc==="string"&&casefile.created_at_utc===man.created_at_utc&&
    Number.isFinite(Date.parse(man.created_at_utc)),"Case/manifest timestamp inconsistency.");
  check(compare(casefile.site,man.site)&&typeof casefile.site?.state==="string"&&
    casefile.site.crs==="EPSG:4326"&&
    Number.isFinite(casefile.site.longitude)&&Math.abs(casefile.site.longitude)<=180&&
    Number.isFinite(casefile.site.latitude)&&Math.abs(casefile.site.latitude)<=90&&
    [1,3,5].includes(casefile.site.radius_km),"Case/manifest WGS84 site mismatch.");
  validateRefs(man.source_file_sha256);
  validateRefs(casefile.source_provenance?.source_file_sha256);
  check(compare(man.source_file_sha256,casefile.source_provenance.source_file_sha256),
    "Case and manifest source hash references disagree.");
  const geo=strictJson(files.get("Site_Buffer.geojson"),MAX_CASE,"Site_Buffer.geojson");
  check(geo?.type==="FeatureCollection"&&geo.features?.length===2 &&
    geo.features[0]?.geometry?.type==="Point"&&
    geo.features[1]?.geometry?.type==="Polygon"&&
    compare(geo.features[0].geometry.coordinates,[casefile.site.longitude,casefile.site.latitude])&&
    geo.features[1].properties?.radius_km===casefile.site.radius_km&&
    Array.isArray(geo.features[1]?.geometry?.coordinates?.[0])&&
    geo.features[1].geometry.coordinates[0].length>=16,
    "GIS feature collection does not match the recorded point/radius.");
  const pdf=files.get("Preliminary_Screening.pdf");
  check(pdf?.length>=5000&&readUtf8(pdf.subarray(0,5))==="%PDF-",
    "Mapped report does not have a valid PDF file header.");
  check(Number.isInteger(man.pdf_pages)&&
    (petroleum?man.pdf_pages>=4&&man.pdf_pages<=8:man.pdf_pages===3),
    "PDF page-count metadata inconsistent with facility scope.");
  check(casefile.evidence_review?.review?.no_field_authentication===true&&
    casefile.petroleum_scope?.mapped_asset_locations_used===false,
    "Missing explicit limits on fieldwork and petroleum assets.");
  check(casefile.measurements?.land_cover_2021?.classes&&
    casefile.measurements?.historical_surface_water_1984_2024?.threshold_areas&&
    casefile.measurements?.mapped_landscape_proximity_2021?.indicators?.length===4,
    "Expected source-dated measurements are missing.");
  return {manifest:man,casefile,petroleum,hashes};
}
/** Verify archive strictly, entirely in local memory. Does not authenticate authorship. */
export async function verifyCasePackage(zip,{sourceManifest=null}={}){
  const archive=zip instanceof ArrayBuffer?new Uint8Array(zip):zip;
  const files=parseZip(archive);
  const {manifest,casefile,petroleum,hashes}=inspect(files);
  let checked=0;
  for(const [name,expected] of hashes){
    check(await sha256(files.get(name))===expected,"SHA-256 mismatch: "+name);
    checked++;
  }
  const expected=sourceManifest?.state_sources?.find(s=>s.state===casefile.site.state);
  let source_reference_status="not_compared";
  if(expected){
    const refs=expected.source_files||[];
    const actual=manifest.source_file_sha256;
    const same=refs.length===actual.length&&refs.every(f=>
      actual.filter(x=>x.name===f.file&&x.sha256===f.sha256&&x.kind===f.kind).length===1);
    source_reference_status=same?"matches_current_manifest":"differs_from_current_manifest";
  }
  const hash=await sha256(archive);
  const manifestHash=await sha256(files.get("MANIFEST.json"));
  const verified_at_utc=new Date().toISOString();
  const receipt={
    schema:VERIFIER_SCHEMA,verified_at_utc,
    archive_sha256:hash,embedded_manifest_sha256:manifestHash,
    zip_structure_crc32:"passed",file_sha256:"passed",
    entry_count:files.size,hashed_payload_count:checked,
    case_and_gis_metadata:"internally_consistent",
    source_reference_status,
    // Avoid copying exact coordinates or user-entered notes into receipt.
    scientific_validation:"not_performed",
    authenticated_author_or_fieldwork:false,
    verification_scope:"Internal ZIP/CRC32/SHA256 and selected case/GIS metadata consistency only. No independent source-raster calculation, file authorship, field verification, legal or environmental safety determination. A rewritten unsigned manifest and payloads can produce another internally consistent package.",
    private_data_notice:"The package was processed in this browser; share the ZIP only if authorized."
  };
  return {receipt,summary:{
    status:"internal_integrity_pass",entry_count:files.size,
    sha256_files:checked,source_reference_status,
    petroleum_appendix:petroleum,pdf_pages_declared:manifest.pdf_pages
  }};
}
