"""Scientific-computation engineering acceptance for an official two-state union.

Tests original single-state interiors and shared boundary buffers at 1/3/5km.
The all-state domain comes from public open ADM1 polygons; data clips have
one nonoverlapping ESA source per original 3-degree tile and one JRC source.
"""
import json
from pathlib import Path
from shapely.geometry import Point,shape
from screening_engine import screen,geodesic_area_km2,circle_wgs84

ROOT=Path("petroscreen-ng/artifacts_two_state")
DOMAIN=ROOT/"two_state_eligible_domain.geojson"
BORDERS=ROOT/"two_state_original_state_boundaries.geojson"
MANIFEST=ROOT/"acquisition_report.json"
WC=[
 ROOT/"ESA_WorldCover_2021_v200_Bayelsa_Rivers_N03E003.tif",
 ROOT/"ESA_WorldCover_2021_v200_Bayelsa_Rivers_N03E006.tif"
]
JRC=ROOT/"JRC_GSW_1984_2024_Bayelsa_Rivers.tif"
TARGETS=("Bayelsa","Rivers")

def get_states():
    doc=json.loads(BORDERS.read_text())
    out={}
    for f in doc["features"]:
        props=f.get("properties",{})
        matches=[name for name in TARGETS if name.casefold() in
                 {str(x).casefold() for x in props.values()}]
        if len(matches)!=1:raise AssertionError(f"Cannot uniquely identify state {props}")
        out[matches[0]]=shape(f["geometry"])
    if set(out)!=set(TARGETS):raise AssertionError("Wrong state boundary count")
    return out

def seam_points(states):
    result={}
    for name,other in (("Bayelsa","Rivers"),("Rivers","Bayelsa")):
        geom=states[name]
        neighbour=states[other]
        candidate=geom.intersection(neighbour.buffer(.006))
        if candidate.is_empty:raise AssertionError("No neighbouring area within ~600m")
        point=candidate.representative_point()
        if not geom.contains(point):
            raise AssertionError("Seam candidate is not inside intended state")
        overlap=geodesic_area_km2(circle_wgs84(point.x,point.y,3).intersection(neighbour))
        if overlap<.05:
            raise AssertionError(f"Boundary candidate is not a genuine cross-state study area: {name} {overlap} km2")
        result[name]=point
    return result

def main():
    state_polys=get_states()
    official=shape(json.loads(DOMAIN.read_text())["features"][0]["geometry"])
    if not official.is_valid:raise AssertionError("Combined region invalid")
    seam=seam_points(state_polys)
    tests=[]
    for state in TARGETS:
        for name,point in (("interior",state_polys[state].representative_point()),
                            ("interstate",seam[state])):
            if not state_polys[state].contains(point):raise AssertionError("Wrong state interior")
            for radius in (1,3,5):
                r=screen(point.x,point.y,radius,DOMAIN,WC,JRC,MANIFEST)
                if r["data_integrity"]["acquisition_manifest"]!="passed_sha256":
                    raise AssertionError("Not verified against source SHA256")
                if r["land_cover_2021"]["coverage"]["whole_buffer_coverage_pct_approx"]<96.5:
                    raise AssertionError(f"Land data gap {state}/{name}/{radius}km")
                if r["surface_water_occurrence_1984_2024"]["coverage"]["whole_buffer_coverage_pct_approx"]<96.5:
                    raise AssertionError(f"Water data gap {state}/{name}/{radius}km")
                if r["land_cover_2021"]["coverage"]["valid_area_km2_approx"]>r["study"]["buffer_area_km2_geodesic"]*1.02:
                    raise AssertionError("Suspicious double counting of ESA cells")
                overlap_other=geodesic_area_km2(circle_wgs84(point.x,point.y,radius)
                                   .intersection(state_polys["Rivers" if state=="Bayelsa" else "Bayelsa"]))
                if name=="interstate" and radius>=3 and overlap_other<.05:
                    raise AssertionError("No genuine cross-state buffer intersection")
                tests.append({"state":state,"kind":name,"radius_km":radius,
                    "other_state_overlap_km2":round(overlap_other,4),
                    "result":r})
    try:
        screen(4.1,7.1,1,DOMAIN,WC,JRC,MANIFEST)
        raise AssertionError("Accepted site outside prepared region")
    except ValueError as error:
        if "outside" not in str(error):raise
    out={"status":"PASS",
      "scope":"Real-data engineering reference, not environmental field validation",
      "cases":tests,"eligible_states":list(TARGETS),
      "no_nigerian_agency_data":True,
      "public_deployment_authorized":False}
    (ROOT/"two_state_engine_acceptance.json").write_text(json.dumps(out,indent=2)+"\n")
    print(json.dumps({"status":"PASS","case_count":len(tests),
        "cross_state_3km":{state:next(t["other_state_overlap_km2"] for t in tests if
           t["state"]==state and t["kind"]=="interstate" and t["radius_km"]==3)
           for state in TARGETS}},indent=2))

if __name__=="__main__":main()
