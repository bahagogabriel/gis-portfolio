"""Sample real satellite raster pixels in all NDDC nine-state *candidate* tiles.

Reads small windows from official public ESA/JRC TIFFs, no paid API and no
Nigeria-agency data. A successful sample does NOT mean complete coverage QA.
"""
from __future__ import annotations
import json
from datetime import datetime,timezone
from pathlib import Path
from urllib.request import Request,urlopen

from shapely.geometry import shape,box
from shapely.ops import transform,unary_union
from pyproj import Transformer

from raster_acquisition import sample_cog,worldcover_url,GSW_ENDPOINTS
from regional_tile_inventory import API,TARGETS,projected_buffer

ROOT=Path("petroscreen-ng")
INDEX=ROOT/"regional_expansion_candidate_index.json"
OUTPUT=ROOT/"regional_source_pixel_probe.json"

def geojson(url):
    with urlopen(Request(url,headers={"User-Agent":"PetroScreenNG-RegionalSample/0.1"}),timeout=60) as f:
        return json.loads(f.read())

def tile_box(tag):
    # ESA tile is the 3-degree southwest anchor: N03E006.
    if not(tag.startswith("N") and "E" in tag):
        raise ValueError(f"Only valid NGA N/E ESA tile IDs supported: {tag}")
    parts=tag.split("E")
    lat=int(parts[0][1:]);lon=int(parts[1])
    return box(lon,lat,lon+3,lat+3)

def main():
    manifest=json.loads(INDEX.read_text(encoding="utf-8"))
    if manifest["status"]!="CANDIDATES_ONLY_NOT_VERIFIED_RASTER_COVERAGE":
        raise RuntimeError("Regional tile candidates not a verified dataset")
    meta=geojson(API)
    region=geojson(meta["gjDownloadURL"])
    geoms=[]
    found=set()
    for feature in region["features"]:
        names={str(v).casefold() for v in feature["properties"].values() if isinstance(v,str)}
        for name in TARGETS:
            if name.casefold() in names:
                geoms.append(projected_buffer(shape(feature["geometry"]),5000))
                found.add(name)
    if found!=set(TARGETS):raise RuntimeError("All nine state AOIs not found")
    target=unary_union(geoms)
    attempts=[]
    errors=[]
    for tile in manifest["unique_candidate_worldcover_3deg_tiles"]:
        intersection=target.intersection(tile_box(tile))
        if intersection.is_empty or intersection.area<=0:
            raise RuntimeError(f"Candidate tile does not overlap target: {tile}")
        p=intersection.representative_point()
        try:
            sample=sample_cog(worldcover_url(tile),p.x,p.y,"worldcover")
            if sample["sample_valid_pixel_count"]<=0:
                raise ValueError("No valid ESA pixels in sample window")
            sample["candidate_tile"]=tile
            attempts.append(sample)
        except Exception as exc:
            attempts.append({"candidate_tile":tile,"status":"FAILED",
                             "error":f"{type(exc).__name__}: {exc}"})
            errors.append(tile)
    # The identified JRC source grid must be tested at a real coordinate.
    if manifest["unique_candidate_jrc_v1_5_10deg_tiles"]!=["0E_10N"]:
        raise RuntimeError("Unexpected JRC tile index: needs revised URL discovery")
    p=target.representative_point()
    for url in GSW_ENDPOINTS:
        try:
            result=sample_cog(url,p.x,p.y,"water_occurrence")
            if result["sample_valid_pixel_count"]<=0:
                raise ValueError("No valid JRC pixels sampled")
            result["candidate_tile"]="0E_10N"
            attempts.append(result)
            break
        except Exception as exc:
            attempts.append({"candidate_tile":"0E_10N","source_url":url,
                 "status":"FAILED","error":f"{type(exc).__name__}: {exc}"})
    if not attempts or attempts[-1]["status"]=="FAILED":
        errors.append("0E_10N")
    report={"checked_utc":datetime.now(timezone.utc).isoformat(),
        "scope":"Actual raster sample pixels in NDDC regional candidate tiles; NOT full source coverage",
        "nine_states":list(TARGETS),
        "sample_results":attempts,"candidate_esa_tiles_count":
        len(manifest["unique_candidate_worldcover_3deg_tiles"]),
        "failed_candidates":errors,
        "full_regional_data_acquisition":"PENDING",
        "full_regional_coverage_qa":"PENDING",
        "regional_public_screening_allowed":False}
    OUTPUT.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"status":"PASS" if not errors else "HOLD",
        "sampled_success":sum(x["status"]=="sampled_actual_raster_pixels" for x in attempts),
        "failures":errors,"report":str(OUTPUT)},indent=2))
    if errors:raise SystemExit("Actual source sample failures: "+",".join(errors))
if __name__=="__main__":main()
