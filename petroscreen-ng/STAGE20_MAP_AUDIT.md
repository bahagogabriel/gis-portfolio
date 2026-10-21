# PetroScreen NG | Stage 20 map interpretation and mobile-performance audit

**Release target:** PetroScreen NG v2.0 (21 October 2026)  
**Scope:** source-bound visual legend, map usability, test-based browser performance/reuse.  
**Immutable:** nine-state coverage, 31 SHA-256-pinned source TIFFs, original pixel arithmetic, buffer geometry, case schemas, privacy, field-authentication cautions, professional exports and other portfolio applications.

## Stage 19 evidence and remaining map problem

The previous screenshot-grounded Stage 19 UI review improved first-run clarity and passed automated WCAG 2.1 A/AA checks in real desktop/mobile Chromium. However, the prominent ESA WorldCover map had no accessible explanation for class colors and could encourage mistaking dated map classes for present-day environmental conditions. The map has two distinct visual sources: an initial **generalized regional overview** and a post-screening **site detail image derived from nominal 10 m ESA 2021 source pixels**, resampled to a 1024×1024 visual overlay. Applying one unqualified color key to both would mislead users.

## Stage 20 solution

- Introduce an unobtrusive expandable **Map key · ESA land cover 2021** within the map itself; users can understand the pilot boundary, chosen site point and selected buffer without leaving the map.
- Reuse the **exact original 11-code RGB palette** in `web/src/site_detail.js` by exporting its color constant. Numeric screening math, source data and the detail renderer's colors remain unchanged.
- Read class labels from the pre-existing `engine.js` `ESA` dictionary, not a copy of the legend names.
- Display the palette grid **only after the native-derived detail map has been rendered**. The starting overview explicitly says class color chips are not applicable; if detail generation fails, the overview/fallback is again explicitly distinguished. This avoids conflating rendered overview colors and class codes.
- Warn that historical water metrics use the separate JRC Global Surface Water v1.5 (1984–2024) observations and **are not another map-color overlay**.
- The detail image is **resampled to 1024 pixels**; nominal native-source pixel dimensions do not establish the current map's displayed resolution.
- Support desktop and mobile expansion without clipping the map or blocking zoom buttons. All legend text is semantic HTML and keyboard accessible.

## Performance/compatibility claims and evidence

The application has always downloaded state-owned TIFF files on demand, checked actual bytes with SHA-256, and retained the most recently used state's decoded rasters in browser memory. Stage 20 tests this existing optimization; it does not claim new source compression, additional caching infrastructure or faster networks.

`stage20-map-perf.mjs` performs a **real browser** audit at 375 and 1440 px and records diagnostic elapsed times to first-ready and first successful screening. Assertions cover:

1. Zero state TIFF downloads before the first screening.
2. Exactly the selected state's source TIFFs downloaded, with source hash query strings; no external imagery or telemetry service calls.
3. A detailed rendered map and **all eleven displayed colors exactly matching the palette used to draw those pixels**.
4. Accessibility automated WCAG 2.1 A/AA check with the actual key expanded after screening.
5. No TIFF redownload when changing only the screening radius within the same state.
6. Truthful overview, native-detail and fallback messages. Additional CI continues full nine-state source-backed screening and existing output/parity regressions.

**Limitations:** Chromium on GitHub Actions is not real Android hardware or field usability testing. Observed times are diagnostic, not service guarantees for slow connections, low-memory phones, satellite reliability, or telecom outages. An automated accessibility scan cannot establish universal accessibility. ESA WorldCover is a dated 2021 classification and the JRC historical water series does not prove current site conditions, petroleum assets, contamination, flood probability or regulatory compliance.

## Next qualitative validation after release

Actual-device review (budget phones, 3G/4G), TalkBack/NVDA navigation, color-vision accessibility, and short task-based testing with geospatial and nontechnical petroleum research visitors. Changes from this future review must preserve the exact source/class distinctions and all scientific invariants.
