#!/usr/bin/env python3
"""Local experimental tip arcs: reuse Swiss GlaViTU inference with global weights.
Exact saved L1C pass, six TOA bands, 10 m UTM grid and Mapterhorn terrain.
Not a dated measured outline; no production record or owner choice is changed.
"""
import argparse,hashlib,io,json,math,os,pickle,sys,tarfile
from pathlib import Path
import numpy as np
from PIL import Image
import rasterio.features
from rasterio.transform import from_origin
from pyproj import Transformer
from shapely.geometry import shape,Polygon,mapping
from shapely.ops import transform as project,linemerge
from shapely import make_valid,get_coordinates
from scipy import ndimage as ndi
import urllib.request
import onboard_sentinel_l1c as l1c
import serve
ROOT=Path(__file__).resolve().parents[1]
SWISS=ROOT/'experiments/glavitu-annual'

def smooth_ring(ring, sigma_m=20.0, step_m=5.0):
 n=max(int(ring.length/step_m),8)
 points=np.array([ring.interpolate(i*ring.length/n).coords[0] for i in range(n)])
 points=ndi.gaussian_filter1d(points,sigma_m/(ring.length/n),axis=0,mode='wrap')
 return np.vstack([points,points[0]])

def smooth_polygon(polygon):
 # The same 5 m sampling / 20 m Gaussian ring smoothing as the Swiss smooth.py.
 outer=Polygon(smooth_ring(polygon.exterior));holes=[Polygon(smooth_ring(r)) for r in polygon.interiors]
 result=make_valid(outer)
 for hole in holes:
  if hole.area>=400:result=make_valid(result.difference(make_valid(hole)))
 return result.simplify(1)

def main(gid,years,arc_km=2):
 d=ROOT/'experiments/onboard'/gid;s=json.loads((d/'session.json').read_text());sc=json.loads((d/'scenes.json').read_text());pick=s['steps']['scenes']['params']['picks'];st=s['steps']['strip']['params'];st=st.get('strip',st)
 # The saved strip geometry is expressed in ground metres in Web Mercator.
 if 'azimuth' not in st:st=s['proposal_strip']|st
 tip=st.get('tip',s['proposal_strip']['tip']);epsg=32700+int((tip[1]+180)//6)+1 if tip[0]<0 else 32600+int((tip[1]+180)//6)+1
 utm=Transformer.from_crs(4326,epsg,always_xy=True);ll=Transformer.from_crs(epsg,4326,always_xy=True);mt=Transformer.from_crs(3857,epsg,always_xy=True);mx,my=Transformer.from_crs(4326,3857,always_xy=True).transform(tip[1],tip[0]);k=1/math.cos(math.radians(tip[0]));sn,cs=math.sin(math.radians(st['azimuth'])),math.cos(math.radians(st['azimuth']))
 def point(a,b):return mt.transform(mx+(a*sn+b*cs)*k,my+(a*cs-b*sn)*k)
 def rect(a,b):return Polygon([point(a,-st['half']),point(a,st['half']),point(b,st['half']),point(b,-st['half'])])
 x,y=point(0,0);ex,ey=point(1000,0);along=lambda coords:(coords[:,0]-x)*(ex-x)/1000+(coords[:,1]-y)*(ey-y)/1000
 outlines=json.loads((d/'outlines.geojson').read_text());reference=max((f for f in outlines['features'] if f['geometry']['type'] in ('Polygon','MultiPolygon') and f.get('properties',{}).get('date')),key=lambda f:f['properties']['date']);reference_name=reference['properties'].get('label',reference['properties'].get('key','Inventory outline'));ref=project(utm.transform,shape(reference['geometry']));parts=lambda q:[g for g in getattr(q,'geoms',[q]) if g.geom_type=='Polygon'];front=float(along(get_coordinates(max(parts(ref.intersection(rect(-st['back'],st['up']))),key=lambda q:q.area))).min());cross=front+arc_km*1000;zone=rect(-st['back'],cross);win=zone.buffer(1110);xmin,ymin,xmax,ymax=win.bounds;xmin,ymin=math.floor(xmin/10)*10,math.floor(ymin/10)*10;xmax,ymax=math.ceil(xmax/10)*10,math.ceil(ymax/10)*10;W,H=int((xmax-xmin)/10),int((ymax-ymin)/10);tr=from_origin(xmin,ymax,10,10)
 out=d/'tip-model';out.mkdir(exist_ok=True);print('grid',W,H,epsg,flush=True)
 grid_key=hashlib.sha256(json.dumps([epsg,xmin,ymin,xmax,ymax,W,H]).encode()).hexdigest()[:12]
 dm=out/('terrain-'+grid_key+'.npz')
 if dm.exists():dem=np.load(dm)['dem']
 else:
  cols,rows=np.meshgrid(xmin+5+np.arange(W)*10,ymax-5-np.arange(H)*10);lon,lat=ll.transform(cols,rows);n=2**12;fx=(lon+180)/360*n;fy=(1-np.arcsinh(np.tan(np.radians(lat)))/np.pi)/2*n;tx0,tx1,ty0,ty1=int(fx.min()),int(fx.max()),int(fy.min()),int(fy.max());mos=None;cache=ROOT/'scripts/.dem-cache/mapterhorn';cache.mkdir(exist_ok=True,parents=True)
  for ty in range(ty0,ty1+1):
   for tx in range(tx0,tx1+1):
    p=cache/f'12-{tx}-{ty}.webp'
    if not p.exists():p.write_bytes(urllib.request.urlopen(f'https://tiles.mapterhorn.com/12/{tx}/{ty}.webp',timeout=60).read())
    a=np.array(Image.open(p).convert('RGB'),dtype=float);sz=a.shape[0]
    if mos is None:mos=np.zeros(((ty1-ty0+1)*sz,(tx1-tx0+1)*sz))
    mos[(ty-ty0)*sz:(ty-ty0+1)*sz,(tx-tx0)*sz:(tx-tx0+1)*sz]=a[:,:,0]*256+a[:,:,1]+a[:,:,2]/256-32768
  dem=ndi.map_coordinates(mos,[(fy-ty0)*sz-.5,(fx-tx0)*sz-.5],order=1).astype(np.float32);np.savez_compressed(dm,dem=dem)
 creds=serve.load_credentials(ask=False);token=serve.Token(*creds);candidates={c['id']:c for row in sc['years'].values() for c in row['cands']};arrays=[]
 for year,p in sorted(pick.items()):
  if years and int(year) not in years:continue
  c=candidates.get(p)
  if not c or c.get('image_level')!='L1C':continue
  raw=out/(year+'-'+grid_key+'-'+hashlib.sha256(c['id'].encode()).hexdigest()[:12]+'.npz')
  if not raw.exists():
   sat,stamp,orbit=l1c.pass_identity(c);prefix=f'{sat}_MSIL1C_{stamp}_';bands=['B02','B03','B04','B08','B11','B12','dataMask'];script='//VERSION=3\nfunction setup(){return{input:'+json.dumps(bands)+',mosaicking:"TILE",output:{bands:7,sampleType:"FLOAT32"}}}\n';script+='function preProcessScenes(c){c.scenes.tiles=c.scenes.tiles.filter(t=>(t.sentinel2ProductId||t.productId||"").startsWith('+json.dumps(prefix)+')&&(t.sentinel2ProductId||t.productId||"").includes('+json.dumps('_R'+orbit+'_')+'));return c;}\n';script+='function evaluatePixel(ss){for(var s of ss)if(s.dataMask)return ['+','.join('s.'+b for b in bands)+'];return [0,0,0,0,0,0,0];}\nfunction updateOutputMetadata(s,i,o){o.userData={tiles:s.tiles};}'
   body={'input':{'bounds':{'bbox':[xmin,ymin,xmax,ymax],'properties':{'crs':f'http://www.opengis.net/def/crs/EPSG/0/{epsg}'}},'data':[{'type':'sentinel-2-l1c','dataFilter':{'timeRange':{'from':c['date']+'T00:00:00Z','to':c['date']+'T23:59:59Z'}},'processing':{'upsampling':'BILINEAR'}}]},'output':{'width':W,'height':H,'responses':[{'identifier':'default','format':{'type':'image/tiff'}},{'identifier':'userdata','format':{'type':'application/json'}}]},'evalscript':script}
   with tarfile.open(fileobj=io.BytesIO(l1c.request(token,body))) as tar:
    files={Path(m.name).name:tar.extractfile(m).read() for m in tar.getmembers() if m.isfile()}
   names=l1c.verify_products(json.loads(files['userdata.json'])['tiles'],c)
   with rasterio.MemoryFile(files['default.tif']) as mf,mf.open() as ds:a=ds.read()
   np.savez_compressed(raw,a=a,date=c['date'],source_ids=np.array(names))
  arrays.append((year,c,raw));print('raw ready',year,flush=True)
 # This is the Swiss inference wrapper and feature normalisation, with global rather than Alps weights.
 sys.path.insert(0,str(SWISS));import infer_lib as L
 mins,maxs=pickle.load(open(SWISS/'repo/utils/dataset_stats.pickle','rb'));model=L.load(str(SWISS/'downloads/weights_list/glavitu_global_weights.h5'));gy,gx=np.gradient(dem.astype(float),10);sl=np.degrees(np.arctan(np.hypot(gx,gy)));el=(dem-mins['elevation'])/(maxs['elevation']-mins['elevation']);sl=(sl-mins['slope'])/(maxs['slope']-mins['slope']);feats=[]
 for year,c,raw in arrays:
  a=np.load(raw)['a'];valid=a[6]>0;opt=np.moveaxis(a[:6],0,-1).astype(float);opt=(np.where(valid[...,None],opt,0)-mins['optical'])/(maxs['optical']-mins['optical']);ph,pw=(384-H%384)%384,(384-W%384)%384;f={'optical':np.pad(opt,((0,ph),(0,pw),(0,0))).astype('float32'),'dem':np.pad(np.stack([el,sl],-1),((0,ph),(0,pw),(0,0))).astype('float32')};prob=L.predict(model,f)[:H,:W,1];pred=ndi.median_filter((prob>.5).astype('uint8'),size=3);pred[~valid]=0;np.savez_compressed(out/(year+'-prediction.npz'),prob=prob,valid=valid)
  gs=[shape(g) for g,v in rasterio.features.shapes(pred,mask=pred.astype(bool),transform=tr) if v==1];gs=[q for q in gs if q.intersects(ref)];
  if not gs:continue
  q=smooth_polygon(max(gs,key=lambda q:q.area));q=make_valid(q.intersection(zone));qs=parts(q)
  if not qs:continue
  q=max(qs,key=lambda q:q.area);edge=rect(cross,cross+1).exterior.buffer(15);line=q.exterior.difference(edge);line=max(getattr(line,'geoms',[line]),key=lambda q:q.length)
  feats.append({'type':'Feature','properties':{'year':int(year),'date':c['date'],'candidate_id':c['id'],'grid_key':grid_key,'arc_window_m':arc_km*1000,'smooth_sigma_m':20,'source':'GlaViTU global · computed experimental','model':'glavitu_global_weights.h5','validated':False,'cloud_caution':'Clouds and snow may be classified as ice. Visually inspect each arc.','reference':f'{reference_name}; fixed cross-line {arc_km*1000:g} m upstream, computed'},'geometry':mapping(project(ll.transform,line))});print('arc',year,flush=True)
 output=d/'tip-arcs.geojson'
 if years and output.exists():
  keep=[f for f in json.loads(output.read_text())['features'] if f['properties']['year'] not in years and f['properties'].get('candidate_id')==pick.get(str(f['properties']['year'])) and f['properties'].get('grid_key')==grid_key]
  feats=sorted(keep+feats,key=lambda f:f['properties']['year'])
 payload={'type':'FeatureCollection','features':feats,'properties':{'experimental':True,'validated':False,'arc_window_m':arc_km*1000,'smooth_sigma_m':20,'grid':{'epsg':epsg,'bounds':[xmin,ymin,xmax,ymax],'width':W,'height':H},'method':'Swiss GlaViTU inference/median filter and 20 m Gaussian ring smoothing, global weights; not a measured front','terrain':'Mapterhorn z12; consult local source provenance before assigning survey epoch/source; model covariate only'}}
 rules_path=d/'tip-arc-reference-rules.json'
 if rules_path.exists():
  rules=json.loads(rules_path.read_text())
  for year,accepted in rules.get('references',{}).items():
   if accepted['properties'].get('candidate_id')!=pick.get(year) or accepted['properties'].get('grid_key')!=grid_key:raise ValueError('Accepted reference is stale after a scene/grid change; retained arcs were not overwritten.')
   payload['features']=[f for f in payload['features'] if f['properties']['year']!=int(year)]+[accepted]
  payload['features'].sort(key=lambda f:f['properties']['year'])
  from onboard_refine_tip_arcs import refine
  refine(gid,rules['pairs'],remember=False,input_data=payload)
 else:
  tmp=output.with_suffix('.tmp');tmp.write_text(json.dumps(payload));tmp.replace(output)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('id');p.add_argument('--years',nargs='*',type=int);p.add_argument('--arc-km',type=float,default=2);a=p.parse_args();main(a.id,a.years,a.arc_km)
