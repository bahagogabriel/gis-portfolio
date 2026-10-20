"""Rebuildable Stage 01 Bayelsa raster clipping and coverage QA. No local agency input."""
import hashlib,json
from datetime import datetime,timezone
from pathlib import Path
from urllib.request import urlopen,Request

import numpy as np
import rasterio
from rasterio.mask import mask
from rasterio.features import geometry_mask
from rasterio.transform import array_bounds
from shapely.geometry import shape,mapping,box

from raster_acquisition import SITES,worldcover_url,GSW_ENDPOINTS,WORLD_COVER_CODES

API="https://www.geoboundaries.org/api/current/gbOpen/NGA/ADM1/"
OUTDIR=Path("petroscreen-ng/artifacts_bayelsa")

def get_json(url):
    with urlopen(Request(url,headers={"User-Agent":"PetroScreen-NG-stage01/0.1"}),timeout=60) as r:
        return json.loads(r.read())

def boundary():
    meta=get_json(API)
    features=get_json(meta["gjDownloadURL"])["features"]
    hits=[f for f in features if any(isinstance(v,str) and v.lower()=="bayelsa" for v in f["properties"].values())]
    if len(hits)!=1:raise RuntimeError(f"Expected one Bayelsa polygon, found {len(hits)}")
    geom=shape(hits[0]["geometry"])
    if not geom.is_valid or geom.is_empty:raise RuntimeError("Boundary invalid; no silent geometry repair")
    return meta,hits[0],geom

def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        for chunk in iter(lambda:f.read(1<<20),b""):h.update(chunk)
    return h.hexdigest()

def clip(url,geom,output,kind):
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
                      CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
                      GDAL_HTTP_MAX_RETRY="2"):
        with rasterio.open(url) as src:
            if src.crs is None or src.crs.to_epsg()!=4326 or src.count!=1:
                raise RuntimeError("Expected one EPSG:4326 source band")
            if geom.intersection(box(*src.bounds)).is_empty:
                raise RuntimeError("Raster does not intersect state boundary")
            nodata=0 if kind=="worldcover" else 255
            clipped,transform=mask(src,[mapping(geom)],crop=True,filled=True,nodata=nodata)
            image=clipped[0]
            anomalous_codes={}
            if kind=="worldcover":
                unknown=set(np.unique(image).tolist())-WORLD_COVER_CODES-{0}
                if unknown:raise RuntimeError(f"Unexpected {kind} pixel codes {sorted(unknown)}")
            else:
                anomalous_mask=(image>100)&(image!=255)
                abnormal,counts=np.unique(image[anomalous_mask],return_counts=True)
                anomalous_codes={str(int(k)):int(v) for k,v in zip(abnormal,counts)}
                if anomalous_codes:
                    print(f"JRC source anomaly: {anomalous_codes}; mark as unknown, never clip to 100%",flush=True)
                    if int(counts.sum())>max(100,round(image.size*0.0001)):
                        raise RuntimeError(f"Too many unexplained >100 JRC pixels: {anomalous_codes}")
                    image[anomalous_mask]=255
            pixel_mask=geometry_mask([mapping(geom)],out_shape=image.shape,
                transform=transform,invert=True,all_touched=False)
            inside=image[pixel_mask]
            valid=inside[inside!=nodata]
            if not valid.size:raise RuntimeError("No valid data inside boundary")
            codes,counts=np.unique(valid,return_counts=True)
            output.parent.mkdir(parents=True,exist_ok=True)
            metadata=src.meta.copy()
            metadata.update(driver="GTiff",height=image.shape[0],width=image.shape[1],
                transform=transform,nodata=nodata,tiled=True,compress="DEFLATE",
                predictor=2,blockxsize=512,blockysize=512)
            with rasterio.open(output,"w",**metadata) as dst:dst.write(image,1)
            return {
                "source_url":url,"output_name":output.name,
                "sha256_derived_clipped_tif":sha256(output),"bytes_derived":output.stat().st_size,
                "source_crs":str(src.crs),"source_shape":[src.height,src.width],
                "clip_shape":[image.shape[0],image.shape[1]],
                "clip_bounds_lon_lat":list(array_bounds(image.shape[0],image.shape[1],transform)),
                "source_pixel_size_degrees":list(src.res),
                "pixel_size_approx_m":"10" if kind=="worldcover" else "30",
                "inside_polygon_pixel_count":int(inside.size),
                "inside_polygon_valid_pixel_count":int(valid.size),
                "inside_polygon_nodata_count":int(inside.size-valid.size),
                "valid_codes_histogram":{str(int(c)):int(n) for c,n in zip(codes,counts)},
                "source_nodata_metadata":src.nodata,"derived_nodata_value":nodata,
                "nonstandard_source_codes_excluded_as_nodata":anomalous_codes,
                "not_a_field_validation":True}

def main():
    meta,feature,geom=boundary()
    OUTDIR.mkdir(parents=True,exist_ok=True)
    polygon_file=OUTDIR/"bayelsa_gbopen_adm1.geojson"
    polygon_file.write_text(json.dumps({"type":"FeatureCollection","features":[feature]})+"\n")
    report={"timestamp_utc":datetime.now(timezone.utc).isoformat(),
        "scope":"Complete Bayelsa pixel windows clipped from source GeoTIFFs",
        "boundary":{"dataset_id":meta.get("boundaryID"),
          "year":meta.get("boundaryYearRepresented"),"license":meta.get("boundaryLicense"),
          "is_valid":geom.is_valid,"source_url":meta["gjDownloadURL"],
          "bbox":list(geom.bounds),"polygon_sha256":sha256(polygon_file)},
        "rasters":[],"limitations":[
          "Administrative boundary is not site survey",
          "Pixel-centre inclusion affects polygon edges",
          "Pixel counts are not equal-area measurements in EPSG:4326",
          "JRC 1984–2024 occurrence is not a real-time surface-water inventory",
          "These datasets do not map pollution, petroleum assets or spill probabilities"]}
    for item in SITES:
        name=f'ESA_WorldCover_2021_v200_Bayelsa_{item["tile"]}.tif'
        report["rasters"].append(clip(worldcover_url(item["tile"]),geom,OUTDIR/name,"worldcover"))
    error=None
    for url in GSW_ENDPOINTS:
        try:
            report["rasters"].append(clip(url,geom,
                OUTDIR/"JRC_GSW_1984_2024_Occurrence_Bayelsa.tif","water_occurrence"))
            error=None
            break
        except (OSError,rasterio.errors.RasterioIOError) as e:
            error=e
            print(f"Alternate JRC source needed: {url}: {e}")
    if error:raise error
    for rec in report["rasters"]:
        if rec["inside_polygon_nodata_count"]>rec["inside_polygon_pixel_count"]*.85:
            raise RuntimeError(f"Insufficient coverage: {rec['source_url']}")
    (OUTDIR/"acquisition_report.json").write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps(report,indent=2))
if __name__=="__main__":main()
