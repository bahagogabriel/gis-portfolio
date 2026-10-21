# PetroScreen NG | Stage 23 first-time guidance and results comprehension

**Target release:** v2.3, 21 October 2026.  
**Authoritative source baseline:** v2.2 (nine verified states, 31 byte-verified GeoTIFFs, ESA WorldCover 2021, JRC GSW v1.5 1984–2024).  
**Scope:** optional first-use walkthrough, verified *non-facility* example coordinate, and plain-language source-data glossary. **No numerical analysis, classification, distance, risk scoring, source coverage, export schema, source raster or portfolio changes.**

## User experience goal

A newcomer should be able to understand what the product screens, select a safe demonstration coordinate without knowing Nigerian WGS84 coordinates, run the same independent scientific screening as before, and correctly distinguish dated mapped context from field-observed evidence, petroleum operations, flood-risk claims, or regulatory conclusions.

The optional “New here? Follow a quick walkthrough” disclosure explains four steps in plain language: choose a point, set the 1/3/5 km circle, calculate from byte-verified state-specific ESA/JRC imagery, and read/export with caveats. Users with an established workflow can leave the guide closed.

“Use a verified Delta demonstration point” looks up only the `qa_example_lon_lat` published in the signed-off nine-state manifest. Before populating inputs it verifies the point lies in the current nine-state coverage and **exactly in Delta's original polygon**, not merely in a broad rectangle. It does not auto-run a screen, imply a mapped petroleum facility or modify facility type. It refuses to replace any active completed screen or pending saved-case reopening, so unexported field notes and measurements are not lost.

## Report reading guide

Under the results heading, a concise source-dated caution precedes the numerical metrics. An expandable glossary defines:
- radius/buffer area, explicitly not a regulatory setback;
- minimum ESA/JRC valid source coverage, not confidence or environmental suitability;
- ESA 2021 pixel-class percentages, denominated by **valid classified** area;
- JRC 1984–2024 historical surface-water occurrence thresholds, not forecast flood probability or present-day depth;
- distance to nearest mapped 2021 class *pixel centre* and the meaning of “not mapped.”

Existing mapped facts, scientific observations, historical-water and coverage warnings, field evidence completeness, petroleum evidence prompts, original report data, case integrity ZIP and comparisons remain unchanged. The new prose adds no classification, generated metric or rank.

## Release-quality evidence

A dedicated desktop 1440px/mobile 375px Chromium gate is required. It checks the walkthrough starts closed; no TIFF downloads happen before screening; the Delta example comes from the actual public data manifest and matches the original state polygon; the “example” button only fills coordinates and does not start screening; the full-screen completes with the current byte-verified source TIFFs; the glossary and source dates are accurate; and a second click while a completed case is open leaves all measurements and unverified user-entered notes intact. Keyboard-readable HTML and automated WCAG 2.1 A/AA scans are required both before and after the screen. Screenshots are archived for design review.

The full scientific release suite additionally checks all 31 source TIFF hashes, all nine states and radii in geometry regression, 108 independent mapped geodesic pixel-centre distances, actual nine-state Chromium screens, PDF/ZIP and local integrity receipts, mobile low-memory mode and TIFF retry, saved-case independent re-screen, and the unaffected Jekyll portfolio/CNAME.

**Limits:** This is a reproducible browser UX QA, not user research with first-time visitors or physical Android TalkBack/NVDA accessibility testing. Neither the demonstration coordinate nor the browser results establish present-day conditions, a petroleum site, contamination, spill probability or project approval. Verify decisions in the field and against current regulatory requirements.
