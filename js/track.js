/* Counts which controls are used, nothing else. One delegated listener: a click on a button, link, switch or summary sends its name
   (data-track, else id, else data-style/side, else aria-label, else the first 30 characters of its text), the glacier in the address (#g=) and the page
   to /ev on the Worker, which adds it to Workers Analytics Engine; script errors go the same way as the event error-js with a note of 80 characters (what went wrong, in which file).
   No cookie, no storage, no IP address, no user id, no coordinates, no typed text;
   nothing is sent when the browser says Do Not Track or Global Privacy Control. Also loads the Cloudflare Web Analytics beacon (page views, referrers,
   countries; cookieless) when the build was given its token (TFS_CONFIG.webAnalytics, repository variable CF_WEB_ANALYTICS_TOKEN). Only on the public site. */
(() => {
  const cfg = window.TFS_CONFIG || {};
  const host = location.hostname;
  if (host !== 'tonguesfromspace.org' && host !== 'www.tonguesfromspace.org') return;
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
  if (cfg.webAnalytics) {
    const s = document.createElement('script');
    s.defer = true; s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    s.setAttribute('data-cf-beacon', JSON.stringify({ token: cfg.webAnalytics }));
    document.head.appendChild(s);
  }
  const clean = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const nameOf = el => {
    if (el.dataset.track) return clean(el.dataset.track);
    if (el.id) return clean(el.id.replace(/([a-z0-9])([A-Z])/g, '$1-$2'));      // modeCompare -> mode-compare
    if (el.dataset.style) return clean('style-' + el.dataset.style + (el.dataset.side ? '-' + el.dataset.side : ''));
    return clean(el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30));
  };
  const send = (name, extra) => {
    if (!name) return;
    const g = /[#&]g=([^&]+)/.exec(location.hash);
    const body = JSON.stringify({ e: name, g: g ? clean(decodeURIComponent(g[1])) : '', p: location.pathname.slice(0, 60), d: innerWidth < 768 ? 'm' : 'd', ...extra });
    try { navigator.sendBeacon('/ev', new Blob([body], { type: 'text/plain' })); } catch (e) { /* counting is optional */ }
  };
  document.addEventListener('click', ev => {
    const el = ev.target instanceof Element ? ev.target.closest('button, a, summary, [role=button], [role=switch], [role=tab], [role=option]') : null;
    if (el) send(nameOf(el));
  }, true);
  /* Script errors: one short note (what went wrong, in which file), so that a broken release shows in the numbers. At most 3 per page view, the same note once; the Worker keeps 80 characters. */
  const seen = new Set();
  const note = (msg, file) => {
    const m = (String(msg || 'error') + (file ? ' @ ' + String(file).split('/').pop().split('?')[0] : '')).replace(/[^A-Za-z0-9 ._:\/()'-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!m || seen.has(m) || seen.size >= 3) return;
    seen.add(m); send('error-js', { m });
  };
  window.addEventListener('error', ev => note(ev.message, ev.filename));
  window.addEventListener('unhandledrejection', ev => note('promise: ' + ((ev.reason && ev.reason.message) || ev.reason), ''));
  window.tfsTrack = send;      // for something that is not a click (a glacier chosen from the search)
})();
