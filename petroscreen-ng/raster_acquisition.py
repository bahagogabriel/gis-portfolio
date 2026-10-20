"""Stage 01: sample real ESA/JRC GeoTIFF pixels, not just metadata or RGB web maps."""
import argparse, hashlib, json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
import numpy as np
import rasterio
from rasterio.windows import Window

WORLD_COVER_PREFIX="https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/"
GSW_ENDPOINTS=[
"https://storage.googleapis.com/water-world/download2024/VER1-5/occurrence/occurrence_0E_10N_v1_5_2024.tif",
"https://s3.waw4-1.cloudferro.com/swift/v1/global-surface-water/download2024/Aggregated/VER1-5/occurrence/occurrence_0E_10N_v1_5_2024.tif"]
WORLD_COVER_CODES={10,20,30,40,50,60,70,80,90,95,100}
SITES=[{"id":"bayelsa_west","lon":5.70,"lat":4.90,"tile":"N03E003"},
       {"id":"bayelsa_east","lon":6.30,"lat":4.90,"tile":"N03E006"}]

def worldcover_url(tile):
    return f"{WORLD_COVER_PREFIX}ESA_WorldCover_10m_2021_v200_{tile}_Map.tif"

def _safe_url(url):
    if urlparse(url).scheme!="https": raise ValueError("HTTPS data source required")
    return url

def sample_cog(url,lon,lat,kind):
    _safe_url(url)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
        GDAL_HTTP_MAX_RETRY="1", GDAL_HTTP_RETRY_DELAY="1",
        CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
        with rasterio.open(url) as src:
            if src.count!=1 or src.crs is None or src.crs.to_epsg()!=4326:
                raise ValueError(f"Unexpected schema: bands={src.count}; CRS={src.crs}")
            if not (src.bounds.left<=lon<src.bounds.right and src.bounds.bottom<lat<=src.bounds.top):
                raise ValueError(f"Point outside tile: {src.bounds}")
            row,col=src.index(lon,lat)
            width=min(128,src.width);height=min(128,src.height)
            col0=max(0,min(col-width//2,src.width-width))
            row0=max(0,min(row-height//2,src.height-height))
            arr=src.read(1,window=Window(col0,row0,width,height),masked=False)
            values,counts=np.unique(arr,return_counts=True)
            nodata=src.nodata
            valid=arr if nodata is None else arr[arr!=nodata]
            if kind=="worldcover":
                forbidden=set(int(x) for x in np.unique(valid))-WORLD_COVER_CODES-{0}
                if forbidden: raise ValueError(f"Unknown ESA codes {sorted(forbidden)}")
            elif kind=="water_occurrence":
                forbidden=set(int(x) for x in np.unique(arr))-set(range(101))-{254,255}
                if forbidden: raise ValueError(f"Unexpected JRC codes {sorted(forbidden)}")
            else: raise ValueError("Unknown kind")
            return {"status":"sampled_actual_raster_pixels","source_url":url,
                "dataset_kind":kind,"site_lon_lat":[lon,lat],"crs":str(src.crs),
                "bounds_lon_lat":list(src.bounds),"raster_width":src.width,
                "raster_height":src.height,"source_nodata":nodata,
                "source_dtype":src.dtypes[0],"resolution_degrees":list(src.res),
                "sample_window_rcwh":[int(row0),int(col0),int(height),int(width)],
                "sample_sha256":hashlib.sha256(arr.tobytes()).hexdigest(),
                "sample_pixel_count":int(arr.size),
                "sample_unique_codes":{str(int(v)):int(c) for v,c in zip(values,counts)},
                "sample_valid_pixel_count":int(valid.size),
                "sample_only_not_full_coverage_qa":True}

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--output",default="petroscreen-ng/raster_probe_results.json")
    args=p.parse_args()
    results={"created_utc":datetime.now(timezone.utc).isoformat(),
       "scope":"Actual COG sample-window tests; NOT full Bayelsa coverage acquisition",
       "sites":{},"water_occurrence_candidates":[]}
    failed=False
    for site in SITES:
        try:
            results["sites"][site["id"]]=sample_cog(worldcover_url(site["tile"]),
                site["lon"],site["lat"],"worldcover")
        except Exception as e:
            results["sites"][site["id"]]={"status":"FAILED","error":f"{type(e).__name__}: {e}"}
            failed=True
    for url in GSW_ENDPOINTS:
        try:
            results["water_occurrence_candidates"].append(
                sample_cog(url,SITES[0]["lon"],SITES[0]["lat"],"water_occurrence"))
            break
        except Exception as e:
            results["water_occurrence_candidates"].append(
                {"status":"FAILED","source_url":url,"error":f"{type(e).__name__}: {e}"})
    if not results["water_occurrence_candidates"] or results["water_occurrence_candidates"][-1]["status"]=="FAILED":
        failed=True
    out=Path(args.output);out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(results,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(results,indent=2))
    if failed: raise SystemExit("At least one mandatory real-COG probe failed; G0b still pending")
if __name__=="__main__":main()
