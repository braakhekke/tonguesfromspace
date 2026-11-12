/* Local-only full-extent context. Never changes the explorer's terrain or image caches. */
import {startViewer,meshWide} from '../js/viewer3d-core.js';

export function fullGeometry(bounds, project) {
  const sw=project(bounds[0]),ne=project(bounds[1]);
  const P={x:(sw.x+ne.x)/2,y:(sw.y+ne.y)/2};
  const k=Math.cosh(P.y/6378137), half=(ne.x-sw.x)/2/k*1.08, up=(ne.y-sw.y)/2/k*1.08;
  return {P,k,half,up,back:up,ue:0,un:1,dist:1,tex:[2048,2048],merc:(a,b)=>[P.x+b*k,P.y+a*k]};
}

export function embedTongue(background,S,nA,nB,bundle,referenceYear) {
  const surface=bundle.surfaces?.get(referenceYear);
  if(!surface)throw Error(`The fixed ${referenceYear} tongue surface is unavailable.`);
  const out=new Float32Array(background),W=bundle.nB+1,half=bundle.half;
  let count=0;
  for(let j=0;j<=nA;j++)for(let i=0;i<=nB;i++){
    const [mx,my]=S.merc(S.up-j*(S.up+S.back)/nA,-S.half+i*2*S.half/nB);
    const dx=(mx-bundle.P[0])/bundle.k,dy=(my-bundle.P[1])/bundle.k;
    const a=dx*bundle.ue+dy*bundle.un,b=dx*bundle.un-dy*bundle.ue;
    const edge=Math.min(half-Math.abs(b),bundle.up-a,a+bundle.back);
    if(edge<=0)continue;
    const x=(b+half)/(2*half)*bundle.nB,y=(bundle.up-a)/(bundle.up+bundle.back)*bundle.nA;
    const ix=Math.min(bundle.nB-1,Math.floor(x)),iy=Math.min(bundle.nA-1,Math.floor(y)),fx=x-ix,fy=y-iy,q=iy*W+ix;
    const h=(surface[q]*(1-fx)+surface[q+1]*fx)*(1-fy)+(surface[q+W]*(1-fx)+surface[q+W+1]*fx)*fy;
    // Transition only at the strip boundary; the tongue's interior stays at the reference surface.
    const t=Math.min(1,edge/250),weight=t*t*(3-2*t),n=j*(nB+1)+i;
    out[n]=background[n]*(1-weight)+h*weight;count++;
  }
  return {heights:out,embeddedVertices:count};
}

export class FullGlacier {
  constructor({panel,canvas,api,compose,inspect,say}){Object.assign(this,{panel,canvas,api,compose,inspect,say});this.referenceYear=2023;this.active=false;this.run=0;this.textureRun=0;this.overlayRun=0;this.bases=new Map();this.doc=api.document;
    canvas.addEventListener('click',e=>{if(!e.shiftKey||!this.viewer)return;const r=canvas.getBoundingClientRect(),p=this.viewer.pick(e.clientX-r.left,e.clientY-r.top,r.width,r.height);if(p)this.inspect(this.S.merc(-p[1],p[0]),e.clientX,e.clientY);});
  }
  async open(){this.active=true;this.panel.hidden=false;if(this.viewer)return this.updateTexture();const run=++this.run;this.panel.dataset.state='loading';this.say('Loading full-glacier terrain…');
    try{const g=this.api.currentGlacier();if(g.id!=='zmutt')throw Error('Full-glacier science terrain is available for Zmutt.');
      this.S=fullGeometry(g.bounds,p=>this.api.L.CRS.EPSG3857.project(this.api.L.latLng(p)));const S=this.S,limit=meshWide()?512:192,cell=meshWide()?28:80;
      this.nB=Math.min(limit,2*Math.ceil(S.half/cell));this.nA=Math.min(limit,2*Math.ceil((S.up+S.back)/cell/2));
      const [background,bundle]=await Promise.all([this.api.science.loadHeights(S,this.nA,this.nB,12),this.api.science.loadBundle('B57-05')]);if(run!==this.run)return;if(!bundle)throw Error('Fixed tongue surface unavailable.');
      const fixed=embedTongue(background,S,this.nA,this.nB,bundle,this.referenceYear);this.heights=fixed.heights;this.bundle=bundle;
      const placeholder=this.doc.createElement('canvas');placeholder.width=placeholder.height=2;const c=placeholder.getContext('2d');c.fillStyle='#b4c0c6';c.fillRect(0,0,2,2);
      this.viewer=startViewer(this.canvas,this.heights,placeholder,this.nA,this.nB,S.up,S.back,1,S.half);this.home={az:-.5,el:.8,dist:Math.max(S.half*2,S.up+S.back)*1.6,tx:0,tz:1200*Math.min(S.half/2000,2.5)};this.viewer.setCam(this.home);this.viewer.setExag(1);
      this.panel.dataset.state='ready';this.panel.dataset.referenceYear='2023';this.panel.dataset.embeddedVertices=String(fixed.embeddedVertices);this.say('Full-glacier terrain ready. Fixed tongue: 2023.');await this.updateTexture();
    }catch(e){if(run===this.run){this.panel.dataset.state='error';this.say(e.message,true);}}
  }
  close(){this.active=false;this.panel.hidden=true;}
  reset(){this.viewer?.setCam(this.home);}
  focusTongue(){if(!this.viewer)return;const x=(this.bundle.P[0]-this.S.P.x)/this.S.k,z=-(this.bundle.P[1]-this.S.P.y)/this.S.k;this.viewer.focusPoint(x,z,{dist:6000});}
  async updateTexture(){if(!this.viewer||!this.active)return;const run=++this.textureRun,state=this.api.state,years=state.mode==='compare'?[state.a,state.b]:[this.api.mapYear()];
    const msg=this.doc.getElementById('fullLoading');msg.hidden=false;msg.textContent='Loading image and layers…';
    try{const textures=await Promise.all(years.map((y,unit)=>this.api.science.texture(this.S,y,this.nA,this.nB,this.heights,unit===1?state.styleB||state.style:state.style)));if(run!==this.textureRun)return;
      this.bases=new Map(textures.map((t,i)=>[i,t]));await this.render();msg.hidden=true;this.panel.dataset.textureYear=years.join(',');
    }catch(e){if(run===this.textureRun){msg.textContent='Background imagery unavailable; local data and terrain remain available.';this.say(e.message,true);}}
  }
  async render(){if(!this.viewer||!this.active)return;const run=++this.overlayRun,textureRun=this.textureRun,entries=[...this.bases];const textures=await Promise.all(entries.map(([unit,base])=>this.compose(base,unit,this.S)));if(run!==this.overlayRun||textureRun!==this.textureRun)return;entries.forEach(([unit],i)=>this.viewer.setTexture(textures[i],unit));this.panel.dataset.overlaySources=textures.map(t=>t.dataset.sourceFrame||'none').join(',');this.syncSplit();}

  syncSplit(){this.viewer?.setSplit(this.api.state.mode==='compare'?this.api.state.split:-1,this.api.science.horiz());}
  destroy(){++this.run;++this.textureRun;this.viewer?.destroy();this.viewer=null;}
}
