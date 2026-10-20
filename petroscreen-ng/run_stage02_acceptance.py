"""Reproducible real-rasters acceptance checks and independent projected-grid control."""
import json
from pathlib import Path

import numpy as np
import rasterio
from pyproj import CRS
from rasterio.enums import Resampling
from rasterio.features import geometry_mask
from rasterio.transform import from_origin
from rasterio.warp import reproject
from shapely.geometry import Point, box, mapping, shape

from screening_engine import screen

ROOT=Path("petroscreen-ng/artifacts_bayelsa")
WC=[
    ROOT/"ESA_WorldCover_2021_v200_Bayelsa_N03E003.tif",
    ROOT/"ESA_WorldCover_2021_v200_Bayelsa_N03E006.tif",
]
WATER=ROOT/"JRC_GSW_1984_2024_Occurrence_Bayelsa.tif"
DOMAIN=ROOT/"bayelsa_gbopen_adm1.geojson"
MANIFEST=ROOT/"acquisition_report.json"


def test_point(geom, bbox):
    interior=geom.intersection(box(*bbox))
    if interior.is_empty:
        raise AssertionError("Representative site lookup unexpectedly empty")
    p=interior.representative_point()
    if not geom.covers(p):
        raise AssertionError("Site point not within loaded polygon")
    return p


def projected_control(point):
    """Independent rasterio.warp 10m AEQD verification, not row geodesic sampling."""
    radius=1000
    resolution=10
    proj=CRS.from_proj4(
        f"+proj=aeqd +lat_0={point.y} +lon_0={point.x} +datum=WGS84 +units=m +no_defs"
    )
    size=2*radius//resolution
    affine=from_origin(-radius,radius,resolution,resolution)
    merged=np.zeros((size,size),dtype="uint8")
    for file in WC:
        with rasterio.open(file) as src:
            reproject(source=rasterio.band(src,1),destination=merged,
                src_transform=src.transform,src_crs=src.crs,
                src_nodata=0,dst_transform=affine,dst_crs=proj,
                dst_nodata=0,resampling=Resampling.nearest,
                init_dest_nodata=False)
    in_buffer=geometry_mask([mapping(Point(0,0).buffer(radius,resolution=128))],
        transform=affine,out_shape=merged.shape,invert=True,all_touched=False)
    valid=(merged!=0)&in_buffer
    if not np.count_nonzero(valid):
        raise AssertionError("No projected reference pixels")
    return {"area_km2":np.count_nonzero(valid)*resolution**2/1e6,
        "code95_area_km2":np.count_nonzero((merged==95)&in_buffer)*resolution**2/1e6,
        "method":"independent 10m azimuthal-equidistant reprojected nearest-neighbor pixel grid"}


def main():
    boundary=shape(json.loads(DOMAIN.read_text())["features"][0]["geometry"])
    scenarios={
        "west":test_point(boundary,(5.4,4.35,5.995,5.34)),
        "east":test_point(boundary,(6.005,4.35,6.60,5.34)),
        "seam":test_point(boundary,(5.9997,4.35,6.0003,5.34)),
    }
    results=[]
    for scenario, point in scenarios.items():
        for radius in (1,3,5):
            result=screen(point.x,point.y,radius,DOMAIN,WC,WATER,MANIFEST)
            wc=result["land_cover_2021"]
            jrc=result["surface_water_occurrence_1984_2024"]
            if result["data_integrity"]["acquisition_manifest"]!="passed_sha256":
                raise AssertionError("Manifest integrity not verified")
            if wc["pixel_count_valid"]<=0 or jrc["pixel_count_valid"]<=0:
                raise AssertionError(f"Missing source pixels at {scenario}/{radius}km")
            if abs(sum(c["area_km2_approx"] for c in wc["classes"])
                   -wc["coverage"]["valid_area_km2_approx"])>.0001:
                raise AssertionError("Land-cover class areas do not sum")
            if not (0<result["study"]["buffer_area_km2_geodesic"]<80):
                raise AssertionError("Unexpected geodesic buffer area")
            for layer in (wc,jrc):
                for kind in ("within_domain_coverage_pct_approx",
                             "whole_buffer_coverage_pct_approx"):
                    value=layer["coverage"][kind]
                    if not 0<=value<=100:
                        raise AssertionError("Coverage outside [0,100]")
            scenario_report={
                "scenario":scenario,"radius_km":radius,
                "site_lon_lat":[round(point.x,7),round(point.y,7)],
                "buffer_area_km2":result["study"]["buffer_area_km2_geodesic"],
                "worldcover_classified_km2":wc["coverage"]["valid_area_km2_approx"],
                "jrc_valid_km2":jrc["coverage"]["valid_area_km2_approx"],
                "coverage_status":result["coverage_status"],
                "warnings":result["warnings"],
            }
            if scenario=="seam" and radius==1:
                comparison=projected_control(point)
                reference=wc["coverage"]["valid_area_km2_approx"]
                rel=abs(comparison["area_km2"]-reference)/max(reference,1e-6)
                scenario_report["independent_projected_control"]=comparison
                scenario_report["independent_relative_difference_pct"]=round(100*rel,3)
                if rel>.04:
                    raise AssertionError(f"Independent-area control disagreement {rel:.1%}")
            results.append(scenario_report)
    output={"status":"PASS","scenarios":results,
        "cautions":[
          "No site findings are petroleum spill or exposure probabilities",
          "Source masks are preliminary; observational field validation is not provided",
          "Pixel-centre vs projected-grid comparison threshold 4% for 1km circle",
          "This is public-data engineering QA, not independent expert approval",
        ]}
    dest=ROOT/"stage02_real_data_qa.json"
    dest.write_text(json.dumps(output,indent=2)+"\n")
    print(json.dumps({"status":output["status"],
        "cases":len(results),"seam_1km_independent_control":
            next((r.get("independent_relative_difference_pct") for r in results
                 if r["scenario"]=="seam" and r["radius_km"]==1),None),
        "reports":str(dest)},indent=2))


if __name__=="__main__":
    main()
