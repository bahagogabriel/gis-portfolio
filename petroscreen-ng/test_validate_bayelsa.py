import unittest
from validate_bayelsa import approximate_pixel_area
class AreaContractTests(unittest.TestCase):
    def test_pixel_area_resolution_ratio(self):
        bounds=[5.4,4.3,6.6,5.4]
        a=approximate_pixel_area({"clip_bounds_lon_lat":bounds,
          "source_pixel_size_degrees":[1/12000,1/12000]})
        b=approximate_pixel_area({"clip_bounds_lon_lat":bounds,
          "source_pixel_size_degrees":[.00025,.00025]})
        self.assertAlmostEqual(b/a,9,places=3)
        self.assertTrue(80<a<100)
if __name__=="__main__":unittest.main()
