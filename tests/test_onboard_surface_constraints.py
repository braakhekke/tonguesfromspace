"""Guard against blending the ice front and double-counting mean ablation."""
import datetime as dt
from pathlib import Path
import sys,tempfile,unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
try:
 import numpy as np
 from shapely.geometry import box
 from onboard_surface_constraints import hard_mesh,stake_forcing
except ImportError:hard_mesh=None
@unittest.skipIf(hard_mesh is None,'Optional glacier processing dependencies unavailable')
class SurfaceConstraints(unittest.TestCase):
 def test_clipped_top_and_vertical_wall_never_ramp_to_lake(self):
  axis=np.array([0.,100.]);ice=np.full((2,2),300.);uv=np.zeros((2,2,2))
  p,u,k,c=hard_mesh(box(20,20,80,80),axis,axis,ice,ice,np.ones((2,2)),178,ice,{},uv)
  p=p.reshape(-1,3)
  self.assertEqual(set(p[:,1]),{178.,300.})
  # First clipped triangle: all vertices are exactly on/in the hard boundary.
  self.assertTrue(((p[:3,0]>=20)&(p[:3,0]<=80)).all())
  self.assertTrue((p[:3,1]==300).all())
  self.assertEqual(len(u),len(p)*2);self.assertTrue(np.isfinite(p).all())
 def test_background_preserves_land_elevation_outside_ice(self):
  axis=np.array([0.,100.]);ice=np.full((2,2),300.);terrain=np.full((2,2),450.);uv=np.zeros((2,2,2))
  p,u,k,c=hard_mesh(box(20,20,80,80),axis,axis,ice,terrain,np.ones((2,2)),178,ice,{},uv,terrain,np.zeros((2,2)))
  p=p.reshape(-1,3)
  self.assertTrue((p[k==0,1]==450).all());self.assertTrue((k==0).any());self.assertFalse((p[:,1]==178).any())
 def test_detrending_preserves_published_rate_period(self):
  with tempfile.TemporaryDirectory() as tmp:
   path=Path(tmp)/'stake.csv'
   start=dt.date(2010,1,1);rows=['date,Cumulative ablation (cm)'];total=0.
   for i in range(6200):
    day=start+dt.timedelta(days=i);total+=4 if day.month<7 else 2
    rows.append(day.strftime('%Y/%m/%d')+','+str(total))
   path.write_text('\n'.join(rows));value,report=stake_forcing(path)
   self.assertAlmostEqual(value(dt.date(2019,3,31)),value(dt.date(2023,3,31)),places=8)
   self.assertTrue(all(0<=a['measured_day_fraction_computed']<=1 for a in report['annual']))
