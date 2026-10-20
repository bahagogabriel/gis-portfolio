"""Network-free synthetic tests for nationally reusable Stage 02 computation."""
import json
import math
import tempfile
import unittest
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import box, mapping

from screening_engine import (
    _ensure_nonoverlap, circle_wgs84, geodesic_area_km2, screen,
)

class EngineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.domain = self.root / "region.geojson"
        self.domain.write_text(json.dumps(mapping(box(5.95,4.95,6.05,5.05))))
        self.west = self.root / "west.tif"
        self.east = self.root / "east.tif"
        self.water = self.root / "water.tif"
        self.write(self.west, np.full((256, 256), 10, dtype="uint8"),
                   5.9744, 5.0128, .0001, nodata=0)
        self.write(self.east, np.full((256, 256), 95, dtype="uint8"),
                   6.0, 5.0128, .0001, nodata=0)
        vals = np.full((200, 200), 25, dtype="uint8")
        vals[:, 100:] = 75
        self.write(self.water, vals, 5.97, 5.03, .0003, nodata=255)

    def tearDown(self):
        self.tmp.cleanup()

    @staticmethod
    def write(path, data, west, north, cell, nodata):
        with rasterio.open(path,"w",driver="GTiff",width=data.shape[1],
             height=data.shape[0],count=1,crs="EPSG:4326",
             transform=from_origin(west,north,cell,cell),
             dtype=data.dtype,nodata=nodata) as dst:
            dst.write(data,1)

    def run_screen(self, lon=6., lat=5., radius=1, domain=None):
        return screen(lon,lat,radius,domain or self.domain,
                      [self.west,self.east],self.water)

    def test_geodesic_1km_circle_and_radius_validation(self):
        area = geodesic_area_km2(circle_wgs84(6,5,1))
        self.assertLess(abs(area-math.pi),.002)
        for radius in (2,10,0):
            with self.assertRaises(ValueError):
                circle_wgs84(6,5,radius)
        with self.assertRaises(ValueError):
            circle_wgs84(181,5,1)

    def test_two_source_tile_seam_and_land_cover_shares(self):
        r=self.run_screen()
        self.assertEqual(r["schema_version"],"1.0")
        self.assertEqual(r["data_integrity"]["land_cover_raster_count"],2)
        self.assertAlmostEqual(r["study"]["buffer_area_km2_geodesic"], math.pi,delta=.005)
        self.assertEqual({c["code"] for c in r["land_cover_2021"]["classes"]},{10,95})
        cls={c["code"]:c for c in r["land_cover_2021"]["classes"]}
        self.assertAlmostEqual(cls[10]["share_of_valid_classified_pct"],50,delta=3)
        self.assertAlmostEqual(cls[95]["share_of_valid_classified_pct"],50,delta=3)
        self.assertGreater(r["land_cover_2021"]["coverage"]["within_domain_coverage_pct_approx"],97)
        self.assertGreater(r["surface_water_occurrence_1984_2024"]["coverage"]["within_domain_coverage_pct_approx"],97)
        self.assertEqual(r["coverage_status"],"partial") # No file manifest verified
        self.assertIn("SOURCE_HASHES_NOT_RECHECKED: pass acquisition manifest for verified processing",r["warnings"])

    def test_water_occurrence_thresholds_are_not_probabilities(self):
        r=self.run_screen()
        t={x["threshold_pct"]:x["share_of_valid_jrc_area_pct"]
           for x in r["surface_water_occurrence_1984_2024"]["threshold_areas"]}
        self.assertAlmostEqual(t[1],100,delta=.1)
        self.assertAlmostEqual(t[50],50,delta=5)
        self.assertAlmostEqual(t[90],0,delta=.1)
        self.assertIn("not current water",r["surface_water_occurrence_1984_2024"]["interpretation"])

    def test_zero_occurrence_pixels_still_count_as_valid(self):
        self.write(self.water,np.zeros((200,200),dtype="uint8"),5.97,5.03,.0003,255)
        r=self.run_screen()
        self.assertGreater(r["surface_water_occurrence_1984_2024"]["coverage"]["whole_buffer_coverage_pct_approx"],97)
        self.assertEqual(r["surface_water_occurrence_1984_2024"]["threshold_areas"][0]["area_km2_approx"],0)

    def test_partial_buffer_does_not_imply_zero_outside_boundary(self):
        d=self.root/"partial_domain.geojson"
        d.write_text(json.dumps(mapping(box(5.997,4.99,6.05,5.05))))
        r=self.run_screen(domain=d)
        self.assertGreater(r["study"]["outside_supported_domain_km2_geodesic"],.1)
        self.assertTrue(any(w.startswith("BUFFER_CROSSES_SUPPORTED_BOUNDARY") for w in r["warnings"]))

    def test_out_of_region_rejected(self):
        with self.assertRaisesRegex(ValueError,"outside"):
            self.run_screen(lon=6.3)

    def test_overlapping_tiles_rejected(self):
        overlap=self.root/"overlap.tif"
        self.write(overlap,np.full((256,256),95,dtype="uint8"),5.999,5.0128,.0001,0)
        with self.assertRaisesRegex(ValueError,"Overlapping"):
            _ensure_nonoverlap([self.west,overlap])

    def test_bad_water_code_rejected(self):
        self.write(self.water,np.full((200,200),104,dtype="uint8"),5.97,5.03,.0003,255)
        with self.assertRaisesRegex(ValueError,"Unrecognised"):
            self.run_screen()

    def test_manifest_integrity_rejects_changed_raster(self):
        f=self.root/"manifest.json"
        f.write_text(json.dumps({"rasters":[{"output_name":p.name,
            "sha256_derived_clipped_tif":"incorrect"} for p in (self.west,self.east,self.water)]}))
        with self.assertRaisesRegex(ValueError,"different"):
            screen(6,5,1,self.domain,[self.west,self.east],self.water,f)

if __name__=="__main__":
    unittest.main()
