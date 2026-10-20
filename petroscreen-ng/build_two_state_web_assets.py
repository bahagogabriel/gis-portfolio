"""Build a *separate* Bayelsa+Rivers two-state static preview bundle.

Never replace the Stage04 Bayelsa-only accepted build in production. This
generates static/local hosted assets from checksum-locked official source
products. Site membership is the real union of two official ADM1 polygons;
5km acquisition halos are never presented as eligible states.
"""
from __future__ import annotations
import json,hashlib,shutil
from datetime import datetime,timezone
from pathlib import Path
import numpy as np
import rasterio
from rasterio.warp import reproject,Resampling
from rasterio.transform import from_bounds
from PIL import Image

ROOT=Path("petroscreen-ng/artifacts_two_state")
PUB=Path("petroscreen-ng/web/public/data")
RASTERS=[
 ("ESA_WorldCover_2021_v200_Bayelsa_Rivers_N03E003.tif","wc_west.tif","worldcover"),
 ("ESA_WorldCover_2021_v200_Bayelsa_Rivers_N03E006.tif","wc_east.tif","worldcover"),
 ("JRC_GSW_1984_2024_Bayelsa_Rivers.tif","water_occurrence.tif","water"),
]
COLOR={
 10:(48,110,75,215),20:(154,167,96,215),30:(196,191,121,210),
 40:(224,190,103,220),50:(214,120,86,220),60:(202,167,128,190),
 70:(236,240,239,200),80:(103,164,197,230),90:(126,176,152,220),
 95:(39,142,111,225),100:(174,169,151,200)
}
def digest(p):
    h=hashlib.sha256()
    with p.open("rb") as f:
        for b in iter(lambda:f.read(1048576),b""):h.update(b)
    return h.hexdigest()

def run():
    report=json.loads((ROOT/"acquisition_report.json").read_text())
    if report["status"]!="TWO_STATE_SOURCE_ACQUISITION_AND_STRUCTURAL_QA_PASS":
        raise RuntimeError("Two-state engineering data gate not passed")
    expected={x["output_name"]:x["sha256_derived_clipped_tif"] for x in report["rasters"]}
    PUB.mkdir(parents=True,exist_ok=True)
    records=[]
    for name,file,kind in RASTERS:
        source=ROOT/name
        if digest(source)!=expected.get(name):
            raise RuntimeError("Source derived GeoTIFF failed mandatory SHA256 check "+name)
        target=PUB/file
        shutil.copyfile(source,target)
        if digest(target)!=expected[name]:
            raise RuntimeError("Output public asset differs from source")
        records.append({"file":file,"sha256":digest(target),"bytes":target.stat().st_size,
                        "original_name":name,"type":kind})
    for source_name,public_name in [
        ("two_state_eligible_domain.geojson","coverage.geojson"),
        ("two_state_original_state_boundaries.geojson","original_states.geojson")
    ]:
        src=ROOT/source_name
        if digest(src)!=report["eligible_domain_sha256" if public_name=="coverage.geojson" else "state_boundary_sha256"]:
            raise RuntimeError("Official state boundary checksum differs")
        shutil.copyfile(src,PUB/public_name)
    from shapely.geometry import shape
    union=shape(json.loads((PUB/"coverage.geojson").read_text())["features"][0]["geometry"])
    west,south,east,north=union.bounds
    width,height=1600,1330
    transform=from_bounds(west,south,east,north,width,height)
    raster=np.zeros((height,width),dtype=np.uint8)
    for name,_,kind in RASTERS:
        if kind!="worldcover":continue
        with rasterio.open(ROOT/name) as tif:
            reproject(source=rasterio.band(tif,1),destination=raster,
                src_transform=tif.transform,src_crs=tif.crs,src_nodata=0,
                dst_transform=transform,dst_crs="EPSG:4326",dst_nodata=0,
                resampling=Resampling.nearest,init_dest_nodata=False)
    rgb=np.zeros((height,width,4),dtype=np.uint8)
    for klass,color in COLOR.items():rgb[raster==klass]=color
    preview=PUB/"landcover_overview.webp"
    Image.fromarray(rgb,"RGBA").save(preview,"WEBP",quality=85,method=6)
    if preview.stat().st_size<20000:raise RuntimeError("Unexpected blank overview map")
    manifest={
      "schema_version":"2","stage":"research-preview","region":"Bayelsa and Rivers",
      "states":["Bayelsa","Rivers"],"source_years":["ESA 2021","JRC 1984–2024"],
      "generated_utc":datetime.now(timezone.utc).isoformat(),
      "worldcover":records[:2],"water":records[2],
      "boundary":{"file":"coverage.geojson","sha256":digest(PUB/"coverage.geojson"),
          "source":"geoBoundaries gbOpen Nigeria ADM1 (2022), original source GRID3; CC BY 4.0",
          "meaning":"official source state union, not 5km raster data halo"},
      "original_states":{"file":"original_states.geojson",
                         "sha256":digest(PUB/"original_states.geojson")},
      "overview":{"file":preview.name,"sha256":digest(preview),
                  "bounds_lon_lat":[west,south,east,north],
                  "display_note":"Resampled illustrative 2021 WorldCover; numerical screening from full-resolution GeoTIFFs"},
      "sources":{
          "worldcover":"ESA WorldCover 2021 v200, CC BY 4.0",
          "worldcover_credit":"© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium.",
          "jrc":"JRC Global Surface Water v1.5, 1984–2024. Source: EC JRC/Google. Copernicus terms; Pekel et al. 2016.",
          "admin":"geoBoundaries gbOpen Nigeria ADM1 2022 / GRID3, CC BY 4.0"},
      "privacy":"Browser-local calculations and locally hosted tiles; hosting may retain ordinary access logs.",
      "publication_ready":False,
      "limitations":[
          "Bayelsa–Rivers preview only. Other Nigerian states not prepared.",
          "No offshore/geotechnical/field site suitability claims.",
          "No petroleum incident, contamination or regulatory EIA predictions."
      ]
    }
    (PUB/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    print(json.dumps({"status":"PASS","scope":manifest["region"],
        "source_raster_count":len(records),
        "total_source_bytes":sum(x["bytes"] for x in records),
        "overview_bytes":preview.stat().st_size,
        "official_eligible_geodesic_area_km2":report["eligible_domain_geodesic_area_km2"]},indent=2))

if __name__=="__main__":run()
