const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(process.argv[2],'utf8').match(/<script>\n([\s\S]*?)<\/script>/)[1];
const nodes={},keys={};let tick=null,clears=0,revoked=0;
function el(id){return nodes[id]||(nodes[id]={hidden:id==='big',value:'0',textContent:'',style:{},clientWidth:1200,clientHeight:900,removeAttribute(n){delete this[n];},click(){return this.onclick?.();}});}
const context=vm.createContext({document:{getElementById:el,addEventListener:(k,f)=>keys[k]=f},location:{pathname:'/perito-moreno/scenes'},URL:{createObjectURL:()=>`blob:${Math.random()}`,revokeObjectURL:()=>revoked++},fetch:p=>p.endsWith('.json')?new Promise(()=>{}):Promise.resolve({ok:true,blob:async()=>({})}),setInterval:f=>{tick=f;return 7;},clearInterval:()=>{tick=null;clears++;}});
vm.runInContext(source,context);
assert.equal(typeof el('timelapse').onclick,'function','Actual page must bind the header button during startup');
const data={image_level:'L1C',orbits:[10,53],years:{'1985':{source:'landsat',cands:[{id:'l',date:'1985-02-01',sat:'Landsat 5',img:'l.jpg'}]},'2020':{source:'sentinel-2',cands:[{id:'s',date:'2020-03-22',sat:'Sentinel-2',orbit:53,image_level:'L1C',img:'s.jpg'}]}}};
vm.runInContext('D='+JSON.stringify(data)+';P={"1985":"l"};O=10;PO={53:{2020:"s"}};E={10:{2020:{orbit:53,reason:"Clouds"}}};',context);
(async()=>{
 el('bigi').naturalWidth=640;el('bigi').naturalHeight=689;
 await el('timelapse').click();assert.equal(el('big').hidden,false);assert.equal(el('play').textContent,'Pause');assert(tick);assert(el('bigt').textContent.includes('1985'));
 const landsatSize={...el('bigi').style};assert(parseFloat(landsatSize.width)>640,'Landsat should fill the shared frame rather than stay at its smaller native size');
 el('bigi').naturalWidth=960;el('bigi').naturalHeight=1032;
 tick();assert.deepEqual(el('bigi').style,landsatSize,'Sentinel and Landsat must occupy the identical screen rectangle');assert(el('bigt').textContent.includes('2020'));assert(el('bigt').textContent.includes('ORBIT EXCEPTION'));
 el('play').click();assert.equal(tick,null);assert.equal(el('play').textContent,'Play');
 el('prev').click();assert(el('bigt').textContent.includes('1985'));el('next').click();assert(el('bigt').textContent.includes('2020'));
 el('frame').value='0';el('frame').oninput();assert(el('bigt').textContent.includes('1985'));
 el('bigstage').clientWidth=350;el('bigstage').clientHeight=450;vm.runInContext('sizePreview()',context);assert(parseFloat(el('bigi').style.width)<=350);assert(parseFloat(el('bigi').style.height)<=450);
 keys.keydown({key:'Escape'});assert.equal(el('big').hidden,true);assert(revoked===2);assert(clears>=1);
 console.log('Actual page startup binds button; click opens and autoplays selected frames; pause/step/scrub/exception label/Escape close and constant sensor-independent frame sizing all passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
