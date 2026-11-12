/* Entry of the live explorer frame: the page's own bundle (js/main.js) plus the science bridge in ONE bundle, so both share the same module instances.
   In local development bridge.js is injected by app.js instead; here it starts once the page has loaded and the parent page is ready to receive it. */
import '../js/main.js';
const start=()=>{
  if(typeof parent.scienceReady!=='function'){setTimeout(start,50);return;}
  import('./bridge.js');
};
if(document.readyState==='complete')start();else addEventListener('load',start);
