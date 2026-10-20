"""Independent functional screening acceptance on newly acquired Rivers state rasters.

Uses the same unchanged Stage02 region-independent engine tested in Bayelsa.
Rivers is not enabled in a public application by this QA run.
"""
import json
from pathlib import Path
from shapely.geometry import shape
from screening_engine import screen

ROOT=Path("petroscreen-ng/artifacts_additional_states/Rivers")
DOMAIN=ROOT/"Rivers_gbopen_with_5km_halo.geojson"
ORIGINAL=ROOT/"Rivers_original_state_outline.geojson"
MANIFEST=ROOT/"acquisition_report.json"
ESA=ROOT/"ESA_WorldCover_2021_v200_Rivers_N03E006_halo.tif"
JRC=ROOT/"JRC_GSW_1984_2024_Rivers_halo.tif"

def main():
    source=json.loads(MANIFEST.read_text())
    if source["status"]!="TECHNICAL_ACQUISITION_AND_COVERAGE_QA_PASS":
        raise AssertionError("Rivers acquisition has not passed technical QA")
    official=shape(json.loads(ORIGINAL.read_text())["features"][0]["geometry"])
    point=official.representative_point()
    if not official.contains(point):
        raise AssertionError("Representative point not in original Rivers State")
    examples=[]
    for radius in (1,3,5):
        result=screen(point.x,point.y,radius,DOMAIN,[ESA],JRC,MANIFEST)
        wc=result["land_cover_2021"]
        water=result["surface_water_occurrence_1984_2024"]
        if result["data_integrity"]["acquisition_manifest"]!="passed_sha256":
            raise AssertionError("Rivers source TIFF SHA-256 verification not passed")
        if wc["coverage"]["whole_buffer_coverage_pct_approx"]<97:
            raise AssertionError(f"Rivers ESA missing coverage radius {radius} km")
        if water["coverage"]["whole_buffer_coverage_pct_approx"]<97:
            raise AssertionError(f"Rivers JRC missing coverage radius {radius} km")
        if result["coverage_status"]!="sufficient":
            raise AssertionError(f"Rivers site unexpectedly partial: {radius}km")
        examples.append({"radius_km":radius,"site_wgs84_lon_lat":[point.x,point.y],
           "study_area_km2":result["study"]["buffer_area_km2_geodesic"],
           "esa_class_area_km2":wc["coverage"]["valid_area_km2_approx"],
           "jrc_valid_area_km2":water["coverage"]["valid_area_km2_approx"],
           "result":result})
    report={"status":"PASS",
        "meaning":"Only Rivers real-data ENGINEERING screening acceptance",
        "regional_public_screening_enabled":False,
        "representative_cases":examples,
        "limitations":[
            "Single representative site in Rivers, 1km, 3km and 5km radii.",
            "No field validation, protected habitat confirmation, petroleum contamination or spill risk estimates.",
            "The application remains Bayelsa-only until new regional clients/assets and boundary handling are published."
        ]}
    out=ROOT/"stage05_rivers_engine_qa.json"
    out.write_text(json.dumps(report,indent=2,allow_nan=False)+"\n",encoding="utf-8")
    print(json.dumps({"status":"PASS","cases":len(examples),
        "state":"Rivers","sample_lon_lat":[point.x,point.y],
        "radius_km":[c["radius_km"] for c in examples],
        "source_hashes":"PASS",
        "public_app_status":"NOT_DEPLOYED"},indent=2))

if __name__=="__main__":main()
