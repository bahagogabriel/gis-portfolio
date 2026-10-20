"""Stage 01 cross-resolution area and checksum QA (not thematic accuracy validation)."""
import hashlib,json
from pathlib import Path
from pyproj import Geod
from shapely.geometry import shape

DIR=Path("petroscreen-ng/artifacts_bayelsa")
GEOD=Geod(ellps="WGS84")

def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        for block in iter(lambda:f.read(1<<20),b""):h.update(block)
    return h.hexdigest()

def approximate_pixel_area(rec):
    west,south,east,north=rec["clip_bounds_lon_lat"]
    dx,dy=rec["source_pixel_size_degrees"]
    lat=(south+north)/2
    area,_=GEOD.polygon_area_perimeter([west,west+dx,west+dx,west],
        [lat-dy/2,lat-dy/2,lat+dy/2,lat+dy/2])
    return abs(area)

def validate(report,feature,base_dir=DIR):
    geom=shape(feature["geometry"])
    if not geom.is_valid:raise ValueError("Boundary invalid")
    geod_area=abs(GEOD.geometry_area_perimeter(geom)[0])/1e6
    if not 4000<geod_area<20000:raise ValueError("Implausible geodesic boundary area")
    wc_total=0
    checks=[]
    for rec in report["rasters"]:
        path=base_dir/rec["output_name"]
        if not path.is_file() or sha256(path)!=rec["sha256_derived_clipped_tif"]:
            raise ValueError(f"Derived TIFF integrity failed: {path}")
        inside=rec["inside_polygon_pixel_count"]
        total=sum(rec["valid_codes_histogram"].values())+rec["inside_polygon_nodata_count"]
        if inside!=total:raise ValueError(f"Histogram count mismatch in {path.name}")
        area_km2=inside*approximate_pixel_area(rec)/1e6
        # WorldCover clips are partial state tiles; only their sum can match the state.
        if "WorldCover" not in path.name and abs(area_km2/geod_area-1)>.035:
            raise ValueError(f"Raster/geometry area mismatch in {path.name}: {area_km2} vs {geod_area}")
        if "WorldCover" in path.name:wc_total+=area_km2
        checks.append({"name":path.name,"sha256_check":"PASS",
          "approx_polygon_pixel_area_km2":round(area_km2,3),
          "reference_geodesic_boundary_area_km2":round(geod_area,3),
          "relative_area_delta_pct":round(100*(area_km2/geod_area-1),3)})
    if abs(wc_total/geod_area-1)>.035:raise ValueError("Two ESA clips fail state-area coverage")
    return {"status":"PASS","boundary_geodesic_area_km2":round(geod_area,3),
      "worldcover_two_tile_approx_area_km2":round(wc_total,3),"raster_checks":checks,
      "limitations":["Approximate midlatitude pixel area is used for QA, not quantitative screening",
          "This does not demonstrate thematic map accuracy",
          "Pixel-centre inclusion may differ at coastline and polygon edges"]}

def main():
    report=json.loads((DIR/"acquisition_report.json").read_text())
    feature=json.loads((DIR/"bayelsa_gbopen_adm1.geojson").read_text())["features"][0]
    result=validate(report,feature)
    (DIR/"geodesic_area_qa.json").write_text(json.dumps(result,indent=2)+"\n")
    print(json.dumps(result,indent=2))

if __name__=="__main__":main()
