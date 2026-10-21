import test from "node:test";
import assert from "node:assert/strict";
import {browserReadinessReport,readinessText,DIAGNOSTIC_SCHEMA} from "../src/browser_readiness.js";
const capabilities={
 secure_context:true,webcrypto_sha256:true,canvas_2d:true,
 interactive_map_initialized:true,browser_download_supported:true
};
const manifest={states:["Delta","Rivers"],state_sources:[
 {state:"Delta",source_files:[{file:"dummy-one.tif"},{file:"dummy-two.tif"}]},
 {state:"Rivers",source_files:[{file:"dummy-three.tif"}]}
]};
test("manifest readiness never mislabels all TIFFs as individually verified",()=>{
 const p=browserReadinessReport(capabilities,"ready",manifest);
 assert.equal(p.schema,DIAGNOSTIC_SCHEMA);
 assert.equal(p.status,"manifest_ready_sources_load_on_demand");
 assert.deepEqual(p.index,{pilot_states_listed:2,source_tiff_files_listed:3,
  currently_sha256_verified_state:null,all_source_files_preverified:false});
 assert.deepEqual(p.blockers,[]);
 assert.match(readinessText(p),/Indexed state source TIFFs: 3/);
 assert.match(readinessText(p),/none \(not screened in this tab\)/);
});
test("after accepted on-demand raster loads report only the selected state",()=>{
 const p=browserReadinessReport(capabilities,"ready",manifest,"Delta");
 assert.equal(p.index.currently_sha256_verified_state,"Delta");
 assert.equal(p.index.all_source_files_preverified,false);
 const spoof=browserReadinessReport(capabilities,"ready",manifest,"Bayelsa");
 assert.equal(spoof.index.currently_sha256_verified_state,null);
});
test("HTTPS SHA256, map, canvas and file download failures give useful guidance",()=>{
 const p=browserReadinessReport({
  secure_context:false,webcrypto_sha256:false,canvas_2d:false,
  interactive_map_initialized:false,browser_download_supported:false
 },"failed",null);
 assert.equal(p.blockers.length,6);
 assert.match(p.blockers.join(" "),/HTTPS public website/);
 assert.match(p.blockers.join(" "),/SHA-256/);
 assert.match(p.blockers.join(" "),/Retry/);
});
test("unsupported runtime states and malformed reports are rejected",()=>{
 assert.throws(()=>browserReadinessReport(capabilities,"maybe",manifest),/Unknown dataset/);
 assert.throws(()=>readinessText({schema:"unknown"}),/Invalid browser readiness/);
});
test("diagnostics contain no private site coordinates, names or field notes",()=>{
 const privateFixture={...manifest,selected_coordinate:"SECRET_LAT_LON",
  field_notes:"CONFIDENTIAL_NOTE",user_name:"PERSON_NAME"};
 const textOutput=readinessText(browserReadinessReport(capabilities,"ready",privateFixture));
 assert.doesNotMatch(textOutput,/SECRET_LAT_LON|CONFIDENTIAL_NOTE|PERSON_NAME/);
 assert.match(textOutput,/No site coordinates, field notes/);
});
