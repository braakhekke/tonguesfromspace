/* Local File/Blob reads only. This worker has no network upload path. */
import {fromBlob} from 'geotiff';
import proj4 from 'proj4';
import {colour} from './raster-worker-colour.js';
import {openScientific} from './formats.js';
import {renderVector,inspectVector,renderGrid,inspectGrid} from './vector-renderer.js';
import {fileMetadata} from './file-metadata.js';
proj4.defs('EPSG:2056', '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs');
proj4.defs('EPSG:21781', '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=600000 +y_0=200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs');
let images, base, project, crs, demo = false, demoShift=0;
const datasets=new Map();let currentDataset=null;
const snapshot=()=>({images,base,project,crs,demo,demoShift});
const restore=c=>({images,base,project,crs,demo,demoShift}=c);
const LIMIT = 64 * 1024 * 1024;
const fd = (im, key) => im.getFileDirectory().getValue(key);

function valid(v, nodata) { return Number.isFinite(v) && v !== nodata; }
function configure(code) {
  if (code >= 32601 && code <= 32660) proj4.defs(`EPSG:${code}`, `+proj=utm +zone=${code-32600} +datum=WGS84 +units=m`);
  if (code >= 32701 && code <= 32760) proj4.defs(`EPSG:${code}`, `+proj=utm +zone=${code-32700} +south +datum=WGS84 +units=m`);
  crs = `EPSG:${code}`;
  if (!proj4.defs(crs)) throw Error(`Unsupported coordinate system ${crs}. Reproject to EPSG:2056, 21781, 3857, 4326 or WGS84 UTM.`);
  project = proj4('EPSG:3857', crs);
}
function location(grid, x, y) { return [grid[0] + grid[2] * x + grid[4] * y, grid[1] + grid[3] * x + grid[5] * y]; }
function pixels(im, xy) { let o; try { o=im.getOrigin(); } catch { o=base.getOrigin(); } const r=im.getResolution(base); return [(xy[0]-o[0])/r[0], (xy[1]-o[1])/r[1]]; }
function guard(im, win) {
  const tw=im.getTileWidth(), th=im.getTileHeight();
  const nx=Math.ceil(win[2]/tw)-Math.floor(win[0]/tw), ny=Math.ceil(win[3]/th)-Math.floor(win[1]/th);
  const bits=fd(im,'BitsPerSample') || [32];
  const bytes=Array.from(typeof bits === 'number' ? [bits] : bits).reduce((a,b)=>a+b/8,0);
  if (nx*ny*tw*th*bytes > LIMIT) throw Error('This view needs too much raster decoding. Zoom in, or prepare a tiled GeoTIFF with internal overviews.');
}
async function open(file) {
  demo=false; const t=await fromBlob(file); base=await t.getImage();
  const keys=base.getGeoKeys() || {}, code=keys.ProjectedCSTypeGeoKey || keys.GeographicTypeGeoKey;
  configure(code);
  if(fd(base,'ModelTransformation')) throw Error('Rotated GeoTIFFs are not supported yet. Export a north-up raster.');
  if(keys.GTRasterTypeGeoKey === 2) throw Error('Pixel-is-point rasters are not supported yet. Export a pixel-is-area GeoTIFF.');
  const origin=base.getOrigin(), resolution=base.getResolution();if(!origin.every(Number.isFinite)||!resolution.every(Number.isFinite)||resolution[0]<=0||resolution[1]>=0)throw Error('Expected a north-up raster with finite georeferencing.');
  const count=await t.getImageCount(); if(count>32) throw Error('Too many TIFF image directories; use a single survey with internal overviews.');
  images=[base]; for(let i=1;i<count;i++) { const im=await t.getImage(i); if(im.getWidth()<base.getWidth() && im.getSamplesPerPixel()===base.getSamplesPerPixel()) images.push(im); }
  const bb=base.getBoundingBox(), points=[];
  for(let i=0;i<=16;i++) for(const p of [[bb[0]+(bb[2]-bb[0])*i/16,bb[1]],[bb[0]+(bb[2]-bb[0])*i/16,bb[3]],[bb[0],bb[1]+(bb[3]-bb[1])*i/16],[bb[2],bb[1]+(bb[3]-bb[1])*i/16]]) points.push(proj4(crs,'EPSG:4326',p));
  const bounds=[[Math.min(...points.map(p=>p[1])),Math.min(...points.map(p=>p[0]))],[Math.max(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0]))]];
  const dataset=await base.getGDALMetadata(), bandMetadata=[];for(let i=0;i<base.getSamplesPerPixel();i++)bandMetadata.push(await base.getGDALMetadata(i));
  const bandInfo=fileMetadata(dataset,bandMetadata);
  return {rgb:fd(base,'PhotometricInterpretation')===2&&base.getSamplesPerPixel()>=3,bits:base.getBitsPerSample?.(0)||8,bandInfo,name:file.name,size:file.size,width:base.getWidth(),height:base.getHeight(),bands:base.getSamplesPerPixel(),crs,overviews:images.length-1,tiled:base.isTiled,nodata:base.getGDALNoData(),bounds};
}
async function render(m) {
  const {width:w,height:h,grid,band=0,low=0,high=1}=m;
  if(w*h>1048576 || w<1 || h<1) throw Error('Render resolution exceeds the prototype limit.');
  const rgba=new Uint8ClampedArray(w*h*4); let channels=null; let min=Infinity,max=-Infinity,values=null,win,im,sw,sh,nodata;
  if(!demo) {
    const q=project.forward(location(grid,w/2,h/2)), dx=project.forward(location(grid,w/2+1,h/2)), dy=project.forward(location(grid,w/2,h/2+1));
    const desired=Math.max(Math.hypot(dx[0]-q[0],dx[1]-q[1]),Math.hypot(dy[0]-q[0],dy[1]-q[1]));
    im=images.filter(i=>Math.abs(i.getResolution(base)[0])<=desired*1.5).sort((a,b)=>a.getWidth()-b.getWidth())[0] || base;
    const corners=[]; for(let y=0;y<=4;y++) for(let x=0;x<=4;x++) corners.push(pixels(im,project.forward(location(grid,x*w/4,y*h/4))));
    win=[Math.max(0,Math.floor(Math.min(...corners.map(p=>p[0])))),Math.max(0,Math.floor(Math.min(...corners.map(p=>p[1])))),Math.min(im.getWidth(),Math.ceil(Math.max(...corners.map(p=>p[0])))),Math.min(im.getHeight(),Math.ceil(Math.max(...corners.map(p=>p[1]))))];
    if(win[2]>win[0] && win[3]>win[1]) {
      guard(im,win); sw=Math.min(1024,win[2]-win[0]); sh=Math.min(1024,win[3]-win[1]); nodata=im.getGDALNoData();
      if(m.rgb){channels=await im.readRasters({window:win,samples:Array.from({length:(Array.from(fd(im,'ExtraSamples')||[]).some(v=>v===1||v===2)?4:3)},(_,i)=>i),width:sw,height:sh,resampleMethod:'nearest'});values=channels[0];}else [values]=await im.readRasters({window:win,samples:[band],width:sw,height:sh,resampleMethod:'nearest'});
    }
  }
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    let v; const xy=location(grid,x+.5,y+.5);
    if(demo) { const ll=proj4('EPSG:3857','EPSG:4326',xy); if(ll[0]<7.59||ll[0]>7.66||ll[1]<45.975||ll[1]>46.015) continue; v=demoShift-8+10*(ll[0]-7.59)/.07+2*Math.sin((ll[1]-45.975)*400); }
    else { if(!values) continue; const p=pixels(im,project.forward(xy)); if(p[0]<win[0]||p[1]<win[1]||p[0]>=win[2]||p[1]>=win[3]) continue; const ix=Math.min(sw-1,Math.floor((p[0]-win[0])/(win[2]-win[0])*sw)), iy=Math.min(sh-1,Math.floor((p[1]-win[1])/(win[3]-win[1])*sh)); v=values[iy*sw+ix];if(channels){const index=iy*sw+ix,target=(y*w+x)*4,maximum=2**im.getBitsPerSample(0)-1;if(!Number.isFinite(v)||v===nodata)continue;for(let k=0;k<3;k++)rgba[target+k]=Math.max(0,Math.min(255,channels[k][index]/maximum*255));rgba[target+3]=channels[3]?channels[3][index]/maximum*255:255;continue;} }
    if(!valid(v,nodata)) continue; min=Math.min(min,v);max=Math.max(max,v);const i=(y*w+x)*4;rgba.set([...colour((v-low)/(high-low)),255],i);
  }
  return {rgba,width:w,height:h,min:Number.isFinite(min)?min:null,max:Number.isFinite(max)?max:null};
}
async function inspect(m) {
  if(demo) { const [lon,lat]=proj4('EPSG:3857','EPSG:4326',m.xy); return {value:lon>=7.59&&lon<=7.66&&lat>=45.975&&lat<=46.015 ? demoShift-8+10*(lon-7.59)/.07+2*Math.sin((lat-45.975)*400):null,synthetic:true}; }
  const p=pixels(base,project.forward(m.xy)),x=Math.floor(p[0]),y=Math.floor(p[1]);
  if(x<0||y<0||x>=base.getWidth()||y>=base.getHeight()) return {value:null};
  const win=[x,y,x+1,y+1]; guard(base,win); if(m.rgb){const a=await base.readRasters({window:win,samples:[0,1,2]});return {value:null,rgb:a.map(c=>c[0]),pixel:[x,y]};}const [a]=await base.readRasters({window:win,samples:[m.band||0]}); return {value:valid(a[0],base.getGDALNoData())?a[0]:null,pixel:[x,y]};
}
let queue=Promise.resolve();
self.onmessage=({data:m})=>{ queue=queue.then(async()=>{try { let result;
  if(m.type==='open'){
    let direct=false;
    if(/\.tiff?$/i.test(m.file.name)){try{result=await open(m.file);datasets.set(m.datasetId||'default',snapshot());currentDataset=m.datasetId||'default';direct=true;}catch(e){if(!/coordinate system|affine transformation|north-up|Rotated|Pixel-is-point/i.test(e.message))throw e;}}
    if(!direct){const imported=await openScientific([m.file,...(m.companions||[])],m.options||{});if(imported.needsMapping)result=imported;else if(imported.kind==='raster-file'){result=await open(imported.file);result.name=m.file.name;result.size=m.file.size;result.note=imported.note;datasets.set(m.datasetId||'default',snapshot());currentDataset=m.datasetId||'default';}else{datasets.set(m.datasetId,imported);result=imported.meta;}}
  }
  else if(m.type==='demo') {demo=true;images=base=project=crs=undefined;demoShift=m.shift||0;result={name:m.name||'Synthetic thermal example',size:0,width:512,height:512,bands:1,crs:'EPSG:4326',overviews:0,tiled:true,bounds:[[45.975,7.59],[46.015,7.66]],synthetic:true,bandInfo:[{acquisition:{value:m.date||'2023-08-15',year:+(m.date||'2023-08-15').slice(0,4),source:'Synthetic example'},unit:'°C',displayUnit:'°C',unitSource:'Synthetic example',needsScaling:false,description:'Synthetic thermal values'}]};datasets.set(m.datasetId||'default',snapshot());currentDataset=m.datasetId||'default';}
  else if(m.type==='close'){datasets.delete(m.datasetId);if(currentDataset===m.datasetId){currentDataset=null;images=base=project=crs=undefined;demo=false;demoShift=0;}result={closed:true};}
  else {if(m.type==='render'&&(!(m.width>0)||!(m.height>0)||m.width*m.height>1048576))throw Error('Render exceeds the preview pixel budget.');const special=m.datasetId&&datasets.get(m.datasetId);if(special?.kind==='vector'||special?.kind==='grid'){if(m.type==='valueField'&&special.kind==='vector'){const layer=special.layers[m.band||0];if(m.field&&!layer.numericFields.includes(m.field))throw Error('Not a numeric property in this layer.');layer.valueProperty=m.field;layer.info={...layer.originalInfo};if(m.field!==layer.originalValueProperty){layer.info.unit=null;layer.info.displayUnit=null;layer.info.unitSource=null;}special.meta.valueProperties[m.band||0]=m.field;special.meta.bandInfo[m.band||0]={...special.meta.bandInfo[m.band||0],...layer.info};result=special.meta;}else if(m.type==='render')result=special.kind==='vector'?renderVector(special,m):renderGrid(special,m);else if(m.type==='inspect')result=special.kind==='vector'?inspectVector(special,m):inspectGrid(special,m);else throw Error('Unsupported layer operation');self.postMessage({id:m.id,result},result?.rgba?[result.rgba.buffer]:[]);return;}if(m.datasetId){const c=datasets.get(m.datasetId);if(!c)throw Error('This local file is no longer open.');restore(c);currentDataset=m.datasetId;}if(m.type==='render')result=await render(m);else if(m.type==='inspect')result=await inspect(m);else throw Error('Unknown reader operation');}
  self.postMessage({id:m.id,result},result?.rgba?[result.rgba.buffer]:[]);
 }catch(e){self.postMessage({id:m.id,error:e.message});}});};
