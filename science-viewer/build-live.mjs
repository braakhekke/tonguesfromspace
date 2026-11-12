/* Live build of the playground: node build-live.mjs <outdir>   (outdir = _site/playground-gabriele)
   GDAL's WebAssembly (28 MB, over the 25 MiB limit of Worker static files) is read from jsDelivr, pinned to the installed version; gdal3.js itself stays same-origin (a Worker script must). */
import {build} from 'esbuild';
import {mkdir,copyFile,readFile} from 'node:fs/promises';
const out=process.argv[2];if(!out)throw Error('usage: node build-live.mjs <outdir>');
const version=JSON.parse(await readFile('node_modules/gdal3.js/package.json','utf8')).version;
const GDAL_CDN=JSON.stringify(`https://cdn.jsdelivr.net/npm/gdal3.js@${version}/dist/package/`);
const common={bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'none',define:{GDAL_CDN}};
await build({...common,entryPoints:['raster-worker.js'],splitting:true,outdir:out+'/dist'});
await build({...common,entryPoints:{app:'app.js',explorer:'live-entry.js'},splitting:false,outdir:out,entryNames:'[name]',outbase:'.'});
await copyFile('style.css',out+'/style.css');
await mkdir(out+'/dist/gdal',{recursive:true});
for(const name of ['gdal3.js'])await copyFile('node_modules/gdal3.js/dist/package/'+name,out+'/dist/gdal/'+name);
await copyFile('node_modules/gdal3.js/LICENSE',out+'/dist/gdal/LICENSE');
console.log('playground built, GDAL data from',JSON.parse(GDAL_CDN));
