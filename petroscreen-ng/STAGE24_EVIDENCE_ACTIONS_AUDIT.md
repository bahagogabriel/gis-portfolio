# PetroScreen NG — Stage 24 Evidence Requests Before Fieldwork

**Release target:** PetroScreen NG v2.4. **Scientific baseline:** verified v2.3 deployment. **Date:** 21 October 2026.

## Purpose and source limitations

Stage 24 provides an optional, *non-ranked* list of **evidence to request/verify**, grounded entirely in the screening's existing SHA-256-referenced Case File and Stage13 evidence register, Stage12 user-declared scoping prompts and the seven pre-existing field-verification questions. Its purpose is to make hand-off to field and professional reviewers more legible without claiming PetroScreen has completed fieldwork, discovered actual petroleum assets, ranked environmentally safer locations or interpreted regulatory obligations.

The new planning table is **not a prescribed field survey, comprehensive EIA, engineering hazard assessment, legal checklist, operator asset inventory or proof of approval**. A qualified reviewer must decide the actual survey needs and confirm current requirements.

### Action register contents

The deterministic `buildEvidenceActions(casefile)` produces a separate additive object `PetroScreenNG/EvidenceActions/1.0`. It independently calls the original `buildEvidenceReview` validator before deriving actions, and contains:
- Source/coverage clarifications only where pre-existing ESA-2021, JRC-1984–2024 or boundary QA flags require a reviewer to understand unobserved areas. Data below coverage threshold do **not** become risk scores.
- All seven existing field-verification topics, with original check titles/instructions. Reported statuses are explicitly `user_reported_unverified_*`; `not_checked` and `user_requested_specialist_follow_up` are distinct. A visit date does not authenticate fieldwork.
- The exact existing petroleum-scoping prompts arising from user-declared activity plus source-dated land-cover indicators; all stay `not_reviewed`. No actual asset is assumed.
- One standing request for appropriate contemporary field, regulatory and professional review, labelled `not_established`.

Grouped tasks have no recommended order, urgency, weight, risk rank or compliance designation. None of the screening engine, geodesic calculations, original source data, official report measurements or original case schema is modified. The browser recalculates the planning view from the currently accepted case as user statuses/declarations change; this cannot trigger another satellite raster fetch or re-screen.

### CSV privacy and authenticity

**Download evidence-to-collect checklist · CSV** is generated entirely in-browser and includes site coordinates, source-dated supporting context, user-selected field statuses and source-case timestamp. It deliberately excludes observer names and free-text general field notes, and spreadsheet-formula-leading values are neutralized. It is an additional CSV, not falsely advertised as part of the older complete case ZIP; the case package remains byte-schema compatible with its existing verifier.

Review site coordinates and user-entered statuses before distributing. No additional storage, server, login, telemetry or paid service is introduced.

### Required acceptance tests

1. Unit tests with explicitly synthetic TEST FIXTURES for seven field categories, 2021/JRC source-coverage and boundary flags, optional pipeline prompts, bad statuses/missing fields, CSV injection safety and no private notes/observer.
2. Actual SHA-256-verified Delta screening in Chromium at 375px and 1440px: baseline 7 unchecked tasks and original scope requests, user-reported field observations/needs follow-up, optional pipeline declarations, live update, downloadable CSV containing only the supported records, no repeated TIFF requests, unchanged mapped metrics.
3. Automated axe-core WCAG 2.1 A/AA rule scans with the planning view open. Screenshot artifacts archived for visual verification.
4. The unchanged full scientific suite: all 31 original GeoTIFF SHA-256 bytes, original nine-state × three-radius boundary matrix, 108 independent PyProj WGS84 pixel-centre comparisons, actual nine-state and PDF/ZIP/verification tests, mobile/desktop UX, Stage11–23 saved-case, source-color legend and comparison/regression checks.
5. Isolated deployment from current `main` changes **only `petroscreen/`** compiled assets and never the portfolio, CNAME, homepage or source rasters. Independent post-Pages public HTTPS v2.4 check includes original Delta TIFF digest.

**Limits:** Automated browser and accessibility tests are not actual-device field observations, user research, field-surveyor review or an official regulatory assessment. Nor is a user-entered status automatically verified by being copied into a planning register.
