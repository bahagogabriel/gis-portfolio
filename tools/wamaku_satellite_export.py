#!/usr/bin/env python3
"""Wamaku-Rima true-colour Sentinel-2 10-m satellite basemap, reproducible open imagery."""
from __future__ import annotations
import json, math, re, base64, zlib, zipfile, time
from pathlib import Path
from datetime import datetime, timezone
import numpy as np
import geopandas as gpd
import requests
from shapely.geometry import shape, box
from shapely.ops import unary_union
from shapely import wkb
from pyproj import Transformer
import rasterio
from rasterio.vrt import WarpedVRT
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from PIL import Image, ImageDraw, ImageFont

R = Path("Wamaku_Rima_Satellite"); R.mkdir(exist_ok=True)
repo_script=Path("tools/wamaku_rima_export.py").read_text()
m=re.search(r'aoi=wkb.loads\(zlib.decompress\(base64.b64decode\("([^"]+)"\)\)\)',repo_script)
assert m, "Original boundary embedded in earlier GIS export not found"
aoi=wkb.loads(zlib.decompress(base64.b64decode(m.group(1))))
assert aoi.is_valid and aoi.area>0
crs="EPSG:32631"
boundary=gpd.GeoDataFrame([{"Name":"Wamaku-Rima","Source":"User supplied HydroBASINS catchment","HYBAS_ID":"1080696100"}],geometry=[aoi],crs="EPSG:4326")
b_projected=boundary.to_crs(crs).geometry.iloc[0]
# General area: extend a fixed 8 km in every direction beyond catchment bbox.
xmin,ymin,xmax,ymax=b_projected.bounds
margin=8000; res=10
xmin=math.floor((xmin-margin)/res)*res
xmax=math.ceil((xmax+margin)/res)*res
ymin=math.floor((ymin-margin)/res)*res
ymax=math.ceil((ymax+margin)/res)*res
width=int((xmax-xmin)/res); height=int((ymax-ymin)/res)
transform=from_origin(xmin,ymax,res,res)
print("FRAME",json.dumps({"width":width,"height":height,"utm_bounds":[xmin,ymin,xmax,ymax],"resolution_m":res}),flush=True)
assert width*height < 75e6 and width>2000 and height>2000
latlon=Transformer.from_crs(crs,"EPSG:4326",always_xy=True)
ll=latlon.transform(xmin,ymin);ur=latlon.transform(xmax,ymax)
bbox=[ll[0],ll[1],ur[0],ur[1]]
frame=box(*bbox)
session=requests.Session()
stac="https://earth-search.aws.element84.com/v1/search"
def search(start,end,cloud=22,limit=100):
 payload={"collections":["sentinel-2-l2a"],"bbox":bbox,
 "datetime":f"{start}T00:00:00Z/{end}T23:59:59Z","limit":limit,
 "query":{"eo:cloud_cover":{"lt":cloud}}}
 result=[]
 link=stac;count=0
 while link and len(result)<450 and count<6:
  for attempt in range(4):
   try:
    r=session.post(link,json=payload,timeout=50);
    if r.status_code>=400: print("STAC HTTP",r.status_code,"response",r.text[:1100],flush=True)
    r.raise_for_status(); j=r.json();break
   except Exception as e:
    print("STAC retry",attempt, str(e)[:160],flush=True);
    if isinstance(e,requests.HTTPError) and e.response is not None and e.response.status_code==400: break
    time.sleep(3*(attempt+1))
  else:raise RuntimeError("STAC repeated errors")
  fs=j.get("features",[]);result+=fs;count+=1
  print("STAC returned",len(fs),"page",count,flush=True)
  nxt=next((x for x in j.get("links",[]) if x.get("rel")=="next"),None)
  # Avoid risky pagination changes if first page already contains sufficient scenes.
  if len(result)>=180:break
  if not nxt:break
  if nxt.get("method","GET").upper()=="GET":
   # STAC next often GET with full tokenized link, but POST pagination differs.
   link=nxt["href"];payload={}
  else:
   link=nxt["href"];payload=nxt.get("body",payload)
 return result

items=[]
for period in [("2025-12-01","2026-03-31",15),
               ("2025-10-01","2026-04-30",32)]:
 try:
  found=search(*period)
  items.extend(found)
  print("Candidate items",len(items),flush=True)
  if len(items)>=25: break
 except Exception as e: print("STAC period failed",str(e),flush=True)
seen=set(); choices=[]
for f in items:
 if f.get("id") in seen:continue
 seen.add(f.get("id"))
 try:
  geom=shape(f["geometry"]);overlap=geom.intersection(frame)
  href=f.get("assets",{}).get("visual",{}).get("href")
  cloud=float(f.get("properties",{}).get("eo:cloud_cover",100))
  if not href or overlap.is_empty or overlap.area/frame.area<0.005:continue
  choices.append((f,overlap,cloud,href))
 except Exception as e:print("Skip invalid item",str(e)[:80],flush=True)
print("Usable scenes:",len(choices),flush=True)
assert choices, "No public Sentinel scenes found"
# Prefer days with several overlapping granules; cloud cover and area both matter.
groups={}
for f,g,c,h in choices:
 day=f["properties"].get("datetime","")[:10]
 groups.setdefault(day,[]).append((f,g,c,h))
daily=[]
for d,cs in groups.items():
 cov=unary_union([x[1] for x in cs]).intersection(frame).area/frame.area
 cloudavg=np.average([x[2] for x in cs],weights=[x[1].area for x in cs])
 daily.append((cov,cloudavg,d,cs))
daily.sort(key=lambda x:(x[0] >= .97,x[0],-x[1]), reverse=True)
for cov,cl,d,cs in daily[:10]:
 print("Candidate date",d,"coverage",round(cov,4),"cloud",round(cl,3),"n",len(cs),flush=True)
# First construct a single-date coherent scene when coverage allows. Otherwise fill with lowest-cloud supplementary dates.
best=sorted(daily, key=lambda x:(x[0]>=.97, x[0] - .004*x[1], -x[1]),reverse=True)[0]
chosen=[]
if best[0]>=.88:
 for f,g,c,h in sorted(best[3], key=lambda x:x[2],reverse=True):
  if g.area/frame.area>.01:chosen.append((f,g,c,h))
else:
 print("No near-complete same-date coverage; greedy cloud-aware fill",flush=True)
covered=unary_union([x[1] for x in chosen]) if chosen else None
extra=sorted(choices, key=lambda x:x[2])
for i in range(15):
 coverage=covered.intersection(frame).area/frame.area if covered else 0
 if coverage>=.997:break
 residual=frame.difference(covered) if covered else frame
 gain=[]
 for f,g,c,h in extra:
  if f["id"] in [x[0]["id"] for x in chosen]:continue
  area=g.intersection(residual).area/frame.area
  if area>.003:
   score=area/(1+0.025*c)
   gain.append((score,area,(f,g,c,h)))
 if not gain:break
 gain.sort(reverse=True,key=lambda x:x[0])
 chosen.append(gain[0][2])
 covered=unary_union([x[1] for x in chosen])
 print("Selected",chosen[-1][0]["id"],"coverage",round(covered.intersection(frame).area/frame.area,4),flush=True)
assert chosen, "Unable to choose Sentinel scenes"
print("FINAL SCENES", [(x[0]["id"],x[2]) for x in chosen],flush=True)
# Optional failover for alternate COG mirrors may be required; leave the underlying imagery unmodified.
rgb=np.zeros((3,height,width),dtype="uint8")
filled=np.zeros((height,width),dtype=bool)
source_records=[]
for item,geom,cloud,url in chosen:
 print("READ",item["id"],"visual",url[:140],flush=True)
 try:
  with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
       GDAL_HTTP_MAX_RETRY="5",GDAL_HTTP_RETRY_DELAY="2",GDAL_HTTP_MULTIRANGE="YES",
       GDAL_HTTP_MULTIPLEX="YES",GDAL_NUM_THREADS="2",VSI_CACHE="FALSE"):
   with rasterio.open(url) as src:
    print("Asset",src.count,src.crs,src.dtypes,src.width,src.height,flush=True)
    with WarpedVRT(src,crs=crs,transform=transform,width=width,height=height,
                 resampling=Resampling.bilinear,nodata=0) as vrt:
     data=vrt.read([1,2,3],masked=False)
     new_valid=np.any(data>0,axis=0)
     target=new_valid & (~filled)
     for band in range(3):rgb[band,target]=data[band,target]
     filled|=target
     ratio=float(target.sum())/filled.size
     print("READ OK",item["id"],"new_pixels",round(ratio,4),"filled",round(filled.mean(),4),flush=True)
  source_records.append({"scene_id":item["id"],"datetime":item["properties"].get("datetime"),
  "cloud_cover_scene_percent":cloud,"stac_item":item.get("links",[{}])[0].get("href",""),"visual_asset":url})
 except Exception as e:
  print("SCENE_READ_FAILURE",str(e)[:350],flush=True)
fraction=float(filled.mean())
print("FINAL frame coverage",fraction,flush=True)
if fraction<.92:raise RuntimeError(f"Insufficient valid imagery pixels {fraction*100:.1f}%")
# GeoTIFF: unmodified wider area with true spatial positioning.
tif=R/"Wamaku_Rima_Sentinel2_10m_RGB_Wider_Area.tif"
profile=dict(driver="GTiff",height=height,width=width,count=3,dtype="uint8",
             crs=crs,transform=transform,tiled=True,blockxsize=512,blockysize=512,
             compress="JPEG",photometric="YCBCR",jpeg_quality=93,interleave="pixel",
             BIGTIFF="IF_SAFER",nodata=None)
with rasterio.open(tif,"w",**profile) as dst:
 dst.write(rgb)
 dst.set_band_description(1,"Red");dst.set_band_description(2,"Green");dst.set_band_description(3,"Blue")
 dst.update_tags(source="Copernicus Sentinel-2 L2A 10m TCI (Element84 Earth Search)",
                 imagery_not_google_earth="true",study_area="Wamaku Rima catchment",
                 scene_ids=";".join(x["scene_id"] for x in source_records),
                 processing_date_utc=datetime.now(timezone.utc).isoformat())
 try: dst.build_overviews([2,4,8,16],Resampling.average)
 except Exception as e:print("Overview warning",e,flush=True)
print("GeoTIFF",tif.stat().st_size,flush=True)
# Copy precise boundary as an independently togglable GIS layer.
boundary.to_file(R/"Wamaku_Rima_Study_Boundary.shp",driver="ESRI Shapefile",encoding="UTF-8")
boundary.to_file(R/"Wamaku_Rima_Study_Boundary.gpkg",layer="catchment_boundary",driver="GPKG")
# Create crisp cartographic outline in the same full-resolution PNG for maps and slides.
# Use ImageDraw from geo-transformed exterior coordinates, image is not a substitute for GIS raster.
out=Image.fromarray(np.moveaxis(rgb,0,2),"RGB")
draw=ImageDraw.Draw(out)
outline=b_projected
def pixelcoords(ring):
 return [((x-xmin)/res,(ymax-y)/res) for x,y in ring.coords]
for poly in ([outline] if outline.geom_type=="Polygon" else list(outline.geoms)):
 coords=pixelcoords(poly.exterior)
 draw.line(coords+[coords[0]],fill=(5,15,20),width=17,joint="curve")
 draw.line(coords+[coords[0]],fill=(255,215,42),width=10,joint="curve")
out_jpg=R/"Wamaku_Rima_Satellite_With_Catchment_Outline.jpg"
out.save(out_jpg,format="JPEG",quality=94,optimize=True,subsampling=0,dpi=(300,300))
thumb=out.copy()
thumb.thumbnail((2400,2400),Image.Resampling.LANCZOS)
thumb.save(R/"Satellite_Map_Preview.jpg",quality=85,optimize=True)
# QA raster raster extent / nodata and boundary coverage.
with rasterio.open(tif) as src:
 assert src.crs.to_string()==crs
 assert src.count==3
 assert abs(src.res[0]-10)<0.001
 assert xmin<src.bounds.left+1 and xmax<=src.bounds.right+.01
 assert b_projected.within(box(src.bounds.left,src.bounds.bottom,src.bounds.right,src.bounds.top))
print("QA validated raster geometry, CRS, resolution and boundary coverage",flush=True)
readme=f"""WAMAKU-RIMA TRUE COLOUR SATELLITE IMAGERY
=================================================
Purpose: General/wider-area satellite imagery to serve as ArcGIS Pro map background.
Boundary: exact user-supplied Wamaku-Rima catchment HYBAS_ID 1080696100, as a separate layer.
Source: Open Copernicus Sentinel-2 Level-2A true-color visual/TCI assets via Element84 Earth Search STAC.
This is **NOT Google Earth or Google imagery** and must not be labelled as such.
Native ground sample distance: 10 metres. Displayed JPEG is a visualization, not a higher-resolution ground observation.
Area: full rectangular frame with 8 km margin from the boundary envelope (UTM zone 31N).
Raster size: {width} x {height} pixels at 10 m.
Pixel coverage by imagery: {fraction*100:.2f} %.
CRS: EPSG:32631 (WGS 84 / UTM zone 31N) for the GeoTIFF.
Boundary shapefile and GeoPackage: EPSG:4326 (WGS 84); ArcGIS Pro reprojects on the fly.
Raster footprint (UTM 31N m): xmin {xmin}; ymin {ymin}; xmax {xmax}; ymax {ymax}.
Valid original polygon area: {b_projected.area/1e6:.3f} square km.

DELIVERED FILES:
- Wamaku_Rima_Sentinel2_10m_RGB_Wider_Area.tif: georeferenced, RGB, no boundary burnt in.
- Wamaku_Rima_Satellite_With_Catchment_Outline.jpg: high pixel count visual with yellow boundary, *not georeferenced*.
- Satellite_Map_Preview.jpg: smaller image preview.
- Wamaku_Rima_Study_Boundary.shp plus .shx .dbf .prj .cpg: original study outline as GIS polygon.
- Wamaku_Rima_Study_Boundary.gpkg: same boundary in GeoPackage.
- Scenes_Metadata.json: satellite acquisition provenance and source links.

ArcGIS Pro quick steps:
1. Extract ZIP; Add Data -> .tif raster, then .shp or .gpkg boundary.
2. Set boundary symbol No Fill and yellow/orange outline of about 1.5-2 pt.
3. Add previously provided drainage, villages and dam layers as desired.
4. Export final map in 300 dpi PNG/PDF; do not alter spatial reference manually.
5. You can create an ArcGIS map layout with a wider-area satellite image while retaining the precise study polygon.
Image scenes were selected for cloud conditions. Some haze/field season differences can remain.
Imagery attribution: Contains modified Copernicus Sentinel data ({', '.join(sorted(set(x['datetime'][:4] for x in source_records)))}), processed by the European Space Agency. Accessed through Element84 Earth Search.
Source API: https://earth-search.aws.element84.com/v1
Sentinel dataset documentation: https://dataspace.copernicus.eu/data-collections/copernicus-sentinel-missions/sentinel-2
"""
(R/"README_ArcGIS_Satellite.txt").write_text(readme,encoding="utf-8")
(R/"Scenes_Metadata.json").write_text(json.dumps({
 "source":"Copernicus Sentinel-2 L2A/TCI via Element84 Earth Search","is_google_earth":False,
 "scenes":source_records,"image_resolution_m":10,"pixel_width":width,"pixel_height":height,
 "frame_utm31n":[xmin,ymin,xmax,ymax],"fraction_valid":fraction,
 "boundary_source":"User supplied Wamako_Rima.rar (HYBAS_ID 1080696100)",
 "generated_utc":datetime.now(timezone.utc).isoformat()},indent=2),encoding="utf-8")
zipname=Path("Wamaku_Rima_HD_Satellite_Imagery_ArcGIS.zip")
with zipfile.ZipFile(zipname,"w",zipfile.ZIP_DEFLATED,compresslevel=5,allowZip64=True) as z:
 for p in sorted(R.iterdir()):
  if p.is_file():z.write(p,p.relative_to(R.parent))
print("SUCCESS",zipname,"size_bytes",zipname.stat().st_size,"scenes",len(source_records),flush=True)
