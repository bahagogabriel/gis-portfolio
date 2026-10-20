"""Stage 07: validate an additional Niger Delta state with unchanged reference engine.

This checks reproducible preliminary remote-sensing screening, not ground truth
or public deployment. Works for any non-Bayelsa NDDC state already acquired.
"""
import argparse
import json
from pathlib import Path
from shapely.geometry import shape
from screening_engine import screen

ROOT=Path("petroscreen-ng/artifacts_additional_states")

def run(state):
    slug=state.replace(" ","_")
    root=ROOT/slug
    report=json.loads((root/"acquisition_report.json").read_text())
    if report.get("state")!=state or report.get("status")!="TECHNICAL_ACQUISITION_AND_COVERAGE_QA_PASS":
        raise RuntimeError("State and technical acquisition acceptance not verified: "+state)
    domain=root/f"{slug}_gbopen_with_5km_halo.geojson"
    official=shape(json.loads((root/f"{slug}_original_state_outline.geojson").read_text())["features"][0]["geometry"])
    site=official.representative_point()
    if not official.contains(site):raise RuntimeError("Invalid state-representative site")
    tiles=[root/x["output_name"] for x in report["rasters"] if "WorldCover" in x["output_name"]]
    water=[root/x["output_name"] for x in report["rasters"] if "JRC" in x["output_name"]]
    if not tiles or len(water)!=1:raise RuntimeError("Incomplete ESA/JRC source manifest")
    cases=[]
    for radius in (1,3,5):
        result=screen(site.x,site.y,radius,domain,tiles,water[0],root/"acquisition_report.json")
        if result["data_integrity"]["acquisition_manifest"]!="passed_sha256":
            raise RuntimeError("Unverified raster SHA256")
        for layer in ("land_cover_2021","surface_water_occurrence_1984_2024"):
            if result[layer]["coverage"]["whole_buffer_coverage_pct_approx"]<96:
                raise RuntimeError(f"{state} {radius} km insufficient {layer} coverage")
        if not result["land_cover_2021"]["classes"]:
            raise RuntimeError("No classified ESA pixels")
        cases.append({"radius_km":radius,"result":result})
    outcome={"status":"PASS","state":state,"qa_scope":"3 radii at 1 in-state test location",
       "field_validation":"NOT_DONE","regional_browser_deployed":False,
       "cases":cases}
    (root/"stage07_engine_acceptance.json").write_text(json.dumps(outcome,indent=2)+"\n")
    print(json.dumps({"state":state,"status":"PASS","radii":[1,3,5],
       "source_tile_count":len(tiles)+1,"site":[site.x,site.y],
       "public_browser":"NOT_ENABLED"},indent=2))

if __name__=="__main__":
    from regional_tile_inventory import TARGETS
    p=argparse.ArgumentParser()
    p.add_argument("--state",required=True,choices=[x for x in TARGETS if x!="Bayelsa"])
    a=p.parse_args()
    run(a.state)
