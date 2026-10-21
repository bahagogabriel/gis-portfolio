/** Stage 18: atomic import of 1..4 saved JSON cases into a comparison.
 * Preflight every saved case before loading TIFFs. Then each saved case
 * independently passes the full Stage11/17 source-hash + pixel re-screen gate.
 * No partial results are returned when even one file fails.
 */
import {preflightSavedComparison,recheckSavedComparison} from "./saved_case_comparison.js";
import {addCandidate} from "./candidate_comparison.js";
import {approxDistanceMeters} from "./engine.js";

export function preflightSavedBatch({texts,manifest,candidates}){
  if(!Array.isArray(texts)||!texts.length||texts.length>4||
      !Array.isArray(candidates)||candidates.length+texts.length>4)
    throw new Error("Choose 1 to 4 saved JSON files; comparison has a four-site limit.");
  const planned=[...candidates],sites=[];
  for(let i=0;i<texts.length;i++){
    let imported;
    try{
      imported=preflightSavedComparison(texts[i],manifest,planned);
    }catch(error){
      throw new Error("File "+(i+1)+" preflight failed: "+error.message);
    }
    const {state,longitude,latitude,radius_km}=imported.site;
    // Preflight reserves only a coordinate/radius for the next file; unlike
    // a science candidate, this does not enter any comparison export.
    if(planned.some(x=>approxDistanceMeters(
      x.longitude,x.latitude,longitude,latitude)<1))
      throw new Error("File "+(i+1)+" repeats an existing comparison location.");
    planned.push({state,longitude,latitude,radius_km});
    sites.push({state,radius_km});
  }
  return sites;
}
export async function recheckSavedComparisonBatch({
  texts,manifest,candidates,coverage,stateFeatures,loadRasters,screen,onProgress
}){
  const sites=preflightSavedBatch({texts,manifest,candidates});
  let staged=[...candidates];
  for(let i=0;i<texts.length;i++){
    onProgress?.({completed:i,total:texts.length,state:sites[i].state});
    let fresh;
    try{
      fresh=await recheckSavedComparison({
        text:texts[i],manifest,candidates:staged,coverage,stateFeatures,
        loadRasters,screen
      });
    }catch(error){
      throw new Error("File "+(i+1)+" of "+texts.length+
        " ("+sites[i].state+") rejected: "+error.message+
        ". No candidates from this batch were added.");
    }
    staged=addCandidate(staged,fresh);
  }
  onProgress?.({completed:texts.length,total:texts.length,state:null});
  return staged;
}
