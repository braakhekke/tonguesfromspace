#!/usr/bin/env python3
"""Refine a selected-year tip arc around an explicitly accepted reference arc.
The reference supplies topology/search corridor, the target's own six-band L1C
supplies boundary evidence. Weak evidence retains the reference position and is
labelled reference-constrained. No imagery or reference geometry is altered.
"""
import argparse,hashlib,json,math
from pathlib import Path
import numpy as np
from scipy.ndimage import map_coordinates,gaussian_filter,gaussian_filter1d
from scipy.special import expit
from pyproj import Transformer
from shapely.geometry import LineString,mapping,shape
from shapely.ops import transform as project
ROOT=Path(__file__).resolve().parents[1]

def guided_boundary(reference, bands, bounds, cell=10.0, max_shift_m=180.0, smooth=True):
    """Normal-offset dynamic programme; closed topology comes from the reference."""
    step=10.;n=max(3,int(math.ceil(reference.length/step))+1)
    xy=np.array([reference.interpolate(v).coords[0] for v in np.linspace(0,reference.length,n)])
    tangent=np.gradient(xy,axis=0);tangent/=np.maximum(np.linalg.norm(tangent,axis=1)[:,None],1e-9)
    normal=np.column_stack([-tangent[:,1],tangent[:,0]])
    closed=np.vstack([xy,xy[0]]);signed=np.sum(closed[:-1,0]*closed[1:,1]-closed[1:,0]*closed[:-1,1])
    if signed>0:normal=-normal
    green,nir,swir=bands[1].astype(float),bands[3].astype(float),bands[4].astype(float)
    ndsi=(green-swir)/np.maximum(green+swir,1e-6)
    ice=expit((ndsi-.30)/.12)*expit((nir-.09)/.025)
    valid=bands[6]>0
    ice=gaussian_filter(np.where(valid,ice,0),.7)
    offsets=np.arange(-max_shift_m,max_shift_m+cell*.5,cell)
    def sample(distance):
        points=xy[:,None,:]+(offsets[None,:,None]+distance)*normal[:,None,:]
        col=(points[:,:,0]-bounds[0])/cell-.5;row=(bounds[3]-points[:,:,1])/cell-.5
        return map_coordinates(ice,[row,col],order=1,mode='constant',cval=np.nan),map_coordinates(valid.astype(float),[row,col],order=0,mode='constant',cval=0)>.5
    inside,vi=sample(-40);outside,vo=sample(40);centre,vc=sample(0)
    contrast=inside-outside;good=vi&vo&vc&np.isfinite(contrast)&np.isfinite(centre)
    likelihood=-np.log(np.clip(inside,.03,.97))-np.log(np.clip(1-outside,.03,.97))
    # A bounded temporal prior prevents a cloud/shadow hole cutting across the tongue.
    curvature=np.linalg.norm(np.gradient(tangent,axis=0),axis=1)/max(reference.length/(n-1),1e-6)
    limit=np.minimum(max_shift_m,.30/np.maximum(curvature,1e-9))
    local=np.where(good,likelihood+2*(centre-.5)**2,10.)+.18*(offsets[None,:]/75.)**2
    local+=np.where(abs(offsets[None,:])>limit[:,None],1e6,0.)
    transition=.22*((offsets[:,None]-offsets[None,:])/15.)**2
    back=np.zeros((n,len(offsets)),np.int16);score=local[0].copy()
    for i in range(1,n):
        all_cost=score[:,None]+transition;back[i]=all_cost.argmin(axis=0);score=local[i]+all_cost.min(axis=0)
    ix=np.empty(n,int);ix[-1]=score.argmin()
    for i in range(n-1,0,-1):ix[i-1]=back[i,ix[i]]
    chosen=offsets[ix];evidence=contrast[np.arange(n),ix]
    reliable=good[np.arange(n),ix]&(evidence>.30)
    chosen=np.where(reliable,chosen,0.)
    if smooth:chosen=gaussian_filter1d(chosen,2.,mode='nearest')
    chosen[[0,-1]]=0
    chosen=np.clip(chosen,-limit,limit)
    damping=1.0
    result=LineString(xy+chosen[:,None]*normal).simplify(2)
    while not result.is_simple and damping>1/32:
        damping*=.5;result=LineString(xy+(chosen*damping)[:,None]*normal).simplify(2)
    if not result.is_simple:raise ValueError('Refined arc crosses itself; do not publish the correction.')
    chosen*=damping
    return result,{'method':'accepted-reference corridor + target-date L1C NDSI/NIR boundary likelihood, normal-offset dynamic programming','search_half_width_m':max_shift_m,'sampling_m':step,'topology_damping_computed':damping,'displacement_smoothing_sigma_m':20 if smooth else 0,'weak_image_evidence_fraction_computed':round(float((~reliable).mean()),4),'median_displacement_m_computed':round(float(np.median(chosen)),2),'max_displacement_m_computed':round(float(abs(chosen).max()),2),'caution':'Reference-constrained experimental outline; weak image evidence is constrained toward the reference position. Not an independently observed or validated inventory outline.'}

def refine(gid, pairs, remember=True, input_data=None):
    d=ROOT/'experiments/onboard'/gid;path=d/'tip-arcs.geojson';original=path.read_text();data=input_data if input_data is not None else json.loads(original);grid=data['properties']['grid'];epsg=grid['epsg'];to=Transformer.from_crs(4326,epsg,always_xy=True).transform;ll=Transformer.from_crs(epsg,4326,always_xy=True).transform
    session=json.load(open(d/'session.json'));scenes=json.load(open(d/'scenes.json'));by={f['properties']['year']:f for f in data['features']};changes=[]
    for target,reference in pairs:
        if target==reference:raise ValueError('Target and reference year must differ')
        f=by[target];r=by[reference];candidate=session['steps']['scenes']['params']['picks'][str(target)];c=next(c for c in scenes['years'][str(target)]['cands'] if c['id']==candidate)
        if r['properties'].get('candidate_id')!=session['steps']['scenes']['params']['picks'].get(str(reference)):
            raise ValueError('Accepted reference does not match its selected acquisition')
        if f['properties'].get('candidate_id')!=candidate:raise ValueError('Arc does not match the selected target acquisition')
        key=f['properties']['grid_key'];raw=d/'tip-model'/(str(target)+'-'+key+'-'+hashlib.sha256(candidate.encode()).hexdigest()[:12]+'.npz')
        z=np.load(raw);bands=z['a']
        if bands.shape[1:]!=(grid['height'],grid['width']) or str(z['date'])!=c['date']:raise ValueError('Cached target grid/date mismatch')
        accepted=project(to,shape(r['geometry']));line,report=guided_boundary(accepted,bands,grid['bounds'])
        f['geometry']=mapping(project(ll,line));f['properties'].update(reference_year=reference,reference_geometry_sha256=hashlib.sha256(json.dumps(r['geometry'],sort_keys=True).encode()).hexdigest(),refinement=report,source='Target-date L1C boundary, constrained by accepted '+str(reference)+' arc',validated=False)
        changes.append({'target':target,'reference':reference,**report});print(target,'reference',reference,report,flush=True)
    backup=d/'tip-arcs-before-reference-refinement.geojson'
    if not backup.exists():backup.write_text(original)
    data['properties']['reference_refinements']={str(t):r for t,r in pairs};tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(data));tmp.replace(path)
    (d/'tip-refinement-report.json').write_text(json.dumps(changes,indent=2))
    if remember:(d/'tip-arc-reference-rules.json').write_text(json.dumps({'pairs':pairs,'references':{str(r):by[r] for _,r in pairs},'instruction':'Owner explicitly accepted these reference-year arcs; preserve these curves and refine target-year imagery within their corridor. A changed acquisition or grid requires renewed reference review.'},indent=2))
    return changes
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('id');p.add_argument('--reference',action='append',required=True,help='target:accepted-reference');a=p.parse_args();refine(a.id,[tuple(map(int,v.split(':'))) for v in a.reference])
