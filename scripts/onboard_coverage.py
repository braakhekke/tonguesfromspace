#!/usr/bin/env python3
"""Build the local Sentinel coverage inspector from the onboarding catalogue/SCL cache.

python scripts/onboard_coverage.py <session-id> [--years 2024 2025 2026]
Catalogue geometry is distinct from the nominal projected tile rectangle. Coverage
figures are computed on the same 207 x 207 SCL grid as onboard_scenes.py, never
from the nominal tile bounds. Same-pass groups use the datatake ID, not date alone.
"""
import argparse
import base64
import io
import json
import os
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
import urllib.parse

import numpy as np
from pyproj import Transformer
from rasterio.features import geometry_mask
from rasterio.transform import from_bounds
from shapely.geometry import Polygon, mapping, shape
from shapely.ops import transform

import onboard_scenes as onboarding

N = 207


def packed(a):
    return base64.b64encode(np.packbits(a.reshape(-1), bitorder='little').tobytes()).decode()


def tile_geometry(item):
    asset = item['assets']['SCL']
    bounds = asset['proj:bbox']
    w, s, e, n = bounds
    # Densify the UTM edges before transforming to longitude/latitude.
    pts = [(w + (e-w)*t, n) for t in np.linspace(0, 1, 12)]
    pts += [(e, n + (s-n)*t) for t in np.linspace(0, 1, 12)]
    pts += [(e + (w-e)*t, s) for t in np.linspace(0, 1, 12)]
    pts += [(w, s + (n-s)*t) for t in np.linspace(0, 1, 12)]
    epsg = asset.get('proj:epsg') or item['properties']['proj:epsg']
    return mapping(transform(Transformer.from_crs(epsg, 4326, always_xy=True).transform, Polygon(pts)))


def catalogue(bounds, year, season):
    sf, st, _ = season
    body = json.dumps({'collections': ['sentinel-2-l2a'], 'bbox': bounds,
                       'datetime': f'{year}-{sf}T00:00:00Z/{year}-{st}T23:59:59Z', 'limit': 1000})
    data = json.loads(onboarding.bl.fetch(onboarding.bl.STAC, body))
    items = data['features']
    while True:
        link = next((x for x in data.get('links', []) if x['rel'] == 'next'), None)
        if not link:
            break
        data = json.loads(onboarding.bl.fetch(link['href'], json.dumps(link.get('body', {})) if link.get('method') == 'POST' else None))
        items.extend(data['features'])
    return items


def classes(item, bbox):
    q = [('collection', 'sentinel-2-l2a'), ('item', item['id']), ('assets', 'SCL'),
         ('asset_as_band', 'true'), ('coord_crs', 'EPSG:3857'), ('dst_crs', 'EPSG:3857'), ('resampling', 'nearest')]
    url = f'{onboarding.bl.DATA}/{",".join(str(v) for v in bbox)}/{N}x{N}.npy?{urllib.parse.urlencode(q)}'
    return np.load(io.BytesIO(onboarding.bl.fetch(url, tries=2)))[0].reshape(N, N)


def stats(valid, clear, glacier):
    return {'box': round(float(valid.mean())*100, 2),
            'glacier': round(float(valid[glacier].mean())*100, 2) if glacier.any() else None,
            'clear_box': round(float(clear.mean())*100, 2),
            'clear_glacier': round(float(clear[glacier].mean())*100, 2) if glacier.any() else None}


def build(gid, years):
    directory, state, _, bbox, _, _ = onboarding.session(gid)
    directory = Path(directory)
    bounds = state['steps']['box']['params']['bounds']
    sw = onboarding.bl.unmerc(bbox[0], bbox[1]); ne = onboarding.bl.unmerc(bbox[2], bbox[3])
    search_bounds = [sw[1], sw[0], ne[1], ne[0]]
    season = onboarding.season(state)
    fc = json.loads((directory / 'outlines.geojson').read_text())
    latest = max(fc['features'], key=lambda f: f['properties'].get('date', ''))
    projector = Transformer.from_crs(4326, 3857, always_xy=True).transform
    glacier = geometry_mask([mapping(transform(projector, shape(latest['geometry'])))],
                            out_shape=(N,N), transform=from_bounds(*bbox, N, N), invert=True)
    manifest = {'name': state['name'], 'bounds': bounds, 'years': years, 'season': season, 'grid': N,
                'glacier_outline': latest['properties']['label'],
                'glacier_mask': packed(glacier), 'created': datetime.now(timezone.utc).isoformat(),
                'sources': [{'name': 'Microsoft Planetary Computer, Sentinel-2 L2A catalogue and SCL assets',
                             'url': 'https://planetarycomputer.microsoft.com/api/stac/v1/collections/sentinel-2-l2a'},
                            {'name': 'Copernicus Sentinel-2 product and tiling description',
                             'url': 'https://sentiwiki.copernicus.eu/web/s2-products'}]}
    summaries = {}
    for year in years:
        fs = catalogue(search_bounds, year, season)
        tiles, items, groups, arrays, failures = {}, [], defaultdict(list), {}, []
        for item in fs:
            p = item['properties']; tile = p['s2:mgrs_tile']
            tiles.setdefault(tile, {'id': tile, 'geometry': tile_geometry(item)})
            record = {'id': item['id'], 'tile': tile, 'orbit': p['sat:relative_orbit'],
                      'datetime': p['datetime'], 'platform': p['platform'], 'geometry': item['geometry'],
                      'datatake': p.get('s2:datatake_id'), 'catalogue_cloud_percent': p.get('eo:cloud_cover')}
            try:
                scl = classes(item, bbox)
                valid = scl != 0
                clear = valid & ~np.isin(scl, (1, 3, 8, 9, 10))
                record.update(valid=packed(valid), clear=packed(clear), stats=stats(valid, clear, glacier))
                arrays[record['id']] = (valid, clear)
            except Exception as ex:
                record['mask_error'] = str(ex)
                failures.append(item['id'])
            # Separate satellites, datatakes and relative orbits. Never silently join dates.
            key = (p.get('s2:datatake_id') or p['datetime'][:19], p['platform'], p['sat:relative_orbit'])
            groups[key].append(record['id'])
            items.append(record)
        by_id = {x['id']: x for x in items}
        passes = []
        for (datatake, platform, orbit), ids in groups.items():
            available = [i for i in ids if i in arrays]
            valid = np.zeros((N,N), dtype=bool); clear = valid.copy()
            for i in available:
                valid |= arrays[i][0]; clear |= arrays[i][1]
            passes.append({'id': datatake, 'platform': platform, 'orbit': orbit,
                           'datetime': min(by_id[i]['datetime'] for i in ids), 'items': ids,
                           'stats': stats(valid, clear, glacier), 'mask_failures': len(ids)-len(available),
                           'best_single_box': max((by_id[i]['stats']['box'] for i in available), default=0)})
        passes.sort(key=lambda x: x['datetime'])
        result = {'year': year, 'items': items, 'tiles': list(tiles.values()), 'passes': passes, 'failures': failures}
        path = directory / f'coverage-{year}.json'
        tmp = path.with_suffix('.tmp'); tmp.write_text(json.dumps(result, separators=(',',':'))); os.replace(tmp,path)
        best = max(passes, key=lambda x: (x['stats']['box'] - x['best_single_box'], x['stats']['clear_box']), default=None)
        summaries[str(year)] = {'items': len(items), 'passes': len(passes), 'best_gain': best}
        print(year, len(items), 'tiles/products;', len(passes), 'passes;', len(failures), 'mask failures;',
              'best gain', None if best is None else (best['datetime'][:10],best['best_single_box'],best['stats']['box']), flush=True)
    manifest['summaries'] = summaries
    (directory/'coverage.json').write_text(json.dumps(manifest,indent=1))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('id');ap.add_argument('--years',type=int,nargs='+',default=list(range(2016,2027)))
    args=ap.parse_args();build(args.id,args.years)
