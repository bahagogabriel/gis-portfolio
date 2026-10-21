# PetroScreen NG | Stage 19 user-interface and accessibility audit

**Date:** 21 October 2026  
**Release target:** v1.9 (GitHub Pages)  
**Code scope:** front-end HTML/CSS, orientation/status labels, usability/keyboard interactions and automated test infrastructure. **No scientific model, source raster, scoring, data contract, case measurement or original portfolio changes.**

## Actual problems identified before changes

1. **Main task buried:** desktop first-view screenshot at 1440×900 required scrolling to reach the screening action. The long four-line H1 and introductory text consumed much of a narrow research sidebar. At 375×812, the action was just below the fold.
2. **Unnecessary cognitive load:** ZIP integrity verification and source disclosures competed for first-screen attention with basic screening. Professional case formats are important but not needed for every first-time visitor.
3. **Finding discovery:** after analysis, findings sit in a separate report panel; on phone the user had to scroll past the map with no direct navigation.
4. **Readability:** legacy stylesheet enforced 10-pixel text on all `.fine` paragraphs, and several legacy sub-panels used pale text on a light background or insufficient contrast.
5. **Map accessibility:** the map could be clicked but keyboard/phone visitors needed a more discoverable direct coordinate route and a clear path back from map selection.
6. **Advanced downloads:** six secondary file formats dominated the results section; primary case ZIP and PDF should be discoverable first.

## Improvements implemented in v1.9

- Retained truthful “research preview” position, nine-state source boundary, source dates and all cautionary statements.
- Short three-step guide with more readable typography, reduced header wrapping and a first-fold primary action on both desktop and phone.
- Short link from coordinate field to map and an explicit *Continue to screening* button after a map-selected location. No map click is required for keyboard-only users; latitude/longitude form remains available.
- Collapsible optional petroleum settings, source/verification tools and advanced exports, with accessible native `details`/summary semantics.
- Primary downloadable full case ZIP and screening PDF remain visible ahead of specialist exports.
- Show a *View [state] screening findings* button after a successful screen; it scrolls to and keyboard-focuses the named findings heading.
- Corrected paragraph sizes, headings, contrast, labels, focus outlines, tap targets and error/readiness feedback. All layouts use source data and preserve scientific caveats.
- Scoped CSS for mobile 375/390 px, tablet 768/1024 px and desktop 1440 px.
- Preserved all Stage11–18 saved-case, comparison CSV/PDF, ZIP verifier and field/evidence features.

## Independent test protocol

The new `web/test/stage19-ui-audit.mjs` runs in real headless Chromium using pinned `@axe-core/playwright`. Every release checks:

- Document has keyboard-first skip navigation and correctly labelled controls.
- Desktop 1440, tablet 1024/768 and mobile 390/375 pixels have **no horizontal document overflow**.
- Primary *Run site screening* button is directly visible without scrolling at 375×812 and exceeds the 44-pixel-size guideline.
- First-run optional tools are hidden without being deleted; opening them reveals functional fields/buttons.
- The mobile map shortcut reaches its target.
- A Delta example is screened against actual source raster files and its findings link navigates to the visible report heading.
- Advanced exports remain reachable, and the comparison dialog remains keyboard-operated.
- Automated axe-core WCAG 2.1 A/AA rule suite reports **zero violations** for desktop first visit, mobile first visit, mobile report and mobile comparison.
- Screenshot artifacts of the desktop first visit, mobile first visit and mobile report allow qualitative review.
- Pre-existing CI independently checks all 31 GeoTIFF SHA-256 hashes, a nine-state × three-radius geometry matrix, 108 independent geodesic distances, all nine states' browser screening, and real PDF/ZIP output.

**Audit limitations:** automated WCAG scans are *not* a full accessibility certificate and cannot substitute for real users, assistive-technology trials, touch usability studies or network performance measurement. Human visual inspection used actual CI screenshot captures, not a design mock-up.

## Follow-up UX/quality backlog

These require a separate evidence-led stage and must not be described as already completed:

- Keyboard + VoiceOver/TalkBack/NVDA usability sessions with representative users and assistive devices.
- Browser testing on actual mid-range Android hardware, low-memory phones and slow mobile connections.
- First-time task completion observations with petroleum EIA specialists and nonspecialist field-planning users.
- Map legend and land-cover colorblind distinguishability review with geospatial specialists; preserve ESA classes and scientifically correct labels.
- Browser performance and download-size budget across nine states, with an optimization plan that does not compromise raster precision.
- User-tested terminology and a plain-language guide to what the results **do not** mean (regulatory EIA, contamination, asset mapping, spill risk).

**Scientific integrity rule:** all revisions are UX-only. Source-dated ESA 2021 land-cover and JRC 1984–2024 water observations must remain unchanged, and any future additional environmental measure requires its own evidence/provenance tests.
