import test from "node:test";
import assert from "node:assert/strict";
import {jsPDF} from "jspdf";
import {appendDeskReviewHandoff,handoffModel,HANDOFF_SCHEMA} from "../src/handoff_report.js";
const fields=["surface_water","wetland","mangrove","built_up","land_tenure","protected_status","existing_issues"];
function fixture(){
 return {schema:"PetroScreenNG/ScreeningCase/1.0",
  created_at_utc:"2026-10-21T00:00:00Z",
  site:{state:"Delta",longitude:5.5,latitude:5.2,radius_km:1,study_area_km2_approx:3.14159},
  source_provenance:{source_file_sha256:[
   {name:"UNIT_TEST_ONLY_wcover.tif",sha256:"a".repeat(64),kind:"worldcover"},
   {name:"UNIT_TEST_ONLY_jrc.tif",sha256:"b".repeat(64),kind:"surface_water"}
  ]},
  measurements:{
   land_cover_2021:{coverage:{whole_buffer_coverage_pct_approx:99.5},
    classes:[{code:10,area_km2_approx:2,share_of_valid_classified_pct:70}]},
   historical_surface_water_1984_2024:{
    coverage:{whole_buffer_coverage_pct_approx:97.2},
    threshold_areas:[{threshold_pct:50,area_km2_approx:0.1}]},
   mapped_landscape_proximity_2021:{indicators:[
    {code:80,label:"Mapped permanent water",
      status:"not_mapped_in_available_pixels",nearest_pixel_centre_m_approx:null}]}
  },
  qa:{warnings:["BUFFER_CROSSES_SUPPORTED_BOUNDARY: synthetic fixture coverage warning"]},
  field_verification:{visit_date:"",observer:"DO_NOT_PUBLISH_OBSERVER",
    notes:"DO_NOT_PUBLISH_PRIVATE_NOTES",
    checklist:fields.map(id=>({id,title:id,status:"not_checked"}))},
  petroleum_scope:{facility_type:"pipeline",facility_label:"Pipeline / flowline corridor point",
   tasks:Array.from({length:11},(_,i)=>({id:"example_"+i,
    title:"Test-only request "+i,
    evidence_to_check:"Request current project-specific source and independent evidence "+i,
    prompt_basis:"USER-DECLARED ONLY; not an authenticated petroleum asset"}))}
 };
}
test("handoff metadata uses verified case-only sources, no private observer/notes",()=>{
 const m=handoffModel(fixture());
 assert.equal(m.schema,HANDOFF_SCHEMA);
 assert.equal(m.documented.land_cover_year,2021);
 assert.equal(m.documented.water_period,"1984-2024");
 assert.equal(m.documented.esa_coverage_pct,99.5);
 assert.equal(m.documented.jrc_coverage_pct,97.2);
 assert.equal(m.plan.summary.source_coverage_cautions,2);
 assert.equal(m.plan.summary.field_not_checked,7);
 assert.equal(m.plan.summary.no_action_priority_or_risk_score,true);
 assert.equal(m.plan.summary.no_field_authentication,true);
 assert.doesNotMatch(JSON.stringify(m),/DO_NOT_PUBLISH_OBSERVER|DO_NOT_PUBLISH_PRIVATE_NOTES/);
});
test("append paginated handoff to original PDF without removing or changing base pages",()=>{
 const doc=new jsPDF({unit:"mm",format:"a4",compress:true});
 doc.text("UNCHANGED ORIGINAL SCIENTIFIC BASE PAGE 1",18,50);
 doc.addPage();doc.text("UNCHANGED ORIGINAL SCIENTIFIC BASE PAGE 2",18,50);
 doc.addPage();doc.text("UNCHANGED ORIGINAL SCIENTIFIC BASE PAGE 3",18,50);
 const baseCount=doc.getNumberOfPages();
 const before=Array.from({length:baseCount},(_,i)=>doc.getPageInfo(i+1).pageNumber);
 const v=appendDeskReviewHandoff(doc,fixture());
 assert.equal(v.schema,HANDOFF_SCHEMA);
 assert.equal(v.base_pdf_pages,baseCount);
 assert.ok(v.total_pdf_pages>=6,"11 tasks should paginate to multiple appended pages");
 assert.equal(doc.getNumberOfPages(),v.total_pdf_pages);
 assert.deepEqual(before,[1,2,3]);
 assert.equal(v.no_field_authentication,true);
 assert.equal(v.no_new_scientific_measurements,true);
 const bytes=new Uint8Array(doc.output("arraybuffer"));
 assert.ok(bytes.length>15000);
 assert.equal(String.fromCharCode(...bytes.slice(0,5)),"%PDF-");
});
test("malformed source or missing mapped measurements rejected before any handoff",()=>{
 assert.throws(()=>handoffModel({}),/complete SHA-referenced/);
 const wrong=fixture();wrong.site.radius_km=8;
 assert.throws(()=>handoffModel(wrong),/Invalid source site geometry/);
 const missing=fixture();delete missing.measurements.land_cover_2021.classes;
 assert.throws(()=>handoffModel(missing),/Source case measurements incomplete/);
 const pdf=new jsPDF();
 assert.throws(()=>appendDeskReviewHandoff(pdf,fixture()),/missing mapped scientific pages/);
});
