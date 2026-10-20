"""Build a nine-state *research-only* static source-data catalogue from 9 verified
state QA artifacts. Browser can lazily fetch one site's state-owned 5km halo.

Critical: never sum overlapping 5km halo raster clips. A selected site is
attributed to ONE official ADM1 polygon; only its state's source rasters are
used for that site's full 5km buffer. This avoids tile/halo double counting.
"""
import hashlib,json,shutil
from pathlib import Path
from datetime import datetime,timezone

import numpy as np
import rasterio
from PIL import Image
from rasterio.warp import reproject,Resampling
from rasterio.transform import from_bounds
from shapely.geometry import shape,mapping
from shapely.ops import unary_union
from regional_tile_inventory import TARGETS

INPUT=Path("petroscreen-ng/artifacts_additional_states")
DEST=Path("petroscreen-ng/web/public/data")
COLORS={10:(48,110,75,235),20:(154,167,96,235),30:(196,191,121,225),
40:(224,190,103,235),50:(214,120,86,235),60:(202,167,128,235),
70:(236,240,239,210),80:(103,164,197,235),90:(126,176,152,235),
95:(39,142,111,235),100:(174,169,151,215)}

def sha(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        for block in iter(lambda:f.read(1024*1024),b""):h.update(block)
    return h.hexdigest()

def main():
    DEST.mkdir(parents=True,exist_ok=True)
    entries=[]
    all_features=[]
    clip_paths=[]
    for state in TARGETS:
        key=state.replace(" ","_")
        root=INPUT/key
        report=json.loads((root/"acquisition_report.json").read_text())
        screen=json.loads((root/"stage07_engine_acceptance.json").read_text())
        if report["state"]!=state or report["status"]!="TECHNICAL_ACQUISITION_AND_COVERAGE_QA_PASS":
            raise RuntimeError("Source acquisition not approved: "+state)
        if screen["status"]!="PASS" or len(screen["cases"])!=3:
            raise RuntimeError("Screening engine QA missing: "+state)
        original=json.loads((root/f"{key}_original_state_outline.geojson").read_text())
        if len(original["features"])!=1:raise RuntimeError("Non-unique ADM1 geometry")
        feature=original["features"][0]
        area_geom=shape(feature["geometry"])
        if not area_geom.is_valid:raise RuntimeError("Invalid official geometry")
        all_features.append(feature)
        outdir=DEST/"regions"/key
        outdir.mkdir(parents=True,exist_ok=True)
        sources=[]
        for item in report["rasters"]:
            original_name=item["output_name"]
            p=root/original_name
            if sha(p)!=item["sha256_derived_clipped_tif"]:
                raise RuntimeError("SHA mismatch "+str(p))
            kind="worldcover" if "WorldCover" in original_name else "water"
            if kind=="worldcover":
                tag=next((s for s in report["candidate_worldcover_tiles"] if s in original_name),None)
                if not tag:raise RuntimeError("WorldCover tile id absent "+original_name)
                name=f"wc_{tag}.tif"
                clip_paths.append(p)
            else:name="occurrence.tif"
            dest=outdir/name
            shutil.copyfile(p,dest)
            sources.append({"file":f"regions/{key}/{name}","sha256":sha(dest),
                "bytes":dest.stat().st_size,"kind":kind,
                "historical_period":"2021" if kind=="worldcover" else "1984-2024"})
        verified_site=screen["cases"][0]["result"]["location_wgs84"]
        entries.append({"state":state,"slug":key,"qa_example_lon_lat":[verified_site["longitude"],verified_site["latitude"]],"source_files":sources,
            "original_state_geodesic_area_km2":round(report["original_state_geodesic_area_km2"],3),
            "raster_domain_halo_m":5000,
            "source_qa":"passed_sha256_and_source_footprint",
            "reference_engine_1_3_5km":"passed"})
    union=unary_union(shape(f["geometry"]) for f in all_features)
    if union.is_empty or not union.is_valid:raise RuntimeError("Invalid nine-state union")
    bounds=union.bounds
    wc_geo={"type":"FeatureCollection","features":[
      {"type":"Feature","properties":{"region":"NDDC nine-state research pilot"},
       "geometry":mapping(union)}]}
    (DEST/"coverage.geojson").write_text(json.dumps(wc_geo)+"\n")
    (DEST/"original_states.geojson").write_text(json.dumps({
       "type":"FeatureCollection","features":all_features})+"\n")
    width,height=1600,1480
    west,south,east,north=bounds
    # State-outline raster appearance: no need for all 10m cells to be held in memory.
    grid=np.zeros((height,width),dtype=np.uint8)
    tx=from_bounds(west,south,east,north,width,height)
    for state in entries:
        slug=state["slug"]
        for f in state["source_files"]:
            if f["kind"]!="worldcover":continue
            with rasterio.open(DEST/f["file"]) as source:
                reproject(rasterio.band(source,1),grid,
                    src_transform=source.transform,src_crs=source.crs,src_nodata=0,
                    dst_transform=tx,dst_crs="EPSG:4326",dst_nodata=0,
                    resampling=Resampling.nearest,init_dest_nodata=False)
    rgba=np.zeros((height,width,4),dtype=np.uint8)
    for k,v in COLORS.items():rgba[grid==k]=v
    preview=DEST/"landcover_overview.webp"
    Image.fromarray(rgba,"RGBA").save(preview,"WEBP",quality=83,method=6)
    if preview.stat().st_size<10000:raise RuntimeError("Nine-state map overview empty")
    manifest={
      "schema_version":"3",
      "stage":"research-preview",
      "region":"Niger Delta nine-state research pilot",
      "states":list(TARGETS),"state_sources":entries,
      "loaded_raster_policy":"Only the selected site's state files. Never add overlapping halos.",
      "generated_utc":datetime.now(timezone.utc).isoformat(),
      "boundary":{"file":"coverage.geojson","sha256":sha(DEST/"coverage.geojson"),
                  "source":"geoBoundaries gbOpen Nigeria ADM1 2022 / GRID3 CC BY 4.0"},
      "original_states":{"file":"original_states.geojson","sha256":sha(DEST/"original_states.geojson")},
      "overview":{"file":preview.name,"sha256":sha(preview),"bounds_lon_lat":list(bounds)},
      "license":"ESA WorldCover 2021 v200 CC BY 4.0; JRC GSW v1.5 Copernicus terms; geoBoundaries gbOpen CC BY 4.0",
      "safety":"Research baseline only. No hazard, contamination, regulatory approval, petroleum incident likelihood, or field validation.",
      "public_deployment_allowed":False,
      "offshore_screening_allowed":False
    }
    (DEST/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    print(json.dumps({"status":"CANDIDATE_NINE_STATE_WEB_ASSET_BUNDLE",
      "states":len(entries),"source_files":sum(len(x["source_files"]) for x in entries),
      "source_bytes":sum(f["bytes"] for x in entries for f in x["source_files"]),
      "overview_bytes":preview.stat().st_size,
      "public_deployment_allowed":False},indent=2))

if __name__=="__main__":main()
