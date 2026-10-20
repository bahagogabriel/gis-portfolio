import unittest
from raster_acquisition import SITES,WORLD_COVER_CODES,GSW_ENDPOINTS,worldcover_url,_safe_url

class RasterAcquisitionTests(unittest.TestCase):
    def test_bayelsa_crosses_both_worldcover_tiles(self):
        self.assertEqual({s["tile"] for s in SITES},{"N03E003","N03E006"})
        self.assertTrue(all("2021_v200" in worldcover_url(s["tile"]) for s in SITES))
    def test_worldcover_codes(self):
        self.assertEqual(WORLD_COVER_CODES,{10,20,30,40,50,60,70,80,90,95,100})
    def test_url_scheme(self):
        with self.assertRaises(ValueError): _safe_url("http://example.org/x.tif")
        self.assertEqual(len(GSW_ENDPOINTS),2)
    def test_project_bbox(self):
        self.assertTrue(all(4<s["lat"]<6 for s in SITES))
if __name__=="__main__":unittest.main()
