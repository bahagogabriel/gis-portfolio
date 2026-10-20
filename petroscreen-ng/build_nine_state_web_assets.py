"""Prepare Stage 09 browser on-demand spatial tile archive from VERIFIED 9-state sources.

Input: Stage 08's seven checksum-verified original-source clips, one per tile,
no state overlaps. Output: non-overlapping source-window GeoTIFF chunks sized
2048 source pixels; one state union manifest + a small overview for the map.
No resampling for the *analytical* GeoTIFFs. The overview is visual-only.
"""
from __future__ import annotations
import hashlib,json,math,shutil
from pathlib import Path
from datetime import datetime,timezone

import numpy as np
import rasterio
from rasterio.windows import Window,bounds as win_bounds
from rasterio.warp import reproject,Resampling
from rasterio.transform import from_bounds
from shapely.geometry import shape
from PIL import Image

ROOT=Path("petroscreen-ng/artifacts_nine_state")
DEST=Path("petroscreen-ng/web/public/data")
TILE=2048
COLORS={
 10:(48,110,75,215),20:(154,167,96,215),30:(196,191,121,210),
 40:(224,190,103,220),50:(214,120,86,220),60:(202,167,128,190),
 70:(236,240,239,200),80:(103,164,197,230),90:(126,176,152,220),
 95:(39,142,111,225),100:(174,169,151,200)}

def digest(path):
 h=hashlib.sha256()
 with path.open("rb") as f:
  for chunk in iter(lambda:f.read(1<<20),b""):h.update(chunk)
 return h.hexdigest()

def make_index(root,report):
 tiles=DEST/"tiles";tiles.mkdir(parents=True,exist_ok=True)
 items={"worldcover":[],"water":[]}
 original_valid=0;output_valid=0
 total_bytes=0
 for i,source in enumerate(report["rasters"]):
  input_path=root/source["output_name"]
  if digest(input_path)!=source["sha256_derived_clipped_tif"]:
   raise RuntimeError("Original stage08 source checksum mismatch: "+input_path.name)
  kind=source["kind"]
  key="worldcover" if kind=="worldcover" else "water"
  nodata=0 if key=="worldcover" else 255
  original_valid+=source["inside_polygon_valid_pixel_count"]
  counted=0
  with rasterio.open(input_path) as src:
   if src.count!=1 or src.dtypes[0]!="uint8" or src.crs.to_epsg()!=4326:
    raise RuntimeError("Unexpected source grid")
   for row in range(0,src.height,TILE):
    for col in range(0,src.width,TILE):
     win=Window(col,row,min(TILE,src.width-col),min(TILE,src.height-row))
     arr=src.read(1,window=win)
     valid=int(np.count_nonzero(arr!=nodata))
     if valid==0:continue
     counted+=valid
     basename=f"{kind}_{i:02d}_r{row//TILE:03d}_c{col//TILE:03d}.tif"
     out=tiles/basename
     props=src.profile.copy()
     props.update(driver="GTiff",width=arr.shape[1],height=arr.shape[0],
                  transform=src.window_transform(win),nodata=nodata,
                  tiled=True,blockxsize=256,blockysize=256,compress="DEFLATE",predictor=2)
     with rasterio.open(out,"w",**props) as dst:dst.write(arr,1)
     bounds=win_bounds(win,src.transform)
     items[key].append({"file":"tiles/"+basename,"sha256":digest(out),
        "bounds_lon_lat":[round(float(v),12) for v in bounds],
        "source_tile":source["output_name"],
        "valid_pixels":valid,"bytes":out.stat().st_size})
     total_bytes+=out.stat().st_size
  if counted!=source["inside_polygon_valid_pixel_count"]:
   raise RuntimeError(f"Source pixels missing/duplicated during chunking: {input_path} ({counted} vs {source['inside_polygon_valid_pixel_count']})")
  output_valid+=counted
 if original_valid!=output_valid:raise RuntimeError("Chunk population mismatch")
 return items,total_bytes

def run():
 source=json.loads((ROOT/"acquisition_report.json").read_text())
 if source["status"]!="NINE_STATE_REGIONAL_SOURCE_ACQUISITION_QA_PASS" or len(source["states"])!=9:
  raise RuntimeError("Nine-state continuous source data have not been QA accepted")
 DEST.mkdir(parents=True,exist_ok=True)
 entries,bytes_total=make_index(ROOT,source)
 for original,public,sha in [
  ("eligible_domain.geojson","coverage.geojson","official_boundary_sha256"),
  ("original_states.geojson","original_states.geojson","original_states_sha256")]:
  if digest(ROOT/original)!=source[sha]:raise RuntimeError("Boundary failed source SHA256")
  shutil.copyfile(ROOT/original,DEST/public)
 region=shape(json.loads((DEST/"coverage.geojson").read_text())["features"][0]["geometry"])
 bbox=region.bounds;w,s,e,n=bbox
 width,height=1800,1500
 image=np.zeros((height,width),dtype=np.uint8)
 affine=from_bounds(w,s,e,n,width,height)
 for r in source["rasters"]:
  if r["kind"]!="worldcover":continue
  with rasterio.open(ROOT/r["output_name"]) as src:
   reproject(rasterio.band(src,1),image,src_transform=src.transform,src_crs=src.crs,
     src_nodata=0,dst_transform=affine,dst_crs="EPSG:4326",dst_nodata=0,
     resampling=Resampling.nearest,init_dest_nodata=False)
 display=np.zeros((height,width,4),dtype=np.uint8)
 for code,color in COLORS.items():display[image==code]=color
 preview=DEST/"landcover_overview.webp"
 Image.fromarray(display,"RGBA").save(preview,"WEBP",quality=85,method=6)
 if preview.stat().st_size<20000:raise RuntimeError("Overview appears unexpectedly blank")
 manifest={
  "schema_version":"3","stage":"research-preview","data_mode":"regional_chunk_index",
  "region":"Niger Delta nine-state pilot","states":source["states"],
  "created_utc":datetime.now(timezone.utc).isoformat(),
  "max_screening_radius_km":5,"source_data_halo_km":5,
  "tile_size_source_pixels":TILE,
  "tile_counts":{k:len(v) for k,v in entries.items()},
  "worldcover_index":entries["worldcover"],
  "water_index":entries["water"],
  "boundary":{"file":"coverage.geojson",
    "sha256":digest(DEST/"coverage.geojson"),
    "source":"geoBoundaries gbOpen Nigeria ADM1 2022, source GRID3; CC BY 4.0",
    "role":"source administrative union - site eligibility"},
  "original_states":{"file":"original_states.geojson",
    "sha256":digest(DEST/"original_states.geojson")},
  "overview":{"file":preview.name,"sha256":digest(preview),
    "bounds_lon_lat":[w,s,e,n],
    "display_note":"Generalized source-derived land cover 2021, not screening data"},
  "sources":{
    "worldcover":"ESA WorldCover 2021 v200 CC BY 4.0, Zanaga et al. 2022",
    "worldcover_credit":"© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium",
    "jrc":"JRC Global Surface Water v1.5 historical occurrence 1984–2024. Source: EC JRC/Google; Pekel et al. 2016, Copernicus terms",
    "administrative":"geoBoundaries gbOpen Nigeria ADM1 2022; GRID3; CC BY 4.0"},
  "public_deployment_authorized":False,
  "limitations":[
    "Research preview, preliminary satellite baseline, not official EIA or petroleum risk.",
    "This is nine NDDC states, not all Nigeria; no offshore marine screening.",
    "Classification dates 2021 and 1984–2024; not a present-day field observation.",
    "Source tile index creates no overlap between nonempty raster source windows."]
 }
 (DEST/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
 report_file=ROOT/"stage09_tile_delivery_qa.json"
 report_file.write_text(json.dumps({"status":"PASS","states":9,
   "original_raster_count":len(source["rasters"]),
   "chunks_by_layer":manifest["tile_counts"],
   "total_chunk_megabytes":round(bytes_total/1e6,2),
   "original_valid_pixel_count":original_valid,
   "chunk_valid_pixel_count":output_valid,"data_mode":manifest["data_mode"],
   "manifest_sha256":digest(DEST/"manifest.json"),
   "public_deployment_authorized":False},indent=2)+"\n")
 print(report_file.read_text())
 return manifest

if __name__=="__main__":
 run()
