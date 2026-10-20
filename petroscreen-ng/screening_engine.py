"""PetroScreen NG Stage 02 reference engine.

Region-agnostic preliminary environmental baseline, driven by explicit local
boundaries and source rasters. Never derives spill risk or EIA approval.
No network calls, secrets, or external institutional data required.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path

import numpy as np
import rasterio
from pyproj import CRS, Geod, Transformer
from rasterio.mask import mask
from shapely.geometry import Point, box, mapping, shape
from shapely.ops import transform

ENGINE_VERSION = "stage02.1"
WGS84 = Geod(ellps="WGS84")
ALLOWED_RADII_KM = (1, 3, 5)
LAND_CLASSES = {
    10: "Tree cover", 20: "Shrubland", 30: "Grassland",
    40: "Cropland", 50: "Built-up", 60: "Bare/sparse vegetation",
    70: "Snow and ice", 80: "Permanent water bodies",
    90: "Herbaceous wetland", 95: "Mangroves", 100: "Moss and lichen",
}
JRC_THRESHOLDS = (1, 50, 90)


def geodesic_area_km2(geometry):
    if geometry.is_empty:
        return 0.0
    # WGS84 geodesic area, independent of a latitude-longitude pixel count.
    return abs(WGS84.geometry_area_perimeter(geometry)[0]) / 1_000_000.0


def circle_wgs84(longitude, latitude, radius_km):
    if (
        not all(math.isfinite(v) for v in (longitude, latitude, radius_km))
        or not -180 <= longitude <= 180
        or not -90 <= latitude <= 90
        or radius_km not in ALLOWED_RADII_KM
    ):
        raise ValueError("Valid WGS84 coordinates and a 1, 3 or 5 km radius are required")
    local = CRS.from_proj4(
        f"+proj=aeqd +lat_0={latitude} +lon_0={longitude} +datum=WGS84 +units=m +no_defs"
    )
    back = Transformer.from_crs(local, "EPSG:4326", always_xy=True)
    return transform(back.transform, Point(0, 0).buffer(radius_km * 1000, resolution=128))


def _open_domain(geojson_path):
    document = json.loads(Path(geojson_path).read_text(encoding="utf-8"))
    if document.get("type") == "FeatureCollection":
        features = document.get("features", [])
        if len(features) != 1:
            raise ValueError("Supply a one-feature geographic coverage polygon")
        geometry = shape(features[0]["geometry"])
    elif document.get("type") == "Feature":
        geometry = shape(document["geometry"])
    else:
        geometry = shape(document)
    if (
        geometry.is_empty or not geometry.is_valid
        or geometry.geom_type not in {"Polygon", "MultiPolygon"}
        or not (-180 <= geometry.bounds[0] <= geometry.bounds[2] <= 180)
        or not (-90 <= geometry.bounds[1] <= geometry.bounds[3] <= 90)
    ):
        raise ValueError("Coverage geometry must be a valid WGS84 Polygon/MultiPolygon")
    return geometry


def _sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_source_manifest(paths, manifest_path):
    if manifest_path is None:
        return "not_requested"
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    expected = {item["output_name"]: item["sha256_derived_clipped_tif"]
                for item in manifest["rasters"]}
    for path in paths:
        if path.name not in expected or _sha256(path) != expected[path.name]:
            raise ValueError(f"Source file absent or different from checked manifest: {path.name}")
    return "passed_sha256"


def _single_band_window(path, study, valid_codes):
    """Return area-weighted category histograms over a study polygon.

    Pixel-centre inclusion means edge areas are approximate; geodesic pixel
    area varies by raster row and is not a constant degree-squared area.
    """
    with rasterio.open(path) as src:
        if (
            src.count != 1 or src.crs is None or src.crs.to_epsg() != 4326
            or abs(src.transform.b) > 1e-12 or abs(src.transform.d) > 1e-12
            or src.transform.a <= 0 or src.transform.e >= 0
            or src.nodata is None
        ):
            raise ValueError(f"Unsupported raster grid or missing NoData: {path}")
        if not study.intersects(box(*src.bounds)):
            return {"area_m2": {}, "valid_area_m2": 0.0,
                    "valid_pixels": 0, "nodata_pixels": 0}
        data, affine = mask(src, [mapping(study)], crop=True, filled=False,
                            all_touched=False)
        pixels = np.ma.getmaskarray(data[0])
        values = data[0].data
        hist = defaultdict(float)
        nvalid = 0
        nnodata = 0
        dx = float(affine.a)
        for row in range(values.shape[0]):
            active = ~pixels[row]
            nnodata += int(np.count_nonzero(~active))
            if not np.any(active):
                continue
            row_vals = values[row, active]
            observed = set(int(v) for v in np.unique(row_vals))
            illegal = observed.difference(valid_codes)
            if illegal:
                raise ValueError(f"Unrecognised {path.name} codes: {sorted(illegal)}")
            top = float(affine.f + row * affine.e)
            bottom = top + float(affine.e)
            lon = float(affine.c)
            area = abs(WGS84.polygon_area_perimeter(
                [lon, lon + dx, lon + dx, lon],
                [top, top, bottom, bottom]
            )[0])
            codes, counts = np.unique(row_vals, return_counts=True)
            for code, count in zip(codes, counts):
                hist[int(code)] += area * int(count)
            nvalid += len(row_vals)
        return {"area_m2": dict(hist), "valid_area_m2": sum(hist.values()),
                "valid_pixels": nvalid, "nodata_pixels": nnodata}


def _ensure_nonoverlap(paths):
    # Never count the same valid grid twice when new national tiles are added.
    areas = []
    for path in paths:
        with rasterio.open(path) as src:
            areas.append(box(*src.bounds))
    for i, a in enumerate(areas):
        for b in areas[i+1:]:
            if a.intersection(b).area > 1e-12:
                raise ValueError("Overlapping source raster footprints would double-count area")


def _coverage(valid_area_km2, target_km2, study_km2):
    return {
        "valid_area_km2_approx": round(valid_area_km2, 5),
        "within_domain_coverage_pct_approx":
            round(min(100, 100 * valid_area_km2 / target_km2), 3) if target_km2 else 0.0,
        "whole_buffer_coverage_pct_approx":
            round(min(100, 100 * valid_area_km2 / study_km2), 3) if study_km2 else 0.0,
    }


def screen(longitude, latitude, radius_km, domain_geojson, worldcover_paths,
           jrc_path, acquisition_report=None):
    worldcover_paths = [Path(p) for p in worldcover_paths]
    if not worldcover_paths:
        raise ValueError("Provide one or more WorldCover raster tiles")
    jrc_path = Path(jrc_path)
    for p in (*worldcover_paths, jrc_path):
        if not p.is_file():
            raise FileNotFoundError(f"Expected local acquired GeoTIFF: {p}")

    boundary = _open_domain(domain_geojson)
    point = Point(longitude, latitude)
    if not boundary.covers(point):
        raise ValueError("Location is outside the loaded coverage boundary")
    study = circle_wgs84(longitude, latitude, radius_km)
    study_km2 = geodesic_area_km2(study)
    target_km2 = geodesic_area_km2(study.intersection(boundary))
    outside_km2 = max(0, study_km2 - target_km2)

    verify_state = verify_source_manifest((*worldcover_paths, jrc_path), acquisition_report)
    _ensure_nonoverlap(worldcover_paths)
    wc = defaultdict(float)
    wc_pixel_count = 0
    for tif in worldcover_paths:
        sample = _single_band_window(tif, study, set(LAND_CLASSES))
        wc_pixel_count += sample["valid_pixels"]
        for code, area_m2 in sample["area_m2"].items():
            wc[code] += area_m2
    wc_valid = sum(wc.values()) / 1e6

    water_sample = _single_band_window(jrc_path, study, set(range(101)))
    water = water_sample["area_m2"]
    water_valid = water_sample["valid_area_m2"] / 1e6
    if wc_valid > study_km2 * 1.02 or water_valid > study_km2 * 1.02:
        raise ValueError("Calculated pixel area unexpectedly exceeds study-area geometry")

    wc_cov = _coverage(wc_valid, target_km2, study_km2)
    jrc_cov = _coverage(water_valid, target_km2, study_km2)
    land_cover = [
        {"code": code, "class": LAND_CLASSES[code],
         "area_km2_approx": round(wc[code] / 1e6, 5),
         "share_of_valid_classified_pct": round(100 * wc[code] / sum(wc.values()), 3)}
        for code in sorted(wc) if wc[code] > 0
    ] if wc else []
    jrc_thresholds = [
        {"threshold_pct": threshold,
         "area_km2_approx": round(
             sum(area for value, area in water.items() if value >= threshold) / 1e6, 5),
         "share_of_valid_jrc_area_pct": round(
             100 * sum(area for value, area in water.items() if value >= threshold)
             / water_sample["valid_area_m2"], 3)}
        for threshold in JRC_THRESHOLDS
    ] if water else []

    warnings = []
    if outside_km2 / study_km2 > 0.005:
        warnings.append("BUFFER_CROSSES_SUPPORTED_BOUNDARY: do not extrapolate beyond available tiles")
    if wc_cov["within_domain_coverage_pct_approx"] < 98:
        warnings.append("LAND_COVER_INCOMPLETE: no-data or insufficient source coverage")
    if jrc_cov["within_domain_coverage_pct_approx"] < 98:
        warnings.append("SURFACE_WATER_INCOMPLETE: no-data or insufficient source coverage")
    if acquisition_report is None:
        warnings.append("SOURCE_HASHES_NOT_RECHECKED: pass acquisition manifest for verified processing")
    return {
        "schema_version": "1.0", "engine_version": ENGINE_VERSION,
        "purpose": "Preliminary environmental baseline only; not EIA, spill risk, or exposure",
        "location_wgs84": {"longitude":longitude, "latitude":latitude},
        "radius_km": radius_km,
        "study": {"buffer_area_km2_geodesic":round(study_km2, 5),
                  "supported_domain_intersection_km2_geodesic":round(target_km2, 5),
                  "outside_supported_domain_km2_geodesic":round(outside_km2, 5)},
        "land_cover_2021": {
            "source": "ESA WorldCover 2021 v200, 10 m nominal, CC BY 4.0",
            "pixel_count_valid": wc_pixel_count,
            "coverage": wc_cov, "classes": land_cover,
            "interpretation": "2021 mapped land cover; mangrove class is not a field survey"},
        "surface_water_occurrence_1984_2024": {
            "source": "JRC Global Surface Water v1.5, occurrence 1984-2024, 30 m nominal",
            "pixel_count_valid": water_sample["valid_pixels"],
            "coverage": jrc_cov, "threshold_areas": jrc_thresholds,
            "interpretation": "Historical Landsat-observed occurrence, not current water, flood hazard, contamination or exposure"},
        "data_integrity": {"acquisition_manifest":verify_state,
                           "polygon_source":str(domain_geojson),
                           "land_cover_raster_count":len(worldcover_paths)},
        "coverage_status": "partial" if warnings else "sufficient",
        "warnings": warnings,
        "method_limitations": [
            "Pixel-centre inclusion at AOI edges; geodesic latitude-dependent pixel areas are approximations",
            "Pixels beyond the prepared regional coverage are unknown rather than zero",
            "Spatial resolution and source accuracy limit site-level interpretations",
            "Independent GIS and field validation required before operational use",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description="Regional or Nigeria-wide land-cover and historical-water baseline")
    parser.add_argument("--longitude", type=float, required=True)
    parser.add_argument("--latitude", type=float, required=True)
    parser.add_argument("--radius-km", type=int, choices=ALLOWED_RADII_KM, required=True)
    parser.add_argument("--domain-geojson", type=Path, required=True)
    parser.add_argument("--worldcover", type=Path, nargs="+", required=True)
    parser.add_argument("--jrc", type=Path, required=True)
    parser.add_argument("--acquisition-report", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = screen(args.longitude, args.latitude, args.radius_km,
        args.domain_geojson, args.worldcover, args.jrc, args.acquisition_report)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n",
                           encoding="utf-8")
    print(json.dumps({"output":str(args.output), "status":result["coverage_status"],
                      "warnings":result["warnings"], "study":result["study"]}, indent=2))


if __name__ == "__main__":
    main()
