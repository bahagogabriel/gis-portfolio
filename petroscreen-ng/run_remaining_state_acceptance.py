"""Stage 07 - strict reference acceptance for any additional NDDC state.

Site eligibility is the unbuffered gbOpen state; 5km source halo only supports
edge calculations. Screening uses the same unchanged multi-tile Python engine.
This gate certifies engineering inputs, never source thematic accuracy.
"""
from __future__ import annotations
import argparse,json
from pathlib import Path
from shapely.geometry import shape
from screening_engine import screen,circle_wgs84,geodesic_area_km2
from regional_tile_inventory import TARGETS

def check(state):
 if state not in TARGETS or state in {"Bayelsa","Rivers"}:
  raise ValueError("Choose one of the seven remaining NDDC states")
 root=Path("petroscreen-ng/artifacts_additional_states")/state.replace(" ","_")
 manifest=root/"acquisition_report.json"
 info=json.loads(manifest.read_text())
 if info["status"]!="TECHNICAL_ACQUISITION_AND_COVERAGE_QA_PASS":
  raise AssertionError("Source acquisition not accepted")
 state_file=root/f"{state.replace(' ','_')}_original_state_outline.geojson"
 halo=root/f"{state.replace(' ','_')}_gbopen_with_5km_halo.geojson"
 official=shape(json.loads(state_file.read_text())["features"][0]["geometry"])
 assert official.is_valid and not official.is_empty
 site=official.representative_point()
 assert official.contains(site)
 rasters=[root/item["output_name"] for item in info["rasters"]]
 wc=[p for p in rasters if "WorldCover" in p.name]
 jrc=[p for p in rasters if "JRC_GSW" in p.name]
 if not wc or len(jrc)!=1:raise AssertionError("Incomplete mandatory layer manifest")
 cases=[]
 for radius in (1,3,5):
  r=screen(site.x,site.y,radius,halo,wc,jrc[0],manifest)
  if r["data_integrity"]["acquisition_manifest"]!="passed_sha256":
   raise AssertionError("Data hashes not verified")
  for label in ("land_cover_2021","surface_water_occurrence_1984_2024"):
   cov=r[label]["coverage"]["whole_buffer_coverage_pct_approx"]
   if cov<96:raise AssertionError(f"{state} {radius}km {label} low coverage {cov}")
  if not 3.13*radius**2<r["study"]["buffer_area_km2_geodesic"]<3.15*radius**2:
   raise AssertionError("Area inconsistent with radius")
  cases.append({"radius_km":radius,
    "land_valid_km2":r["land_cover_2021"]["coverage"]["valid_area_km2_approx"],
    "jrc_valid_km2":r["surface_water_occurrence_1984_2024"]["coverage"]["valid_area_km2_approx"]})
 try:
  screen(4.1,7.1,1,halo,wc,jrc[0],manifest)
 except ValueError as e:
  if "outside" not in str(e):raise
 else:raise AssertionError("Out-of-region point accepted")
 outcome={"state":state,"status":"TECHNICAL_ENGINEERING_QA_PASS",
          "test_site_lon_lat":[site.x,site.y],
          "source_tiles_worldcover":len(wc),"jrc_sources":len(jrc),
          "tests":cases,"public_deployment_allowed":False,
          "field_validation":"NOT_DONE",
          "warning":"Do not interpret these results as pollution, flood risk or official EIA."}
 output=root/"stage07_screening_acceptance.json"
 output.write_text(json.dumps(outcome,indent=2,allow_nan=False)+"\n")
 print(json.dumps(outcome,indent=2))
 return outcome

if __name__=="__main__":
 p=argparse.ArgumentParser()
 p.add_argument("--state",choices=tuple(x for x in TARGETS if x not in ("Bayelsa","Rivers")),required=True)
 args=p.parse_args()
 check(args.state)
