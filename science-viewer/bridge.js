/* This bridge adds local data to the actual explorer. No replacement theme or controls. */
import {GLACIERS} from '../js/02-glaciers.js';
import {boxLayer,otherLayer} from '../js/08-controls.js';
import {map,tlFrames,tlLayers,stopPlay,showFrame,horiz,speedMs,PLAY_ICON,PAUSE_ICON,FULL_ICONS} from '../js/05-map.js';
import {loadHeights,loadBundle,strip3DTexture,setView} from '../js/11-view3d.js';
import {wire} from '../js/wire.js';
import {refreshAll} from '../js/07-render.js';
import {state,currentGlacier,viewMode} from '../js/04-state.js';
const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href=new URL('./style.css',import.meta.url).href;document.head.append(sheet);
// Restrict only this iframe session; the original explorer keeps its complete list.
const zmutt=GLACIERS.find(g=>g.id==='zmutt');
GLACIERS.splice(0,GLACIERS.length,zmutt);boxLayer.clearLayers();otherLayer.clearLayers();
const scope=document.createElement('style');scope.textContent='#glacierList,#glacierSearch,#mGlacier,#rankNote,.region-btn,.region-menu{display:none!important}';document.head.append(scope);
document.querySelector('#glacierGroup .step-h').innerHTML='<span class="num">01</span>Zmutt Glacier';
document.getElementById('brandLede').textContent='Zmutt Glacier · Field data playground';
const panel=document.importNode(parent.document.getElementById('scienceTemplate').content,true);document.getElementById('glacierGroup').append(panel);
const native3=document.getElementById('view3dBtn'),full=native3.cloneNode(true);full.id='viewFull';full.title='Full glacier with a fixed 2023 tongue surface';full.querySelector('span').textContent='Full 3D';full.setAttribute('aria-pressed','false');native3.after(full);
const note=document.createElement('p');note.id='fullNote';note.className='landsat-info';note.hidden=true;note.textContent='Fixed 2023 tongue within surrounding terrain. Image years change the picture only.';document.getElementById('viewGroup').append(note);
const source=document.createElement('div');source.className='science-source';source.innerHTML='<div class="side-label">Timeline</div><div class="modes"><button type="button" id="sourceSatellite" aria-pressed="true">Satellite years</button><button type="button" id="sourceData" aria-pressed="false" disabled>Field dates</button></div><div id="dataDates" class="science-dates" hidden></div>';
document.getElementById('modeGroup').after(source);
const stage=document.getElementById('stage'),overlay=document.createElement('canvas');overlay.id='scienceMap';overlay.className='science-map-overlay';overlay.hidden=true;stage.append(overlay);
const tag=document.createElement('div');tag.id='dataTag';tag.className='science-acquisition';tag.hidden=true;stage.append(tag);
const inspection=document.createElement('article');inspection.id='inspection';inspection.hidden=true;inspection.className='science-observation';inspection.innerHTML='<button class="act" id="closeInspect" aria-label="Close observation">×</button><h3>Field observation</h3><strong id="inspectValue"></strong><p id="inspect"></p><p id="inspectDate"></p>';stage.append(inspection);
const fullPanel=document.createElement('section');fullPanel.id='fullPanel';fullPanel.hidden=true;fullPanel.className='science-full-panel';fullPanel.innerHTML='<canvas id="fullCanvas" aria-label="Full glacier 3D"></canvas><p class="science-full-loading" id="fullLoading"></p><p class="science-full-credit">Terrain: <a href="https://mapterhorn.com/attribution/" target="_blank" rel="noopener">Mapterhorn</a> · © swisstopo. Fixed tongue: swisstopo / GLAMOS surface model. Non-commercial. <a href="https://github.com/braakhekke/tonguesfromspace/blob/main/docs/SOURCES.md" target="_blank">Sources</a></p>';stage.append(fullPanel);
const science={
 setView,refresh:refreshAll,loadHeights,loadBundle,horiz,speedMs,icons:{play:PLAY_ICON,pause:PAUSE_ICON,smallPlay:FULL_ICONS.play,smallPause:FULL_ICONS.pause},
 texture:(S,year,nA,nB,heights,style=state.style)=>strip3DTexture(currentGlacier(),S,year,nA,nB,()=>heights,style),
 years:()=>Object.keys(state.available).map(Number).filter(y=>state.available[y]),
 pause:stopPlay,
 selectReferences:(a,b,one)=>{
   const years=Object.keys(state.available).map(Number).filter(y=>state.available[y]);if(!years.length)return;
   const valid=y=>years.includes(y)?y:years.includes(state.one)?state.one:years[years.length-1];
   if(state.mode==='compare'){const aa=valid(a),bb=valid(b);if(state.a!==aa||state.b!==bb){state.a=aa;state.b=bb;refreshAll();}}
   else if(state.mode==='timelapse'){const y=valid(one),i=tlLayers.findIndex(t=>t.yr===y);if(i>=0&&state.frame!==i)showFrame(i);}
   else {const y=valid(one);if(state.one!==y){state.one=y;refreshAll();}}
 },
};
parent.scienceReady?.({science,map,L:window.L,wire,state,currentGlacier,getView:()=>viewMode,mapYear:()=>state.mode==='timelapse'?tlFrames()[state.frame]:state.mode==='compare'?state.b:state.one,document,window});
