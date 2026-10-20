/** Factual, source-dated desktop-review notes. No inferred environmental risk score. */
export function screeningNotes(result){
  if(!result?.land_cover_2021?.classes || !result?.surface_water_occurrence_1984_2024?.threshold_areas)
    throw new Error("Completed source-backed screening result required");
  const classes=[...result.land_cover_2021.classes].sort((a,b)=>b.area_km2_approx-a.area_km2_approx);
  const first=classes[0];
  if(!first)throw new Error("No valid land-cover classes");
  const p=Number(first.share_of_valid_classified_pct).toFixed(1);
  const freq=result.surface_water_occurrence_1984_2024.threshold_areas.find(x=>x.threshold_pct===1);
  const area=freq ? Number(freq.area_km2_approx).toFixed(3) : "not available";
  return [
    `ESA WorldCover 2021 maps ${first.class.toLowerCase()} as the largest class (${p}% of valid classified area). Confirm present-day land cover in the field.`,
    `JRC 1984–2024 records ${area} km² of historically observed surface water at ≥1% occurrence. This is not a flood-risk, water-depth or present-day water estimate.`,
    "Before project decisions, verify site drainage or tidal influences, sensitive habitats, nearby receptors and applicable regulatory requirements with current evidence."
  ];
}
