#!/usr/bin/env python3
"""Consistent snow-preserving display from calibrated Sentinel-2 L2A RGB bands.

Reuses build_landsat.sadj_np/srgb_np (the Swiss natural-colour curve), without
subtracting a Rayleigh term from already atmosphere-corrected BOA reflectance.
Per-band quantification/offsets are read from each product's XML, not inferred
from acquisition date. Source measurements, geometry and scene picks stay intact.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import gzip
import hashlib
import io
import json
from pathlib import Path
import shutil
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image
import onboard_scenes as onboarding

COLOUR_VERSION='reflectance-colour-v1'
CACHE=Path(onboarding.ROOT)/'experiments/onboard/sentinel-colour-cache'
BANDS=('B04','B03','B02')
HTTP_SLOTS=threading.Semaphore(2)
SIGN_LOCK=threading.Lock()
SAS_TOKENS={}


def http(url):
    # Never log signed asset URLs or cache the signing response.
    for attempt in range(7):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'tonguesfromspace/1.0','Accept-Encoding':'gzip'})
            with HTTP_SLOTS:
                with urllib.request.urlopen(req,timeout=180) as r:
                    b=r.read()
                    return gzip.decompress(b) if r.headers.get('Content-Encoding')=='gzip' else b
        except (urllib.error.HTTPError, urllib.error.URLError) as ex:
            if isinstance(ex,urllib.error.HTTPError) and ex.code not in (429,500,502,503,504):raise
            if attempt==6:raise
            retry=ex.headers.get('Retry-After','') if isinstance(ex,urllib.error.HTTPError) else ''
            delay=float(retry) if retry.isdigit() else min(60,3*2**attempt)
            while delay>0:
                interval=min(delay,30);time.sleep(interval);delay-=interval


def signed_asset(href):
    """Reuse container-scoped public-read signatures in memory, never on disk."""
    u=urllib.parse.urlsplit(href);key=(u.netloc,u.path.split('/')[1])
    with SIGN_LOCK:
        cached=SAS_TOKENS.get(key)
        if cached and cached[0]>time.monotonic():
            return urllib.parse.urlunsplit((u.scheme,u.netloc,u.path,cached[1],''))
        sign='https://planetarycomputer.microsoft.com/api/sas/v1/sign?'+urllib.parse.urlencode({'href':href})
        signed=json.loads(http(sign))['href'];s=urllib.parse.urlsplit(signed);q=urllib.parse.parse_qs(s.query)
        if q.get('sr')==['c'] and q.get('se'):
            expiry=datetime.fromisoformat(q['se'][0].replace('Z','+00:00'))
            remaining=(expiry-datetime.now(timezone.utc)).total_seconds()-60
            if remaining>0:SAS_TOKENS[key]=(time.monotonic()+min(1200,remaining),s.query)
        return signed


def metadata(item):
    CACHE.mkdir(parents=True,exist_ok=True)
    path=CACHE/(item['id']+'.xml')
    if not path.exists():
        href=item['assets']['product-metadata']['href']
        signed=signed_asset(href)
        payload=http(signed)
        ET.fromstring(payload)
        path.write_bytes(payload)
    return parse_calibration(path.read_bytes(),item['properties'].get('s2:processing_baseline',''))


def parse_calibration(xml,baseline):
    root=ET.fromstring(xml);nodes=list(root.iter())
    tag=lambda e:e.tag.rsplit('}',1)[-1]
    quantities=[float(e.text) for e in nodes if tag(e)=='BOA_QUANTIFICATION_VALUE']
    if len(set(quantities))!=1 or quantities[0]<=0:raise ValueError('Missing/ambiguous BOA quantification')
    band_ids={}
    for e in nodes:
        if tag(e)=='Spectral_Information':
            physical=e.attrib.get('physicalBand','');band_id=e.attrib.get('bandId')
            if physical.startswith('B') and physical[1:].isdigit():physical='B'+physical[1:].zfill(2)
            band_ids[physical]=band_id
    offsets={e.attrib['band_id']:float(e.text) for e in nodes if tag(e)=='BOA_ADD_OFFSET'}
    if not offsets and float(baseline or 0)>=4:raise ValueError('Modern product has no BOA offset metadata')
    result={}
    for band in BANDS:
        if not offsets:
            result[band]={'quantification':quantities[0],'offset':0.0}
            continue
        if band not in band_ids:raise ValueError('Missing spectral metadata for '+band)
        bid=band_ids[band]
        if offsets and bid not in offsets:raise ValueError('Missing BOA offset for '+band)
        result[band]={'quantification':quantities[0],'offset':offsets.get(bid,0.0)}
    return result


def tone(reflectance):
    # One fixed treatment for all years/tiles: no per-image histogram fitting.
    t=onboarding.bl.TC
    channels=onboarding.bl.sadj_np(np.maximum(reflectance,0))
    neutral=channels.mean(axis=2,keepdims=True)*(1-t['sat'])
    linear=np.clip(neutral+channels*t['sat'],0,1)
    return np.round(255*onboarding.bl.srgb_np(linear)).astype(np.uint8)


def raw_tile(item,bbox,w,h):
    CACHE.mkdir(parents=True,exist_ok=True)
    key=hashlib.sha256(json.dumps([item['id'],bbox,w,h,list(BANDS),'nearest']).encode()).hexdigest()
    path=CACHE/(key+'.npz')
    if path.exists():
        with np.load(path) as z:a=z['data']
    else:
        q=[('collection','sentinel-2-l2a'),('item',item['id']),('asset_as_band','true'),
           ('coord_crs','EPSG:3857'),('dst_crs','EPSG:3857'),('resampling','nearest')]
        q += [('assets',band) for band in BANDS]
        url=f'{onboarding.bl.DATA}/{",".join(str(v) for v in bbox)}/{w}x{h}.npy?{urllib.parse.urlencode(q)}'
        a=np.load(io.BytesIO(http(url)))
        if a.shape!=(4,h,w):raise ValueError('Unexpected raw RGB array shape')
        np.savez_compressed(path,data=a)
    calibration=metadata(item)
    ref=np.empty((h,w,3),np.float32)
    for c,band in enumerate(BANDS):
        q=calibration[band];ref[:,:,c]=(a[c].astype(np.float32)+q['offset'])/q['quantification']
    rgb=tone(ref);valid=(a[3]>0)&np.all(a[:3]!=0,axis=0)
    rgba=np.dstack((rgb,valid.astype(np.uint8)*255))
    return rgba,calibration


def item_metadata(item_id):
    CACHE.mkdir(parents=True,exist_ok=True);p=CACHE/(item_id+'.json')
    if not p.exists():p.write_bytes(http('https://planetarycomputer.microsoft.com/api/stac/v1/collections/sentinel-2-l2a/items/'+item_id))
    return json.loads(p.read_text())


def thumbnail(item,bbox,w,h):
    return raw_tile(item_metadata(item['id']),bbox,w,h)[0]


def recolour(gid):
    from onboard_coverage import catalogue
    d,state,_,bbox,_,_=onboarding.session(gid);d=Path(d);p=d/'sentinel.json';data=json.loads(p.read_text())
    candidates=[c for cs in data['years'].values() for c in cs];total=len(candidates);done=0
    if data.get('image_level') == 'L1C':
        raise RuntimeError('L1C imagery already uses the Swiss rendering. Rebuild with onboard_sentinel_l1c.py; the legacy L2A recolour tool must not replace it.')
    CACHE.mkdir(parents=True,exist_ok=True)
    # Seed full metadata from the catalogue responses already used by the picker.
    sw=onboarding.bl.unmerc(bbox[0],bbox[1]);ne=onboarding.bl.unmerc(bbox[2],bbox[3]);needed={i for c in candidates for i in c['source_ids']}
    for year in sorted({int(c['date'][:4]) for c in candidates}):
        for item in catalogue([sw[1],sw[0],ne[1],ne[0]],year,onboarding.season(state)):
            if item['id'] in needed:(CACHE/(item['id']+'.json')).write_text(json.dumps(item))
    with ThreadPoolExecutor(max_workers=6) as pool:
        for c in candidates:
            path=d/c['img'];old=c.get('original_img') or str(Path(c['img']).with_suffix('.tci.jpg'))
            if not (d/old).exists():shutil.copy2(path,d/old)
            source=np.array(Image.open(d/c['source_map']));h,w=source.shape
            members=[item_metadata(i) for i in c['source_ids']]
            tiles=list(pool.map(lambda i:raw_tile(i,bbox,w,h),members))
            rgb=np.zeros((h,w,3),np.uint8);bad=0
            for j,(rgba,_) in enumerate(tiles,1):
                selected=source==j;bad+=int((selected&(rgba[:,:,3]==0)).sum());rgb[selected]=rgba[:,:,:3][selected]
            if bad:raise ValueError(f"{c['id']}: {bad} chosen source pixels lack valid raw RGB; original preview retained")
            tmp=path.with_suffix('.colour-tmp.jpg');Image.fromarray(rgb).save(tmp,quality=92,optimize=True);tmp.replace(path)
            c.update(original_img=old,colour_rendering=COLOUR_VERSION,colour_settings=dict(onboarding.bl.TC,rayleigh_subtraction=False),colour_calibration={i['id']:q for i,(_,q) in zip(members,tiles)},
                     colour_note='Fixed Swiss soft-contrast/saturation/sRGB curve on calibrated L2A RGB reflectance; no extra Rayleigh subtraction or cross-year histogram matching.')
            done+=1
            (d/'sentinel-colour-progress.json').write_text(json.dumps({'done':done,'total':total,'ready':False}))
            print(done,'/',total,c['date'],'R'+str(c['orbit']).zfill(3),'calibrated and rendered; full source coverage preserved',flush=True)
    # years_by_orbit contains a JSON copy of the same candidates; keep it aligned.
    byid={c['id']:c for c in candidates}
    data['years_by_orbit']={y:{o:[byid[c['id']] for c in cs] for o,cs in groups.items()} for y,groups in data['years_by_orbit'].items()}
    data['version']=data['version'].split('+')[0]+'+'+COLOUR_VERSION
    data['colour_rendering']=COLOUR_VERSION
    data['colour_settings']=dict(onboarding.bl.TC,rayleigh_subtraction=False)
    data['source']='Calibrated Sentinel-2 L2A B04/B03/B02 reflectance, fixed Swiss display curve, same-pass source maps.'
    tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(data,indent=1));tmp.replace(p)
    (d/'sentinel-colour-progress.json').write_text(json.dumps({'done':done,'total':total,'ready':True}))
    onboarding.run_assemble(gid,[])


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('id');args=parser.parse_args();recolour(args.id)
