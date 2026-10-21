# PetroScreen NG — Stage 22 map control and communication audit

**Release target:** v2.2 (21 October 2026). **Source baseline:** verified v2.1 deployment.  
**Scope:** navigational map controls, source-aware progressive disclosure, contextual coverage feedback, responsive map layout. **No** scientific engine/data/field-evidence changes.

## Context and factual UX issues

The owner confirmed that the v2.1 checkbox was functioning. Their screenshot showed the expanded legend taking much of the map area, which can distract first-time users from site selection. After clicking a point outside the verified coverage, the “Outside supported states” message remained visible, with no prominent way to restore the full pilot view. The goal is a clearer map while preserving the useful lightweight display.

## Changes

1. Keep the **Map key · ESA land cover 2021** header available as an accessible native HTML disclosure. The first expanded view is a quick guide with the pilot boundary symbol, selected site symbol, buffer symbol, source status, and **Show full pilot area**.
2. Place optional specialist content under separate native disclosures: **Land-cover colors (11 classes)**, **Display quality (512/1024 px)**, and **Source dates & limitations**. The original Stage 21 lightweight checkbox remains fully available without loss of function.
3. Preserve the Stage 20 scientific distinction: the overview is a generalized raster whose colors must NOT be treated as the 2021 source-class palette. Detailed ESA color chips appear only after an actual detailed source image has successfully rendered.
4. The new extent button calls MapLibre fitBounds on the already loaded, SHA-256-manifest-described regional overview extent, without re-screening, changing WGS84 point values, altering field notes, downloading new satellite TIFFs or reclassifying image pixels.
5. An out-of-coverage click now explains how to find a valid pilot location. A previously accepted site/screening stays valid and the message explicitly says so. A deliberate map movement clears the warning; valid selection resets it. The map does not suggest risk, asset inventories, contamination or regulatory approval.

## Test and deployment gates

- Stage22 Chromium with genuine already-verified Delta source rasters at **375-pixel mobile** and **1440-pixel desktop**: quick legend height capped, classes and display settings hidden until requested, 11 source-aligned classes available, pilot extent navigation and no scientific screen changes, no TIFF refetch, automated WCAG 2.1 A/AA scan of open map controls, screenshot archive.
- Stage20 source-native palette test and Stage21 512/1024 visual toggle and failed-source retry remain required.
- Full nine-state source-backed scientific suite: all 31 TIFF SHA-256, nine-state 1/3/5-km geometry matrix, 108 independent mapped-feature geodesic distances, real reports/case bundle/ZIP verification/compare-PDF, original Jekyll/portfolio compatibility and original CNAME.
- Production change strictly confined to compiled `petroscreen/` files. No portfolio homepage/CMS/dashboard edits and no modifications to scientific TIFFs.

## Limits

A browser-based WCAG automated scan cannot replace screen-reader trials, and desktop/mobile viewport emulation is not a physical Android QA result. Field validation and up-to-date satellite observations are independent scientific needs. Out-of-coverage clicks only inform the user; the valid screening domain is unchanged.
