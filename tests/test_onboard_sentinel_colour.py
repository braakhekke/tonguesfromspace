"""Radiometric metadata and fixed-display safeguards for Sentinel previews."""
import importlib.util
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))

@unittest.skipUnless(all(importlib.util.find_spec(x) for x in ('numpy','PIL')), 'Optional imagery dependencies unavailable')
class TestSentinelColour(unittest.TestCase):
    def test_legacy_quantification_needs_no_band_offsets(self):
        from onboard_sentinel_colour import parse_calibration
        result=parse_calibration(b'<root><BOA_QUANTIFICATION_VALUE>10000</BOA_QUANTIFICATION_VALUE></root>','02.01')
        self.assertEqual(result['B04'],{'quantification':10000,'offset':0})

    def test_read_offsets_from_band_ids_not_acquisition_date(self):
        from onboard_sentinel_colour import parse_calibration
        xml=b'''<root><BOA_QUANTIFICATION_VALUE>10000</BOA_QUANTIFICATION_VALUE>
        <Spectral_Information bandId="3" physicalBand="B4"/><Spectral_Information bandId="2" physicalBand="B3"/><Spectral_Information bandId="1" physicalBand="B2"/>
        <BOA_ADD_OFFSET band_id="3">-1000</BOA_ADD_OFFSET><BOA_ADD_OFFSET band_id="2">-1100</BOA_ADD_OFFSET><BOA_ADD_OFFSET band_id="1">-900</BOA_ADD_OFFSET></root>'''
        result=parse_calibration(xml,'05.00')
        self.assertEqual([result[b]['offset'] for b in ('B04','B03','B02')],[-1000,-1100,-900])

    def test_fail_when_modern_offsets_are_missing(self):
        from onboard_sentinel_colour import parse_calibration
        with self.assertRaises(ValueError):parse_calibration(b'<root><BOA_QUANTIFICATION_VALUE>10000</BOA_QUANTIFICATION_VALUE></root>','05.00')

    def test_snow_retains_detail_and_neutral_stays_neutral(self):
        import numpy as np
        from onboard_sentinel_colour import tone
        reflectance=np.array([[[.3,.3,.3],[.5,.5,.5],[.8,.8,.8],[1.,1.,1.]]])
        rgb=tone(reflectance)
        self.assertTrue(np.all(rgb[:,:,0]==rgb[:,:,1]))
        self.assertTrue(np.all(rgb[:,:,1]==rgb[:,:,2]))
        self.assertTrue(np.all(np.diff(rgb[0,:,0].astype(int))>0))
        self.assertLess(int(rgb[0,2,0]),255)

    def test_curve_does_not_change_with_other_pixels_in_frame(self):
        import numpy as np
        from onboard_sentinel_colour import tone
        sample=np.array([[[.12,.18,.22]]])
        whole=np.concatenate([sample,np.ones((1,100,3))],axis=1)
        self.assertTrue(np.array_equal(tone(sample)[0,0],tone(whole)[0,0]))

if __name__=='__main__':unittest.main()
