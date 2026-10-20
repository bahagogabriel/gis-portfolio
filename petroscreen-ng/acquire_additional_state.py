"""Acquire and QA one extra NDDC state as a regional expansion pilot.

Default is Rivers, Nigeria; all source rasters come from documented public
services. No official/operator communication, no paid API and no deployment.
The clipped data domain includes a 5km surrounding halo for future cross-state
buffer assessment; that halo is NOT an administrative membership assertion.
"""
import argparse
import json
from datetime import datetime,timezone
from pathlib import Path
from urllib.request import Request,urlopen

from pyproj import Geod
from shapely.geometry import shape
from rasterio.errors import RasterioIOError
from acquire_bayelsa import clip,sha256
from raster_acquisition import worldcover_url,GSW_ENDPOINTS
from regional_tile_inventory import API,TARGETS,projected_buffer,candidates
from validate_bayelsa import approximate_pixel_area

G=Geod(ellps="WGS84")

def read(url):
    """Retry transient public boundary endpoint failures; preserve hard error on exhaustion."""
    import time
    from urllib.error import URLError, HTTPError
    delays=(0,2,5,10)
    for index,delay in enumerate(delays):
        if delay:time.sleep(delay)
        try:
            with urlopen(Request(url,headers={
                "User-Agent":"PetroScreenNG-Regional-Pilot/0.1",
                "Accept":"application/json"}),timeout=90) as response:
                return json.loads(response.read())
        except (URLError, TimeoutError, HTTPError) as err:
            if index==len(delays)-1:raise
            print(f"Temporary boundary source error; retry {index+1}/{len(delays)-1}: {type(err).__name__}",flush=True)
    raise RuntimeError("Public boundary endpoint retry loop exhausted")

def source_boundary(name):
    meta=read(API)
    hits=[]
    for f in read(meta["gjDownloadURL"])["features"]:
        names={str(v).casefold() for v in f.get("properties",{}).values() if isinstance(v,str)}
        if name.casefold() in names:hits.append(f)
    if len(hits)!=1:raise RuntimeError(f"Expected exactly one {name} ADM1 polygon, got {len(hits)}")
    geom=shape(hits[0]["geometry"])
    if not geom.is_valid or geom.is_empty:raise RuntimeError("Invalid source polygon")
    return meta,hits[0],geom

def process(state):
    if state not in TARGETS:
        raise ValueError("Choose one of the nine NDDC states")
    meta,feature,geom=source_boundary(state)
    halo=projected_buffer(geom,5000)
    wc,jrc=candidates(halo)
    if jrc!=["0E_10N"]:
        raise RuntimeError("JRC area extends beyond first verified 10-degree file")
    root=Path("petroscreen-ng/artifacts_additional_states")/state.replace(" ","_")
    root.mkdir(parents=True,exist_ok=True)
    geomjson=root/f"{state.replace(' ','_')}_gbopen_with_5km_halo.geojson"
    from shapely.geometry import mapping
    geomjson.write_text(json.dumps({"type":"FeatureCollection","features":[
      {"type":"Feature","properties":{"name":state,"type":"buffered_5km_supported_domain",
         "buffer_method":"EPSG6933 metres"},"geometry":mapping(halo)}]})+"\n",encoding="utf-8")
    state_file=root/f"{state.replace(' ','_')}_original_state_outline.geojson"
    state_file.write_text(json.dumps({"type":"FeatureCollection","features":[feature]})+"\n")
    report={"as_of_utc":datetime.now(timezone.utc).isoformat(),"state":state,
      "source_admin_name":meta.get("boundaryName"),
      "source_boundary_year":meta.get("boundaryYearRepresented"),
      "source_license":meta.get("boundaryLicense"),
      "source_admin_original":meta.get("boundarySource"),
      "halo_metres":5000,"boundary_wgs84_bbox":list(geom.bounds),
      "original_state_geodesic_area_km2":abs(G.geometry_area_perimeter(geom)[0])/1e6,
      "halo_geodesic_area_km2":abs(G.geometry_area_perimeter(halo)[0])/1e6,
      "halo_geojson_sha256":sha256(geomjson),
      "candidate_worldcover_tiles":wc,"candidate_jrc_tiles":jrc,
      "rasters":[],"status":"HOLD","scientific_interpretation_verified":False,
      "public_coverage_enabled":False}
    for tile in wc:
        tif=root/f"ESA_WorldCover_2021_v200_{state.replace(' ','_')}_{tile}_halo.tif"
        result=clip(worldcover_url(tile),halo,tif,"worldcover")
        result["source_name"]="ESA WorldCover 2021 v200"
        report["rasters"].append(result)
    errors=[]
    for url in GSW_ENDPOINTS:
        try:
            result=clip(url,halo,root/f"JRC_GSW_1984_2024_{state.replace(' ','_')}_halo.tif","water_occurrence")
            result["source_name"]="JRC GSW v1.5 occurrence 1984–2024"
            report["rasters"].append(result)
            break
        except (OSError,RasterioIOError) as e:
            errors.append(f"{url}: {e}")
    else:
        raise RuntimeError("No usable public JRC source: "+";".join(errors))
    wc_area=0
    jrc_area=0
    for item in report["rasters"]:
        tif=root/item["output_name"]
        if not tif.exists() or sha256(tif)!=item["sha256_derived_clipped_tif"]:
            raise RuntimeError("Output file SHA-256 mismatch")
        coverage=item["inside_polygon_valid_pixel_count"]/max(1,item["inside_polygon_pixel_count"])
        if coverage<.95:raise RuntimeError(f"Incomplete *source raster* footprint: {tif.name} {coverage:.1%}")
        cellarea=approximate_pixel_area(item)
        approx_area=item["inside_polygon_pixel_count"]*cellarea/1e6
        if "WorldCover" in tif.name:wc_area+=approx_area
        else:jrc_area+=approx_area
    area=report["halo_geodesic_area_km2"]
    if abs(wc_area/area-1)>.04:raise RuntimeError(f"ESA area mismatch: {wc_area} vs {area}")
    if abs(jrc_area/area-1)>.04:raise RuntimeError(f"JRC area mismatch: {jrc_area} vs {area}")
    report["worldcover_pixel_footprint_area_km2_approx"]=round(wc_area,3)
    report["jrc_pixel_footprint_area_km2_approx"]=round(jrc_area,3)
    report["status"]="TECHNICAL_ACQUISITION_AND_COVERAGE_QA_PASS"
    report["limitations"]=[
        "Buffers are 5 km projected-domain halos, not enlarged state boundaries.",
        "Data classifications have not been field verified for this state.",
        "No new region is enabled in a public application.",
        "No petroleum risk/flood probability/regulatory clearance assessed.",
        "WorldCover 2021 is not a current land-cover update.",
        "JRC occurrence 1984–2024 can have Collection 1/2 positional offsets."
    ]
    (root/"acquisition_report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"status":report["status"],"state":state,
       "worldcover_source_tiles":wc,"jrc_source_tiles":jrc,
       "state_area_km2":round(report["original_state_geodesic_area_km2"],3),
       "halo_area_km2":round(area,3),"wc_area_km2":round(wc_area,3),
       "jrc_area_km2":round(jrc_area,3),
       "source_raster_count":len(report["rasters"])},indent=2))
    return report

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--state",choices=tuple(TARGETS),default="Rivers")
    args=parser.parse_args()
    process(args.state)
