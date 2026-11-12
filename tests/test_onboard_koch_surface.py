"""Physical identity and source-grid orientation for the Koch prototype."""
from pathlib import Path
import sys,tempfile,unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
try:
 import numpy as np,rasterio
 from rasterio.transform import Affine
 from onboard_koch_surface import reconstruct,sample_raster
except ImportError:
 reconstruct=None
@unittest.skipIf(reconstruct is None,'Optional glacier processing dependencies unavailable')
class TestKochSurface(unittest.TestCase):
 def test_reference_identity_rate_direction_and_bed_floor(self):
  b=np.array([0.,-100.,20.]);h=np.array([50.,200.,3.]);r=np.array([-2.,-4.,-5.])
  np.testing.assert_allclose(reconstruct(b,h,r,0),b+h)
  self.assertGreater(reconstruct(b,h,r,-4)[0],reconstruct(b,h,r,0)[0])
  self.assertEqual(reconstruct(b,h,r,10)[2],b[2])
 def test_missing_rates_and_thickness_remain_unmodelled(self):
  out=reconstruct(np.zeros(3),np.array([10.,0.,10.]),np.array([np.nan,-2.,-2.]),1)
  self.assertTrue(np.isnan(out[:2]).all());self.assertEqual(out[2],8)
 def test_south_up_grid_is_sampled_by_its_transform_and_crs_is_explicit(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'south-up.tif'
   with rasterio.open(p,'w',driver='GTiff',height=2,width=2,count=1,dtype='float32',transform=Affine(100,0,500000,0,100,4400000)) as r:r.write(np.array([[10,20],[30,40]],np.float32),1)
   e=np.array([[500050.,500150.]]);n=np.array([[4400050.,4400150.]])
   with self.assertRaises(ValueError):sample_raster(p,e,n,'EPSG:32718')
   a,m=sample_raster(p,e,n,'EPSG:32718','EPSG:32718')
   np.testing.assert_allclose(a,[[10,40]]);self.assertEqual(m['assumed_crs'],'EPSG:32718')
