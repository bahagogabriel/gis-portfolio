/** Stage 17. Accept saved screening cases for comparison ONLY after running the
 * Stage 11 source-hash and independent-current-raster measurement gates.
 * Saved measurements, field records and declarations are NEVER comparison inputs.
 */
import {parseCaseText,confirmRescreenedCase} from "./case_continuity.js";
import {captureCandidate,addCandidate} from "./candidate_comparison.js";
import {approxDistanceMeters,inPolygon} from "./engine.js";

export function preflightSavedComparison(text,manifest,candidates){
  const imported=parseCaseText(text,manifest);
  if(!Array.isArray(candidates)||candidates.length>=4)
    throw new Error("Comparison holds at most four screened sites.");
  if(candidates.length&&candidates[0].radius_km!==imported.site.radius_km)
    throw new Error("Saved screening radius differs from the comparison. Use the same radius or clear all sites.");
  if(candidates.some(item=>approxDistanceMeters(
    item.longitude,item.latitude,imported.site.longitude,imported.site.latitude)<1))
    throw new Error("That saved site is already in the comparison (within 1 metre).");
  return imported;
}
function confirmStatePolygon(imported,coverage,features,manifest){
  const {longitude,latitude,state}=imported.site,point=[longitude,latitude];
  if(!coverage||!inPolygon(point,coverage))
    throw new Error("Saved coordinate is outside the verified nine-state coverage.");
  if(!Array.isArray(features)||features.length!==manifest?.states?.length)
    throw new Error("Verified individual state boundaries are unavailable.");
  const hits=features.filter(feature=>inPolygon(point,feature));
  if(hits.length!==1)
    throw new Error("Saved site does not fall unambiguously within a single verified state.");
  const names=Object.values(hits[0].properties||{}).filter(v=>typeof v==="string");
  if(!names.some(v=>v.toLowerCase()===state.toLowerCase()))
    throw new Error("Saved state attribution conflicts with the current verified state boundary.");
}
/** loadRasters(state) MUST enforce the SHA-256 check for each actual TIFF.
 * screen(...) MUST independently compute ESA/JRC values from those returned images.
 * This helper never edits the currently selected site or existing user field notes.
 */
export async function recheckSavedComparison({
  text,manifest,candidates,coverage,stateFeatures,loadRasters,screen
}){
  if(typeof loadRasters!=="function"||typeof screen!=="function")
    throw new Error("Independent raster screening is required for saved cases.");
  const imported=preflightSavedComparison(text,manifest,candidates);
  confirmStatePolygon(imported,coverage,stateFeatures,manifest);
  const {longitude:lon,latitude:lat,radius_km:radiusKm,state}=imported.site;
  const data=await loadRasters(state);
  if(!Array.isArray(data?.worldcoverImages)||!data.worldcoverImages.length||!data.waterImage)
    throw new Error("Verified state-specific satellite rasters did not load.");
  const result=await screen({lon,lat,radiusKm,coverage,
    worldcoverImages:data.worldcoverImages,waterImage:data.waterImage,
    regionName:manifest.region});
  if(!result||result.radius_km!==radiusKm)
    throw new Error("Independent saved-site screening is incomplete.");
  // The trusted state comes from current original state polygons, never merely
  // from a field in imported JSON or inferred from raster appearance.
  result.site_state=state;
  confirmRescreenedCase(imported,result);
  const fresh=captureCandidate(result,manifest);
  // Reapply comparison duplicate/radius/capacity gate after async work.
  addCandidate(candidates,fresh);
  return fresh;
}
