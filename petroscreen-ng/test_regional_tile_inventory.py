import unittest
from shapely.geometry import box
from regional_tile_inventory import TARGETS,candidates,projected_buffer

class ExpansionContractTests(unittest.TestCase):
    def test_nine_official_states(self):
        self.assertEqual(len(TARGETS),9)
        self.assertEqual(len(set(TARGETS)),9)
        self.assertIn("Bayelsa",TARGETS)
        self.assertIn("Ondo",TARGETS)
    def test_worldcover_tile_seam(self):
        wc,jrc=candidates(box(5.95,4.6,6.05,4.75))
        self.assertEqual(wc,["N03E003","N03E006"])
        self.assertEqual(jrc,["0E_10N"])
    def test_10deg_jrc_tile_grid_northward(self):
        _,jrc=candidates(box(9.8,9.8,10.2,10.2))
        self.assertEqual(jrc,["0E_10N","0E_20N","10E_10N","10E_20N"])
    def test_5km_halo_produces_real_outside_area(self):
        region=box(5.95,4.6,6.05,4.75)
        halo=projected_buffer(region,5000)
        self.assertGreater(halo.area,region.area)
        self.assertTrue(halo.contains(region))
    def test_no_unsafe_negative_tile_ids(self):
        wc,jrc=candidates(box(-1.3,-1.3,-1.1,-1.1))
        self.assertTrue(all(s.startswith("S") and "W" in s for s in wc))
        self.assertEqual(jrc,["10W_0N"])
if __name__=="__main__":
    unittest.main()
