# PetroScreen NG — Stage 21 mobile reliability and memory-controlled display

**Release target:** v2.1  
**Scope:** visual map display sampling, explicit low-memory control, failure recovery QA.  
**Scientific baseline:** v2.0, unchanged: nine verified states, 31 SHA256-verified TIFFs, ESA WorldCover 2021 v200, JRC GSW v1.5 1984–2024, 1/3/5 km WGS84 pixel-centre methods, case/ZIP/CSV/PDF semantics.

## What is actually improved

On a narrow browser (maximum 600 CSS pixels) the optional map canvas defaults to a **512×512 resampled display**. The original desktop default remains 1024×1024. In both cases every source TIFF is still downloaded in full and SHA256-verified before numerical screening; the shared geospatial engine, classified source pixels, buffer area, historical JRC observations, reports and saved case output are untouched.

The RGBA pixel buffer needed for the detailed visual is **1,048,576 bytes** in lightweight mode versus **4,194,304 bytes** at 1024 pixels, a 75% reduction in that one raw RGBA buffer. Actual peak browser memory and wall-clock speed are environment-dependent; this is **not** a claim of 75% overall RAM or mobile data savings. The display itself is downsampled and may visually omit small mapped features at the lighter resolution. This does not reduce the native scientific source resolution used for measurements.

The accessible **Use lightweight detail display** checkbox appears within the Stage20 map key, with a plain-language disclosure that it changes only presentation. The user may toggle it after screening without repeating raster downloads or changing evidence. Repeated display requests are invalidated by an existing incrementing task token; stale rendering failures cannot incorrectly overwrite the latest display-status message.

## Automated test evidence and limitations

Stage21 tests include:
- Exact RGBA buffer-size and invalid-size unit checks; full original 11-class palette unchanged.
- Real Chromium at 390 px with a 3× CPU-emulation factor, and desktop at 1440 px.
- Both modes draw a real verified Delta image from the existing source TIFFs. Switching from 512 to 1024 (and back) must leave all screening measurements and caveats **bitwise/text identical** and perform **zero additional source TIFF downloads**.
- Source downloads are absent before screening, and no external map/telemetry requests are made.
- Automated WCAG 2.1 A/AA scan while the options and screened results are visible.
- An injected HTTP 503 for an actual source TIFF must fail the screen cleanly, display no partial report, and allow the user to retry successfully with a correctly fetched and SHA256-checked source.
- The original Stage19 desktop/mobile UX, Stage20 exact source-color legend, all nine states, 108 independent geodesic comparisons, all source TIFF hashes, and actual PDF/ZIP/verification regressions must still pass.

**Cannot substitute for physical-device testing:** CPU throttling in headless Chromium is not a phone with limited RAM, intermittent Nigerian mobile networks, background app process pressure, actual GPU drivers or TalkBack/NVDA screen-reader usage. A future manual device QA pass should test an actual affordable Android phone with 1–4 GB RAM if available, a modern phone, 3G/4G connectivity and TalkBack. No physical-device or human assistive-technology PASS is claimed by this release.

## Permanent guardrails

No backend, paid cloud dependency, telemetry, petroleum-asset claims, simulated risk scores, new raster source or third-party map tiles. Only the statically served PetroScreen subsite may be changed on production `main`; unrelated portfolio content, CNAME, original rasters and editable source branch remain intact.
