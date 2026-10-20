# PetroScreen NG — Stage 06 Bayelsa + Rivers continuous research preview

**Date:** 20 October 2026. **Visibility:** private development PR, do not deploy to the live portfolio. **Coverage:** precisely the union of the official geoBoundaries gbOpen 2022 Bayelsa and Rivers ADM1 polygons, not all Nigeria and not all nine NDDC states.

## Improvement over Stage 04
The old app clipped environmental data separately for Bayelsa. Rivers was then independently tested. Those two separate sources cannot simply be laid on top of each other because 5 km data halos overlap and could **double-count the same source pixels**.

Stage 06 **re-crops from the actual source rasters just once**: WorldCover 2021 v200 tiles `N03E003` and `N03E006` and one 1984–2024 JRC occurrence tile `0E_10N`. Source raster footprints are never duplicated. The combined administrative eligibility boundary and 5 km geospatial-data halo are maintained separately. A site outside both states is rejected, while a buffer crossing an internal state line is analyzed continuously.

Site coordinates stay in the browser for calculations; the map background and GeoTIFF assets are served locally. Browser HTTP requests and provider attributions are checked automatically. This does not exclude ordinary server access logs if hosting publicly in future.

## Source and science semantics

- **ESA WorldCover 2021 v200**, mapped land cover, 10 m nominal, **CC BY 4.0**. Attribution: © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium. Zanaga et al. (2022), DOI:10.5281/zenodo.7254221. Not current field-determined land cover or habitat quality.
- **JRC GSW v1.5 1984–2024**, observed historical surface-water occurrence, 30 m nominal. Provider attribution **Source: EC JRC/Google**, Copernicus terms, Pekel et al. (2016), Nature, DOI:10.1038/nature20584. Landsat Collection 1/2 positional differences can locally exceed 30 m. Water-occurrence percentages are not contemporary water, contamination, flood risk, or petroleum hazard.
- **geoBoundaries gbOpen Nigeria ADM1 (2022)**, original source GRID3, CC BY 4.0. This is an approximate published administrative boundary, not a surveyed legal boundary, petroleum lease line or coastline.

## Repeatable build (from repository root)

```sh
python -m pip install numpy==2.3.5 rasterio==1.4.3 shapely==2.1.2 pyproj==3.7.2 pillow==11.3.0
cd petroscreen-ng/web && npm install --no-audit --no-fund && cd ../..
python petroscreen-ng/acquire_two_state.py
python petroscreen-ng/run_two_state_engine_acceptance.py
cd petroscreen-ng/web && node test/two-state-parity.mjs && cd ../..
python petroscreen-ng/build_two_state_web_assets.py
cd petroscreen-ng/web && npm run build
```

Serve `petroscreen-ng/web/dist/` with a local HTTP server. The original Python reference engine remains responsible for independent scientific arithmetic QA. The browser uses its own geodesic-per-row pixel-area implementation.

**Critical:** The output `dist/` is for a **private review preview**, not a blanket approval to publish. Public hosting, professional scientific review, map/report interpretation, region-specific privacy and scientific validation remain gated.

### Automated checks
- Real source acquisition and SHA-256 checks for two WorldCover 3-degree tiles + one JRC 10-degree occurrence raster.
- Polygon union correctness, clipped-source footprints and regional 5 km halo vs site eligibility.
- 12 source-backed Python screening test cases: 1/3/5 km for site interiors and interstate boundaries in each state.
- 12 JavaScript/Python result comparisons, with predeclared area tolerances.
- Real Chromium map and screening for Rivers and Bayelsa interstate locations, 3 mapped PDFs, desktop and mobile layout tests and no external HTTP requests.
- Two-page PDF check for source credit, map appearance, page margins.

See [Stage 06 automated evidence](https://github.com/bahagogabriel/gis-portfolio/actions/workflows/petroscreen-two-state.yml). Scientific/field/regulatory validation is **NOT** implied by successful engineering tests.

## Expansion path

Do not expand by copying overlapping state clips. For the remaining seven states, obtain **one verified clip per original source tile** for the *union* regional dataset and maintain an index for on-demand download at larger scale. When the regional area is large enough that loading a whole GeoTIFF is wasteful, split into uniquely indexed, nonoverlapping client COG tiles. Each state/domain promotion requires the same public rights/source hashes, border tests and JS/Python arithmetic comparisons.

The declared product ambition remains full Nigerian terrestrial coverage, but Stage 06 only enables a **two-state research pilot**.
