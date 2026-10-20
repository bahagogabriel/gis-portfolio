"""Independent geodesic reference for PetroScreen mapped pixel proximity.

Stage 10 scientific engineering parity; computes WGS84 ellipsoidal distances
from site to ESA raster pixel centres with Rasterio + PyProj (NOT a port of
the browser's approximate metres-per-degree distance formula).

Only pixels within the chosen 1/3/5-km radius count. The source is ESA
WorldCover 2021, not confirmed current sensitive receptors, setback or risk.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window, from_bounds
from pyproj import Geod

ROOT=Path("petroscreen-ng/web/public/data")
OUTPUT=Path("petroscreen-ng/artifacts_stage10/proximity_geodesic_oracle.json")
CODES=(80,90,95,50)
G=Geod(ellps="WGS84")

def sha(path):
    digest=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):
            digest.update(chunk)
    return digest.hexdigest()

def nearest_values(files, lon, lat, radius_km):
    result={code:None for code in CODES}
    radius_m=radius_km*1000.0
    # Latitude/longitude bounding extent safely contains a circular 5 km buffer.
    latitude_span=(radius_m+100)/110000
    longitude_span=(radius_m+100)/(110000*math.cos(math.radians(lat)))
    for entry, path in files:
        with rasterio.open(path) as ds:
            if str(ds.crs)!="EPSG:4326":
                raise RuntimeError(f"Unexpected source CRS for {path}: {ds.crs}")
            win=from_bounds(lon-longitude_span,lat-latitude_span,
                lon+longitude_span,lat+latitude_span,transform=ds.transform)
            row0=max(0,math.floor(win.row_off))
            row1=min(ds.height,math.ceil(win.row_off+win.height))
            col0=max(0,math.floor(win.col_off))
            col1=min(ds.width,math.ceil(win.col_off+win.width))
            if row0>=row1 or col0>=col1:continue
            data=ds.read(1,window=Window(col0,row0,col1-col0,row1-row0))
            for code in CODES:
                rows,cols=np.where(data==code)
                if rows.size==0:continue
                x=ds.transform.c+(cols.astype(float)+col0+0.5)*ds.transform.a
                y=ds.transform.f+(rows.astype(float)+row0+0.5)*ds.transform.e
                # Only 48 nearest approximate candidates are needed for a
                # proven minimum; latitude scaling error <0.05% in this domain.
                mx=111412.84*math.cos(math.radians(lat))-93.5*math.cos(3*math.radians(lat))
                my=111132.92-559.82*math.cos(2*math.radians(lat))
                approx=(x-lon)**2*mx**2+(y-lat)**2*my**2
                take=np.argpartition(approx,min(47,len(approx)-1))[:48]
                _,_,distance=G.inv(np.full(take.size,lon),np.full(take.size,lat),x[take],y[take])
                closest=float(np.min(distance))
                if closest<=radius_m+0.001:
                    result[code]=min(result[code] if result[code] is not None else math.inf,closest)
    return {str(code):(round(v,3) if v is not None else None)
            for code,v in result.items()}

def main():
    manifest=json.loads((ROOT/"manifest.json").read_text())
    if len(manifest.get("state_sources",[]))!=9:
        raise AssertionError("Not the checked nine-state research dataset")
    cases=[]
    count=0
    for state in manifest["state_sources"]:
        files=[]
        for item in state["source_files"]:
            p=ROOT/item["file"]
            if not p.exists() or sha(p)!=item["sha256"]:
                raise RuntimeError(f"Missing or corrupt state source: {p}")
            count+=1
            if item["kind"]=="worldcover":files.append((item,p))
        lon,lat=state["qa_example_lon_lat"]
        for radius in (1,3,5):
            cases.append({
                "state":state["state"],"longitude":lon,"latitude":lat,
                "radius_km":radius,"geodesic_nearest_pixel_centre_m":nearest_values(files,lon,lat,radius)
            })
    if count!=31 or len(cases)!=27:
        raise AssertionError("Incomplete candidate source validation")
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    result={
        "status":"REFERENCE_GENERATED_NOT_YET_BROWSER_VERIFIED",
        "method":"Independent PyProj.Geod.inv WGS84 ellipsoidal centre-to-centre reference",
        "sources":"Officially derived ESA WorldCover 2021 v200, verified SHA-256 state raster files",
        "eligible_cases":27,
        "not_an_ecological_setback_or_ground_observation":True,
        "cases":cases
    }
    OUTPUT.write_text(json.dumps(result,indent=2,allow_nan=False)+"\n")
    print(json.dumps({
        "status":"INDEPENDENT_REFERENCE_READY","states":9,
        "radii":[1,3,5],"cases":len(cases),"source_tiffs_checked":count,
        "output":str(OUTPUT)
    },indent=2))

if __name__=="__main__":main()
