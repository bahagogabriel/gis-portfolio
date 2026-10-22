"""Produce local, display-only Nigerian nine-state LGA context from pinned gbOpen ADM2.

This is NOT a scientific/risk source and cannot change screening eligibility,
area statistics, mapped class attribution, or original SHA-256-locked TIFFs.
On source mismatch or incomplete administrative coverage, fail CLOSED.
"""
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

from shapely.geometry import shape

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "web/public/data"
UPSTREAM = ("https://github.com/wmgeolab/geoBoundaries/raw/9469f09/"
    "releaseData/gbOpen/NGA/ADM2/"
    "geoBoundaries-NGA-ADM2_simplified.geojson")
YEAR = "2022"
EXPECTED = {
    "Abia": 17, "Akwa Ibom": 31, "Bayelsa": 8,
    "Cross River": 18, "Delta": 25, "Edo": 18,
    "Imo": 27, "Ondo": 18, "Rivers": 23,
}


def main():
    manifest = json.loads((PUBLIC / "manifest.json").read_text())
    assert manifest["states"] == list(EXPECTED), "Pilot state order changed"
    state_file = PUBLIC / manifest["original_states"]["file"]
    raw_states = state_file.read_bytes()
    assert hashlib.sha256(raw_states).hexdigest() == manifest["original_states"]["sha256"], (
        "State polygons differ from the authoritative manifest"
    )
    states = json.loads(raw_states)
    assert len(states["features"]) == 9
    footprints = {}
    for entry in states["features"]:
        state = entry["properties"]["shapeName"]
        assert state in EXPECTED and state not in footprints
        footprints[state] = shape(entry["geometry"])

    request = Request(UPSTREAM, headers={"User-Agent": "PetroScreenNG-LGA-context-builder/1"})
    with urlopen(request, timeout=100) as response:
        raw = response.read(15_000_001)
    assert len(raw) < 15_000_001, "Unexpectedly large administrative file"
    source = json.loads(raw)
    assert source["type"] == "FeatureCollection"
    assert len(source["features"]) == 774, "Pinned GRID3/geoBoundaries 2022 ADM2 count changed"
    selected = []
    counts = {name: 0 for name in EXPECTED}
    for feature in source["features"]:
        name = feature.get("properties", {}).get("shapeName")
        assert isinstance(name, str) and name.strip()
        geom = shape(feature["geometry"])
        assert geom.is_valid and not geom.is_empty
        point = geom.representative_point()
        matches = [state for state, polygon in footprints.items() if polygon.covers(point)]
        if not matches:
            continue
        assert len(matches) == 1, "Ambiguous state for ADM2 unit"
        state = matches[0]
        counts[state] += 1
        selected.append({
            "type": "Feature",
            "properties": {
                "shapeName": name,
                "pilotState": state,
                "labelPoint": [round(point.x, 7), round(point.y, 7)]
            },
            "geometry": feature["geometry"]
        })
    assert counts == EXPECTED, f"ADM2 state alignment QA failed: {counts!r}"
    assert len(selected) == 185
    output = {"type": "FeatureCollection", "features": selected}
    bytes_out = (json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    assert len(bytes_out) < 8_000_000, "Web administrative context too heavy"
    dest = PUBLIC / "lga_context.geojson"
    dest.write_bytes(bytes_out)
    provenance = {
        "purpose": "Visual navigation only; not a screening data source, legal boundary, or EIA evidence",
        "source": "geoBoundaries gbOpen NGA ADM2 / original GRID3",
        "source_year": YEAR, "source_adm2_count": 774,
        "license": "CC BY 4.0", "source_pinned_commit": "9469f09",
        "download_url": UPSTREAM,
        "original_download_sha256": hashlib.sha256(raw).hexdigest(),
        "selected_states": counts, "selected_units": len(selected),
        "output_geojson_sha256": hashlib.sha256(bytes_out).hexdigest()
    }
    (PUBLIC / "lga_context_provenance.json").write_text(
        json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
    print("LGA_CONTEXT_QA_PASS=185/185 pinned 2022 GRID3/geoBoundaries ADM2 units")
    print("LGA_CONTEXT_SHA256=" + provenance["output_geojson_sha256"])


if __name__ == "__main__":
    main()
