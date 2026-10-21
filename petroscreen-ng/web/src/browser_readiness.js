/** v3.0 support diagnostics — browser-only, deterministic and privacy-minimized.
 * This tool NEVER inspects site coordinates, user notes, family/personal data,
 * browser identity, IP address, geolocation, cookies, passwords or accounts.
 * Listed source files != independently SHA-256 verified source rasters.
 */
export const DIAGNOSTIC_SCHEMA="PetroScreenNG/LocalBrowserReadiness/1.0";
const bool=x=>x===true;
export function browserReadinessReport(capabilities,status,manifest,verifiedState=null){
 if(!["loading","ready","failed"].includes(status))throw Error("Unknown dataset status");
 const states=Array.isArray(manifest?.states)?manifest.states.length:0;
 const files=Array.isArray(manifest?.state_sources)
   ?manifest.state_sources.reduce((n,s)=>n+(Array.isArray(s.source_files)?s.source_files.length:0),0):0;
 const state=verifiedState && manifest?.states?.includes(verifiedState)?verifiedState:null;
 const p={
  secure_context:bool(capabilities.secure_context),
  webcrypto_sha256:bool(capabilities.webcrypto_sha256),
  canvas_2d:bool(capabilities.canvas_2d),
  interactive_map_initialized:bool(capabilities.interactive_map_initialized),
  browser_download_supported:bool(capabilities.browser_download_supported)
 };
 const blockers=[];
 if(!p.secure_context)blockers.push("Use the HTTPS public website; required SHA-256 features may be unavailable on HTTP.");
 if(!p.webcrypto_sha256)blockers.push("This browser lacks WebCrypto SHA-256; source rasters cannot be accepted.");
 if(!p.canvas_2d)blockers.push("This browser cannot draw the mapped PDF/site image using 2D canvas.");
 if(!p.interactive_map_initialized)blockers.push("Interactive map is not ready; try a supported browser/device or use numeric coordinates.");
 if(!p.browser_download_supported)blockers.push("This browser cannot create local downloads.");
 if(status==="failed")blockers.push("Dataset manifest/boundary loading failed. Try Retry, check connection and supported browser.");
 return {
  schema:DIAGNOSTIC_SCHEMA,
  release:"3.0",status:status==="ready"?"manifest_ready_sources_load_on_demand":status,
  browser_capabilities:p,
  index:{pilot_states_listed:states,source_tiff_files_listed:files,
    currently_sha256_verified_state:state,
    all_source_files_preverified:false},
  blockers,
  privacy:"No site coordinates, field notes, project declarations, browser identity or device fingerprint are collected. Generated locally, with no server submission.",
  source_note:"Ready means the manifest and boundaries loaded. A source TIFF is individually fetched and SHA-256-checked only after screening its state. Not an offline-data or field-validation certificate."
 };
}
export function readinessText(report){
 if(report?.schema!==DIAGNOSTIC_SCHEMA)throw Error("Invalid browser readiness report");
 return [
  "PetroScreen NG v3.0 — local browser readiness report",
  "Data manifest: "+report.status,
  "Indexed pilot states: "+report.index.pilot_states_listed,
  "Indexed state source TIFFs: "+report.index.source_tiff_files_listed,
  "Currently SHA-256-verified state: "+(report.index.currently_sha256_verified_state||"none (not screened in this tab)"),
  ...Object.entries(report.browser_capabilities).map(([k,v])=>k+": "+(v?"yes":"no")),
  "Browser issues: "+(report.blockers.length?report.blockers.join(" | "):"none detected by these limited checks"),
  report.source_note,report.privacy
 ].join("\n")+"\n";
}
