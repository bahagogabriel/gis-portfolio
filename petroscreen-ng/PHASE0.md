# PetroScreen NG — G0 data independence gate (20 October 2026)

**Status:** Feasibility from published public data routes: **PASS**. Actual geospatial file download, legality of republishing selected layers and scientific coverage checks: **PENDING**. Nothing in this branch should be deployed to the live site yet.

## Objective
A Bayelsa-first, petroleum-sector **preliminary environmental site-screening tool** using freely obtainable geospatial datasets. Provide point-entry or map-click plus user-selected 1/3/5 km buffers; source-specific land cover, historical mapped surface-water proximity, coverage and provenance. Population, mangrove, rivers and petroleum incident context remain optional after independent audit.

**Core V1 required:** (1) geoBoundaries gbOpen Nigeria ADM1 (public CC BY 4.0); (2) ESA WorldCover 2021 v200 (public CC BY 4.0); (3) JRC Global Surface Water (2024 update, public Copernicus; use occurrence/water data with dated accuracy caveats; v1.4 as labelled historical fallback).

**Optional:** WorldPop 2025 (public CC BY 4.0), Global Mangrove Watch 2025 (Zenodo v4.1.12; selected-file reuse/license still to confirm), HydroRIVERS Africa (terms/re-distribution audit), OSM (ODbL considerations). Existing Bayelsa oil-spill and Niger Delta flaring atlases are research context, not proof of contamination/exposure or spatial risk.

## Strict exclusions
No required data acquisition from NUPRC, NNPC, NOSDRA, EIA consultants or private operators; no confidential coordinates or pipeline geometry; no mandatory Earth Engine runtime or paid commercial EECU dependency. Never invent a spill probability or exposure map.

## Gated implementation
- G0a: Record source versions, precise download links and license terms; automated HTTP reachability probe (not scientific proof).
- G0b: Download real Bayelsa data and freeze checksums; verify CRS, source years, extent, categories, nodata, marine/coastal behavior and attribution requirements. **Stop if any mandatory layer cannot be obtained and the fallback fails.**
- G1: Independent Python geospatial reference analysis with geodesic/projected buffer and class-area calculations. Make uncertainty and completeness explicit.
- G2: Static browser MVP (MapLibre, on-device selection and screening using precomputed public assets) with clearly dated source cards and PDF report; confidential user coordinates never submitted to a server by default.
- G3: Independent ArcGIS/QGIS comparisons across urban/wetland/coast/interior and out-of-coverage sites; agree acceptance tolerances before comparing.
- G4: Professional feedback, usability audit, legal/privacy review, then public deployment and portfolio integration.

## Acceptance
An operator or consultant can produce a **preliminary** evidence report without contacting a Nigerian agency, and every quantitative value is traceable, reproducible and reasonably agrees with independent GIS verification. The product does not claim to be a regulatory ESIA, a hazard probability or a field inspection substitute.

## Sources
- https://www.geoboundaries.org/api/current/gbOpen/NGA/ADM1/
- https://esa-worldcover.org/en/data-access
- https://global-surface-water.appspot.com/download
- https://stac.worldpop.org/collections/NGA/Population/2025/100m
- https://zenodo.org/records/21346457
- https://www.hydrosheds.org/products/hydrorivers
- https://download.geofabrik.de/africa/nigeria.html

**Development principle:** Do not edit `main`, public pages or established scientific atlas results until acceptance.