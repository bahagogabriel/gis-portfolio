"""Stage 06 — single continuous Bayelsa+Rivers source-domain acquisition.

One source crop per *original* ESA 3-degree tile, one JRC source crop and one
union of both official state boundaries. The 5-km raster-data halo is distinct
from the official eligible site domain; it prevents clipping artifacts at
interstate seams but never widens site eligibility.
"""
from __future__ import annotations
import json
from datetime import datetime,timezone
from pathlib import Path
from urllib.request import Request,urlopen

from pyproj import Geod
from shapely.geometry import mapping,shape
from shapely.ops import unary_union
from rasterio.errors import RasterioIOError

from acquire_bayelsa import clip,sha256
from raster_acquisition import worldcover_url,GSW_ENDPOINTS
from regional_tile_inventory import API,projected_buffer,candidates
from validate_bayelsa import approximate_pixel_area

STATES=("Bayelsa","Rivers")
OUT=Path("petroscreen-ng/artifacts_two_state")
G=Geod(ellps="WGS84")

def retrieve(url):
    """Retry public boundary service timeouts, without bypassing source QA."""
    import time
    from urllib.error import URLError
    for attempt,delay in enumerate((0,2,5,10),1):
        if delay:time.sleep(delay)
        try:
            with urlopen(Request(url,headers={
                "User-Agent":"PetroScreenNG-Stage06/0.1","Accept":"application/json"
            }),timeout=90) as response:
                return json.loads(response.read())
        except (URLError, TimeoutError):
            if attempt==4:raise
            print(f"Transient gbOpen timeout, retry {attempt}/3",flush=True)

def boundaries():
    meta=retrieve(API)
    if meta.get("boundaryISO")!="NGA" or "CC BY 4.0" not in meta.get("boundaryLicense",""):
        raise RuntimeError("Open admin-boundary metadata/license mismatch")
    hits={}
    for f in retrieve(meta["gjDownloadURL"])["features"]:
        names={str(v).strip().casefold() for v in f.get("properties",{}).values() if isinstance(v,str)}
        for name in STATES:
            if name.casefold() in names:
                if name in hits:raise RuntimeError("Duplicate state "+name)
                geom=shape(f["geometry"])
                if not geom.is_valid or geom.is_empty:
                    raise RuntimeError("Invalid "+name+" boundary")
                hits[name]=(f,geom)
    if set(hits)!=set(STATES):raise RuntimeError(f"Missing states {set(STATES)-set(hits)}")
    return meta,hits

def area(geom):return abs(G.geometry_area_perimeter(geom)[0])/1e6

def run():
    OUT.mkdir(parents=True,exist_ok=True)
    meta,hits=boundaries()
    official=unary_union([x[1] for x in hits.values()])
    if not official.is_valid or official.is_empty:
        raise RuntimeError("Two-state official union invalid; no silent repair")
    halo=projected_buffer(official,5000)
    wc,jrc=candidates(halo)
    if set(wc)!={"N03E003","N03E006"}:
        raise RuntimeError("Source tiles expanded beyond verified candidate list: "+str(wc))
    if jrc!=["0E_10N"]:raise RuntimeError("Unexpected JRC source tile "+str(jrc))
    single={"type":"FeatureCollection","features":[
      {"type":"Feature","properties":{"name":"Bayelsa and Rivers",
        "region_id":"NG-BAY-RIV","type":"official_supported_site_domain"},
       "geometry":mapping(official)}
    ]}
    domain=OUT/"two_state_eligible_domain.geojson"
    domain.write_text(json.dumps(single)+"\n")
    state_boundaries={"type":"FeatureCollection","features":[
      hits[name][0] for name in STATES
    ]}
    states=OUT/"two_state_original_state_boundaries.geojson"
    states.write_text(json.dumps(state_boundaries)+"\n")
    halo_file=OUT/"two_state_5km_data_halo.geojson"
    halo_file.write_text(json.dumps({"type":"Feature","properties":{
      "interpretation":"data availability only, not site eligibility"},
      "geometry":mapping(halo)})+"\n")
    report={"project":"PetroScreen NG","stage":6,"status":"PENDING",
      "generated_at_utc":datetime.now(timezone.utc).isoformat(),
      "source_boundary_url":meta["gjDownloadURL"],
      "source_year":meta.get("boundaryYearRepresented"),
      "source_boundary_license":meta.get("boundaryLicense"),
      "source_original_attribution":meta.get("boundarySource"),
      "region_states":list(STATES),
      "source_polygon_area_by_state_km2":{
          name:round(area(hits[name][1]),5) for name in STATES},
      "eligible_domain_geodesic_area_km2":round(area(official),5),
      "halo_data_domain_geodesic_area_km2":round(area(halo),5),
      "eligible_domain_sha256":sha256(domain),
      "state_boundary_sha256":sha256(states),
      "halo_geometry_sha256":sha256(halo_file),
      "worldcover_tiles":wc,"jrc_tiles":jrc,
      "rasters":[],
      "public_deployment_allowed":False,
      "semantic_rule":"Official state union controls accepted input points. Prepared 5km halo is data support only.",
      "field_validation_status":"NOT_DONE"}
    for tile in wc:
        name=f"ESA_WorldCover_2021_v200_Bayelsa_Rivers_{tile}.tif"
        record=clip(worldcover_url(tile),halo,OUT/name,"worldcover")
        record["source_name"]="ESA WorldCover 2021 v200"
        report["rasters"].append(record)
    error=None
    for url in GSW_ENDPOINTS:
        try:
            record=clip(url,halo,OUT/"JRC_GSW_1984_2024_Bayelsa_Rivers.tif","water_occurrence")
            record["source_name"]="JRC GSW v1.5, 1984-2024"
            report["rasters"].append(record)
            error=None
            break
        except (OSError,RasterioIOError) as exc:
            error=exc
            print(f"JRC candidate failed: {url} — {exc}",flush=True)
    if error:raise RuntimeError(f"JRC both sources inaccessible; latest: {error}")
    wc_area=0
    jrc_area=0
    for entry in report["rasters"]:
        path=OUT/entry["output_name"]
        if sha256(path)!=entry["sha256_derived_clipped_tif"]:
            raise RuntimeError("Derived raster checksum mismatch "+path.name)
        inside=entry["inside_polygon_pixel_count"]
        valid=entry["inside_polygon_valid_pixel_count"]
        if valid<.98*inside:
            raise RuntimeError(f"Unexpectedly incomplete source crop {path.name}: {valid}/{inside}")
        raster_area=inside*approximate_pixel_area(entry)/1e6
        if "WorldCover" in path.name:wc_area+=raster_area
        else:jrc_area+=raster_area
    halo_area=report["halo_data_domain_geodesic_area_km2"]
    if abs(wc_area/halo_area-1)>.03 or abs(jrc_area/halo_area-1)>.03:
        raise RuntimeError(f"Footprint disagrees with halo area: ESA={wc_area}, JRC={jrc_area}, halo={halo_area}")
    report["worldcover_area_from_source_pixel_footprints_km2_approx"]=round(wc_area,4)
    report["jrc_area_from_source_pixel_footprints_km2_approx"]=round(jrc_area,4)
    report["status"]="TWO_STATE_SOURCE_ACQUISITION_AND_STRUCTURAL_QA_PASS"
    report["limitations"]=[
        "A 5km data halo is included; site eligibility is restricted to the actual two-state union.",
        "2021 land-cover classification and 1984-2024 JRC occurrence are historical products.",
        "Neither product measures contamination, hazards or petroleum risk.",
        "No independent scientific field or operational regulatory review.",
        "Other seven Niger Delta states remain only candidate footprints."
    ]
    (OUT/"acquisition_report.json").write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps({"status":report["status"],"states":STATES,
        "source_tiles":{"worldcover":wc,"jrc":jrc},
        "eligible_area_km2":report["eligible_domain_geodesic_area_km2"],
        "source_halo_area_km2":halo_area,
        "esa_pixel_footprint_km2":round(wc_area,3),
        "jrc_pixel_footprint_km2":round(jrc_area,3),
        "clipped_source_count":len(report["rasters"])},indent=2))
    return report

if __name__=="__main__":run()
