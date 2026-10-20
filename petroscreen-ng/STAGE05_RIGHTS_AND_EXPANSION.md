# PetroScreen NG — Stage 05 source rights, interpretive controls and national expansion

**20 October 2026.** Scientific source and attribution desk audit. No claim of formal legal advice, field validation or independent expert endorsement. This branch does not modify `main`, the public site, or published dashboards.

## Mandatory dataset desk review

| Layer | Official source | Terms | Citation/attribution required | Distinct interpretive issues | Gate |
|---|---|---|---|---|---|
| ESA WorldCover 2021 **v200**, 10 m nominal | https://esa-worldcover.org/en/data-access | CC BY 4.0; permitted reuse with attribution | Map credit **© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium.** Cite Zanaga et al. 2022, https://doi.org/10.5281/zenodo.7254221. Identify modifications (Bayelsa clip/overview). | WorldCover 2020 v100 vs 2021 v200 have differing models, so change cannot be attributed solely to true land change; 2021 is not 2026 condition. Mapped tree cover does not equal field-verified forest, protected habitat or species value. | Terms and attribution **DESK PASS**; thematic accuracy/field use **HOLD**. |
| JRC Global Surface Water occurrence **v1.5 1984–2024**, 30 m nominal | https://global-surface-water.appspot.com/download | Official download page says freely usable under **Copernicus Regulation**; proper acknowledgement mandatory. An alternative FAO catalogue lists CC BY 4.0 but for the public product reproduce the **provider's explicit stated terms and map credit**, not an oversimplified license designation. | Provider's mapped-layer credit **Source: EC JRC/Google**. Cite Pekel et al., 2016, *Nature* 540:418–422, https://doi.org/10.1038/nature20584. Disclose clip/derived masked anomalies. | Historical percentage of valid satellite observations showing water, NOT flood probability, present-day water, contamination, depth, sensitive habitats, regulatory risk or actual petroleum impact. Collection 1/2 geolocation differences can locally exceed 30 m. Later data added beyond 2015 were not subjected to the validation of the original research release. Known recurrence issue concerns **monthly recurrence**, which is not an input to PetroScreen. Four Bayelsa source values (one 101, three 104) were masked/declared. | Terms and attribution **DESK PASS**; position-specific validity/field use **HOLD**. |
| geoBoundaries Nigeria **gbOpen ADM1** | https://www.geoboundaries.org/api/current/gbOpen/NGA/ADM1/ | gbOpen CC BY 4.0. **Do not substitute** gbAuthoritative or gbHumanitarian license. | geoBoundaries gbOpen, Nigeria ADM1 2022; API identifies original boundary source as **GRID3**. Attribute geoBoundaries and GRID3 and indicate state-border approximate rather than surveyed. | Administrative boundary limits the current **data coverage** only; not an ocean coastline, exact legal site boundary or ecological watershed. Near-border buffer indicates incomplete prepared coverage. | Terms/structural geometry **DESK PASS**, site-border survey quality **HOLD**. |

Sources inspected on 20 Oct 2026, including provider terms and JRC v1.5 release notes.

## Mandatory language constraints
1. Use **mapped tree cover**, **mapped permanent water**, **mapped mangroves** rather than certified forest, wetland condition, pollution or species richness.
2. Report JRC **historical observed occurrence 1984–2024**. Do not call the >=1/50/90% categories river proximity, presence right now, permanent water, contamination, annual rate or flood probability.
3. Disclose source dates and pixel resolutions visibly on reports, and distinguish `valid pixel coverage` from `scientific classification accuracy`.
4. No fabricated petroleum pipeline/well assets, oil spill likelihood, official screening verdict, environmental risk score or approval.
5. Protect against false certainty where two rasters disagree: different sensors, dates, semantic classes and geographic registration mean disagreement is expected.
6. Never interpret the absence of a mapped feature as proof that the actual habitat/receptor is absent.
7. No Nigerian agency or proprietary operator data are required for the MVP. Optional layers require their own terms, QA and verification before being included.

## Region expansion strategy — **not** a claim of coverage

Build a discoverable **candidate** inventory from public geoBoundaries Nigeria ADM1 polygons. Target NDDC's nine mandate states: Abia, Akwa Ibom, Bayelsa, Cross River, Delta, Edo, Imo, Ondo, Rivers. Source: https://nddc.gov.ng/ . This definition includes Ondo, Abia and Imo, and is not synonymous with the six South-South geopolitical states.

The `regional_tile_inventory.py` generator downloads **only an open public administrative GeoJSON** and produces:
- State area/bbox and overlap-friendly 5 km buffers based on the same source boundary,
- Candidate intersecting ESA WorldCover **3° x 3°** v200 tile IDs,
- Candidate intersecting JRC GSW **10° x 10°** v1.5 north/east coordinate tile IDs,
- Provenance metadata, source terms and **pending** download/QA status for every regional raster.

**Nothing from the candidate inventory is live screening coverage.** A candidate tile must be downloaded, checked for source date, CRS, valid values, NoData and extent, and independently compared with the reference engine. National or NDDC screening must not go live until source data and relevant cross-region buffer gaps are fully covered.

Regional deployment needs cost/performance evaluation. Whole-country 10 m TIFFs in the browser would be needlessly large; use regional/COG/cloud tiles and explicit on-demand loading so no paid live analysis service is necessary.

## Controlled online preview HOLD

- A working local downloadable Stage 04 Bayelsa preview exists, but GitHub Pages public publication should occur on an isolated **research-preview** host/project with no change to `bahagogabriel.com`.
- Repo's current GitHub connector permissions do not expose repository creation or Pages provisioning. Do not claim an online URL or modify public `main` in lieu of those capabilities.
- Browser-only processing excludes intentional submission to an app backend; web hosting and third-party scripts still entail ordinary IP/HTTP telemetry. Verify deployment traffic, privacy notice, CSP and actual server before marketing as private.
- Further publish blockers: peer domain-interpretation review, legal/attribution review of derivatives, map/pdf release QA, and owner's final consent to expose the project publicly.

## Stable release rule

The software's source and data QA may be green while *scientific operational suitability* remains HOLD. These are separate assessments. Do not automatically promote draft stacked PRs to the live site until the latter is resolved.
