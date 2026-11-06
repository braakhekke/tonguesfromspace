#!/usr/bin/env python3
"""Writes data/tongue-arcs.js from the local GlaViTU experiment (experiments/glavitu-annual): the smoothed
yearly arcs of the lowest ~2 km of a glacier outline. LOCAL ONLY for now (experimental model outlines, licence not settled).
    python3 scripts/build_tongue_arcs.py            # the ten Swiss glaciers, from the scene the site shows for each year (pinned_run.py)
    python3 scripts/build_tongue_arcs.py multi      # the older several-scenes-per-year average
Per year: the arc [lng, lat] (5 decimals), the scene dates the model used, and front_behind_sgi_front_m as the experiment states it."""
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUN = 'out_multi_glavitu_regional_ALP' if 'multi' in sys.argv[1:] else 'out_pinned_glavitu_regional_ALP'
SITE_ID = {'B36-26': 'aletsch', 'B56-07': 'gorner', 'B40-07': 'fiescher', 'A54g-11': 'unteraar', 'B83-03': 'corbassiere', 'B57-05': 'zmutt', 'B43-03': 'rhone', 'B56-03': 'sgi-b56-03', 'B53-04': 'sgi-b53-04', 'A54e-24': 'trift'}
SRC = {sid: (inv, f'experiments/glavitu-annual/{RUN}/{inv}/tongue_arcs_smooth.geojson') for inv, sid in SITE_ID.items()
       if os.path.exists(os.path.join(ROOT, f'experiments/glavitu-annual/{RUN}/{inv}/tongue_arcs_smooth.geojson'))}
out = {}
for gid, (inv, rel) in SRC.items():
    arcs = {}
    for f in json.load(open(os.path.join(ROOT, rel)))['features']:
        p = f['properties']
        if p.get('year') is None: continue          # the SGI2023 reference line is the site's own outline layer
        arcs[str(p['year'])] = {'line': [[round(x, 5), round(y, 5)] for x, y in f['geometry']['coordinates']],
                                'scenes': p['scene'], 'front_behind_sgi_front_m': p['front_behind_sgi_front_m']}
    out[gid] = {'inv': inv, 'sigma_m': 20, 'arcs': arcs}
open(os.path.join(ROOT, 'data/tongue-arcs.js'), 'w').write('window.TONGUE_ARCS = ' + json.dumps(out, separators=(',', ':')) + ';\n')
print('data/tongue-arcs.js', {k: len(v['arcs']) for k, v in out.items()})
