#!/usr/bin/env python3
"""Local Koch-style bed + thickness reference, projected with a published dh/dt.
A coarse shared-source reconstruction, not an independent measured DEM series.
Original rasters, picked images and owner approvals are never modified.
"""
import argparse,base64,datetime as dt,hashlib,json,math
from pathlib import Path
import numpy as np,rasterio
from scipy.ndimage import map_coordinates
from shapely.geometry import Polygon,shape
from shapely import contains_xy
from pyproj import Transformer
from onboard_surface_constraints import stake_forcing,masks,hard_mesh
ROOT=Path(__file__).resolve().parents[1]

def sample_raster(path,e,n,crs,assume_crs=None,context=False):
    with rasterio.open(path) as r:
        source_crs=r.crs or assume_crs
        if source_crs is None:raise ValueError('Missing source CRS: an explicit, documented assumption is required')
        x,y=Transformer.from_crs(crs,source_crs,always_xy=True).transform(e,n)
        col,row=(~r.transform)*(x,y);inside=(col>=0)&(col<r.width)&(row>=0)&(row<r.height);row=row-.5;col=col-.5
        if context:row=np.clip(row,0,r.height-1);col=np.clip(col,0,r.width-1)
        a=r.read(1).astype(float);ok=np.isfinite(a)
        if r.nodata is not None:ok&=a!=r.nodata
        weight=map_coordinates(ok.astype(float),[row,col],order=1,mode='constant',cval=0)
        value=map_coordinates(np.where(ok,a,0),[row,col],order=1,mode='constant',cval=0)
        value=np.where((weight>(.01 if context else .999))&inside,value/np.maximum(weight,1e-9),np.nan)
        metadata={'file':Path(path).name,'sha256':hashlib.sha256(Path(path).read_bytes()).hexdigest(),'native_crs':str(r.crs) if r.crs else None,'assumed_crs':str(assume_crs) if not r.crs else None,'transform':list(r.transform)[:6],'resolution':list(r.res),'bounds':list(r.bounds)}
        return value,metadata

def reconstruct(bed,thickness,rate,years_from_reference):
    ok=np.isfinite(bed)&np.isfinite(thickness)&(thickness>0)&np.isfinite(rate)
    return np.where(ok,np.maximum(bed,bed+thickness+rate*years_from_reference),np.nan)

def build(args):
    d=ROOT/'experiments/onboard'/args.id
    if args.crs is None:
        with rasterio.open(args.bed) as source:args.crs=source.crs
        if args.crs is None:raise ValueError('Bed CRS is missing; specify the model CRS explicitly')
    s=json.load(open(d/'session.json'));sc=json.load(open(d/'scenes.json'));st=s['steps']['strip']['params'];tip=st['tip'];arcs=json.load(open(d/'tip-arcs.geojson'));arc_by={f['properties']['year']:f for f in arcs['features']}
    na=math.ceil((st['up']+st['back'])/100);nb=math.ceil(2*st['half']/100);along=np.linspace(-st['back'],st['up'],na+1);across=np.linspace(-st['half'],st['half'],nb+1);aa,bb=np.meshgrid(along,across,indexing='ij');k=1/math.cos(math.radians(tip[0]));sn,cs=math.sin(math.radians(st['azimuth'])),math.cos(math.radians(st['azimuth']));mx,my=Transformer.from_crs(4326,3857,always_xy=True).transform(tip[1],tip[0]);X=mx+(aa*sn+bb*cs)*k;Y=my+(aa*cs-bb*sn)*k;lo,la=Transformer.from_crs(3857,4326,always_xy=True).transform(X,Y);E,N=Transformer.from_crs(3857,args.crs,always_xy=True).transform(X,Y)
    bed,bmeta=sample_raster(args.bed,E,N,args.crs);thick,hmeta=sample_raster(args.thickness,E,N,args.crs,args.assume_thickness_crs);rate,rmeta=sample_raster(args.rate,E,N,args.crs);support=np.isfinite(bed)&np.isfinite(thick)&(thick>0)&np.isfinite(rate)
    if not support.any():raise ValueError('No overlapping bed, positive thickness and dh/dt support')
    inventory=json.load(open(d/'outlines.geojson'));f=max(inventory['features'],key=lambda f:f['properties'].get('date',''));inventory_mask=contains_xy(shape(f['geometry']),lo,la);inside_share=float(inventory_mask[support].mean())
    if inside_share<.9:raise ValueError('Thickness/source grids fail the spatial inventory-overlap check')
    context=np.full_like(bed,np.nan)
    for p in args.context:
        a,_=sample_raster(p,E,N,args.crs,context=True);context=np.where(np.isfinite(context),context,a)
    if args.lake_level is None:raise ValueError('Hard outside mask requires an explicit assumed lake level')
    glacier_masks=masks(d,st,arcs,shape(f['geometry']),mx,my,k,sn,cs)
    forcing,forcing_report=stake_forcing(d/'research/6991282/ablation_Moreno_MTK_2021.csv')
    (d/'stake-forcing.json').write_text(json.dumps(forcing_report,indent=2))
    taper=np.clip((485-(bed+thick))/(485-230),0,1)
    hard_geometries=[];raw_surfaces=[];mask_arrays=[]
    refday=dt.date.fromisoformat(args.nominal_epoch);years=[];surfaces=[];classes=[];records=[];textures=[]
    (lat0,lon0),(lat1,lon1)=st['box'];bx0,by0=Transformer.from_crs(4326,3857,always_xy=True).transform(lon0,lat0);bx1,by1=Transformer.from_crs(4326,3857,always_xy=True).transform(lon1,lat1);uv=np.stack([(X-bx0)/(bx1-bx0),(Y-by0)/(by1-by0)],axis=-1).astype('float32')
    for year in range(2016,2027):
        pick=s['steps']['scenes']['params']['picks'].get(str(year));c=next((c for c in sc['years'][str(year)]['cands'] if c['id']==pick),None)
        if c is None:continue
        day=dt.date.fromisoformat(c['date']);delta=(day-refday).days/365.25
        anomaly=forcing(day)-forcing(refday)
        model=reconstruct(bed,thick,rate,delta)
        model=np.where(support,np.maximum(bed,model+taper*anomaly),np.nan)
        raw=np.where(support,model,context)
        polygon=glacier_masks[year];kept=contains_xy(polygon,aa,bb)
        # Restore non-glacier land. Optical water evidence is used only outside ice;
        # low, already level GLO-30 water supplies context beyond the optical arc grid.
        arc=arc_by[year];key=arc['properties']['grid_key'];optical=np.load(d/'tip-model'/f"{year}-{key}-{hashlib.sha256(pick.encode()).hexdigest()[:12]}.npz")['a'];ag=arcs['properties']['grid']
        e,n=Transformer.from_crs(args.crs,ag['epsg'],always_xy=True).transform(E,N);col=(e-ag['bounds'][0])/10-.5;row=(ag['bounds'][3]-n)/10-.5
        green=map_coordinates(optical[1],[row,col],order=1,mode='constant',cval=np.nan);nir=map_coordinates(optical[3],[row,col],order=1,mode='constant',cval=np.nan);swir=map_coordinates(optical[4],[row,col],order=1,mode='constant',cval=np.nan)
        optical_water=(nir<.09)&(green>nir*1.25)&(swir<.06)&((context<args.lake_level+25)|inventory_mask)
        context_water=(abs(context-args.lake_level)<3)&~inventory_mask
        water=~kept&(optical_water|context_water)
        background=np.where(water,args.lake_level,context)
        z=np.where(kept,raw,background);kind=np.where(kept,np.where(support,1,0),np.where(water,2,0)).astype('uint8')
        # Exact clipped geometry uses unmasked heights: never interpolate ice down to lake.
        vertices,mesh_uv,mesh_classes,mesh_change=hard_mesh(polygon,along,across,raw,context,np.where(support,1,0).astype(float),args.lake_level,np.where(support,bed+thick,context),st,uv,background,water.astype(float))
        encode=lambda a:base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
        hard_geometries.append({'positions':encode(vertices),'uv':encode(mesh_uv),'classes':encode(mesh_classes),'change':encode(mesh_change)})
        active=support&kept;years.append(year);surfaces.append(z.astype('float32'));classes.append(kind);raw_surfaces.append(raw);mask_arrays.append(kept);textures.append({'year':year,'date':c['date'],'url':'/s/'+args.id+'/'+c['img']})
        records.append({'year':year,'image_date':c['date'],'time_from_nominal_reference_years_computed':delta,'time_status':'within published rate period' if 2019<=year<=2023 else 'extrapolated outside published rate period','model_supported_nodes':int(active.sum()),'strip_nodes':int(active.size),'median_model_height_m_computed':float(np.nanmedian(model[active])) if active.any() else None,'median_change_from_reference_m_computed':float(np.nanmedian((rate*delta)[active])) if active.any() else None,'stake_anomaly_m_at_S1_computed':anomaly,'forcing_observation_year':next(q for q in forcing_report['annual'] if q['ending_year']==year),'quality':'Dated stake anomaly + Koch mean-rate reconstruction; uncertainty not yet calibrated'})
    Z=np.stack(surfaces);C=np.stack(classes);xy=np.stack([bb,-aa],axis=-1).astype('float32');b64=lambda a:base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
    assumptions=['S(t) = bed + thickness_2023 + dhdt_2019_2023 × (t − nominal reference date), clipped at bed.','Nominal reference date '+args.nominal_epoch+' is assumed for timing; the thickness file documents the year 2023, not this exact survey day.','Thickness CRS is explicitly assumed from the companion projected grids; spatial overlap with the inventory was checked. Its south-up transform was honoured, not manually flipped.','Bed and thickness share a reconstruction lineage: their sum is a reconstructed reference surface, not an independent 2023 DEM observation.','Dated local stake ablation adds a seasonal/interannual perturbation. Its 2019–2023 linear trend is removed to retain Koch mean dh/dt; ablation is not added directly as Eulerian surface lowering. Missing days use measured monthly climatology, not invented annual observations.','Hard experimental boundary: unsmoothed lower-tongue masks, reference-guided 2016/2018 retained without offset smoothing, fixed inventory continuation upstream. Top mesh is clipped exactly with vertical walls, not a smoothed ramp.','Inside the glacier but outside Koch support, GLO-30 context is static and labelled unmodelled. Non-glacier land retains static GLO-30 elevation; only classified water uses the assumed lake plane.','Uncertainty is not calibrated: no numerical confidence interval is claimed. Source errors and covariance need further work.']
    if args.lake_level is not None:assumptions.append('A constant '+str(args.lake_level)+' m a.s.l. plane applies only to classified lake outside the hard glacier mask. Water classification uses selected-date low NIR/SWIR and green/NIR contrast, guarded by terrain height or inventory footprint; existing low lake terrain supplies coverage outside the optical grid. Classification is experimental. This is an assumed, not measured annual lake level.')
    assumptions.extend([forcing_report['spatial_assumption'],forcing_report['dynamic_assumption'],'Other data roles: glacier-wide geodetic mass balance is context because its spatial/temporal support differs; GPR is shared-source consistency, not independent validation. ITS_LIVE velocity is context until a defensible flux-divergence fit is available; ATL06 and ASTER remain withheld validation, never fitting inputs.'])
    data={'id':args.id,'name':s['name'],'method':'Koch mean rate + dated stake-anomaly prototype','hard_meshes':hard_geometries,'forcing':forcing_report,'years':years,'H':Z.shape[1],'W':Z.shape[2],'node_spacing_m':100,'xy':b64(xy),'uv':b64(uv),'heights':b64(Z),'classes':b64(C),'bed':b64(bed.astype('float32')),'rate':b64(rate.astype('float32')),'textures':textures,'records':records,'assumptions':assumptions,'sources':[bmeta,hmeta,rmeta],'nominal_reference_date':args.nominal_epoch,'validation':{'inventory_overlap_fraction_computed':inside_share,'support_nodes':int(support.sum()),'source_fields_shared':True,'independent_validation_done':False},'strip':st,'height_range':[float(np.nanmin(Z)),float(np.nanmax(Z))],'credits':'Koch et al. 2025, CC BY 4.0 · Copernicus DEM context · Contains modified Copernicus Sentinel data · prototype local only'}
    out=d/'koch-prototype.json';tmp=out.with_suffix('.tmp');tmp.write_text(json.dumps(data,allow_nan=False));tmp.replace(out);np.savez_compressed(d/'koch-prototype.npz',years=np.array(years),E=E,N=N,bed=bed,thickness_2023=thick,dhdt=rate,surface=Z,classes=C,source_support=support,ice_surface=np.stack(raw_surfaces),glacier_mask=np.stack(mask_arrays))
    print('Prototype built:',len(years),'years;',int(support.sum()),'Koch-supported nodes;',round(inside_share*100,2),'percent spatial overlap',flush=True)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('id');p.add_argument('--bed',required=True);p.add_argument('--thickness',required=True);p.add_argument('--rate',required=True);p.add_argument('--crs');p.add_argument('--assume-thickness-crs');p.add_argument('--nominal-epoch',required=True);p.add_argument('--context',nargs='+',required=True);p.add_argument('--lake-level',type=float);build(p.parse_args())
