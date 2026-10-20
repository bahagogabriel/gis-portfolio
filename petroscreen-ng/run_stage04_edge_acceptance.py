"""Stage 04 independent Bayelsa edge and 1/3/5 km real-data reference QA."""
import json
from pathlib import Path

from shapely.geometry import Point,shape
from shapely.ops import nearest_points
from screening_engine import screen

ROOT=Path("petroscreen-ng/artifacts_bayelsa")
WC=[
 ROOT/"ESA_WorldCover_2021_v200_Bayelsa_N03E003.tif",
 ROOT/"ESA_WorldCover_2021_v200_Bayelsa_N03E006.tif",
]
JRC=ROOT/"JRC_GSW_1984_2024_Occurrence_Bayelsa.tif"
BOUNDARY=ROOT/"bayelsa_gbopen_adm1.geojson"
MANIFEST=ROOT/"acquisition_report.json"
OWNER=Point(6.066211,4.755211)

def nearest_interior_edge(boundary,interior):
    point_on_edge,_=nearest_points(boundary.boundary,interior)
    for frac in (.0001,.001,.005,.01,.02,.05,.10):
        point=Point(point_on_edge.x+(interior.x-point_on_edge.x)*frac,
                    point_on_edge.y+(interior.y-point_on_edge.y)*frac)
        if boundary.contains(point) and point.distance(point_on_edge)<.003:
            return point
    raise RuntimeError("Unable to find near-boundary point inside polygon")

def main():
    geom=shape(json.loads(BOUNDARY.read_text())["features"][0]["geometry"])
    if not geom.contains(OWNER):
        raise RuntimeError("Owner's observed 3-km site not inside Bayelsa boundary")
    edge=nearest_interior_edge(geom,OWNER)
    cases=[]
    for name,site in (("owner_windows_site",OWNER),("boundary_near_edge",edge)):
        for radius in (1,3,5):
            result=screen(site.x,site.y,radius,BOUNDARY,WC,JRC,MANIFEST)
            if result["data_integrity"]["acquisition_manifest"]!="passed_sha256":
                raise AssertionError("Source-hash lock was not checked")
            if abs(result["study"]["buffer_area_km2_geodesic"]-3.14159*radius*radius)>0.02:
                raise AssertionError("Buffer radius/area inconsistency")
            if result["land_cover_2021"]["pixel_count_valid"]<100:
                raise AssertionError("Insufficient classified pixels")
            if result["surface_water_occurrence_1984_2024"]["pixel_count_valid"]<100:
                raise AssertionError("Insufficient JRC valid pixels")
            if name=="boundary_near_edge":
                if result["study"]["outside_supported_domain_km2_geodesic"]<=0:
                    raise AssertionError("Edge buffer incorrectly classified wholly inside")
                if not any("BUFFER_CROSSES_SUPPORTED_BOUNDARY" in v for v in result["warnings"]):
                    raise AssertionError("Missing boundary clipping warning")
                if result["coverage_status"]!="partial":
                    raise AssertionError("Missing partial-coverage status")
            cases.append({"name":name,"radius_km":radius,
                "site_lon_lat":[site.x,site.y],
                "result":result})
    try:
        screen(4.1,7.1,1,BOUNDARY,WC,JRC,MANIFEST)
        raise AssertionError("Out-of-region site incorrectly accepted")
    except ValueError as exc:
        if "outside" not in str(exc):
            raise
    dest=ROOT/"stage04_edge_acceptance.json"
    dest.write_text(json.dumps({"status":"PASS","cases":cases},indent=2,allow_nan=False)+"\n")
    print(json.dumps({"status":"PASS","cases":len(cases),
        "edge_site":[edge.x,edge.y],
        "edge_1km_outside_domain_km2":
           next(x["result"]["study"]["outside_supported_domain_km2_geodesic"]
                for x in cases if x["name"]=="boundary_near_edge" and x["radius_km"]==1),
        "owner_3km_tree_pct":
           next((c["share_of_valid_classified_pct"]
                for c in x["result"]["land_cover_2021"]["classes"] if c["code"]==10)
                for x in cases if x["name"]=="owner_windows_site" and x["radius_km"]==3)},indent=2))

if __name__=="__main__":main()
