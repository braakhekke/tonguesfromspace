/* Lazy, local GDAL WebAssembly fallback. Input Files are mounted in WORKERFS. */
import {vectorDataset} from './formats.js';
let serial=0;
async function gdal(){
 const worker=new Worker(new URL('./gdal/gdal3.js',import.meta.url));let id=0;const pending=new Map();
 worker.onmessage=({data:m})=>{const p=pending.get(m.id);if(p){pending.delete(m.id);m.success?p.resolve(m.data):p.reject(Error(typeof m.data==='string'?m.data:JSON.stringify(m.data)));}};
 worker.onerror=e=>{for(const p of pending.values())p.reject(Error(e.message||'GDAL worker failed'));pending.clear();};
 const call=(func,params,key=++id)=>new Promise((resolve,reject)=>{pending.set(key,{resolve,reject});worker.postMessage({id:key,func,params});});
 await call('constructor',{config:{path:new URL('./gdal/',import.meta.url).href,env:{GDAL_CACHEMAX:'32',GDAL_NUM_THREADS:'1',PROJ_NETWORK:'OFF',GDAL_SKIP:'WMS WMTS VRT',OGR_SKIP:'WFS OAPIF'}}},'onload');
 return new Proxy({terminate:()=>worker.terminate()},{get:(target,key)=>key==='then'?undefined:key in target?target[key]:(...args)=>call(key,args)});
}
export async function convert(files,opts={}){
 if(files.some(f=>/\.vrt$/i.test(f.name)))throw Error('VRT can reference files or remote services. Convert it to a self-contained GeoTIFF locally first.');
 const g=await gdal();try{const opened=await g.open(files,[],/\.zip$/i.test(files[0].name)?['vsizip']:[]);if(!opened.datasets.length)throw Error((opened.errors||[]).join(' · ')||'This GDAL build cannot read that format. NetCDF-4/HDF5 need conversion with desktop GDAL.');
 const collections=[];for(const ds of opened.datasets){const info=await g.getInfo(ds);
  if(info.type==='vector'){
   if(info.featureCount>200000)throw Error('Too many vector features. Clip the file first.');
   const details=await g.ogrinfo(ds,['-so','-al']);for(const layer of info.layers||[]){const detail=details.layers?.find(l=>l.name===layer.name);if(!detail?.geometryFields?.[0]?.coordinateSystem&&!opts.crs)return{needsMapping:true,fields:[],reason:`Layer ${layer.name} has no source CRS. Choose it explicitly.`,defaults:{}};
    const args=['-f','GeoJSON','-t_srs','EPSG:4326',...(opts.crs?['-s_srs',opts.crs]:[]),layer.name];const output=await g.ogr2ogr(ds,args,'science_'+(++serial)),bytes=await g.getFileBytes(output);if(bytes.length>64*1024*1024)throw Error('Converted vector exceeds the 64 MiB preview budget.');collections.push({name:layer.name,data:JSON.parse(new TextDecoder().decode(bytes)),crs:'EPSG:4326'});
   }
  }else if(info.type==='raster'){
   if(opened.datasets.length>1)throw Error('Select one raster dataset or subdataset before import.');
   if(!info.projectionWkt&&!opts.crs)return{needsMapping:true,fields:[],reason:'Raster CRS missing. Select the original source CRS; world files alone do not define one.',defaults:{}};
   if(info.width*info.height*(info.bandCount||1)>12000000)throw Error('This raster needs a tiled GeoTIFF conversion before browser import (conversion budget: 12 million values).');
   const out=await g.gdalwarp(ds,['-of','GTiff','-t_srs','EPSG:4326','-r','near','-wm','32',...(opts.crs?['-s_srs',opts.crs]:[]),'-co','TILED=YES','-co','COMPRESS=DEFLATE'],'science_'+(++serial));const bytes=await g.getFileBytes(out);if(bytes.length>128*1024*1024)throw Error('Converted raster exceeds the browser preview budget.');return{kind:'raster-file',file:new File([bytes],files[0].name+'.tif'),note:'GDAL conversion: nearest-neighbour reprojection. Inspected cells belong to the converted grid.'};
  }
 }if(!collections.length)throw Error('No supported geometry or raster layer was found.');return vectorDataset(collections,files[0],{...opts,format:'GDAL: '+opened.datasets.map(d=>d.type).join(', ')});
 }finally{g.terminate();}
}
