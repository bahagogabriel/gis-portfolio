import test from "node:test";
import assert from "node:assert/strict";
import {screeningNotes} from "../src/insights.js";

test("strictly observational mapped land cover and water notes",()=>{
  const report={
    land_cover_2021:{classes:[
      {class:"Built-up",area_km2_approx:64.3051,share_of_valid_classified_pct:81.9},
      {class:"Tree cover",area_km2_approx:6.1459,share_of_valid_classified_pct:7.8}
    ]},
    surface_water_occurrence_1984_2024:{threshold_areas:[
      {threshold_pct:1,area_km2_approx:2.3468},
      {threshold_pct:50,area_km2_approx:1.5625}
    ]}
  };
  const notes=screeningNotes(report);
  assert.equal(notes.length,3);
  assert.match(notes[0],/Built-up.*81\.9%/i);
  assert.match(notes[0],/2021/);
  assert.match(notes[1],/2\.347 km²/);
  assert.match(notes[1],/1984–2024/);
  assert.match(notes[1],/not a flood-risk/);
  assert.match(notes[2],/verify/i);
  assert.doesNotMatch(notes.join(" "),/high risk|low risk|regulatory approval granted|pollution confirmed/i);
});
test("missing source evidence is rejected",()=>{
  assert.throws(()=>screeningNotes({}),/source-backed/);
  assert.throws(()=>screeningNotes({land_cover_2021:{classes:[]},
    surface_water_occurrence_1984_2024:{threshold_areas:[]}}),/No valid/);
});
