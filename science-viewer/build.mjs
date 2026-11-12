import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
await build({entryPoints:['raster-worker.js'],bundle:true,format:'esm',platform:'browser',splitting:true,outdir:'dist'});
await mkdir('dist/gdal',{recursive:true});for(const name of ['gdal3WebAssembly.wasm','gdal3WebAssembly.data','gdal3.js'])await copyFile('node_modules/gdal3.js/dist/package/'+name,'dist/gdal/'+name);await copyFile('node_modules/gdal3.js/LICENSE','dist/gdal/LICENSE');
