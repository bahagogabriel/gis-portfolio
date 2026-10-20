# PetroScreen NG — Stage 02 reference screening engine

**As built and checked:** 20 October 2026. **Status:** Engineering verification PASS; scientific/operational deployment HOLD.

This is a reproducible research **Python reference implementation**, not a website, a flood/contamination/spill risk map, or a regulator-approved EIA. It uses only locally acquired rasters. It makes **no** requests to Nigerian agencies or operational petroleum systems.

## Regional independence / national design

The calculator contains **no Bayelsa-specific study bounds or class rules**. You supply a valid WGS84 Polygon or MultiPolygon coverage boundary, one or more non-overlapping ESA WorldCover v200 2021 rasters, and one JRC Global Surface Water occurrence raster. The engine supports coordinates, 1/3/5 km geodesic study circles, pixel-area-weighted class summaries, historical water-occurrence threshold areas, and explicit source coverage. It rejects points outside the supplied coverage boundary; at boundaries, partial buffers are explicitly reported.

**Important:** The current prepared raster data cover Bayelsa alone. National interface compatibility is not the same as nationally available screening. Additional regional source tiles and boundaries must pass Stage 01 acquisition/QA before their areas can be screened.

## Reproduce a tested Bayelsa run

From repository root on the Stage 02 branch:

```bash
python -m pip install numpy==2.3.5 rasterio==1.4.3 shapely==2.1.2 pyproj==3.7.2

python petroscreen-ng/acquire_bayelsa.py
python petroscreen-ng/validate_bayelsa.py
python -m unittest discover -s petroscreen-ng -p "test_*.py" -v

python petroscreen-ng/screening_engine.py \
  --longitude 6.0 --latitude 4.7286535 --radius-km 1 \
  --domain-geojson petroscreen-ng/artifacts_bayelsa/bayelsa_gbopen_adm1.geojson \
  --worldcover \
    petroscreen-ng/artifacts_bayelsa/ESA_WorldCover_2021_v200_Bayelsa_N03E003.tif \
    petroscreen-ng/artifacts_bayelsa/ESA_WorldCover_2021_v200_Bayelsa_N03E006.tif \
  --jrc petroscreen-ng/artifacts_bayelsa/JRC_GSW_1984_2024_Occurrence_Bayelsa.tif \
  --acquisition-report petroscreen-ng/artifacts_bayelsa/acquisition_report.json \
  --output petroscreen-ng/artifacts_bayelsa/example_screen.json

python petroscreen-ng/run_stage02_acceptance.py
```

No paid API or Earth Engine runtime is needed. Public download URLs are in `raster_acquisition.py` and the source manifest. The initial processing downloads 10 m and 30 m raster **windows** over Bayelsa using rasterio/GDAL HTTP range access, not whole global archives.

## Output fields and scientific meanings

- `study`: geodesic circle area, intersected area inside the **loaded supported polygon**, and out-of-coverage area.
- `land_cover_2021`: approximate mapped ESA class areas and their share of **valid classified pixels**. A class code of 95 is ESA-mapped mangroves, not verified mangrove condition.
- `surface_water_occurrence_1984_2024`: area of JRC pixels with historical observed occurrence >=1%, >=50% and >=90%. These are **past observation statistics**, not current surface water, spill likelihood or flood probabilities.
- `coverage`: approximate valid raster area relative to the supported polygon intersection and to the **whole buffer**. Missing source pixels are never counted as land-cover classes or zero-occurrence water.
- `warnings`: explicit partial-geography, data gaps or unverified-source-hash cases. `coverage_status` remains partial until source hashes are supplied and other coverage checks pass.
- `data_integrity`: verifies frozen **derived-file** SHA-256 checksums when the acquisition manifest is passed.

**Spatial method:** Site-centred azimuthal-equidistant projected 1/3/5 km circle converted to WGS84; pixel-centre containment; WGS84 geodesic area per raster row. This is an approximation along raster/AOI boundaries, not exact fractional cell intersection.

## Automated evidence

- 17/17 offline unit tests passed.
- 9/9 real-data combinations passed (west Bayelsa, east Bayelsa and 6°E tile seam; each 1/3/5 km).
- Independent **10 m rasterio projected-grid** seam-site 1 km control differed from the reference class-area aggregate by **0.024%**. This tests a particular engineering scenario; it does not establish map thematic accuracy.
- Real source clips checksum-verified; 4 JRC values beyond documented 0–100 (one 101, three 104) excluded as NoData and declared.

Evidence: [GitHub Actions Stage 02 QA run](https://github.com/bahagogabriel/gis-portfolio/actions/runs/39389775538). Run archives expire after 14 days; rerun the scripts for reproducible results.

## Intentional exclusions and future gates

- No petroleum asset coordinates, leak likelihood, contamination probability, legal fault, quantified harm, EIA sign-off, environmental risk score or real-time water assertion.
- WorldCover and JRC product resolution, coastal variation and source uncertainty must be presented alongside any eventual output.
- **Stage 03** may create a browser-only UI with MapLibre and spatially indexed prepared assets; the browser's JS calculations must be independently compared against this Python reference before publication. The static GitHub Pages website **cannot execute this Python engine directly**.
- A national rollout requires a multi-region source index, verified edge buffers and acceptable client/storage costs. Scientific validation, licensing/attribution check, privacy review and user acceptance remain publication blockers.
