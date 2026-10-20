"""Nine-state union scientific-computation engineering gate with actual regional clips."""
from __future__ import annotations
import json
from itertools import combinations
from pathlib import Path

from shapely.geometry import shape
from screening_engine import screen,circle_wgs84,geodesic_area_km2
from acquire_nine_state_stream import ROOT,TARGETS

def main():
 info=json.loads((ROOT/"acquisition_report.json").read_text())
 if info["status"]!="NINE_STATE_REGIONAL_SOURCE_ACQUISITION_QA_PASS":
  raise AssertionError("Full nine-region raster processing has not passed")
 domain=ROOT/"eligible_domain.geojson"
 states_json=json.loads((ROOT/"original_states.geojson").read_text())
 states={}
 for f in states_json["features"]:
  names={str(v).casefold() for v in f.get("properties",{}).values() if isinstance(v,str)}
  matches=[n for n in TARGETS if n.casefold() in names]
  if len(matches)!=1:raise AssertionError("Ambiguous ADM1 state name")
  states[matches[0]]=shape(f["geometry"])
 if set(states)!=set(TARGETS):raise AssertionError("Nine states not indexed correctly")
 wc=[ROOT/r["output_name"] for r in info["rasters"] if r["kind"]=="worldcover"]
 jrc=[ROOT/r["output_name"] for r in info["rasters"] if r["kind"]=="water_occurrence"]
 if len(wc)!=6 or len(jrc)!=1:raise AssertionError("Wrong original-source count")
 cases=[]
 def verify(state,kind,p,radius,other=None):
  result=screen(p.x,p.y,radius,domain,wc,jrc[0],ROOT/"acquisition_report.json")
  for layer in ("land_cover_2021","surface_water_occurrence_1984_2024"):
   cov=result[layer]["coverage"]["whole_buffer_coverage_pct_approx"]
   if cov<96:raise AssertionError(f"{state} {kind} {radius}km {layer} incomplete: {cov}")
  if result["data_integrity"]["acquisition_manifest"]!="passed_sha256":
   raise AssertionError("Full mosaic source raster SHA-256 not verified")
  overlap=0.
  if other:
   overlap=geodesic_area_km2(circle_wgs84(p.x,p.y,radius).intersection(states[other]))
   if overlap<.01:raise AssertionError(f"Not a real {state}/{other} interstate buffer")
  cases.append({"state":state,"kind":kind,"radius_km":radius,
    "site_wgs84":[p.x,p.y],"crosses_state":other,"overlap_km2":round(overlap,5),
    "land_valid_km2":result["land_cover_2021"]["coverage"]["valid_area_km2_approx"],
    "water_valid_km2":result["surface_water_occurrence_1984_2024"]["coverage"]["valid_area_km2_approx"]})
 for state,geom in states.items():
  p=geom.representative_point()
  if not geom.contains(p):raise AssertionError("Non-interior point")
  for radius in (1,3,5):verify(state,"interior",p,radius)
 # Dynamically discover real internal state borders. The sub-3km test point is
 # chosen on the official state side of a neighbour to preserve site eligibility.
 border_pairs=[]
 for a,b in combinations(TARGETS,2):
  if states[a].distance(states[b])>.003:continue
  overlap=states[a].intersection(states[b].buffer(.004))
  if overlap.is_empty or overlap.area<.0000001:continue
  point=overlap.representative_point()
  if not states[a].contains(point):continue
  if geodesic_area_km2(circle_wgs84(point.x,point.y,3).intersection(states[b]))<.02:
   continue
  border_pairs.append((a,b,point))
 if len(border_pairs)<3:raise AssertionError("Not enough mapped interstate boundary pairs")
 # Limit CI cost deterministically; already exercises states independently above.
 for a,b,p in border_pairs[:5]:
  for radius in (1,3,5):verify(a,"interstate",p,radius,b)
 try:
  screen(4.0,9.0,1,domain,wc,jrc[0],ROOT/"acquisition_report.json")
 except ValueError as e:
  if "outside" not in str(e):raise
 else:raise AssertionError("Out-of-region location accepted")
 result={"status":"TECHNICAL_REFERENCE_QA_PASS","states":list(TARGETS),
   "interior_cases":27,"interstate_cases":3*min(5,len(border_pairs)),
   "source_tiles":len(wc)+len(jrc),
   "cross_state_pair_names":[[a,b] for a,b,_ in border_pairs[:5]],
   "cases":cases,"public_deployment":False,
   "scientific_field_validation":"NOT_DONE"}
 (ROOT/"nine_state_reference_acceptance.json").write_text(json.dumps(result,indent=2)+"\n")
 print(json.dumps({k:v for k,v in result.items() if k!="cases"},indent=2))

if __name__=="__main__":
 main()
