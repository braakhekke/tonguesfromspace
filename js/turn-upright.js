/* A phone held sideways shows a "turn upright" sheet on the front page, gallery, glacier-vs-city and field notes (the dashboard does the same in js/09-phones.js, except in its full screen). */
(() => {
  if (!matchMedia('(pointer:coarse)').matches) return;
  const st = document.createElement('style');
  st.textContent = '.turn-upright{position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:#fff;color:#0E1A22;text-align:center;font:600 16px/1.3 "Schibsted Grotesk",system-ui,sans-serif}.turn-upright[hidden]{display:none}.turn-upright svg{color:#C8322A}.turn-upright small{font-weight:400;font-size:12px;opacity:.7}';
  document.head.appendChild(st);
  const t = document.createElement('div'); t.className = 'turn-upright'; t.hidden = true; t.setAttribute('role', 'status');
  t.innerHTML = '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/></svg><div>Turn your phone upright</div>';
  document.body.appendChild(t);
  const m = matchMedia('(orientation:landscape) and (max-height:520px)');
  const sync = () => { t.hidden = !m.matches; };
  m.addEventListener('change', sync); sync();
})();
