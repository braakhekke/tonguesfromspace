"""Local dated stake forcing and unsmoothed experimental glacier masks.
No original observations, accepted display arcs or owner choices are modified.
"""
import csv,datetime as dt,hashlib,json,math
from pathlib import Path
import numpy as np
from scipy.ndimage import map_coordinates
from shapely.geometry import Polygon,shape,mapping,box,LineString
from shapely.ops import transform
from shapely import make_valid,contains_xy,constrained_delaunay_triangles
from rasterio.features import shapes
from rasterio.transform import from_origin
from pyproj import Transformer

def stake_forcing(path,start=dt.date(2010,1,1),end=dt.date(2027,1,1)):
    """Ice-length anomaly, not glacier-wide SMB or a direct dh/dt observation.
    Reject duplicate-date, negative, >0.5 m/day and >45-day intervals.
    Missing days use month-of-year climatology; disclose measured support.
    Remove 2019-03-31 to 2023-03-31 trend before adding to Koch rate.
    """
    obs=[]
    for r in csv.DictReader(Path(path).read_text().splitlines()):
        try:obs.append((dt.datetime.strptime(r['date'],'%Y/%m/%d').date(),float(r['Cumulative ablation (cm)'])/100))
        except (ValueError,TypeError):continue
    obs=sorted((d,v) for d,v in obs if np.isfinite(v));days=np.array([start+dt.timedelta(days=i) for i in range((end-start).days)]);measured=np.full(len(days),np.nan);rejected=0
    for (d0,v0),(d1,v1) in zip(obs,obs[1:]):
        n=(d1-d0).days
        if n<=0 or n>45 or not 0<=(v1-v0)/n<=.5:rejected+=1;continue
        lo=max(0,(d0-start).days);hi=min(len(days),(d1-start).days)
        measured[lo:hi]=(v1-v0)/n
    month=np.array([d.month for d in days]);clim=np.array([np.nanmean(measured[month==m]) for m in range(1,13)])
    if not np.isfinite(clim).all():raise ValueError('Insufficient stake observations for monthly climatology')
    melt=np.where(np.isfinite(measured),measured,clim[month-1]);cum=np.r_[0,np.cumsum(-melt)];i0=(dt.date(2019,3,31)-start).days;i1=(dt.date(2023,3,31)-start).days;slope=(cum[i1]-cum[i0])/(i1-i0);anomaly=cum-(np.arange(len(cum))-i0)*slope
    def value(day):
        i=(day-start).days
        if not 0<=i<len(anomaly):raise ValueError('Stake forcing date outside derived series')
        return float(anomaly[i])
    annual=[]
    for year in range(2016,2027):
        l=(dt.date(year-1,4,1)-start).days;h=(dt.date(year,4,1)-start).days
        annual.append({'ending_year':year,'measured_day_fraction_computed':float(np.isfinite(measured[l:h]).mean()),'ice_ablation_m_computed':float(melt[l:h].sum()),'gap_days_climatology_computed':int(np.isnan(measured[l:h]).sum())})
    report={'source':str(path),'sha256':hashlib.sha256(Path(path).read_bytes()).hexdigest(),'role':'constraint: local seasonal/interannual ice-ablation anomaly only','annual':annual,'rejected_intervals_computed':rejected,'monthly_ice_ablation_m_per_day_computed':clim.tolist(),'quality_rules':'Only positive-duration intervals <=45 days and ice ablation 0 to 0.5 m/day. Cumulative cm converted to m here. Duplicate dates and negative changes excluded. Missing days use monthly climatology.','spatial_assumption':'Full anomaly at/below S1 nominal elevation 230 m; linear taper to zero at 485 m. Analyst assumption, not observed elevation-bin SMB.','dynamic_assumption':'Compensating mean emergence is implicit: remove 2019-03-31 to 2023-03-31 forcing trend so Koch mean dh/dt is retained. Annual velocity divergence is not yet assimilated.'}
    return value,report

def masks(d,st,arcs,inventory,mx,my,k,sn,cs):
    """Return raw 10m lower-tongue polygon with fixed inventory continuation.
    Preserve 2016/2018 reference-guided topology without Gaussian offset smoothing.
    """
    grid=arcs['properties']['grid'];to_utm=Transformer.from_crs(4326,grid['epsg'],always_xy=True).transform;to_ll=Transformer.from_crs(grid['epsg'],4326,always_xy=True).transform;to_mc=Transformer.from_crs(grid['epsg'],3857,always_xy=True).transform
    def local(x,y,z=None):
        x,y=to_mc(x,y);return ((np.asarray(x)-mx)/k*sn+(np.asarray(y)-my)/k*cs,(np.asarray(x)-mx)/k*cs-(np.asarray(y)-my)/k*sn)
    inv=transform(local,transform(to_utm,inventory));strip=box(-st['back'],-st['half'],st['up'],st['half']);inv=make_valid(inv).intersection(strip);cross=inv.bounds[0]+arcs['properties']['arc_window_m'];zone=box(-st['back'],-st['half'],cross,st['half']);result={};features=[]
    for f in arcs['features']:
        year=f['properties']['year'];reference=f['properties'].get('reference_year');method='Unsmoothed 10 m probability>0.5 raster polygon; no median or Gaussian contour filtering'
        if reference:
            from onboard_refine_tip_arcs import guided_boundary
            rf=next(q for q in arcs['features'] if q['properties']['year']==reference);p=f['properties'];raw=d/'tip-model'/f"{year}-{p['grid_key']}-{hashlib.sha256(p['candidate_id'].encode()).hexdigest()[:12]}.npz"
            line,report=guided_boundary(transform(to_utm,shape(rf['geometry'])),np.load(raw)['a'],grid['bounds'],smooth=False);lower=make_valid(Polygon(transform(local,line).coords)).intersection(zone);method='Target-date L1C reference-guided offset boundary, no Gaussian displacement smoothing; accepted reference topology retained'
        else:
            z=np.load(d/'tip-model'/f'{year}-prediction.npz');pred=(z['prob']>.5)&z['valid'].astype(bool);tr=from_origin(grid['bounds'][0],grid['bounds'][3],10,10)
            candidates=[shape(g) for g,v in shapes(pred.astype('uint8'),mask=pred,transform=tr) if v==1];q=max(candidates,key=lambda q:q.intersection(transform(to_utm,inventory)).area);lower=make_valid(transform(local,q)).intersection(zone)
        full=make_valid(lower.union(inv.intersection(box(cross,-st['half'],st['up'],st['half'])))).intersection(strip);result[year]=full
        # Save the actual hard mask, including closure and upstream continuation.
        to_merc=lambda a,b,z=None:(mx+(np.asarray(a)*sn+np.asarray(b)*cs)*k,my+(np.asarray(a)*cs-np.asarray(b)*sn)*k)
        ll=Transformer.from_crs(3857,4326,always_xy=True).transform
        features.append({'type':'Feature','properties':dict(f['properties'],method=method,smooth_sigma_m=0,mask_upstream='fixed latest inventory',hard_edge=True),'geometry':mapping(transform(ll,transform(to_merc,full)))})
    (d/'tip-arcs-unsmoothed.geojson').write_text(json.dumps({'type':'FeatureCollection','features':features,'properties':{'experimental':True,'hard_edge':True,'outside':'terrain heights with image-classified lake at assumed level','not_independently_validated':True}}))
    return result

def hard_mesh(poly,along,across,ice,context,classes,lake,reference,st,uv_grid,background=None,water_mask=None):
    """Clip top triangles to the exact mask; vertical walls prevent edge ramps.
    Coordinates use (a,b), renderer uses (b,-a). Water plane is a separate sheet.
    """
    vertices=[];kinds=[];changes=[];uvs=[]
    background=np.full_like(context,lake) if background is None else background
    water_mask=np.ones_like(context) if water_mask is None else water_mask
    def sample(a,b,arr):
        rr=(a-along[0])/(along[-1]-along[0])*(len(along)-1);cc=(b-across[0])/(across[-1]-across[0])*(len(across)-1)
        return float(map_coordinates(arr,[[rr],[cc]],order=1,mode='nearest')[0])
    def vertex(a,b,z=None,water=False,terrain=False):
        h=sample(a,b,ice) if z is None else z
        if not np.isfinite(h):h=sample(a,b,context)
        if not np.isfinite(h):raise ValueError('Missing context at hard-edge vertex')
        vertices.extend([b,h,-a]);kinds.append(2 if water else 0 if terrain else round(sample(a,b,classes)));changes.append(0 if water or terrain else h-sample(a,b,reference));uvs.extend([sample(a,b,uv_grid[:,:,0]),sample(a,b,uv_grid[:,:,1])])
    for r in range(len(along)-1):
        for c in range(len(across)-1):
            cell=box(along[r],across[c],along[r+1],across[c+1]);q=poly.intersection(cell)
            if q.is_empty or q.area<1e-6:continue
            for tri in constrained_delaunay_triangles(q).geoms:
                for a,b in list(tri.exterior.coords)[:3]:vertex(a,b)
    parts=list(getattr(poly,'geoms',[poly]))
    for p in parts:
        if p.geom_type!='Polygon':continue
        for ring in [p.exterior,*p.interiors]:
            pts=list(ring.coords)
            for (a,b),(c,e) in zip(pts,pts[1:]):
                for x,y,bottom in [(a,b,False),(c,e,False),(a,b,True),(c,e,False),(c,e,True),(a,b,True)]:vertex(x,y,sample(x,y,background) if bottom else None,water=bottom and sample(x,y,water_mask)>.5,terrain=bottom)
    # Complementary terrain/water surface is clipped away from glacier ice.
    for r in range(len(along)-1):
        for c in range(len(across)-1):
            q=box(along[r],across[c],along[r+1],across[c+1]).difference(poly)
            if q.is_empty or q.area<1e-6:continue
            for tri in constrained_delaunay_triangles(q).geoms:
                for a,b in list(tri.exterior.coords)[:3]:vertex(a,b,sample(a,b,background),water=sample(a,b,water_mask)>.5,terrain=True)
    return np.array(vertices,'float32'),np.array(uvs,'float32'),np.array(kinds,'uint8'),np.nan_to_num(np.array(changes,'float32'))
