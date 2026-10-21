/** Stage 12: user-declared petroleum activity, with bounded evidence prompts.
 *
 * This is not a regulator-approved checklist, professional HAZID, official EIA,
 * safety case, hazard ranking or verification of facility/asset existence.
 * No pipeline, well, flare, spill or other petroleum assets are mapped here.
 */
export const FACILITIES=Object.freeze([
  {id:"not_specified",label:"General environmental screening"},
  {id:"well_pad",label:"Well pad / drilling location"},
  {id:"pipeline",label:"Pipeline / flowline corridor point"},
  {id:"processing",label:"Flow station / processing facility"},
  {id:"storage",label:"Tank farm / petroleum storage"},
  {id:"flare",label:"Flare / associated-gas facility"}
]);
export const STAGES=Object.freeze([
  {id:"not_specified",label:"Not specified"},
  {id:"planning",label:"Planning / site selection"},
  {id:"operations",label:"Existing operations"},
  {id:"decommissioning",label:"Decommissioning / restoration"}
]);
const group=new Map([
  ["well_pad",[
    ["well_drilling","Drilling fluids and waste","Review proposed or existing fluid-handling and waste-management evidence."],
    ["well_stormwater","Stormwater and pad drainage","Review containment and local drainage pathways; obtain current site design."],
    ["well_emergency","Well-control and site response","Identify the responsible engineer and site-specific emergency response information."]
  ]],
  ["pipeline",[
    ["pipe_crossings","Crossing and alignment survey","Obtain surveyed route, actual water crossings and third-party crossing information."],
    ["pipe_integrity","Integrity and access","Request current integrity, corrosion protection, isolation and inspection documentation."],
    ["pipe_response","Spill-response access","Check realistic access routes, containment points and responsible response arrangements."]
  ]],
  ["processing",[
    ["process_effluent","Produced water and effluent pathways","Request facility-specific process/effluent handling and permitted discharge records."],
    ["process_chemicals","Chemicals and containment","Verify chemical-storage inventory, secondary containment and drainage drawings."],
    ["process_air","Air emissions and monitoring","Obtain contemporaneous operating and emissions evidence; do not infer emissions from land cover."]
  ]],
  ["storage",[
    ["tank_bunds","Bunds and tank integrity","Review tank inspection, bund design and containment drainage evidence."],
    ["tank_spill","Spill preparedness","Confirm recovery equipment, realistic response access and emergency contacts."],
    ["tank_receptors","Nearby actual receptors","Verify current occupied sites and surface-water links beyond mapped built-up pixels."]
  ]],
  ["flare",[
    ["flare_records","Flare operating records","Request operator-reported flare activity, metering and emissions evidence."],
    ["flare_engineering","Thermal and dispersion assessments","Request professional design studies and operating envelopes; no thermal zone is inferred here."],
    ["flare_communities","Ground-level receptors","Verify the actual presence and location of people and facilities using current field evidence."]
  ]]
]);
const common=[
  ["scope_baseline","Current environmental baseline","Document seasonal/site conditions and the gap since ESA WorldCover 2021."],
  ["scope_requirements","Applicable requirements and evidence owners",
   "Confirm current project-specific Nigerian petroleum/environmental requirements with qualified personnel."]
];
const validFacility=new Set(FACILITIES.map(x=>x.id));
const validStage=new Set(STAGES.map(x=>x.id));
const safe=(value,max)=>typeof value==="string"?value.trim().slice(0,max):"";
export function normalizeFacilityContext(value={}){
  const v=(value&&typeof value==="object")?value:{};
  const facility_type=v.facility_type||"not_specified";
  const project_stage=v.project_stage||"not_specified";
  if(!validFacility.has(facility_type))throw new Error("Unrecognized petroleum facility type");
  if(!validStage.has(project_stage))throw new Error("Unrecognized petroleum activity stage");
  return {facility_type,project_stage,project_reference:safe(v.project_reference,80)};
}
export function buildPetroleumScope(result,context={}){
  const declared=normalizeFacilityContext(context);
  const facility=FACILITIES.find(x=>x.id===declared.facility_type);
  const stage=STAGES.find(x=>x.id===declared.project_stage);
  const indicators=result?.mapped_context_2021?.indicators;
  if(!Array.isArray(indicators)||indicators.length!==4)
    throw new Error("Verified source-backed landscape context required for petroleum scoping");
  const create=(item,why)=>({
    id:item[0],title:item[1],evidence_to_check:item[2],
    prompt_basis:why,review_state:"not_reviewed"
  });
  const checks=common.map(x=>create(x,"General desktop-review prompt"));
  if(declared.facility_type!=="not_specified")
    for(const specific of group.get(declared.facility_type)||[])
      checks.push(create(specific,"User-declared activity; no asset existence verified"));
  if(declared.project_stage==="decommissioning")
    checks.push(create(["stage_restoration","Restoration and closure evidence",
      "Review cleanup history, restoration plan and post-closure monitoring requirements."],
      "User-declared project stage"));
  const cues=[
    [80,"water_site","Mapped water: check site drainage connection",
      "Field-check current watercourses, flow direction, tidal status and any real interaction with the project."],
    [90,"wetland_site","Mapped wetlands: verify habitat",
      "Obtain up-to-date wetland hydrology and habitat verification by a qualified professional."],
    [95,"mangrove_site","Mapped mangroves: verify habitat",
      "Seek current mangrove habitat evidence and check applicable conservation requirements."],
    [50,"built_site","Mapped built-up: verify people and places",
      "Check actual schools, homes, clinics and work sites, not just classified built-up pixels."]
  ];
  for(const [code,id,title,evidence] of cues){
    const c=indicators.find(x=>x.code===code);
    if(c?.status==="mapped_in_study_buffer")
      checks.push(create([id,title,evidence],
        "ESA WorldCover 2021 mapped class "+code+" within "+result.radius_km+" km; not an actual receptor verification"));
  }
  // Limit reports and exported tables to a predictable professional length.
  // Every selected mapped cue is retained (maximum 4).
  const sources=[
    {name:"NUPRC gazetted petroleum regulations",
      url:"https://www.nuprc.gov.ng/laws/regulations/gazetted",
      role:"Find current legislation; project applicability must be reviewed independently"},
    {name:"NUPRC HSEC guidance catalogue",
      url:"https://www.nuprc.gov.ng/laws/guidelines/hsec",
      role:"Check current environmental/safety/community guidance and reporting requirements"},
    {name:"NUPRC production facilities guidance catalogue",
      url:"https://www.nuprc.gov.ng/laws/guidelines/d-and-p",
      role:"Locate relevant production/facilities guidance where applicable"}
  ];
  return {...declared,facility_label:facility.label,stage_label:stage.label,
    scope_status:"UNVERIFIED_DESKTOP_SCOPING_PROMPTS",
    mapped_asset_locations_used:false,official_authority_reviewed:false,
    regulatory_compliance_determined:false,
    basis:"User-declared project context + ESA WorldCover 2021 landscape categories",
    tasks:checks,reference_links:sources,
    limitations:"Not an environmental risk rank, an asset proximity analysis, a legal compliance check, an EIA, or evidence of petroleum contamination. Do not treat mapped built-up/water/habitat as confirmed current receptors."};
}
export function petroleumScopeCsv(scope,site){
  if(scope?.scope_status!=="UNVERIFIED_DESKTOP_SCOPING_PROMPTS")
    throw new Error("Petroleum scoping plan is not valid");
  const quote=x=>{
    let s=x===null||x===undefined?"":String(x);
    if(/^[\s\uFEFF]*[=+\-@]/.test(s))s="'"+s;
    return '"'+s.replaceAll('"','""')+'"';
  };
  const rows=[["site_state","longitude","latitude","radius_km","facility_type",
    "project_stage","project_reference","task_id","task","why_listed",
    "evidence_to_check","review_status"]];
  for(const task of scope.tasks){
    rows.push([site.state,site.longitude,site.latitude,site.radius_km,
      scope.facility_type,scope.project_stage,scope.project_reference,
      task.id,task.title,task.prompt_basis,task.evidence_to_check,task.review_state]);
  }
  return "\ufeff"+rows.map(line=>line.map(quote).join(",")).join("\r\n")+"\r\n";
}
