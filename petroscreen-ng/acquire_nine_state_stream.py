"""Stage 08 nine-state unified streamed raster acquisition, bounded memory.

One crop from each underlying 3° ESA WorldCover source tile and one JRC tile;
never stack overlapping per-state extractions. Reads/writes 256 source rows per
pass. Regional 5km halo is raster-data support, NOT site eligibility.

Research-only open-data engineering QA. No EIA, spill risk or field validation.
"""
from __future__ import annotations
import json,hashlib,math
from datetime import datetime,timezone
from pathlib import Path
from urllib.request import Request,urlopen

import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.windows import Window,transform as win_transform
from rasterio.transform import array_bounds
from pyproj import Geod
from shapely.geometry import shape,mapping,box
from shapely.ops import unary_union

from regional_tile_inventory import API,TARGETS,projected_buffer,candidates
from raster_acquisition import worldcover_url,GSW_ENDPOINTS,WORLD_COVER_CODES
from acquire_bayelsa import sha256

ROOT=Path("petroscreen-ng/artifacts_nine_state")
G=Geod(ellps="WGS84")
MAX_STRIP_ROWS=256

def request_json(url):
 with urlopen(Request(url,headers={"User-Agent":"PetroScreenNG-stage08-regional/0.1"}),timeout=75) as r:
  return json.load(r)

def remote_sources():
 meta=request_json(API)
 if meta.get("boundaryISO")!="NGA" or meta.get("boundaryType")!="ADM1" or "CC BY 4.0" not in meta.get("boundaryLicense",""):
  raise RuntimeError("Official gbOpen source/terms changed")
 hits={}
 for f in request_json(meta["gjDownloadURL"])["features"]:
  names={str(x).strip().casefold() for x in f.get("properties",{}).values() if isinstance(x,str)}
  for name in TARGETS:
   if name.casefold() in names:
    if name in hits:raise RuntimeError("Duplicate official state: "+name)
    geom=shape(f["geometry"])
    if geom.is_empty or not geom.is_valid:raise RuntimeError("Invalid state: "+name)
    hits[name]=(f,geom)
 if set(hits)!=set(TARGETS):raise RuntimeError("Nine states not resolved")
 return meta,hits

def geod_area(geom):
 return abs(G.geometry_area_perimeter(geom)[0])/1e6

def source_window(src,region):
 intersect=region.intersection(box(*src.bounds))
 if intersect.is_empty or intersect.area<=0:return None,None
 bounds=intersect.bounds
 f=src.window(bounds[0],bounds[1],bounds[2],bounds[3])
 x0=max(0,math.floor(f.col_off));y0=max(0,math.floor(f.row_off))
 x1=min(src.width,math.ceil(f.col_off+f.width));y1=min(src.height,math.ceil(f.row_off+f.height))
 if x1<=x0 or y1<=y0:raise RuntimeError("Nonempty polygon but empty pixel window")
 return Window(x0,y0,x1-x0,y1-y0),intersect

def stream_clip(url,region,path,kind):
 with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
    GDAL_HTTP_MAX_RETRY="3",GDAL_HTTP_RETRY_DELAY="2"):
  with rasterio.open(url) as src:
   if src.crs is None or src.crs.to_epsg()!=4326 or src.count!=1 or src.dtypes[0]!="uint8":
    raise RuntimeError("Unsupported source raster CRS/shape/dtype: "+url)
   win,intersect=source_window(src,region)
   if win is None:raise RuntimeError("Source does not touch AOI: "+url)
   wt=win_transform(win,src.transform)
   nodata=0 if kind=="worldcover" else 255
   profile=src.profile.copy()
   profile.update(driver="GTiff",width=int(win.width),height=int(win.height),
     count=1,transform=wt,nodata=nodata,tiled=True,blockxsize=512,blockysize=512,
     compress="DEFLATE",predictor=2,dtype="uint8")
   path.parent.mkdir(parents=True,exist_ok=True)
   clipped_geom=mapping(intersect)
   inside_count=0;valid_count=0
   anomalous={};valid_codes={}
   weighted_footprint_area_m2=0.0
   with rasterio.open(path,"w",**profile) as dst:
    for y in range(0,int(win.height),MAX_STRIP_ROWS):
     h=min(MAX_STRIP_ROWS,int(win.height)-y)
     frame=Window(win.col_off,win.row_off+y,win.width,h)
     data=src.read(1,window=frame,masked=False)
     stripe_transform=win_transform(frame,src.transform)
     inside=geometry_mask([clipped_geom],out_shape=data.shape,
       transform=stripe_transform,invert=True,all_touched=False)
     inside_count+=int(inside.sum())
     if kind=="worldcover":
      invalid=set(np.unique(data[inside]))-WORLD_COVER_CODES-{0}
      if invalid:raise RuntimeError("Unrecognized WorldCover codes "+str(invalid))
     else:
      anomaly=(data>100)&(data!=255)&inside
      if np.any(anomaly):
       vals,counts=np.unique(data[anomaly],return_counts=True)
       for v,n in zip(vals,counts):
        anomalous[str(int(v))]=anomalous.get(str(int(v)),0)+int(n)
       data[anomaly]=255
     data[~inside]=nodata
     relevant=data[inside & (data!=nodata)]
     if relevant.size:
      codes,counts=np.unique(relevant,return_counts=True)
      for code,n in zip(codes,counts):
       valid_codes[str(int(code))]=valid_codes.get(str(int(code)),0)+int(n)
     valid_count+=int(relevant.size)
     # Count pixel footprint weighted by WGS84 geodesic row area.
     for row in range(h):
      n=int(np.count_nonzero(inside[row]))
      if not n:continue
      top=stripe_transform.f+row*stripe_transform.e
      low=top+stripe_transform.e
      x=stripe_transform.c
      dx=stripe_transform.a
      a=abs(G.polygon_area_perimeter([x,x+dx,x+dx,x],
           [top,top,low,low])[0])
      weighted_footprint_area_m2+=n*a
     # Destination strip origin corresponds exactly to y source rows.
     dst.write(data,1,window=Window(0,y,win.width,h))
   if not inside_count or valid_count<.975*inside_count:
    raise RuntimeError(f"Incomplete raster {path.name}: {valid_count}/{inside_count}")
   if kind=="water_occurrence" and sum(anomalous.values())>max(100,inside_count*.0001):
    raise RuntimeError(f"Excess invalid JRC source pixels: {anomalous}")
   return {"output_name":path.name,"source_url":url,"kind":kind,
     "sha256_derived_clipped_tif":sha256(path),"bytes":path.stat().st_size,
     "clip_shape":[int(win.height),int(win.width)],
     "clip_bounds_lon_lat":list(array_bounds(int(win.height),int(win.width),wt)),
     "source_crs":str(src.crs),"source_resolution_degrees":list(src.res),
     "inside_polygon_pixel_count":inside_count,"inside_polygon_valid_pixel_count":valid_count,
     "inside_polygon_nodata_count":inside_count-valid_count,
     "inside_polygon_pixel_geodesic_area_km2":round(weighted_footprint_area_m2/1e6,4),
     "class_histogram":valid_codes,"masked_invalid_source_codes":anomalous,
     "processing":"bounded 256-row streamed COG crop",
     "source_not_field_validated":True}

def main():
 ROOT.mkdir(parents=True,exist_ok=True)
 meta,hits=remote_sources()
 official=unary_union([hits[name][1] for name in TARGETS])
 if official.is_empty or not official.is_valid:raise RuntimeError("Combined Nigeria nine-state polygon invalid")
 halo=projected_buffer(official,5000)
 wc,jrc=candidates(halo)
 if len(wc)!=6 or jrc!=["0E_10N"]:
  raise RuntimeError("Candidate tile inventory changed: "+str((wc,jrc)))
 doc={"type":"FeatureCollection","features":[{"type":"Feature",
     "properties":{"name":"Niger Delta nine-state gbOpen eligible domain",
       "purpose":"site_eligibility_NOT_source_halo"},
     "geometry":mapping(official)}]}
 geo=ROOT/"eligible_domain.geojson";geo.write_text(json.dumps(doc)+"\n")
 states=ROOT/"original_states.geojson"
 states.write_text(json.dumps({"type":"FeatureCollection","features":[hits[name][0] for name in TARGETS]})+"\n")
 halo_file=ROOT/"raster_data_halo.geojson"
 halo_file.write_text(json.dumps({"type":"Feature","properties":{
     "purpose":"source_data_buffer_5km_not_site_eligibility"},"geometry":mapping(halo)})+"\n")
 report={"stage":8,"source_admin_license":meta.get("boundaryLicense"),
  "source_admin_provider":meta.get("boundarySource"),
  "source_admin_year":meta.get("boundaryYearRepresented"),
  "generated_utc":datetime.now(timezone.utc).isoformat(),
  "status":"PENDING","states":list(TARGETS),
  "eligible_domain_geodesic_area_km2":round(geod_area(official),4),
  "source_halo_geodesic_area_km2":round(geod_area(halo),4),
  "official_boundary_sha256":sha256(geo),
  "original_states_sha256":sha256(states),
  "source_halo_sha256":sha256(halo_file),
  "worldcover_tiles":wc,"jrc_tiles":jrc,
  "rasters":[],"publication_authorized":False}
 for tile in wc:
  print("Clipping verified WorldCover source tile",tile,flush=True)
  record=stream_clip(worldcover_url(tile),halo,ROOT/f"ESA_WorldCover_2021_v200_NigerDelta_{tile}.tif","worldcover")
  report["rasters"].append(record)
 last_error=None
 for url in GSW_ENDPOINTS:
  try:
   report["rasters"].append(stream_clip(url,halo,ROOT/"JRC_GSW_v1_5_1984_2024_NigerDelta.tif","water_occurrence"))
   last_error=None
   break
  except (OSError,rasterio.errors.RasterioIOError) as e:
   last_error=e
   print("Alternative JRC source needed:",repr(e),flush=True)
 if last_error:raise last_error
 target=report["source_halo_geodesic_area_km2"]
 for kind in ("worldcover","water_occurrence"):
  actual=sum(r["inside_polygon_pixel_geodesic_area_km2"] for r in report["rasters"] if r["kind"]==kind)
  if abs(actual/target-1)>.025:
   raise RuntimeError(f"{kind} pixel footprint mismatch {actual} vs {target}")
 report["source_area_qa_km2_by_layer"]={
   kind:round(sum(r["inside_polygon_pixel_geodesic_area_km2"] for r in report["rasters"] if r["kind"]==kind),4)
   for kind in ("worldcover","water_occurrence")}
 report["status"]="NINE_STATE_REGIONAL_SOURCE_ACQUISITION_QA_PASS"
 report["limitations"]=[
    "Unsurveyed gbOpen administration approximates eligible land domain.",
    "5km source halo is not site eligibility.",
    "Land cover 2021 and JRC observed water 1984–2024 are historical satellite classifications.",
    "No petroleum risk model, official EIA, ecological field or geolocation validation.",
    "Browser regional performance and scaled file delivery require separate release gate."]
 (ROOT/"acquisition_report.json").write_text(json.dumps(report,indent=2)+"\n")
 print(json.dumps({"status":report["status"],"states":len(TARGETS),
  "esa_source_tiles":len(wc),"jrc_source_tiles":1,
  "eligible_km2":report["eligible_domain_geodesic_area_km2"],
  "data_halo_km2":target,
  "source_area_km2":report["source_area_qa_km2_by_layer"],
  "total_output_mb":round(sum(r["bytes"] for r in report["rasters"])/1e6,2)},indent=2))
 return report

if __name__=="__main__":
 main()
