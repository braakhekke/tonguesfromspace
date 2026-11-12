#!/usr/bin/env python3
"""Genuine L1C picker mosaics rendered with shared/copernicus.ts.

L2A SCL supplies scoring only. Four equal request tiles cover the saved large
box; each is rendered at preview resolution directly through CDSE, without the
public Worker/KV. Product-ID filters enforce one satellite/acquisition/orbit.
Actual L1C products and a per-pixel source map are retained for verification.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date,timedelta
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tarfile
import time
import urllib.error
import urllib.request

import numpy as np
from PIL import Image
import onboard_scenes as onboarding
from onboard_coverage import classes,N
from onboard_sentinel_mosaics import combine_classes,describe,rank,recommendation,atomic_json
import serve

VERSION='same-pass-l1c-v1'
CACHE=Path(onboarding.ROOT)/'experiments/onboard/sentinel-l1c-cache'


def acquisition_key(c):
    return c.get('date'),c.get('orbit'),c.get('datetime')


def preserve_existing_choices(data,d,state,token,base,pool,bbox):
    """Keep owner-picked acquisitions visible; never edit the owner's session."""
    history={}
    for name in ('scenes-before-l1c.json','scenes.json'):
        p=d/name
        if p.exists():
            for row in json.loads(p.read_text()).get('years',{}).values():
                for c in row['cands']:
                    if c.get('datatake'):history[c['id']]=c
    steps=state.get('steps',{})
    latest=sorted([steps[k] for k in ('scenes','scenes_draft') if k in steps],key=lambda x:x['time'],reverse=True)
    saved=(latest[0].get('params',{}) if latest else {}).get('picksByOrbit',{})
    warnings=[]
    for orbit,years in saved.items():
        for year,pick in years.items():
            old=history.get(pick)
            if not old or year not in data['years_by_orbit']:continue
            choices=data['years_by_orbit'][year].setdefault(orbit,[])
            if any(acquisition_key(c)==acquisition_key(old) for c in choices):continue
            # A preserved owner choice replaces the fourth machine-ranked choice.
            record,problem=render(token,base,old,bbox,d/'sentinel',pool)
            if record:
                choices[:]=[record]+choices[:3]
            else:warnings.append({'year':year,'orbit':int(orbit),'previous_id':pick,'reason':problem})
    for year,groups in data['years_by_orbit'].items():
        for choices in groups.values():
            for c in choices:
                aliases=set(c.get('previous_candidate_ids',[]))
                for old in history.values():
                    if acquisition_key(c)==acquisition_key(old):
                        aliases.add(old['id']);aliases.update(old.get('previous_candidate_ids',[]))
                aliases.discard(c['id']);c['previous_candidate_ids']=sorted(aliases)
    data['years']={y:[c for cs in groups.values() for c in cs] for y,groups in data['years_by_orbit'].items()}
    data['choice_migration_warnings']=warnings


def swiss_script():
    js="""const e=require('esbuild');const code=e.buildSync({entryPoints:['shared/copernicus.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;const m={exports:{}};new Function('module','exports',code)(m,m.exports);process.stdout.write(m.exports.imageEvalscript('natural'));"""
    return subprocess.check_output(['node','-e',js],cwd=onboarding.ROOT,text=True)


def pass_identity(candidate):
    ids=candidate.get('mask_source_ids') or candidate['source_ids']
    keys=set()
    for item in ids:
        m=re.match(r'(S2[ABC])_MSIL2A_(\d{8}T\d{6})_R(\d{3})_',item)
        if not m:raise ValueError('Cannot identify mask acquisition '+item)
        keys.add(m.groups())
    if len(keys)!=1:raise ValueError('Mask inputs cross acquisitions')
    satellite,stamp,orbit=keys.pop()
    if int(orbit)!=candidate['orbit']:raise ValueError('Orbit metadata mismatch')
    return satellite,stamp,orbit


def evalscript(base,candidate):
    sat,stamp,orbit=pass_identity(candidate);prefix=f'{sat}_MSIL1C_{stamp}_'
    lines=base.splitlines()
    filt='function preProcessScenes(c){ c.scenes.tiles=c.scenes.tiles.filter(function(t){var n=t.sentinel2ProductId||t.productId||"";return n.indexOf('+json.dumps(prefix)+')===0 && n.indexOf('+json.dumps('_R'+orbit+'_')+')>=0;});return c;}'
    lines=[filt if l.startswith('function preProcessScenes(') else l for l in lines]
    s='\n'.join(lines)
    s=s.replace('output:{ bands:3 }','output:[{id:"default",bands:4},{id:"plain",bands:4},{id:"source",bands:1,sampleType:"UINT16"}]')
    s=s.replace('function evaluatePixel(ss){','function swissPixel(ss){')
    s+='''
function evaluatePixel(ss){
 var p=null,ix=0;for(var i=0;i<ss.length;i++)if(ss[i].dataMask==1){p=ss[i];ix=i+1;break;}
 var rgb=swissPixel(ss);
 return {default:[rgb[0],rgb[1],rgb[2],p?1:0],plain:p?[clip(2.5*p.B04),clip(2.5*p.B03),clip(2.5*p.B02),1]:[0,0,0,0],source:[ix]};
}
function updateOutputMetadata(scenes,inputMetadata,outputMetadata){outputMetadata.userData={tiles:scenes.tiles};}
'''
    return s


def verify_products(tiles,candidate):
    sat,stamp,orbit=pass_identity(candidate);prefix=f'{sat}_MSIL1C_{stamp}_'
    names=[t.get('sentinel2ProductId') or t.get('productId') for t in tiles]
    if any(not n or not n.startswith(prefix) or '_R'+orbit+'_' not in n for n in names):
        raise ValueError('L1C response crossed pass/orbit/satellite or processing level')
    return names


def request(token,body):
    CACHE.mkdir(parents=True,exist_ok=True);key=hashlib.sha256(json.dumps(body,sort_keys=True).encode()).hexdigest()
    path=CACHE/(key+'.tar')
    if path.exists():return path.read_bytes()
    for attempt in range(6):
        req=urllib.request.Request(serve.ROUTES['/cdse/process'],data=json.dumps(body).encode(),headers={
            'Authorization':'Bearer '+token.get(force=attempt>0),'Content-Type':'application/json','Accept':'application/tar'})
        try:
            with urllib.request.urlopen(req,context=serve.CTX,timeout=180) as r:b=r.read()
            with tarfile.open(fileobj=io.BytesIO(b)):pass
            tmp=path.with_suffix('.tmp');tmp.write_bytes(b);tmp.replace(path);return b
        except urllib.error.HTTPError as ex:
            if ex.code not in (401,429,500,502,503,504) or attempt==5:
                try:message=json.loads(ex.read()).get('error',{}).get('message','')[:300]
                except Exception:message=''
                raise RuntimeError(f'CDSE L1C render HTTP {ex.code}: {message}') from None
            delay=ex.headers.get('Retry-After','')
            time.sleep(min(30,float(delay)) if delay.isdigit() else min(30,2**attempt*2))


def one_tile(token,base,candidate,bounds,w,h):
    day=date.fromisoformat(candidate['date'])
    body={'input':{'bounds':{'bbox':bounds,'properties':{'crs':'http://www.opengis.net/def/crs/EPSG/0/3857'}},
          'data':[{'type':'sentinel-2-l1c','dataFilter':{'timeRange':{'from':str(day)+'T00:00:00Z','to':str(day+timedelta(days=2))+'T00:00:00Z'},'mosaickingOrder':'leastCC'},'processing':{'upsampling':'BILINEAR'}}]},
          'output':{'width':w,'height':h,'responses':[{'identifier':i,'format':{'type':'application/json' if i=='userdata' else 'image/png'}} for i in ('default','plain','source','userdata')]},
          'evalscript':evalscript(base,candidate)}
    raw=request(token,body)
    with tarfile.open(fileobj=io.BytesIO(raw)) as tar:
        files={Path(m.name).name:tar.extractfile(m).read() for m in tar.getmembers() if m.isfile()}
    user=json.loads(files['userdata.json']);tiles=user['tiles'];names=verify_products(tiles,candidate)
    rgb=np.array(Image.open(io.BytesIO(files['default.png'])).convert('RGBA'))
    plain=np.array(Image.open(io.BytesIO(files['plain.png'])).convert('RGBA'))
    source=np.array(Image.open(io.BytesIO(files['source.png']))).astype(np.uint16)
    if rgb.shape!=(h,w,4) or source.shape!=(h,w):raise ValueError('Unexpected L1C tile shape')
    if np.any(source>len(names)):raise ValueError('Unknown L1C source index')
    if not np.array_equal(source>0,rgb[:,:,3]>0):raise ValueError('L1C source and alpha masks disagree')
    return rgb,plain,source,names,tiles


def render(token,base,candidate,bbox,out,pool):
    w,h=960,1032 # even dimensions, equal 2 x 2 tiles
    x0,y0,x1,y1=bbox;xm=(x0+x1)/2;ym=(y0+y1)/2
    bounds=[[x0,ym,xm,y1],[xm,ym,x1,y1],[x0,y0,xm,ym],[xm,y0,x1,ym]]
    parts=list(pool.map(lambda b:one_tile(token,base,candidate,b,w//2,h//2),bounds))
    rgba=np.zeros((h,w,4),np.uint8);plain=rgba.copy();source=np.zeros((h,w),np.uint16);products=[];metadata={}
    for k,(a,b,src,names,tiles) in enumerate(parts):
        local=np.zeros(len(names)+1,np.uint16)
        for i,name in enumerate(names,1):
            if name not in products:products.append(name)
            local[i]=products.index(name)+1;metadata[name]=tiles[i-1]
        yy=(k//2)*(h//2);xx=(k%2)*(w//2);sl=np.s_[yy:yy+h//2,xx:xx+w//2]
        rgba[sl]=a;plain[sl]=b;source[sl]=local[src]
    missing=int((rgba[:,:,3]==0).sum())
    if missing:return None,{'date':candidate['date'],'orbit':candidate['orbit'],'reason':'incomplete L1C preview','missing_pixels':missing}
    used=set(np.unique(source).tolist());used.discard(0)
    used_products=[p for i,p in enumerate(products,1) if i in used]
    tiles=sorted({re.search(r'_T(\w{5})_',p).group(1) for p in used_products})
    if not tiles:raise ValueError('No valid L1C source tile covers the preview')
    key=hashlib.sha256(json.dumps([used_products,bbox,base,VERSION]).encode()).hexdigest()[:10]
    stem=f"{candidate['date']}-R{candidate['orbit']:03d}-l1c-{key}"
    Image.fromarray(rgba[:,:,:3]).save(out/(stem+'.jpg'),quality=92,optimize=True)
    Image.fromarray(plain[:,:,:3]).save(out/(stem+'.plain.jpg'),quality=92,optimize=True)
    Image.fromarray(source).save(out/(stem+'.sources.png'))
    return dict(candidate,id='S2-L1C-MOSAIC-'+stem,img='sentinel/'+stem+'.jpg',original_img='sentinel/'+stem+'.plain.jpg',
        source_map='sentinel/'+stem+'.sources.png',source_ids=used_products,
        mask_source_ids=candidate.get('mask_source_ids') or candidate['source_ids'],tiles=tiles,
        l1c_source_metadata=metadata,source_map_legend={str(i):p for i,p in enumerate(products,1)},
        mask_cover=candidate.get('mask_cover',candidate['cover']),cover=1.0,image_level='L1C',scoring_level='L2A',
        preview_width=w,preview_height=h,preview_missing_pixels=0,preview_cover=1.0,
        colour_rendering='swiss-l1c-v1',colour_note='Exact Swiss L1C true-colour evalscript, including Rayleigh terms; no temporal filling.',
        coverage_check='Every L1C preview pixel has an alpha mask and a verified same-pass L1C source product; 10 m output needs a further check.'),None


def build(gid,y0=2015,y1=2026):
    import base64
    d,state,rings,bbox,tip,_=onboarding.session(gid);d=Path(d);out=d/'sentinel';out.mkdir(exist_ok=True)
    creds=serve.load_credentials(ask=False)
    if not creds or not all(creds):raise RuntimeError('Local CDSE credentials unavailable')
    token=serve.Token(*creds);base=swiss_script();manifest=json.loads((d/'coverage.json').read_text())
    glacier=np.unpackbits(np.frombuffer(base64.b64decode(manifest['glacier_mask']),np.uint8),bitorder='little')[:N*N].reshape(N,N).astype(bool)
    _,tong=onboarding.bl.masks_for(rings,tip,bbox,n=N);tongue=np.zeros(N*N,bool);tongue[list(tong)]=True;tongue=tongue.reshape(N,N)
    sf,st,tg=onboarding.season(state);years={};reasons={};reports={};orbits=set()
    with ThreadPoolExecutor(max_workers=2) as pool:
        for year in range(y0,y1+1):
            p=d/f'coverage-{year}.json'
            if not p.exists():years[str(year)]={};reasons[str(year)]='No Sentinel scoring records in this season.';continue
            cov=json.loads(p.read_text());by={i['id']:i for i in cov['items']};grouped={};excluded=[]
            for pas in cov['passes']:
                items=[by[i] for i in pas['items']];arrays=[classes(i,bbox) for i in items];scl=combine_classes(arrays)
                c=describe(pas,items,scl,glacier,tongue,date.fromisoformat(f'{year}-{tg}'));orbits.add(c['orbit'])
                # A proposal gate only. Final coverage is judged from L1C alpha, not from L2A's mask holes.
                if c['cover']<.98:
                    excluded.append({'date':c['date'],'orbit':c['orbit'],'reason':'low scoring-mask spatial coverage','mask_cover':c['cover']});continue
                grouped.setdefault(c['orbit'],[]).append(c)
            result={}
            for orbit in sorted(orbits):
                choices=[];seen=set()
                for c in sorted(grouped.get(orbit,[]),key=rank):
                    if c['date'] in seen:continue
                    record,problem=render(token,base,c,bbox,out,pool)
                    if record:
                        choices.append(record);seen.add(c['date']);print(year,f'R{orbit:03d}',c['date'],'L1C',len(record['tiles']),'tiles, full preview; glacier cloud',round(100*c['cloud'],1),flush=True)
                    else:excluded.append(problem)
                    if len(choices)==4:break
                result[str(orbit)]=choices
            years[str(year)]=result;reasons[str(year)]=f'{len(cov["passes"])} same-pass proposals scored with L2A masks. Selectable images are L1C with 100% verified preview coverage.'
            reports[str(year)]={'total_passes':len(cov['passes']),'excluded':excluded}
            atomic_json(d/'sentinel-l1c-progress.json',{'year_finished':year,'through':y1,'ready':False})
    rec=recommendation(years,sorted(orbits));active=[s['orbit'] for s in rec['summaries'] if s['years_with_full_coverage']];rec['summaries']=[s for s in rec['summaries'] if s['orbit'] in active]
    data={'version':VERSION,'image_level':'L1C','scoring_level':'L2A','colour_rendering':'swiss-l1c-v1','orbits':active,
        'years_by_orbit':years,'years':{y:[c for cs in groups.values() for c in cs] for y,groups in years.items()},
        'recommendation':rec,'coverage_report':reports,'reasons':reasons,'season':[sf,st,tg],
        'w':960,'h':1032,'madeAt':time.strftime('%Y-%m-%d %H:%M'),
        'source':'Genuine CDSE Sentinel-2 L1C imagery, exact Swiss rendering; L2A masks for scoring only.'}
    with ThreadPoolExecutor(max_workers=2) as pool:
        preserve_existing_choices(data,d,state,token,base,pool,bbox)
    atomic_json(d/'sentinel.json',data);onboarding.run_assemble(gid,[])
    atomic_json(d/'sentinel-l1c-progress.json',{'year_finished':y1,'through':y1,'ready':True})
    print('L1C build complete. Recommended orbit',rec['orbit'],flush=True)


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('id');ap.add_argument('--from',dest='y0',type=int,default=2015);ap.add_argument('--to',dest='y1',type=int,default=2026);a=ap.parse_args();build(a.id,a.y0,a.y1)
