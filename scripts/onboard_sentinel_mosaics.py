#!/usr/bin/env python3
"""Same-datatake Sentinel mosaics, ranked separately for each relative orbit.

No temporal filling or interpolation of missing image areas. A candidate must have
100% usable SCL sample coverage and 100% alpha coverage on the rendered preview.
The final 10 m export still needs its own full-resolution coverage check.
"""
import argparse
import hashlib
import io
import json
import math
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
import time
import urllib.parse

import numpy as np
from PIL import Image
import onboard_scenes as onboarding
from onboard_coverage import classes, build as build_coverage, N

VERSION = 'same-pass-v1'


def atomic_json(path, data):
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(data,indent=1));tmp.replace(path)


def quality(scl):
    q=np.zeros(scl.shape,np.uint8)
    for c,v in [(3,4),(10,5),(8,6),(9,7),(1,254),(0,255)]:q[scl==c]=v
    return q


def combine_classes(arrays):
    out=np.zeros_like(arrays[0]);score=np.full(out.shape,255,np.uint8)
    for a in arrays:
        q=quality(a);take=q<score;out[take]=a[take];score[take]=q[take]
    return out


def describe(p, items, scl, glacier, tongue, target):
    valid=(scl!=0)&(scl!=1);cloud=np.isin(scl,(8,9,10));shadow=scl==3;snow=scl==11
    def fraction(mask,area):
        den=area&valid
        return float(mask[den].mean()) if den.any() else 1.0
    cloud_g=fraction(cloud,glacier);cloud_t=fraction(cloud,tongue)
    shadow_g=fraction(shadow,glacier)
    return {'date':p['datetime'][:10],'time':p['datetime'][11:19], 'datetime':p['datetime'],
            'datatake':p['id'],'orbit':p['orbit'],'platform':p['platform'],'sat':'sentinel-2',
            'source_ids':[i['id'] for i in items], 'tiles':sorted({i['tile'] for i in items}),
            'cloud':cloud_g,'tcloud':cloud_t,'shadow':shadow_g,'snow':fraction(snow,glacier),
            'cover':float(valid.mean()),'sample_missing_pixels':int((~valid).sum()),
            'clear':bool(cloud_g<=.15 and cloud_t<=.05),
            'days_from_target':abs((date.fromisoformat(p['datetime'][:10])-target).days),
            'quality_penalty':cloud_g+2*cloud_t+.5*shadow_g}


def rank(c):
    return (not c['clear'], round(c['quality_penalty'],2), c['days_from_target'], c['date'])


def thumbnail(item,bbox,w,h):
    from onboard_sentinel_colour import thumbnail as calibrated_thumbnail
    a=calibrated_thumbnail(item,bbox,w,h)
    if a.shape[:2]!=(h,w):raise ValueError('Unexpected preview shape')
    return a


def mosaic_pixels(rgbs,scls):
    h,w=rgbs[0].shape[:2];rgb=np.zeros((h,w,3),np.uint8);sources=np.zeros((h,w),np.uint8)
    best=np.full((h,w),256,np.uint16)
    for j,(image,scl) in enumerate(zip(rgbs,scls),1):
        resized=np.array(Image.fromarray(scl).resize((w,h),Image.Resampling.NEAREST))
        score=quality(resized).astype(np.uint16)
        # PNG alpha is the actual raster valid-data mask, not a black-colour test.
        take=(image[:,:,3]>0)&(score<best)
        rgb[take]=image[:,:,:3][take];sources[take]=j;best[take]=score[take]
    return rgb,sources


def render(candidate,items,arrays,bbox,out,w,h,pool):
    signatures={(i['datatake'],i['platform'],i['orbit']) for i in items}
    if len(signatures)!=1:raise ValueError('Refused a mosaic crossing datatakes/satellites/orbits')
    rgb_tiles=list(pool.map(lambda i:thumbnail(i,bbox,w,h),items))
    rgb,source_map=mosaic_pixels(rgb_tiles,arrays)
    missing=int((source_map==0).sum())
    if missing:return None,{'reason':'preview has no-data pixels','missing_pixels':missing,'date':candidate['date'],'orbit':candidate['orbit']}
    digest=hashlib.sha256((' '.join(candidate['source_ids'])+VERSION).encode()).hexdigest()[:10]
    stem=f"{candidate['date']}-R{candidate['orbit']:03d}-{digest}"
    Image.fromarray(rgb).save(out/(stem+'.jpg'),quality=92,optimize=True)
    Image.fromarray(source_map).save(out/(stem+'.sources.png'))
    from onboard_sentinel_colour import COLOUR_VERSION
    before=out/(stem+'.tci.jpg')
    return dict(candidate,id='S2-MOSAIC-'+stem,img='sentinel/'+stem+'.jpg',
                colour_rendering=COLOUR_VERSION,
                **({'original_img':'sentinel/'+before.name} if before.exists() else {}),
                source_map='sentinel/'+stem+'.sources.png', preview_width=w,preview_height=h,
                preview_missing_pixels=0,preview_cover=1.0,
                source_map_legend={str(j):i['id'] for j,i in enumerate(items,1)},
                coverage_check='100% SCL sample and preview alpha; final 10 m check still required'),None


def recommendation(years,orbits):
    summaries=[]
    for orbit in orbits:
        per=[]
        for y,groups in years.items():
            c=groups.get(str(orbit),[])
            per.append({'year':int(y),'candidates':len(c),'has_clear':any(i['clear'] for i in c),
                        'best_cloud':min((i['cloud'] for i in c),default=None),
                        'best_tongue_cloud':min((i['tcloud'] for i in c),default=None),
                        'best_penalty':min((i['quality_penalty'] for i in c),default=None)})
        vals=[x['best_penalty'] for x in per if x['best_penalty'] is not None]
        summaries.append({'orbit':orbit,'years_with_full_coverage':sum(x['candidates']>0 for x in per),
                          'years_with_clear_choice':sum(x['has_clear'] for x in per),
                          'mean_best_annual_penalty':sum(vals)/len(vals) if vals else None,
                          'years':per})
    order=sorted(summaries,key=lambda x:(-x['years_with_clear_choice'],-x['years_with_full_coverage'],x['mean_best_annual_penalty'] if x['mean_best_annual_penalty'] is not None else math.inf,x['orbit']))
    return {'orbit':order[0]['orbit'] if order else None,'summaries':summaries,
            'basis':'Most years with a full-box choice passing <=15% glacier cloud and <=5% tongue cloud; then full-box year availability; then mean best annual cloud/shadow penalty.',
            'geometry_note':'Orbit consistency reduces viewing-angle changes. Stable-bedrock registration has not been measured here, so this is not a jitter guarantee.'}


def build(gid,y0,y1):
    import base64
    d,state,rings,bbox,tip,_=onboarding.session(gid);d=Path(d);out=d/'sentinel';out.mkdir(exist_ok=True)
    years_needed=[y for y in range(max(y0,2016),y1+1) if not (d/f'coverage-{y}.json').exists()]
    if years_needed:build_coverage(gid,years_needed)
    manifest=json.loads((d/'coverage.json').read_text());sf,st,tg=onboarding.season(state)
    glacier=np.unpackbits(np.frombuffer(base64.b64decode(manifest['glacier_mask']),np.uint8),bitorder='little')[:N*N].reshape(N,N).astype(bool)
    _,tong=onboarding.bl.masks_for(rings,tip,bbox,n=N)
    tongue=np.zeros(N*N,bool);tongue[list(tong)]=True;tongue=tongue.reshape(N,N)
    w=960;h=round(w*(bbox[3]-bbox[1])/(bbox[2]-bbox[0]));all_years={};reasons={};report={};orbits=set()
    with ThreadPoolExecutor(max_workers=6) as pool:
        for year in range(y0,y1+1):
            path=d/f'coverage-{year}.json'
            if not path.exists():
                all_years[str(year)]={};reasons[str(year)]='No Sentinel-2 L2A coverage records available for this year.';continue
            data=json.loads(path.read_text());byid={i['id']:i for i in data['items']};grouped=defaultdict(list);payload={};excluded=[]
            for p in data['passes']:
                items=sorted([byid[i] for i in p['items']],key=lambda i:(-i.get('stats',{}).get('box',0),i['tile'],i['id']))
                # Full SCL arrays retained for all same-pass products, including tiny slivers.
                try:arrays=list(pool.map(lambda i:classes(i,bbox),items))
                except Exception as ex:excluded.append({'date':p['datetime'][:10],'orbit':p['orbit'],'reason':str(ex)});continue
                composite=combine_classes(arrays)
                desc=describe(p,items,composite,glacier,tongue,date.fromisoformat(f'{year}-{tg}'));orbit=p['orbit'];orbits.add(orbit)
                if desc['sample_missing_pixels']:
                    excluded.append({'date':desc['date'],'orbit':orbit,'reason':'incomplete SCL coverage','missing_pixels':desc['sample_missing_pixels'],'cover':desc['cover']});continue
                key=desc['datatake'];grouped[orbit].append(desc);payload[key]=(items,arrays)
            result={}
            for orbit in sorted(orbits):
                picks=[];seen=set()
                for c in sorted(grouped[orbit],key=rank):
                    if c['date'] in seen:continue
                    items,arrays=payload[c['datatake']]
                    try:record,problem=render(c,items,arrays,bbox,out,w,h,pool)
                    except Exception as ex:record=None;problem={'date':c['date'],'orbit':orbit,'reason':str(ex)}
                    if record:
                        picks.append(record);seen.add(c['date'])
                        print(year,f'R{orbit:03d}',c['date'],len(c['tiles']),'tiles; cloud',round(100*c['cloud'],1),'tongue',round(100*c['tcloud'],1),'100% preview',flush=True)
                    else:excluded.append(problem)
                    if len(picks)==4:break
                result[str(orbit)]=picks
            all_years[str(year)]=result
            reasons[str(year)]=f'{len(data["passes"])} passes inspected; only 100% SCL-sample and preview coverage accepted. No filling across dates.'
            report[str(year)]={'total_passes':len(data['passes']),'excluded':excluded,'complete_candidates':{str(o):len(grouped[o]) for o in sorted(orbits)}}
            atomic_json(d/'sentinel-mosaic-progress.json',{'year_finished':year,'through':y1,'version':VERSION,'ready':False})
    rec=recommendation(all_years,sorted(orbits))
    available_orbits=[x['orbit'] for x in rec['summaries'] if x['years_with_full_coverage']]
    excluded_orbits=sorted(orbits-set(available_orbits))
    rec['summaries']=[x for x in rec['summaries'] if x['orbit'] in available_orbits]
    from onboard_sentinel_colour import COLOUR_VERSION
    result={'version':VERSION+'+'+COLOUR_VERSION,'colour_rendering':COLOUR_VERSION,
            'w':w,'h':h,'season':[sf,st,tg],'orbits':available_orbits,
            'excluded_orbits_without_full_coverage':excluded_orbits,'years_by_orbit':all_years,
            'years':{y:[c for cs in groups.values() for c in cs] for y,groups in all_years.items()},
            'reasons':reasons,'coverage_report':report,'recommendation':rec,
            'madeAt':time.strftime('%Y-%m-%d %H:%M'),'source':'Same-datatake calibrated Sentinel-2 L2A B04/B03/B02 reflectance with the fixed Swiss display curve; no histogram matching, temporal filling or scene registration.'}
    atomic_json(d/'sentinel.json',result)
    atomic_json(d/'sentinel-mosaic-progress.json',{'year_finished':y1,'through':y1,'version':VERSION,'ready':True})
    print('Recommended orbit',rec['orbit'],rec['summaries'],flush=True)
    onboarding.run_assemble(gid,[])


if __name__=='__main__':
    from onboard_sentinel_l1c import build as build_l1c
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('id');p.add_argument('--from',dest='y0',type=int,default=2015);p.add_argument('--to',dest='y1',type=int,default=2026)
    a=p.parse_args();build_l1c(a.id,a.y0,a.y1)
