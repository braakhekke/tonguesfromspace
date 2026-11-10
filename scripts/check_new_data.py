"""Bi-weekly watch for NEW data about the Swiss glaciers (standard library only, no credentials).

What it looks at (all read-only, public pages and APIs):
  - swisstopo STAC (data.geo.admin.ch): for every collection in STAC_COLLECTIONS the item ids that touch the box of any of our glaciers
    (special flights, swissALTI3D, swissSURFACE3D, SWISSIMAGE, swissBATHY3D, swissBUILDINGS3D, swissTLM3D ...), and the list of ALL STAC collections
    whose id matches a keyword (a new "swissbedrock", a historical orthophoto series, a glacier product shows up here).
  - GLAMOS DOI index (doi.glamos.ch): every product DOI (inventories, length change, volume change, mass balance, ice thickness ...).
  - WGMS (wgms.ch): the versions of the Fluctuations of Glaciers database.
A hit is "new" when its id / DOI is not in the baseline `data/source-watch/switzerland.json`.

Run:  python3 scripts/check_new_data.py            compare with the baseline, print the report (exit 0 = nothing new, 3 = new data, 2 = a source could not be read)
      python3 scripts/check_new_data.py --accept   after you have looked at it: write the current state as the new baseline (commit the file)
      python3 scripts/check_new_data.py --report FILE   also write the report (Markdown) to FILE (the workflow uses this for the issue)
Without a baseline the first run only writes one.

NOTE (owner, 2026-11-10): Switzerland only for now. The check is meant to be extended to the other regions (Iceland, Norway, Svalbard ...): add a
region block to WATCHES, with its own baseline file and sources (see docs/DATA_SEARCH.md, "region-aware": never assume another region has the same sources).
The workflow is .github/workflows/new-data.yml.
This only says that something NEW exists. Whether it is usable (dates, datum, licence) is decided by reading it: docs/DATA_SEARCH.md and a ledger in docs/sources/."""
import argparse, json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
UA = 'tonguesfromspace-data-watch (https://tonguesfromspace.org)'
STAC = 'https://data.geo.admin.ch/api/stac/v1'
STAC_COLLECTIONS = {      # collection id -> what it is (the label of the report)
    'ch.swisstopo.spezialbefliegungen': 'swisstopo special flights (dated aerial DSMs and orthophotos)',
    'ch.swisstopo.swissalti3d': 'swissALTI3D (terrain model)',
    'ch.swisstopo.swisssurface3d-raster': 'swissSURFACE3D Raster (surface model)',
    'ch.swisstopo.swisssurface3d': 'swissSURFACE3D (point cloud)',
    'ch.swisstopo.swissimage-dop10': 'SWISSIMAGE 10 cm (orthophoto)',
    'ch.swisstopo.swissbathy3d': 'swissBATHY3D (lake floors)',
    'ch.swisstopo.swissbuildings3d_3_0': 'swissBUILDINGS3D 3.0',
    'ch.swisstopo.swisstlm3d': 'swissTLM3D (landscape model, glacier outlines)',
}
COLLECTION_KEYWORDS = ('glacier', 'gletscher', 'glacier', 'bedrock', 'swissimage', 'alti', 'surface3d', 'bathy', 'spezial', 'histor', 'siegfried',
                       'dufour', 'dhm', 'ice', 'eis', 'snow', 'firn', 'permafrost', 'lawine', 'gla')
PAGES = {
    'glamos_doi': ('GLAMOS DOI index (all GLAMOS products)', 'https://doi.glamos.ch/', r'10\.18750/[A-Za-z0-9._-]+'),
    'wgms_fog': ('WGMS Fluctuations of Glaciers database versions', 'https://wgms.ch/data_databaseversions/', r'10\.5904/wgms-fog-[A-Za-z0-9-]+'),
}

def get(url, tries=3):
    err = None
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=40).read().decode('utf-8', 'replace')
        except Exception as e:
            err = e; time.sleep(2 * (i + 1))
    raise RuntimeError('%s: %s' % (url, err))

def glacier_boxes():
    t = open(os.path.join(ROOT, 'data', 'glaciers.js'), encoding='utf-8').read(); gl = json.loads(t[t.index('{'):t.rindex('}') + 1])['glaciers']
    return {g['id']: (g['bbox'][0][1], g['bbox'][0][0], g['bbox'][1][1], g['bbox'][1][0]) for g in gl}      # lon0, lat0, lon1, lat1

def stac_items(coll, bbox):
    url = '%s/collections/%s/items?limit=100&bbox=%f,%f,%f,%f' % ((STAC, coll) + tuple(bbox)); ids = []
    while url:
        d = json.loads(get(url)); ids += [f['id'] for f in d['features']]; url = next((l['href'] for l in d['links'] if l['rel'] == 'next'), None)
    return ids

def stac_collections_matching():
    url = STAC + '/collections?limit=100'; out = {}
    while url:
        d = json.loads(get(url))
        for c in d['collections']:
            if any(k in c['id'].lower() for k in COLLECTION_KEYWORDS): out[c['id']] = c.get('title') or ''
        url = next((l['href'] for l in d['links'] if l['rel'] == 'next'), None)
    return out

def collect():
    """-> (state, errors). state: {source key: {'label': ..., 'ids': {id: note}}}"""
    state, errors = {}, []
    boxes = glacier_boxes()
    for coll, label in STAC_COLLECTIONS.items():
        ids = set()
        try:
            for gid, bb in boxes.items(): ids.update(stac_items(coll, bb))
            state['stac:' + coll] = {'label': label, 'url': 'https://data.geo.admin.ch/browser/index.html#/collections/' + coll, 'ids': sorted(ids)}
        except Exception as e: errors.append(str(e))
    try:
        cols = stac_collections_matching(); state['stac:collections'] = {'label': 'STAC collections of data.geo.admin.ch with a matching name (a new product)', 'url': 'https://data.geo.admin.ch/browser/', 'ids': sorted(cols), 'titles': cols}
    except Exception as e: errors.append(str(e))
    for key, (label, url, rx) in PAGES.items():
        try:
            ids = sorted(set(re.findall(rx, get(url)))); state[key] = {'label': label, 'url': url, 'ids': ids}
            if not ids: errors.append('%s: the page was read but no id matched (did the layout change?)' % url)
        except Exception as e: errors.append(str(e))
    return state, errors

def diff(old, new):
    out = {}
    for k, v in new.items():
        added = sorted(set(v['ids']) - set(old.get(k, {}).get('ids', [])))
        if k in old and added: out[k] = added
        elif k not in old: out[k] = ['(new source in the watch list; %d ids recorded)' % len(v['ids'])]
    return out

def report(new_by_source, state, errors):
    L = ['# New Swiss glacier data found', '']
    for k, ids in new_by_source.items():
        s = state[k]; L += ['## %s' % s['label'], s['url'], '']
        for i in ids[:60]: L.append('- `%s`%s' % (i, (' ' + s['titles'].get(i, '')) if 'titles' in s and s['titles'].get(i) else ''))
        if len(ids) > 60: L.append('- ... and %d more' % (len(ids) - 60))
        L.append('')
    if errors: L += ['## Could not be read', ''] + ['- ' + e for e in errors] + ['']
    L += ['## What to do', '',
          '1. Read each new item (dates, datum, licence; docs/DATA_SEARCH.md) and write or extend a ledger in `docs/sources/`.',
          '2. Acknowledge with `python3 scripts/check_new_data.py --accept`, commit `data/source-watch/switzerland.json`.',
          'Until then every run repeats this list.']
    return '\n'.join(L)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--accept', action='store_true'); ap.add_argument('--report'); a = ap.parse_args()
    path = os.path.join(ROOT, 'data', 'source-watch', 'switzerland.json')
    state, errors = collect()
    old = json.load(open(path))['sources'] if os.path.exists(path) else None
    def save():
        os.makedirs(os.path.dirname(path), exist_ok=True)
        merged = dict(old or {}); merged.update(state)      # a source that failed keeps its old baseline
        json.dump({'region': 'switzerland', 'checked': time.strftime('%Y-%m-%d'), 'sources': merged}, open(path, 'w'), indent=1, ensure_ascii=False)
    if old is None:
        save(); print('No baseline yet: wrote %s (%d sources).' % (path, len(state)))
        for e in errors: print('COULD NOT READ:', e)
        return 2 if errors else 0
    new = diff(old, state)
    if a.accept:
        save(); print('Baseline updated.'); return 0
    if new:
        txt = report(new, state, errors); print(txt)
        if a.report: open(a.report, 'w').write(txt)
        return 3
    print('Nothing new in %d sources.' % len(state))
    for e in errors: print('COULD NOT READ:', e)
    if errors and a.report: open(a.report, 'w').write('# Watch could not read some sources\n\n' + '\n'.join('- ' + e for e in errors))
    return 2 if errors else 0

if __name__ == '__main__': sys.exit(main())
