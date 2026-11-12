"""Source review must retain provenance, one role and current scene dependency."""
import copy
import importlib.util
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('onboard_server_data',ROOT/'scripts/onboard_server.py')
server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
class TestSourceReview(unittest.TestCase):
 def setUp(self):
  self.catalogue={'version':'v1','sources':[{'id':'radar'}]}
  self.session={'steps':{'scenes':{'state':'set','time':'today'}}}
  self.params={'catalogueVersion':'v1','scenesTime':'today','sources':[{'id':'radar','url':'https://example.org/data','role':'constraint','include':True}]}
 def test_current_review_and_owner_added_lead(self):
  self.params['sources'].append({'id':'owner-1','url':'https://example.org/lead','role':'context','include':True,'ownerAdded':True})
  server.validate_data(self.params,self.catalogue,self.session)
 def test_stale_scene_or_catalogue_rejected(self):
  for key in ['scenesTime','catalogueVersion']:
   with self.subTest(key=key):
    p=copy.deepcopy(self.params);p[key]='old'
    with self.assertRaises(ValueError):server.validate_data(p,self.catalogue,self.session)
 def test_roles_links_duplicates_and_lost_provenance_rejected(self):
  for mutation in ['role','url','duplicate','missing']:
   with self.subTest(mutation=mutation):
    p=copy.deepcopy(self.params)
    if mutation=='role':p['sources'][0]['role']='constraint+validation'
    elif mutation=='url':p['sources'][0]['url']='javascript:alert(1)'
    elif mutation=='duplicate':p['sources'].append(copy.deepcopy(p['sources'][0]))
    else:p['sources'][0]['id']='owner-2';p['sources'][0]['ownerAdded']=True
    with self.assertRaises(ValueError):server.validate_data(p,self.catalogue,self.session)
