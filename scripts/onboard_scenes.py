#!/usr/bin/env python3
"""Scene candidates for a glacier of the onboarding flow (docs/ONBOARD_RUNBOOK.md, step 3), without a record in data/regions.

    python3 scripts/onboard_scenes.py <id> landsat [--from 1984] [--to 2016] [--years Y ...]   # Landsat 5/7/8 candidates, painted and stripe-filled by scripts/build_landsat.py
    python3 scripts/onboard_scenes.py <id> sentinel [--from 2015] [--to 2026]                  # Sentinel-2 L2A candidates (Planetary Computer, no Copernicus quota)
    python3 scripts/onboard_scenes.py <id> assemble                                           # one picker file: experiments/onboard/<id>/scenes.json + images

Input: experiments/onboard/<id>/session.json (box, strip, season) and outlines.geojson. The Landsat part is build_landsat.py itself (its find_outlet is replaced by the session's box and outlines,
nothing is written to data/regions), so scoring, colour matching, registration on Sentinel-2 and the Landsat 7 stripe fill are the ones used for the Swiss glaciers. Sentinel-2 pictures are the
original L2A B04/B03/B02 surface-reflectance bands, calibrated from product XML and rendered with the fixed Swiss display curve; source measurements stay unchanged.
"""
import io, json, math, os, sys, time, urllib.parse
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import build_landsat as bl


def session(gid):
    d = os.path.join(ROOT, 'experiments', 'onboard', gid)
    s = json.load(open(os.path.join(d, 'session.json'))); fc = json.load(open(os.path.join(d, 'outlines.geojson')))
    (la0, lo0), (la1, lo1) = s['steps']['box']['params']['bounds']
    (x0, y0), (x1, y1) = bl.merc(la0, lo0), bl.merc(la1, lo1)
    rings = []
    for f in fc['features']:
        g = f['geometry']; polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        rings += [[[lat, lon] for lon, lat in ring] for poly in polys for ring in poly]
    tip = s['steps']['strip']['params']['tip']; c = [(la0 + la1) / 2, (lo0 + lo1) / 2]
    return d, s, rings, [round(x0), round(y0), round(x1), round(y1)], tip, c


def season(s):      # southern hemisphere: the glaciological year runs 1 April to 31 March (owner, 2026-11-11), target day 31 March, window 60 days before to 15 days after as in the Swiss rule; northern: find from, find to, target day (month-day): the austral late summer for the southern hemisphere, else the Swiss one
    return tuple(s.get('season') or ('01-30', '04-15', '03-31'))


def patch_mosaic():
    """Same-day scenes of one satellite from adjacent rows (a 38 km box often lies across two) are joined into one candidate `idA+idB`: the first scene's pixels where it has data, the second's elsewhere.
    Nothing is blended or resampled beyond the cut that build_landsat.py already does; the join is only a fill of no-data. The score, the registration and the stripe fill then see one scene."""
    orig_cut, orig_cand = bl.cut, bl.candidates

    def cut(item, assets, bbox, w, h, nearest):
        ids = item.split('+')
        if len(ids) == 1: return orig_cut(item, assets, bbox, w, h, nearest)
        parts = [orig_cut(i, assets, bbox, w, h, nearest) for i in ids]; shape = parts[0][0]; nb = shape[0]
        out = np.array(parts[0][1], dtype=np.uint16).reshape(shape).copy()
        for sh, a in parts[1:]:
            b = np.array(a, dtype=np.uint16).reshape(sh); hole = out[nb - 1] == 0
            out[:, hole] = b[:, hole]
        import array
        arr = array.array('H'); arr.frombytes(out.tobytes()); return shape, arr

    def candidates(bounds, year):
        fs = orig_cand(bounds, year); groups = {}
        for f in fs: groups.setdefault((f['properties']['datetime'][:10], f['properties']['platform']), []).append(f)
        out = []
        for g in groups.values():
            if len(g) == 1: out += g; continue
            g = sorted(g, key=lambda f: f['properties'].get('landsat:wrs_row', 0))
            c = dict(g[0]); c['id'] = '+'.join(f['id'] for f in g); out.append(c)      # the joined scene replaces its parts
        return out
    bl.cut, bl.candidates = cut, candidates


def run_landsat(gid, argv):
    d, s, rings, bbox, tip, c = session(gid)
    o = dict(id=gid, name=s['name'], lat=c[0], lon=c[1], tip=tip)
    bl.SEASONS['onboard'] = season(s); bl.LEAVE_OUT_YEARS_OPEN = bl.LEAVE_OUT_YEARS_OPEN + (gid,)
    bl.RUN = ['natural']  # Only natural-colour thumbnails are used by this picker.
    patch_mosaic()
    if s.get('landsat_colour_mode') == 'surface-reflectance':
        # The automatic LAND patch includes neighbouring ice in this wide box.
        # Use the builder's NOMATCH path and omit the L8 quantile correction.
        bl.auto_land = lambda *args, **kwargs: None
        original_paint = bl.paint
        bl.paint = lambda a, w, h, cal, qmap=None: original_paint(a, w, h, cal, None)
        bl.fix_l8_blue = lambda *args: None
    bl.find_outlet = lambda oid: (o, 'onboard', rings, 12, bbox)
    sys.argv = ['build_landsat.py', '--outlet', gid, '--alternatives', '4'] + argv
    bl.main()


def run_sentinel(gid, argv):
    """Rank same-datatake tile mosaics independently for each relative orbit."""
    from onboard_sentinel_l1c import build
    y0 = int(argv[argv.index('--from') + 1]) if '--from' in argv else 2015
    y1 = int(argv[argv.index('--to') + 1]) if '--to' in argv else time.localtime().tm_year
    build(gid, y0, y1)


def run_assemble(gid, argv):
    """one picker file: a year with Sentinel-2 candidates shows only those (owner's rule 2026-11-11), a year without shows the Landsat candidates (stripes of Landsat 7 filled by build_landsat.py)"""
    import shutil
    d, s, *_ = session(gid)
    ls = json.load(open(os.path.join(ROOT, '.cache', 'landsat-alts', gid + '.json'))) if os.path.exists(os.path.join(ROOT, '.cache', 'landsat-alts', gid + '.json')) else {'years': {}, 'reasons': {}}
    se = json.load(open(os.path.join(d, 'sentinel.json'))) if os.path.exists(os.path.join(d, 'sentinel.json')) else {'years': {}, 'reasons': {}}
    os.makedirs(os.path.join(d, 'landsat'), exist_ok=True); out = {}
    for year in range(1984, time.localtime().tm_year + 1):
        y = str(year); sc = se['years'].get(y) or []; lc = ls['years'].get(y) or []
        if sc:
            out[y] = dict(source='sentinel-2', reason=se['reasons'].get(y, ''), cands=[dict(c, sat='Sentinel-2', img='sentinel/' + os.path.basename(c['img']), note=(str(len(c.get('tiles', []))) + ' tiles · same pass · 100% preview coverage. No filling across dates.' if c.get('datatake') else 'Single-tile preview; coverage may be incomplete.')) for c in sc])
        else:
            cands = []
            for c in lc:
                src = os.path.join(ROOT, '.cache', 'landsat-alts', gid, c['img']); shutil.copy(src, os.path.join(d, 'landsat', c['img']))
                slc = c['sat'] == 'landsat-7' and c['date'] >= bl.SLC_OFF
                colour_note = 'Surface reflectance; cross-year colour matching disabled. ' if s.get('landsat_colour_mode') == 'surface-reflectance' else ''
                if c['sat'] == 'landsat-8':
                    colour_note += 'Residual colour shifts over shaded ice and water may remain. '
                cands.append(dict(id=c['id'], date=c['date'], sat=c['sat'].replace('landsat-', 'Landsat '), cloud=c['cloud'], tcloud=c['tcloud'], snow=c['snow'], cover=c['cover'], img='landsat/' + c['img'],
                                  note=colour_note + ('Same-day scenes joined. ' if '+' in c['id'] else '') + ('Landsat 7 gap-filled: donor scenes where available, interpolation elsewhere. ' if slc else '') + ('' if c.get('positionConfirmed') else 'Position on the Sentinel-2 mosaic not confirmed. ') + ('Computed registration shift: %s m east, %s m south. ' % tuple(c['shiftM']) if c.get('shiftM') else '')))
            out[y] = dict(source='landsat' if cands else 'none', reason=(ls['reasons'].get(y) or '') if len(cands) < 4 else '', cands=cands)
            out[y]['reason'] = out[y]['reason'].replace('No Landsat 5/7 scene', 'No Landsat scene').replace(' (Landsat 8 is not used: it is over-corrected)', '')
            if not cands and not out[y]['reason']: out[y]['reason'] = se['reasons'].get(y) or 'No scene found.'
    # A Sentinel year with no full-box candidate must stay empty, not fall back
    # silently to Landsat because a particular orbit/date failed the coverage test.
    for y, report in se.get('coverage_report', {}).items():
        if y in out and not se.get('years', {}).get(y) and report.get('total_passes'):
            out[y]['source'] = 'sentinel-2'
            out[y]['cands'] = []
            out[y]['reason'] = se['reasons'].get(y, '') + ' No full-box mosaic passed the checks.'
    json.dump({'years': out, 'w': ls.get('w'), 'h': ls.get('h'), 'season': list(season(s)),
               'orbits': se.get('orbits', []), 'recommendation': se.get('recommendation'),
               'version': se.get('version'), 'image_level': se.get('image_level'),
               'scoring_level': se.get('scoring_level'),
               'choice_migration_warnings': se.get('choice_migration_warnings', []),
               'madeAt': time.strftime('%Y-%m-%d %H:%M')}, open(os.path.join(d, 'scenes.json'), 'w'), indent=1)
    print({y: (v['source'], len(v['cands'])) for y, v in out.items()})


if __name__ == '__main__':
    gid, cmd, rest = sys.argv[1], sys.argv[2], sys.argv[3:]
    {'landsat': run_landsat, 'sentinel': run_sentinel, 'assemble': run_assemble}[cmd](gid, rest)
