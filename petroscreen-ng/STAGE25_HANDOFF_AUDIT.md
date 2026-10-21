# PetroScreen NG — Stage 25 Professional Desk-Review PDF Handoff

**Release target:** PetroScreen NG v2.5. **Authoritative baseline:** verified v2.4 published on the portfolio. **Date:** 21 October 2026.

## Objective
A self-contained, printable **Professional Desk-Review Handoff PDF** that joins the *unchanged original mapped screening pages* with clearly separated evidence gaps, source citations, user-declared petroleum planning prompts and outstanding field/professional verification. It must not transform a research preview into a regulatory EIA, a contamination or spill-risk prediction, an official asset registry, or an authenticated field survey.

## Design and compatibility

- The PDF is a **new standalone download**, not a replacement for `Preliminary_Screening.pdf`, the signed-off case JSON, the Stage14 case ZIP or its local unsigned SHA-256 verification. This retains existing 3-page/4-page baseline PDF page counts, ZIP schema, hash verification and other pipeline checks without disruption.
- Build the existing `exportReportPdf({download:false})` report from the currently SHA-256-verified state imagery and mapped site. Only then append new A4 document pages with `appendDeskReviewHandoff(pdf,casefile)` using the existing pinned jsPDF dependency. No second map renderer or invented map geometry.
- Distinguish ESA WorldCover v200 (2021 mapped classification) from JRC GSW v1.5 (1984–2024 historical water occurrence). Keep measured numerical values and nearest pixel-centre details in the unchanged first pages, referencing them explicitly in the supplementary section.
- The addendum derives every action from the established `buildEvidenceActions` and `buildEvidenceReview` case-validated evidence registers, retains their `not_checked`, `user_reported_unverified_*`, `user_requested_specialist_follow_up` and `not_reviewed` distinctions and displays any source-coverage cautions. The original case schema and source TIFFs remain unchanged.
- The handoff includes exact WGS84 site and radius, ESA/JRC study-circle coverage figures, source-file names and all current source TIFF SHA-256 checksums, a professional limitations section, and a browser-local privacy notice.
- To avoid leaking unrestricted text, the handoff omits **field observer names and all free-text field notes**. It includes selected site coordinates and user-selected field status categories: visitors must review the PDF before external distribution. No network upload, user login, server-side analysis, telemetry or additional paid service.

## Mandatory scientific and quality gates

1. Synthetic-only JS tests for source validation, A4 append pagination, bad input rejection, no private details, and preserved original pages.
2. Real Chromium checks: downloadable PDFs for both a **Delta test with user-declared pipeline and user-reported but unauthenticated field observations**, and a **Rivers general-screening test** with default unchecked field statuses.
3. Independent PyMuPDF inspection of both artifacts: identical original page text and mapped image count, source-dated caveats, all TIFF filenames and full SHA-256 halves, field/professional planning prompts, omission of confidential example notes, and A4 text within page boundaries. No clipping, missing content or wildly excessive page counts.
4. Existing regression gates: all 31 unchanged SHA256 source raster bytes, nine-state × 1/3/5-km boundary matrix, 108 independent WGS84 PyProj pixel-centre comparisons, all nine actual Chromium screens and existing Stage08, Stage14 and Stage18 PDF/ZIP/comparison validators. Stage19–24 UX, low-memory, retry and evidence-action checks must continue to pass.
5. Protected GitHub Actions deployment preview **from current `main`**, with only the `petroscreen/` subtree changing; independently validated portfolio/CNAME/Jekyll workflow, GitHub Pages deployment, public HTTPS v2.5 UI/bundle check and served original Delta raster SHA-256 validation before release is declared.

**Explicit limits:** The output is **not** a certified EIA, evidence of a petroleum asset at the map point, field inspection, professional sign-off, risk score, site recommendation or regulator-approved checklist. Headless browser tests do not replace actual Android/TalkBack/desktop screen-reader use or a qualified environmental professional's review.
