"""Checks for same-pass composition and one-orbit owner selections."""
import importlib.util
from pathlib import Path
import sys
import unittest

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
from onboard_server import validate_scenes


class TestOrbitSelection(unittest.TestCase):
    def setUp(self):
        self.data = {'version':'v1','orbits':[10,53],'years':{
            '2020':{'source':'sentinel-2','cands':[
                {'id':'a','orbit':10,'cover':1.0,'preview_missing_pixels':0},
                {'id':'b','orbit':53,'cover':1.0,'preview_missing_pixels':0}]},
            '2021':{'source':'sentinel-2','cands':[
                {'id':'c','orbit':53,'cover':1.0,'preview_missing_pixels':0}]}}}
        self.params = {'primaryOrbit':10,'candidateVersion':'v1','picks':{'2020':'a'}}

    def test_full_selection_with_year_unavailable_in_chosen_orbit(self):
        validate_scenes(self.params,self.data)

    def test_cannot_mix_orbits_to_fill_missing_year(self):
        self.params['picks']['2021']='c'
        with self.assertRaises(ValueError):validate_scenes(self.params,self.data)

    def test_cannot_choose_another_orbit_in_available_year(self):
        self.params['picks']['2020']='b'
        with self.assertRaises(ValueError):validate_scenes(self.params,self.data)

    def test_explicit_no_usable_image_allowed(self):
        self.params['picks']['2020']='none'
        validate_scenes(self.params,self.data)

    def test_does_not_accept_incomplete_or_stale_choices(self):
        self.params['picks']={}
        with self.assertRaises(ValueError):validate_scenes(self.params,self.data)
        self.params['picks']={'2020':'a'};self.params['candidateVersion']='old'
        with self.assertRaises(ValueError):validate_scenes(self.params,self.data)

    def test_no_auto_acceptance_of_partial_mosaic(self):
        self.data['years']['2020']['cands'][0]['cover']=.999
        with self.assertRaises(ValueError):validate_scenes(self.params,self.data)


@unittest.skipUnless(all(importlib.util.find_spec(x) for x in ('numpy','PIL','rasterio','pyproj','shapely')), 'Optional glacier build dependencies unavailable')
class TestPixelMosaic(unittest.TestCase):
    def test_holes_stay_holes_and_real_black_pixels_are_kept(self):
        import numpy as np
        from onboard_sentinel_mosaics import mosaic_pixels
        first=np.array([[[0,0,0,255],[0,0,0,0],[0,0,0,0]]],dtype=np.uint8)
        second=np.array([[[255,255,255,0],[10,20,30,255],[0,0,0,0]]],dtype=np.uint8)
        scl=np.array([[4,4,4]],dtype=np.uint8)
        rgb,source=mosaic_pixels([first,second],[scl,scl])
        self.assertEqual(source.tolist(),[[1,2,0]])
        self.assertEqual(rgb[0,0].tolist(),[0,0,0])
        self.assertEqual(rgb[0,1].tolist(),[10,20,30])

    def test_classifier_prefers_clear_overlap_from_same_pass(self):
        import numpy as np
        from onboard_sentinel_mosaics import combine_classes
        a=np.array([[9,0,11]],dtype=np.uint8);b=np.array([[4,0,9]],dtype=np.uint8)
        self.assertEqual(combine_classes([a,b]).tolist(),[[4,0,11]])

    def test_renderer_refuses_mixed_datatakes_before_fetch(self):
        from onboard_sentinel_mosaics import render
        items=[{'datatake':'pass-a','platform':'S2A','orbit':10},
               {'datatake':'pass-b','platform':'S2A','orbit':10}]
        with self.assertRaises(ValueError):render({},items,[],[],None,2,2,None)



class TestExplicitOrbitExceptions(unittest.TestCase):
    setUp = TestOrbitSelection.setUp
    def test_explicit_year_exception_accepted_without_changing_main(self):
        self.params['picks']['2021']='c'
        self.params['orbitExceptions']={'2021':{'orbit':53,'reason':'No main-orbit image'}}
        validate_scenes(self.params,self.data)
        self.assertEqual(self.params['primaryOrbit'],10)

    def test_exception_for_one_year_does_not_unlock_another(self):
        self.params['picks']={'2020':'b','2021':'c'}
        self.params['orbitExceptions']={'2021':{'orbit':53,'reason':'Clouds / haze'}}
        with self.assertRaises(ValueError):validate_scenes(self.params,self.data)

    def test_exception_needs_a_reason_and_another_orbit(self):
        for exception in ({'orbit':53,'reason':''},{'orbit':10,'reason':'Clouds'},{'orbit':96,'reason':'Clouds'}):
            self.params['orbitExceptions']={'2020':exception}
            with self.assertRaises(ValueError):validate_scenes(self.params,self.data)

    def test_l1c_picker_cannot_save_l2a_candidate(self):
        self.data['image_level']='L1C';self.data['years']['2020']['cands'][0]['image_level']='L2A'
        with self.assertRaises(ValueError):validate_scenes(self.params,self.data)


@unittest.skipUnless(all(importlib.util.find_spec(x) for x in ('numpy','PIL','rasterio','pyproj','shapely')), 'Optional glacier build dependencies unavailable')
class TestGenuineL1C(unittest.TestCase):
    def setUp(self):
        self.c={'orbit':10,'source_ids':['S2A_MSIL2A_20200207T141731_R010_T18FXK_processing']}

    def test_actual_product_is_l1c_and_matches_mask_acquisition(self):
        from onboard_sentinel_l1c import verify_products
        names=verify_products([{'productId':'S2A_MSIL1C_20200207T141731_N0500_R010_T18FXK_processing.SAFE'}],self.c)
        self.assertEqual(len(names),1)

    def test_l2a_or_another_pass_cannot_be_accepted_as_l1c(self):
        from onboard_sentinel_l1c import verify_products
        for name in ['S2A_MSIL2A_20200207T141731_N0500_R010_T18FXK_x.SAFE',
                     'S2B_MSIL1C_20200207T141731_N0500_R010_T18FXK_x.SAFE',
                     'S2A_MSIL1C_20200207T141731_N0500_R053_T18FXK_x.SAFE',
                     'S2A_MSIL1C_20200208T141731_N0500_R010_T18FXK_x.SAFE']:
            with self.assertRaises(ValueError):verify_products([{'productId':name}],self.c)

if __name__=='__main__':unittest.main()
