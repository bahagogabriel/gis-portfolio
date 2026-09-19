---
title: Lokoja Flood Risk and Resilience Planning
eyebrow: Independent flood-resilience project · Lokoja, Nigeria
order: 2
featured: true
categories: [risk, water, remote, webgis]
card_tags: [Sentinel-1, Random Forest, MapLibre]
card_label: Independent project · 2026
card_image: /assets/lokoja-intervention-priority.webp
card_alt: Integrated flood-resilience intervention priority map for Lokoja
summary: A multi-event remote-sensing and machine-learning workflow connecting flood susceptibility, exposure, infrastructure risk and practical intervention priorities.
duration: 2026
client: Independent portfolio and research project
location: Lokoja LGA, Kogi State, Nigeria
role: Lead GIS and machine-learning analyst
hero_image: /assets/lokoja-intervention-priority.webp
hero_alt: Lokoja integrated flood-resilience intervention priority map
hero_caption: Integrated 600 m intervention-priority units for Lokoja LGA
external_url: https://bahagogabriel.github.io/lokoja-flood-resilience-dashboard/
external_label: Open the interactive dashboard
objective_heading: Translate flood evidence into transparent planning priorities.
objective: >-
  The project combined multi-event Sentinel-1 flood mapping, terrain and environmental predictors, spatially validated machine learning, population and building exposure, and infrastructure screening. Its purpose was to move beyond susceptibility mapping toward reproducible intervention planning.
metrics:
  - value: "17"
    label: Model predictors
  - value: "0.813"
    label: Mean spatial PR-AUC
  - value: "1,475"
    label: Robust priority units
  - value: "24"
    label: Priority bridges and fords
contribution_heading: Designing the complete analytical and communication workflow.
contribution_intro: I developed the data preparation, validation, modelling, exposure, infrastructure and WebGIS stages as a reproducible end-to-end project.
contributions:
  - title: Multi-event flood inventory
    description: Produced event labels and recurrence evidence for 2018, 2020, 2022 and 2024 from Sentinel-1 SAR.
  - title: Spatial machine learning
    description: Compared logistic regression, Random Forest and gradient boosting using spatial cross-validation and population weighting.
  - title: Independent validation
    description: Assessed transfer to the 2024 event and later completed chronological validation across all events.
  - title: Exposure analysis
    description: Integrated official constrained WorldPop, building footprints and susceptibility classes.
  - title: Infrastructure screening
    description: Assessed mapped roads, critical facilities, bridges and fords using hazard context.
  - title: Intervention planning
    description: Scored 600 m planning units and tested robustness under alternative weighting scenarios.
workflow_heading: From satellite observations to intervention themes.
workflow:
  - title: Map events
    description: Extract comparable flood labels from multi-date Sentinel-1 observations.
  - title: Build predictors
    description: Align terrain, drainage, water occurrence and land-cover predictors to a 30 m grid.
  - title: Validate models
    description: Use spatial folds, population weighting, ablation and chronological transfer tests.
  - title: Assess exposure
    description: Combine hazard with population, buildings and mapped infrastructure.
  - title: Prioritise action
    description: Rank planning units, assign intervention themes and publish the evidence through WebGIS.
gallery_heading: Model evidence, validation and planning outputs.
gallery:
  - image: /assets/lokoja-importance-classes.webp
    alt: Lokoja feature importance and susceptibility classes
    caption: Feature importance and susceptibility
  - image: /assets/lokoja-validation.webp
    alt: Independent 2024 flood validation results
    caption: Independent validation
  - image: /assets/lokoja-exposure.webp
    alt: Population and building exposure results
    caption: Exposure analysis
outcomes_heading: A complete open decision-support workflow.
outcomes_intro: The project produced analysis-ready rasters, validation tables, intervention units, publication graphics, documentation and an interactive dashboard.
outcomes:
  - Continuous probability and five-class susceptibility rasters
  - Spatial and chronological model-validation evidence
  - Population, building and infrastructure exposure summaries
  - Robust Critical and High intervention units
  - Recommended intervention themes and screening shortlist
  - Open interactive WebGIS dashboard and reproducible project documentation
attribution: Independent work by Samuel Bahago Gabriel using open geospatial data and open-source analytical components alongside ArcGIS Pro.
---
