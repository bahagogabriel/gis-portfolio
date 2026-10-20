"""Stage 03: package only version-locked, approved derivative datasets for local preview.

The output directory is not committed or deployed automatically; CI archives it.
"""
import hashlib
import json
import shutil
from pathlib import Path
from datetime import datetime,timezone

ROOT=Path("petroscreen-ng/artifacts_bayelsa")
PUBLIC=Path("petroscreen-ng/web/public/data")
TARGETS=[
    ("ESA_WorldCover_2021_v200_Bayelsa_N03E003.tif","wc_west.tif"),
    ("ESA_WorldCover_2021_v200_Bayelsa_N03E006.tif","wc_east.tif"),
    ("JRC_GSW_1984_2024_Occurrence_Bayelsa.tif","water_occurrence.tif")
]

def hash_file(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1048576),b""):
            h.update(chunk)
    return h.hexdigest()

def run():
    source=json.loads((ROOT/"acquisition_report.json").read_text())
    verified={item["output_name"]:item["sha256_derived_clipped_tif"]
              for item in source["rasters"]}
    PUBLIC.mkdir(parents=True,exist_ok=True)
    packed=[]
    for source_name,output_name in TARGETS:
        original=ROOT/source_name
        if hash_file(original)!=verified[source_name]:
            raise RuntimeError("Source checksum mismatch: "+source_name)
        target=PUBLIC/output_name
        shutil.copyfile(original,target)
        digest=hash_file(target)
        if digest!=verified[source_name]:
            raise RuntimeError("Derived preview-file digest mismatch: "+source_name)
        packed.append({"file":output_name,"sha256":digest,
                       "bytes":target.stat().st_size,"original_name":source_name})
    boundary=ROOT/"bayelsa_gbopen_adm1.geojson"
    geojson=json.loads(boundary.read_text())
    if len(geojson.get("features",[]))!=1:raise RuntimeError("Expected Bayelsa one-feature polygon")
    shutil.copyfile(boundary,PUBLIC/"coverage.geojson")
    manifest={
       "schema_version":"1","stage":"research-preview","region":"Bayelsa",
       "generated_utc":datetime.now(timezone.utc).isoformat(),
       "site_privacy":"Browser-only local screening; external basemap tile requests",
       "worldcover":packed[:2],"water":packed[2],
       "boundary":{"file":"coverage.geojson","sha256":hash_file(PUBLIC/"coverage.geojson"),
                   "source":"geoBoundaries gbOpen 2022, CC BY 4.0"},
       "sources":{
           "worldcover":"ESA WorldCover 2021 v200, CC BY 4.0",
           "worldcover_credit":"© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium",
           "jrc":"European Commission JRC GSW v1.5 water occurrence, 1984–2024, CC BY 4.0",
       },
       "limitations":["Do not infer petroleum contamination, spill probability or EIA approval",
                      "No national raster coverage is included","No field-validation claim"]
    }
    (PUBLIC/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"built_files":[x["file"] for x in packed],
                      "total_raster_bytes":sum(x["bytes"] for x in packed),
                      "boundary_bytes":(PUBLIC/"coverage.geojson").stat().st_size,
                      "status":"PASS: hashes confirmed"},indent=2))

if __name__=="__main__":run()
