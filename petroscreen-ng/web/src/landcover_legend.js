/** Stage 20: accessible explanatory key for EXACT screen display colors.
 * Source class names are imported from the existing scientific engine; swatches
 * come directly from the original native 2021 display palette.
 * Neither this module nor its output participates in screening arithmetic.
 */
import {ESA} from "./engine.js";
import {WORLD_COVER_DISPLAY_COLORS} from "./site_detail.js";

export function landCoverLegendRows(){
  const classes=Object.keys(ESA).map(Number).sort((a,b)=>a-b);
  return classes.map(code=>{
    const rgb=WORLD_COVER_DISPLAY_COLORS[code];
    if(!Array.isArray(rgb)||rgb.length!==3||
      rgb.some(v=>!Number.isInteger(v)||v<0||v>255))
      throw new Error("Native map display palette incomplete for ESA code "+code);
    return {code,label:ESA[code],
      rgb:[...rgb],hex:"#"+rgb.map(v=>v.toString(16).padStart(2,"0")).join("")};
  });
}
/** Display/availability disclaimers are chosen only by a native image event. */
export function nativeLegendStatus(state){
  switch(state){
    case "native":
      return "Native 10 m ESA WorldCover 2021 display. Colors indicate mapped classes, not risk.";
    case "fallback":
      return "Native detail unavailable; showing a generalized regional overview. Color chips below do NOT apply to that overview.";
    default:
      return "Generalized regional overview. Native 10 m color key becomes active after a successful detailed site map.";
  }
}
export function renderMapLegend(root,statusNode,labelsNode){
  if(!root||!statusNode||!labelsNode)throw Error("Map legend elements missing");
  root.replaceChildren();
  for(const row of landCoverLegendRows()){
    const li=document.createElement("li");li.className="legend-class-item";
    const swatch=document.createElement("span");swatch.className="legend-class-swatch";
    swatch.style.backgroundColor=row.hex;
    swatch.setAttribute("aria-hidden","true");
    const name=document.createElement("span");name.textContent=row.label+" ("+row.code+")";
    li.append(swatch,name);root.append(li);
  }
  statusNode.textContent=nativeLegendStatus("overview");
  labelsNode.hidden=true;
}
export function updateMapLegend(statusNode,labelsNode,state){
  if(!statusNode||!labelsNode)throw Error("Map legend elements missing");
  statusNode.textContent=nativeLegendStatus(state);
  labelsNode.hidden=state!=="native";
}
