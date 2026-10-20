"""Synthetic regression tests for memory-bounded raster streaming."""
import tempfile,unittest
from pathlib import Path
import numpy as np
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import box
from acquire_nine_state_stream import stream_clip,source_window
from acquire_bayelsa import sha256

class StreamingTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory()
  self.root=Path(self.tmp.name)
 def tearDown(self):
  self.tmp.cleanup()
 def make(self,name,values,nodata):
  path=self.root/name
  with rasterio.open(path,"w",driver="GTiff",height=values.shape[0],
     width=values.shape[1],count=1,dtype="uint8",crs="EPSG:4326",
     transform=from_origin(5.0,5.6,.001,.001),nodata=nodata,
     tiled=True,blockxsize=128,blockysize=128,compress="DEFLATE") as dst:
   dst.write(values,1)
  return path
 def test_strips_cross_256_row_boundary_and_preserve_sha(self):
  raw=np.full((420,430),10,dtype="uint8")
  raw[320:400,90:330]=95
  p=self.make("wc.tif",raw,0)
  dest=self.root/"wc-clipped.tif"
  geom=box(5.05,5.21,5.4,5.55)
  info=stream_clip(str(p),geom,dest,"worldcover")
  self.assertGreater(info["inside_polygon_pixel_count"],100000)
  self.assertEqual(info["inside_polygon_valid_pixel_count"],info["inside_polygon_pixel_count"])
  self.assertEqual(info["sha256_derived_clipped_tif"],sha256(dest))
  self.assertTrue(set(info["class_histogram"]).issubset({"10","95"}))
  self.assertTrue(info["inside_polygon_pixel_geodesic_area_km2"]>100)
  with rasterio.open(dest) as tif:
   self.assertEqual(tif.count,1)
   self.assertEqual(tif.crs.to_epsg(),4326)
   self.assertEqual(tif.nodata,0)
   self.assertEqual(tif.read(1).shape,tuple(info["clip_shape"]))
 def test_water_invalid_codes_become_nodata_with_provenance(self):
  arr=np.full((420,430),60,dtype="uint8")
  arr[200,200]=104
  p=self.make("jrc.tif",arr,255)
  info=stream_clip(str(p),box(5.05,5.21,5.4,5.55),
                   self.root/"jrc-clipped.tif","water_occurrence")
  self.assertEqual(info["masked_invalid_source_codes"].get("104"),1)
  with rasterio.open(self.root/"jrc-clipped.tif") as tif:
   self.assertIn(255,np.unique(tif.read(1)))
 def test_invalid_worldcover_is_blocked(self):
  arr=np.full((420,430),10,dtype="uint8")
  arr[200,200]=101
  p=self.make("bad.tif",arr,0)
  with self.assertRaisesRegex(RuntimeError,"Unrecognized"):
   stream_clip(str(p),box(5.05,5.21,5.4,5.55),self.root/"badclip.tif","worldcover")
 def test_no_spatial_intersection(self):
  arr=np.full((420,430),10,dtype="uint8")
  p=self.make("other.tif",arr,0)
  with rasterio.open(p) as tif:
   self.assertEqual(source_window(tif,box(7,7,8,8)),(None,None))
if __name__=="__main__":
 unittest.main()
