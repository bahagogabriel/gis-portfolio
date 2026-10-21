/** Stage 13: client-side evidence provenance and review completeness, NOT environmental risk.
 * This module contains no new mapped measurements, classifications or regulatory tests.
 * User-entered records remain allegations/notes until independently corroborated.
 */
export const EVIDENCE_REGISTER_SCHEMA="PetroScreenNG/EvidenceRegister/1.0";
const pct=x=>typeof x==="number"&&Number.isFinite(x)?x:null;
const safe=x=>x===null||x===undefined?"":String(x);
function record(id,title,category,status,source,detail,limitations){
  return {id,title,category,status,source,detail,limitations};
}
export function buildEvidenceReview(casefile){
  if(casefile?.schema!=="PetroScreenNG/ScreeningCase/1.0" ||
      !casefile.measurements?.land_cover_2021 ||
      !casefile.measurements?.historical_surface_water_1984_2024 ||
      !casefile.field_verification?.checklist ||
      !casefile.source_provenance?.source_file_sha256?.length)
    throw new Error("A complete SHA-referenced screening case is required for evidence review");
  const lc=casefile.measurements.land_cover_2021;
  const water=casefile.measurements.historical_surface_water_1984_2024;
  const mapped=casefile.measurements.mapped_landscape_proximity_2021;
  const field=casefile.field_verification;
  const scope=casefile.petroleum_scope;
  const entries=[
    record("wc_baseline","Land-cover baseline","mapped_2021","mapped_classification",
      "ESA WorldCover 2021 v200",
      "Mapped area by class; "+safe(lc.coverage?.whole_buffer_coverage_pct_approx)+"% approximate valid source coverage.",
      "2021 thematic classification, not current conditions, observed impacts or a ground survey"),
    record("jrc_baseline","Historical water occurrence","historical_1984_2024","historical_observation",
      "JRC Global Surface Water v1.5 (1984–2024)",
      "Historical area at JRC occurrence thresholds; "+safe(water.coverage?.whole_buffer_coverage_pct_approx)+"% approximate valid source coverage.",
      "Occurrence is not depth, future flood probability, water quality or present-day connectivity")
  ];
  for(const item of mapped?.indicators||[]){
    entries.push(record("mapped_"+item.code,item.label,"mapped_2021",
      item.status==="mapped_in_study_buffer"?"mapped_in_available_pixels":"not_mapped_in_available_pixels",
      "ESA WorldCover 2021 v200 / class "+item.code,
      item.status==="mapped_in_study_buffer"
        ?"Approximate nearest classified pixel centre: "+safe(item.nearest_pixel_centre_m_approx)+" metres"
        :"No pixel mapped to this class within the valid searched cells",
      "Not a surveyed feature boundary, confirmed occupied receptor, legal setback or proof of absence"));
  }
  const allowed=new Set(["not_checked","field_observed","not_observed","requires_follow_up"]);
  const counts={total:0,not_checked:0,user_reported:0,follow_up:0};
  for(const item of field.checklist){
    if(!allowed.has(item.status))throw new Error("Invalid field record status: "+item.id);
    counts.total++;
    if(item.status==="not_checked")counts.not_checked++;
    else if(item.status==="requires_follow_up")counts.follow_up++;
    else counts.user_reported++;
    entries.push(record("field_"+item.id,item.title,"user_reported_field_record",item.status,
      field.observer?"User-entered field record / "+field.observer:"User-entered field record / anonymous",
      "Visit date: "+(field.visit_date||"not supplied")+
        "; status selected by user"+(field.notes?"; general notes present":"; general notes absent"),
      "User reporting is unverified by PetroScreen; status is never inferred from satellite pixels"));
  }
  entries.push(record("facility_declaration","Facility and project context","user_declaration",
    scope?.facility_type==="not_specified"?"not_supplied":"user_declared_unverified",
    "User selection",safe(scope?.facility_label||"General environmental screening"),
    "No independent petroleum asset identification or official permit verification"));
  for(const task of scope?.tasks||[]){
    entries.push(record("scope_"+task.id,task.title,"petroleum_scoping_prompt",
      "not_reviewed",safe(task.prompt_basis),safe(task.evidence_to_check),
      "Planning prompt only; not an inspection finding, legal clearance or completed action"));
  }
  const lcPct=pct(lc.coverage?.whole_buffer_coverage_pct_approx);
  const waterPct=pct(water.coverage?.whole_buffer_coverage_pct_approx);
  const warnings=Array.isArray(casefile.qa?.warnings)?casefile.qa.warnings:[];
  const flags=[];
  if(lcPct===null||lcPct<98)flags.push("ESA_2021_VALID_COVERAGE_INCOMPLETE");
  if(waterPct===null||waterPct<98)flags.push("JRC_HISTORICAL_VALID_COVERAGE_INCOMPLETE");
  if(warnings.some(x=>String(x).includes("BUFFER_CROSSES_SUPPORTED_BOUNDARY")))
    flags.push("BUFFER_CROSSES_ADMINISTRATIVE_STUDY_BOUNDARY");
  if(counts.not_checked>0)flags.push("FIELD_CHECKS_NOT_COMPLETED");
  if(counts.follow_up>0)flags.push("USER_FLAGGED_SPECIALIST_FOLLOW_UP");
  if(!field.visit_date && counts.user_reported>0)
    flags.push("USER_REPORTED_FIELD_STATUS_WITHOUT_VISIT_DATE");
  if(scope?.facility_type!=="not_specified")
    flags.push("DECLARED_PETROLEUM_ACTIVITY_NOT_INDEPENDENTLY_VERIFIED");
  flags.push("CURRENT_FIELD_AND_REGULATORY_REVIEW_NOT_ESTABLISHED");
  return {
    schema:EVIDENCE_REGISTER_SCHEMA,generated_at_utc:casefile.created_at_utc,
    site:{...casefile.site},records:entries,
    review:{
      interpretation:"Evidence documentation completeness only; never a safety, risk, sensitivity or regulatory-compliance score",
      field_tasks:counts,land_cover_valid_coverage_pct_approx:lcPct,
      historical_water_valid_coverage_pct_approx:waterPct,
      unresolved_flags:flags,
      no_field_authentication:true,no_regulatory_approval:true,
      no_new_scientific_measurements:true
    },
    source_file_sha256:casefile.source_provenance.source_file_sha256.map(x=>({...x})),
    privacy_notice:"Includes site coordinates, user declarations and optional field notes metadata. Review before sharing. Generated locally; no uploading or attachment storage."
  };
}
const safeCell=value=>{
  let s=safe(value);
  if(/^[\s\uFEFF]*[=+\-@]/.test(s))s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
};
export function evidenceReviewCsv(register){
  if(register?.schema!==EVIDENCE_REGISTER_SCHEMA)throw new Error("Invalid evidence register");
  const site=register.site;
  const rows=[["state","longitude","latitude","radius_km","record_id","evidence_title",
    "evidence_category","review_status","provenance","description","limitations","exported_utc"]];
  for(const row of register.records)rows.push([site.state,site.longitude,site.latitude,
    site.radius_km,row.id,row.title,row.category,row.status,row.source,row.detail,
    row.limitations,register.generated_at_utc]);
  return "\ufeff"+rows.map(row=>row.map(safeCell).join(",")).join("\r\n")+"\r\n";
}
