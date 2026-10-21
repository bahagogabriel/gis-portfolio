# PetroScreen NG v3.0 — Consolidated Release Candidate and Product Completion Audit

**Date:** 21 October 2026. **Public target:** https://bahagogabriel.com/petroscreen/  
**Editable branch:** research/petroscreen-ng-stage26-28-release-candidate  
**Publishing discipline:** Existing v2.5 production `main` stays untouched until full validation and independent portfolio check pass; published changes restricted to `petroscreen/` compiled assets.

## Definition of "finished" for the **scientifically honest research preview**

The product is ready for a defensible, publicly accessible **preliminary browser-based desk-screening pilot** once the following are confirmed:

1. Nine independently source-verified states: Abia, Akwa Ibom, Bayelsa, Cross River, Delta, Edo, Imo, Ondo and Rivers. The pilot does **not** purport to cover all Nigeria or any arbitrary offshore area. Edge/partial coverage warnings are maintained.
2. Three study-circle choices: 1 km, 3 km and 5 km, with the original WGS84 pixel-centre methods, classified-source coverage and independent geodesic QA.
3. Mapped ESA WorldCover v200 land cover **from 2021**, JRC Global Surface Water v1.5 historical occurrence **1984–2024**. No additional petroleum asset/incident evidence is inferred from generic imagery. Site context, current field conditions and project approvals must be independently confirmed.
4. One-click user flow: verified sample location (or manually entered coordinates or site map), radius, screened results, provenance/caveats, optional user-declared project context, 7-category user-reported field checklist, evidence gaps and downloadable artifacts.
5. GIS/records: reopening current-source-checked cases, cross-site descriptive comparison, source-only comparison PDF, standalone mapped screening PDF, printable professional desk-review handoff, data/evidence CSVs, WGS84 GeoJSON, complete ZIP with unsigned SHA-256 file manifest and independent locally runnable verification receipt. This is reproducibility and file-integrity support, **not** legal proof of creator identity or authentication of a field observation.
6. Privacy, consent and accessibility: local browser computation and locally initiated downloads; no app account or intentional coordinate/notes submission; explicit disclosure that public hosting may log IP/file requests. Keyboard support, mobile layout, optional lightweight display, date/source legend, understandable methods and no risk scores.
7. **New v3.0 local browser readiness diagnostics:** a user-triggered advanced tool reports only HTTPS/WebCrypto, canvas/map/download support, number of indexed state TIFFs, and which current state (if any) is SHA-256-verified in this tab. No site coordinates, field/observer notes, browser fingerprint, IP, user agent or device identifiers are read or exported. Crucially **manifest loaded ≠ all 31 rasters downloaded or verified**.
8. **New v3.0 matrix:** actual Chromium screenings of all nine states at **1, 3 and 5 km** with original manifest QA point per state. Exactly 27 accepted screens, current source TIFF fetches and hashes, downloadable 5km reproducible JSON for all nine states, no repeat source downloads within same-state radius changes, data/provenance and accepted source status checks. This complements (does not replace) all prior unit/browser/PDF tests.
9. Release safety: all 31 original TIFF SHA-256 bytes identical; independent PyProj reference across 108 pixel-centre comparisons and the 9×3 geometry matrix; PDF/ZIP/PDF-page layout audits; Jekyll/CNAME/homepage checks; independent PR review and production/live-SHA release checks.

## Technical release gates and honesty constraints

CI validates original source TIFF byte hashes from `main` (not ephemeral expired CI artifacts). All quantitative screening tests use live current TIFF pixels, **not fake scientific observations**. Node unit fixtures are clearly synthetic and are never distributed as real field data. The source-index and individual TIFF verification states are distinct.

The current project makes **no** site-suitability, spill-risk, environmental sensitivity rating, current contamination, petroleum facility discovery, security/facility ownership, statutory setback, mandatory checklist or regulatory clearance claims. A qualified Nigerian petroleum/environmental practitioner must assess contemporary local conditions and project-specific current NUPRC and other relevant requirements. No user-entered field status becomes independently verified just because it appears in an export.

The complete case ZIP and existing screening PDF formats remain backward-compatible. New advanced diagnostics are deliberately *not* added to the case ZIP, because doing so would change its accepted contents/manifest and weaken compatibility. No outside paid provider, server, login, analytics or telemetric API is introduced.

## Release verification matrix

**Automated green requirements:** 31 exact TIFF hash checks; 9 states × 3 radii geometry; 108 independent geodesic proximity comparisons; 27 **real** source-raster Chromium screens; 9 source-checked example 5-km case JSON outputs; map rendering, visual palette, truthful overview, retry after induced HTTP source failure; keyboard + automated WCAG 2.1 A/AA checks, 375/390/768/1024/1440 responsive widths; Stage11–25 saved-case import integrity, human-readable mapped PDF, professional handoff page integrity, multi-case PDF, ZIP/package verifier and CSV privacy. All versions of the same science/published raster manifest.

**Deployment gates:** Only `petroscreen/` may change on production `main`; CNAME and portfolio home still work; all TIFF bytes identical; independent PR portfolio CI green; actual Pages deploy green; external HTTPS UI+JS and a served Delta TIFF hash green. Release hash and run URLs are recorded on PR and final handoff.

## Remaining external validation (cannot be automated honestly in a cloud browser)

- Physical device checks on one budget Android phone on 3G/4G and one modern Android phone, including memory stability, large source-file download tolerance and tapping/zooming.
- NVDA/Windows and TalkBack/Android **human** assistive-device navigation, including map/keyboard controls and PDF reading order.
- Independent task-based usability study with a first-time nontechnical visitor and a Nigerian EIA/petroleum professional; gather evidence of terms misunderstood and concrete fixes rather than guessing.
- A domain expert's current-source/field sampling review of dated satellite context, method uncertainty and regulatory applicability. User-declared pipeline/asset location cannot be authenticated without source evidence.

These are explicitly **post-automated-release pilot-acceptance requirements**, not grounds for making false claims in the application. No further engineering stage should be opened without a documented blocker, new dataset requirements, professional review result or a user-requested feature. Avoid indefinite stage churn once all automated gates pass.

## Fast maintenance route

Editable code, unit tests and workflows live **only in this research branch** under `petroscreen-ng/`; published `main` contains the compiled site. To change the product later, make a focused source-branch commit; GitHub Actions reconstructs the exact original raster assets from deployed `main`, runs all gates, and creates a disposable **preview** branch from current production. After independent portfolio check success, merge the preview PR and require real GitHub Pages and external HTTPS/source checksum PASS. Do not edit minified JS directly on production.
