"""Niger Delta nine-state *candidate* data acquisition inventory.

This is a fast public-boundary-only engineering preflight. It never claims
that satellite tiles are accessible, downloaded, classified, or deployment-ready.
"""
from __future__ import annotations
import hashlib
import json
import math
from datetime import datetime,timezone
from pathlib import Path
from urllib.request import Request,urlopen

from pyproj import Geod,Transformer
from shapely.geometry import box,shape
from shapely.ops import transform,unary_union

API="https://www.geoboundaries.org/api/current/gbOpen/NGA/ADM1/"
TARGETS=("Abia","Akwa Ibom","Bayelsa","Cross River","Delta",
         "Edo","Imo","Ondo","Rivers")
OUT=Path("petroscreen-ng/regional_expansion_candidate_index.json")
G=Geod(ellps="WGS84")

def get(url):
    request=Request(url,headers={"User-Agent":"PetroScreenNG-RegionalDiscovery/0.1"})
    with urlopen(request,timeout=70) as response:return response.read()

def bin_floor(v,size):return math.floor(v/size)*size
def bin_ceil(v,size):return math.ceil(v/size)*size
def candidates(geom):
    """Geometry-intersecting candidate tile IDs, including cross-border 5km halo."""
    w,s,e,n=geom.bounds
    worldcover=[]
    for y in range(bin_floor(s,3),bin_ceil(n,3),3):
        for x in range(bin_floor(w,3),bin_ceil(e,3),3):
            if geom.intersects(box(x,y,x+3,y+3)) and geom.intersection(box(x,y,x+3,y+3)).area>1e-12:
                lat=f"N{y:02d}" if y>=0 else f"S{abs(y):02d}"
                lon=f"E{x:03d}" if x>=0 else f"W{abs(x):03d}"
                worldcover.append(f"{lat}{lon}")
    jrc=[]
    for y in range(bin_floor(s,10),bin_ceil(n,10),10):
        for x in range(bin_floor(w,10),bin_ceil(e,10),10):
            if geom.intersects(box(x,y,x+10,y+10)) and geom.intersection(box(x,y,x+10,y+10)).area>1e-12:
                north=f"{y+10}N" if y+10>=0 else f"{abs(y+10)}S"
                west=f"{x}E" if x>=0 else f"{abs(x)}W"
                jrc.append(f"{west}_{north}")
    return sorted(set(worldcover)),sorted(set(jrc))

def projected_buffer(geom,metres):
    # Metric buffer is a deployment *candidate* halo, not a permit/site limit.
    to=Transformer.from_crs("EPSG:4326","EPSG:6933",always_xy=True)
    back=Transformer.from_crs("EPSG:6933","EPSG:4326",always_xy=True)
    return transform(back.transform,transform(to.transform,geom).buffer(metres,quad_segs=8))

def main():
    meta=json.loads(get(API))
    if meta.get("boundaryISO")!="NGA" or meta.get("boundaryType")!="ADM1" or "CC BY 4.0" not in meta.get("boundaryLicense",""):
        raise RuntimeError("Unexpected Nigeria open ADM1 metadata/license")
    body=get(meta["gjDownloadURL"])
    features=json.loads(body)["features"]
    found={}
    for feature in features:
        props=feature.get("properties",{})
        names={str(v).casefold() for v in props.values() if isinstance(v,str)}
        for name in TARGETS:
            if name.casefold() in names:
                if name in found:raise RuntimeError(f"Duplicate state boundary: {name}")
                geom=shape(feature["geometry"])
                if not geom.is_valid or geom.is_empty:raise RuntimeError(f"Invalid polygon for {name}")
                found[name]=geom
    if set(found)!=set(TARGETS):
        raise RuntimeError(f"Missing states: {sorted(set(TARGETS)-set(found))}")
    row=[]
    all_wc=set();all_jrc=set();buffered=[]
    for name in TARGETS:
        geom=found[name]
        # Geodesic area from source WGS84 polygons
        area=abs(G.geometry_area_perimeter(geom)[0])/1e6
        halo=projected_buffer(geom,5000)
        wc,jrc=candidates(halo)
        all_wc.update(wc);all_jrc.update(jrc);buffered.append(halo)
        row.append({"state":name,"source_geodesic_area_km2":round(area,3),
          "source_bbox_lon_lat":[round(x,6) for x in geom.bounds],
          "candidate_5km_halo_worldcover_tiles":wc,
          "candidate_5km_halo_jrc_tiles":jrc,
          "state_geometry_qa":"valid",
          "actual_raster_acquisition_status":"NOT_STARTED"})
    union=unary_union(buffered)
    wc_union,jrc_union=candidates(union)
    if set(wc_union)!=all_wc or set(jrc_union)!=all_jrc:
        raise RuntimeError("Tile union calculation inconsistent with state inventories")
    data={
      "status":"CANDIDATES_ONLY_NOT_VERIFIED_RASTER_COVERAGE",
      "produced_utc":datetime.now(timezone.utc).isoformat(),
      "scope":"NDDC nine-state region with nominal 5km buffer beyond state borders",
      "boundary":{
          "api_url":API,"download_url":meta["gjDownloadURL"],
          "origin_dataset":meta.get("boundarySource"),
          "year_represented":meta.get("boundaryYearRepresented"),
          "provider_license":meta.get("boundaryLicense"),
          "source_sha256":hashlib.sha256(body).hexdigest()},
      "states":row,
      "unique_candidate_worldcover_3deg_tiles":sorted(all_wc),
      "unique_candidate_jrc_v1_5_10deg_tiles":sorted(all_jrc),
      "download_urls_not_verified":True,
      "scientific_qa_status":"NOT_STARTED",
      "public_deployment_allowed":False,
      "limitations":[
          "Boundary data are regional context, not surveyed coastlines or legally definitive borders.",
          "Candidate cells do not imply source tiles physically exist or have acceptable pixel values.",
          "Cross-state buffers require continuous source mosaics and verified NoData handling.",
          "A source 'year' is not a 2026 observation.",
          "No offshore petroleum analysis, marine habitats, or infrastructure exposures are included."
      ]}
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(data,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"status":data["status"],"states":len(row),
       "worldcover_tile_count":len(all_wc),"jrc_tile_count":len(all_jrc),
       "worldcover_tile_ids":sorted(all_wc),"jrc_tile_ids":sorted(all_jrc)},indent=2))

if __name__=="__main__":main()
