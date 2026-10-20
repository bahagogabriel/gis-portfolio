"""Acquire and structurally validate an actual Bayelsa ADM1 boundary from geoBoundaries."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

API = "https://www.geoboundaries.org/api/current/gbOpen/NGA/ADM1/"

def read_json(url):
    req = Request(url, headers={"User-Agent": "PetroScreen-NG-boundary-audit/0.1"})
    with urlopen(req, timeout=60) as response:
        raw = response.read(30_000_000)
    return json.loads(raw), raw

def coordinates(nested):
    if isinstance(nested, list):
        if len(nested) >= 2 and isinstance(nested[0], (int,float)) and isinstance(nested[1], (int,float)):
            yield (nested[0], nested[1])
        else:
            for item in nested:
                yield from coordinates(item)

def inspect(meta, geojson, binary):
    if meta.get("boundaryISO") != "NGA" or meta.get("boundaryType") != "ADM1":
        raise ValueError("Unexpected boundary metadata")
    if "CC BY 4.0" not in meta.get("boundaryLicense", ""):
        raise ValueError("Boundary license needs manual review")
    if geojson.get("type") != "FeatureCollection":
        raise ValueError("Not a GeoJSON FeatureCollection")
    features = geojson["features"]
    hits = [f for f in features if any(isinstance(v,str) and v.strip().casefold()=="bayelsa" for v in f.get("properties",{}).values())]
    if len(hits) != 1:
        raise ValueError(f"Expected exactly one Bayelsa feature; got {len(hits)}")
    geom = hits[0]["geometry"]
    if geom["type"] not in ("Polygon","MultiPolygon"):
        raise ValueError("Expected polygon geometry")
    coords = list(coordinates(geom["coordinates"]))
    if not coords:
        raise ValueError("No geometry coordinates")
    bbox = [min(x for x,y in coords),min(y for x,y in coords),max(x for x,y in coords),max(y for x,y in coords)]
    if not (2 < bbox[0] < bbox[2] < 9 and 3 < bbox[1] < bbox[3] < 8):
        raise ValueError(f"Unexpected Bayelsa bounds: {bbox}")
    return {"checked_utc": datetime.now(timezone.utc).isoformat(), "dataset":meta.get("boundaryID"),
        "source_year":meta.get("boundaryYearRepresented"), "license":meta.get("boundaryLicense"),
        "download_url":meta["gjDownloadURL"], "sha256": hashlib.sha256(binary).hexdigest(),
        "feature_count":len(features), "bayelsa_geometry_type":geom["type"],
        "bayelsa_bbox_lon_lat":bbox, "bytes_read":len(binary),
        "limitation":"Full topological validity and cartographic comparisons still pending"}

def main():
    metadata,_ = read_json(API)
    shapes,raw = read_json(metadata["gjDownloadURL"])
    summary = inspect(metadata,shapes,raw)
    path = Path(__file__).with_name("boundary_acquisition_report.json")
    path.write_text(json.dumps(summary,indent=2)+"\n", encoding="utf-8")
    print(json.dumps(summary,indent=2))

if __name__ == "__main__":
    main()
