/** Stage24 evidence-action register; derives ONLY from already source-dated
 * evidence categories, user-entered checklist statuses and existing scoping
 * prompts. No risk score, site suitability, implied required procedure,
 * field verification or regulatory compliance interpretation.
 */
import {buildEvidenceReview,EVIDENCE_REGISTER_SCHEMA} from "./evidence_review.js";
import {FIELD_TASKS} from "./exports.js";
export const ACTION_PLAN_SCHEMA="PetroScreenNG/EvidenceActions/1.0";
const LIMIT="Suggestions for planning only. A qualified reviewer must determine actual fieldwork, source-date relevance and applicable current requirements. No action implies a risk level, verified petroleum facility, completed inspection or regulatory approval.";
function action(id,category,title,status,ask,basis,caveat){
 return {id,category,title,review_status:status,evidence_to_request:ask,
   mapped_or_declared_basis:basis,limitations:caveat};
}
export function buildEvidenceActions(casefile){
 const review=buildEvidenceReview(casefile); // original source-gated register first
 if(review.schema!==EVIDENCE_REGISTER_SCHEMA)
  throw new Error("Evidence register required");
 const actions=[];
 const lc=review.review.land_cover_valid_coverage_pct_approx;
 const wc=review.review.historical_water_valid_coverage_pct_approx;
 const flags=review.review.unresolved_flags;
 if(flags.includes("ESA_2021_VALID_COVERAGE_INCOMPLETE")){
  actions.push(action("source_esa_coverage","source_coverage",
    "Review incomplete 2021 land-cover coverage","source_coverage_caution",
    "Identify unmapped/no-data areas, record their impact on interpretation and seek appropriate corroboration.",
    "ESA WorldCover 2021 valid coverage "+(lc===null?"not supplied":lc+"%")+"; evidence-register source QA flag",
    "A coverage gap is not evidence of a physical hazard or its absence."));
 }
 if(flags.includes("JRC_HISTORICAL_VALID_COVERAGE_INCOMPLETE")){
  actions.push(action("source_jrc_coverage","source_coverage",
    "Review incomplete historical water coverage","source_coverage_caution",
    "Identify no-data areas and seek contemporaneous field or additional-source confirmation of current water conditions.",
    "JRC Global Surface Water 1984–2024 valid coverage "+(wc===null?"not supplied":wc+"%")+"; evidence-register source QA flag",
    "Historical occurrence is not a prediction of future flooding or present-day water."));
 }
 if(flags.includes("BUFFER_CROSSES_ADMINISTRATIVE_STUDY_BOUNDARY")){
  actions.push(action("source_boundary","source_coverage",
    "Resolve the study-boundary coverage caveat","source_boundary_caution",
    "Confirm study circle overlaps outside verified administrative/source coverage before interpreting all-buffer figures.",
    "Existing screening case QA warning: buffer crosses supported boundary",
    "A partial source footprint cannot be treated as measured coverage outside verified data."));
 }
 // Always list the 7 accepted field-check categories for a genuinely useful
 // pre-fieldwork plan. Previously chosen statuses remain USER-REPORTED only.
 const checklist=casefile.field_verification.checklist;
 for(const field of FIELD_TASKS){
  const selected=checklist.find(x=>x.id===field.id);
  if(!selected)throw new Error("Missing field checklist item "+field.id);
  actions.push(action("field_"+field.id,"field_verification",field.title,
    selected.status==="not_checked"?"not_checked":
      selected.status==="requires_follow_up"?"user_requested_specialist_follow_up":
      "user_reported_unverified_"+selected.status,
    field.detail,
    "Existing field-verification question; visit date "+
      (casefile.field_verification.visit_date||"not supplied"),
    "PetroScreen has not independently verified any user-selected field status; no fieldwork is certified."));
 }
 const scope=casefile.petroleum_scope;
 for(const task of scope.tasks){
  actions.push(action("scope_"+task.id,"petroleum_scoping_prompt",
    task.title,"not_reviewed",task.evidence_to_check,
    task.prompt_basis,
    "Exploratory evidence prompt from user-declared activity and source-dated map classes; not a verified asset, binding requirement or completed check."));
 }
 actions.push(action("qualified_review","professional_review",
  "Have qualified personnel assess current evidence and project requirements",
  "not_established",
  "Confirm present-day observations, professional survey needs and currently applicable project-specific Nigerian petroleum/environmental requirements with competent personnel.",
  "Existing evidence-register flag: CURRENT_FIELD_AND_REGULATORY_REVIEW_NOT_ESTABLISHED",
  "No compliance, permit, risk, hazard, suitability or field-authenticity outcome is determined by this planning register."));
 const categories={source_coverage:0,field_verification:0,petroleum_scoping_prompt:0,professional_review:0};
 for(const row of actions)categories[row.category]++;
 return {
  schema:ACTION_PLAN_SCHEMA,generated_at_utc:casefile.created_at_utc,
  source_case_schema:casefile.schema,
  site:{...casefile.site},actions,
  summary:{total_actions:actions.length,categories,
    field_not_checked:review.review.field_tasks.not_checked,
    field_user_reported:review.review.field_tasks.user_reported,
    field_follow_up:review.review.field_tasks.follow_up,
    scope_tasks_not_reviewed:scope.tasks.length,
    source_coverage_cautions:categories.source_coverage,
    no_field_authentication:true,no_regulatory_determination:true,
    no_new_scientific_measurements:true,no_action_priority_or_risk_score:true},
  source_file_sha256:review.source_file_sha256.map(x=>({...x})),
  limitations:LIMIT,
  privacy_notice:"Includes site coordinates and user-selected field statuses but excludes observer names and free-text field notes. Generated entirely in-browser. Review before sharing."
 };
}
const cell=x=>{
 let v=x===undefined||x===null?"":String(x);
 if(/^[\s\uFEFF]*[=+\-@]/.test(v)||/^[\t\r\n]/.test(v))v="'"+v;
 return '"'+v.replaceAll('"','""')+'"';
};
export function evidenceActionsCsv(plan){
 if(plan?.schema!==ACTION_PLAN_SCHEMA||!Array.isArray(plan.actions))
  throw new Error("Invalid evidence action register");
 const rows=[["state","longitude","latitude","radius_km","action_id","category",
  "item","current_review_state","evidence_to_request","basis","limitations","source_case_created_utc"]];
 for(const item of plan.actions){
  rows.push([plan.site.state,plan.site.longitude,plan.site.latitude,plan.site.radius_km,
   item.id,item.category,item.title,item.review_status,item.evidence_to_request,
   item.mapped_or_declared_basis,item.limitations,plan.generated_at_utc]);
 }
 return "\ufeff"+rows.map(row=>row.map(cell).join(",")).join("\r\n")+"\r\n";
}
