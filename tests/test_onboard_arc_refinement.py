"""Reference-guided arcs follow the target image and avoid unsupported detours."""
from pathlib import Path
import sys,unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
try:
 import numpy as np
 from shapely.geometry import LineString
 from onboard_refine_tip_arcs import guided_boundary
except ImportError:
 guided_boundary=None
@unittest.skipIf(guided_boundary is None,'Optional glacier processing libraries unavailable')
class TestReferenceGuidedBoundary(unittest.TestCase):
 def reference(self):
  a=np.linspace(np.pi/2,-np.pi/2,250)
  return LineString(np.column_stack([1200+700*np.cos(a),1280+700*np.sin(a)]))
 def bands(self,radius):
  x,y=np.meshgrid(np.arange(256)*10+5,2560-(np.arange(256)*10+5));ice=(x-1200)**2+(y-1280)**2<radius**2;b=np.zeros((7,256,256),float)
  b[1]=np.where(ice,.5,.12);b[3]=np.where(ice,.45,.01);b[4]=np.where(ice,.08,.005);b[6]=1
  return b
 def test_uses_target_edge_instead_of_copying_reference(self):
  ref=self.reference();out,report=guided_boundary(ref,self.bands(730),(0,0,2560,2560))
  xy=np.array(out.coords);r=np.hypot(xy[:,0]-1200,xy[:,1]-1280)
  self.assertLess(abs(np.median(r[10:-10])-730),12)
  self.assertTrue(out.is_simple);self.assertFalse(out.equals(ref));self.assertGreater(report['max_displacement_m_computed'],10)
 def test_missing_evidence_retains_reference_and_reports_it(self):
  ref=self.reference();b=self.bands(730);b[6]=0;out,report=guided_boundary(ref,b,(0,0,2560,2560))
  self.assertEqual(report['weak_image_evidence_fraction_computed'],1)
  self.assertEqual(report['max_displacement_m_computed'],0)
  self.assertLess(out.hausdorff_distance(ref),3)
