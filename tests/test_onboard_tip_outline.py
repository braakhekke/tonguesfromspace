"""Metric ring smoothing preserves a broad front while removing pixel steps."""
import importlib.util,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
try:
 import numpy as np
 from shapely.geometry import Polygon
 import onboard_tip_outline as tip
except ImportError:
 tip=None
@unittest.skipIf(tip is None,'Optional glacier processing dependencies unavailable')
class TestTipSmoothing(unittest.TestCase):
 def test_smooth_valid_closed_ring_without_material_area_change(self):
  theta=np.linspace(0,2*np.pi,200,endpoint=False);radius=1000+10*np.sin(30*theta);p=Polygon(np.column_stack([radius*np.cos(theta),radius*np.sin(theta)]));q=tip.smooth_polygon(p)
  self.assertTrue(q.is_valid);self.assertFalse(q.is_empty)
  self.assertLess(abs(q.area/p.area-1),.01)
  self.assertLess(q.length,p.length)
 def test_ring_is_closed(self):
  p=Polygon([(0,0),(1000,0),(1000,1000),(0,1000)]);r=tip.smooth_ring(p.exterior)
  np.testing.assert_allclose(r[0],r[-1])
