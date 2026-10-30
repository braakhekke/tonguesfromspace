<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tongues from Space | Glaciers seen from orbit</title>
<meta name="description" content="The beauty of glaciers, from space: the best satellite picture of every year, curated for each single glacier. Starting with Switzerland, more regions on the way.">
<meta property="og:title" content="Tongues from Space - Glaciers seen from orbit">
<meta property="og:description" content="The beauty of glaciers, from space: the best satellite picture of every year, curated for each single glacier. Starting with Switzerland, more regions on the way.">
<meta property="og:type" content="website">
<meta property="og:image" content="https://tonguesfromspace.org/images/preview-social.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="589">
<meta property="og:image:alt" content="Tongues from Space: the dashboard with a satellite comparison slider of the Grosser Aletsch glacier, 2016 and 2024, and glacier figures">
<meta property="og:url" content="https://tonguesfromspace.org/">
<link rel="canonical" href="https://tonguesfromspace.org/">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://tonguesfromspace.org/images/preview-social.jpg">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 200 200%27%3E%3Cdefs%3E%3Cmask id=%27ringcut%27 maskUnits=%27userSpaceOnUse%27 x=%27-20%27 y=%27-20%27 width=%27240%27 height=%27240%27%3E%3Crect x=%27-20%27 y=%27-20%27 width=%27240%27 height=%27240%27 fill=%27%23fff%27/%3E%3Ccircle cx=%27164%27 cy=%2736%27 r=%2727%27 fill=%27%23000%27/%3E%3C/mask%3E%3Cmask id=%27mouthcut%27 maskUnits=%27userSpaceOnUse%27 x=%27-50%27 y=%27-50%27 width=%27300%27 height=%27300%27%3E%3Crect x=%27-50%27 y=%27-50%27 width=%27300%27 height=%27300%27 fill=%27%23fff%27/%3E%3Cellipse cx=%27100%27 cy=%2788%27 rx=%2748%27 ry=%2724%27 fill=%27%23000%27/%3E%3C/mask%3E%3Cmask id=%27groovecut%27 maskUnits=%27userSpaceOnUse%27 x=%27-50%27 y=%27-50%27 width=%27300%27 height=%27300%27%3E%3Crect x=%27-50%27 y=%27-50%27 width=%27300%27 height=%27300%27 fill=%27%23fff%27/%3E%3Cpath d=%27M92 90 C112 108 126 136 126 166%27 fill=%27none%27 stroke=%27%23000%27 stroke-width=%275%27 stroke-linecap=%27round%27/%3E%3C/mask%3E%3C/defs%3E%3Cg fill=%27%230A1B33%27%3E%3Ccircle cx=%27100%27 cy=%27100%27 r=%2790%27 fill=%27none%27 stroke=%27%230A1B33%27 stroke-width=%2710%27 mask=%27url(%23ringcut)%27/%3E%3Cg transform=%27translate(100 100) scale(0.78) translate(-96 -101)%27%3E%3Cpath d=%27M4 100 L62 20 L90 56 L102 44 L120 60 L144 44 L188 100 Z%27 mask=%27url(%23mouthcut)%27/%3E%3Cpath d=%27M74 86 C92 104 82 136 82 158 A44 24 0 0 0 170 158 C170 134 134 108 110 86 Q92 78 74 86 Z%27 mask=%27url(%23groovecut)%27/%3E%3C/g%3E%3Cpath transform=%27translate(164 36) scale(1.65) translate(-164 -36)%27 d=%27M164 24 Q165 35 176 36 Q165 37 164 48 Q163 37 152 36 Q163 35 164 24 Z%27/%3E%3C/g%3E%3C/svg%3E">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css">
<link rel="stylesheet" href="css/tokens.css">
<link rel="stylesheet" href="css/pages.css">
<link rel="stylesheet" href="css/home.css">
</head>
<body>

<header class="bar"><div class="wrap">
  <a class="brand" href="#top">
    <img src="images/home/logo-white.svg" alt="" width="32" height="30">
    <b>Tongues from Space</b>
  </a>
  <nav>
    <a href="#regions">Glaciers</a>
    <a href="#how">What you can do</a>
    <a href="#science">Data and method</a>
    <a href="gallery.html">Gallery</a>
  </nav>
</div></header>

<main id="top">
<section class="hero">
  <div class="wrap">
    <div>
      <h1>Glaciers don’t talk. Their <em>tongues</em> tell all.</h1>
      <p class="lede">Satellite pictures, 3D terrain, outlines and figures for every glacier, year by year.</p>
      <div class="find">
        <a class="btn-red" href="#regions">Choose a glacier
          <svg viewBox="0 0 24 24"><path d="M12 4l1.4 1.4L8.8 10H20v2H8.8l4.6 4.6L12 18l-8-8z" transform="rotate(180 12 12)"/></svg></a>
        <div class="search" role="search">
          <label for="gsearch" class="sr">Search for a glacier, in any language</label>
          <div class="sbox">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3a7 7 0 105.2 11.7l4.8 4.8-1.4 1.4-4.8-4.8A7 7 0 0010 3zm0 2a5 5 0 100 10 5 5 0 000-10z"/></svg>
            <input id="gsearch" type="search" role="combobox" aria-expanded="false" aria-controls="gresults" aria-autocomplete="list" aria-haspopup="listbox" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="…or search a glacier, in any language">
          </div>
          <ul id="gresults" class="res" role="listbox" aria-label="Glaciers you may mean" hidden></ul>
          <p class="sstat" id="gstat" role="status" aria-live="polite" hidden></p>
        </div>
      </div>
      <div class="cta">
        <button class="btn-ghost" id="watch" type="button">
          <svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg>Watch the 1-minute teaser</button>
      </div>
    </div>

    <figure class="ba" id="ba">
      <img src="images/home/hero-2026.jpg" alt="Grosser Aletschgletscher, Switzerland, in September 2026" width="1600" height="1701">
      <div class="was"><img src="images/home/hero-1984.jpg" alt="Grosser Aletschgletscher, Switzerland, in September 1984" width="1600" height="1701"></div>
      <div class="yr l">1984<small>2 September · Landsat 5</small></div>
      <div class="yr r">2026<small>12 September · Sentinel-2</small></div>
      <div class="line"></div>
      <input type="range" min="0" max="100" value="50" aria-label="Compare 1984 and 2026">
      <div class="knob"><svg viewBox="0 0 24 24"><path d="M9 6l-6 6 6 6M15 6l6 6-6 6"/></svg></div>
      <div class="zoom" role="group" aria-label="Zoom">
        <button type="button" data-z="in" aria-label="Zoom in"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>
        <button type="button" data-z="out" aria-label="Zoom out"><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>
      </div>
      <figcaption class="cap"><div class="scale" aria-hidden="true"><span class="sl"></span><i class="sbar"></i></div><b>Grosser Aletschgletscher, Switzerland.</b> Drag the line, zoom with + / − or pinch.</figcaption>
    </figure>
  </div>
</section>
<section class="paths" id="paths">
  <div class="wrap">
    <p class="eyebrow">Whatever brings you here</p>
    <div class="pg">
      <a href="#regions"><small>Planning a hike?</small><h3>See the ice before you go.</h3><p>Find the tongue from above and in 3D, with the trails that lead to it where we have them.</p><span>Choose a glacier</span></a>
      <a href="#how"><small>Studying glaciers?</small><h3>Watch the years pass.</h3><p>One clear late-summer picture of every glacier, every year, side by side with its date and satellite.</p><span>See how it works</span></a>
      <a href="#how"><small>Telling the story?</small><h3>Take the picture home.</h3><p>Make a picture or a video of any glacier and year, or share it in the gallery.</p><span>See what you can do</span></a>
      <a href="#science"><small>Checking the facts?</small><h3>Every figure has a source.</h3><p>Numbers appear as the source states them, and what we compute ourselves is labelled.</p><span>Data and method</span></a>
    </div>
  </div>
</section>
<section class="split" id="regions">
  <div class="pickband"><div class="wrap">
    <div class="sh">
      <div>
        <p class="eyebrow">Choose a glacier</p>
        <h3 class="pick-h">Which glacier do you want to see?</h3>
        <p>Click a region on the map, then a glacier, or choose one from the list. More regions are in the making.</p>
      </div>
      <div class="pickrow">
        <div class="search" role="search">
          <label for="gsearch2" class="sr">Search for a glacier, in any language</label>
          <div class="sbox">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3a7 7 0 105.2 11.7l4.8 4.8-1.4 1.4-4.8-4.8A7 7 0 0010 3zm0 2a5 5 0 100 10 5 5 0 000-10z"/></svg>
            <input id="gsearch2" type="search" role="combobox" aria-expanded="false" aria-controls="gresults2" aria-autocomplete="list" aria-haspopup="listbox" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Search a glacier, in any language">
          </div>
          <ul id="gresults2" class="res" role="listbox" aria-label="Glaciers you may mean" hidden></ul>
          <p class="sstat" role="status" aria-live="polite" hidden></p>
        </div>
        <div class="sel"><select id="pick" aria-label="Glacier"></select>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></div>
      </div>
    </div>

    <div class="mapbox">
      <div id="map" role="application" aria-label="World map of the regions"></div>
      <div class="info" id="info" hidden>
        <button class="back" id="iBack" type="button" hidden></button>
        <div class="lab" id="iLab"></div>
        <h3 id="iName"></h3>
        <p id="iText"></p>
        <ul class="gl" id="iList"></ul>
        <div class="row"><a class="btn-red" id="iGo" href="#">Open the dashboard</a><a class="btn-line" id="iGo2" href="#" hidden></a></div>
      </div>
      <div class="credit">Sentinel-2 cloudless 2024 by <a href="https://s2maps.eu" target="_blank" rel="noopener">EOX</a> · labels © OpenStreetMap contributors, rendering EOX</div>
    </div>
    <div class="tiles" id="tiles"></div>
    <p class="soonrow">Iceland, Norway and beyond are in the making.</p>
  </div></div>
  <div class="whyband">
    <svg class="why-logo" viewBox="0 0 200 190" role="img" aria-label="Tongues from Space logo">
      <defs>
        <mask id="wlMouth" maskUnits="userSpaceOnUse" x="-20" y="-20" width="240" height="240"><rect x="-20" y="-20" width="240" height="240" fill="#fff"/><ellipse cx="100" cy="88" rx="48" ry="24" fill="#000"/></mask>
        <mask id="wlGroove" maskUnits="userSpaceOnUse" x="-20" y="-20" width="240" height="240"><rect x="-20" y="-20" width="240" height="240" fill="#fff"/><path d="M92 90 C112 108 126 136 126 166" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"/></mask>
      </defs>
      <g fill="#0A1B33">
        <path d="M4 100 L62 20 L90 56 L102 44 L120 60 L144 44 L188 100 Z" mask="url(#wlMouth)"/>
        <path class="tongue" d="M74 86 C92 104 82 136 82 158 A44 24 0 0 0 170 158 C170 134 134 108 110 86 Q92 78 74 86 Z" mask="url(#wlGroove)"/>
        <path class="spark" d="M172 8 Q173 21 186 22 Q173 23 172 36 Q171 23 158 22 Q171 21 172 8 Z"/>
      </g>
    </svg>
    <div class="wrap whygrid">
    <div class="whyhead">
      <p class="eyebrow">Why Tongues from Space</p>
      <h2 class="why-h">Where a glacier ends, you see it change.</h2>
      <p class="why-name">The lower end of a glacier is called its tongue. It is where the ice melts most and where change shows first. Satellites see every tongue from above, in the same way, year after year, and we curate the best picture of each. So: tongues, from space.</p>
    </div>
    <div class="why" id="why">
      <div><h3>The lowest ice shows change first</h3><p>A glacier ends in its tongue, the lowest stretch of ice, where it melts the most. Year after year the tip pulls back and leaves bare rock, a lake or a new valley floor.</p></div>
      <div><h3>Curated: one best picture of every year</h3><p>Most satellite pictures are no use: clouds, shadows, snow. For each glacier and year we choose the one clear late-summer picture, when the winter snow has melted and the ice shows, and cut it to the same frame around the tongue, so you never search an archive and a before-and-after is understood at once.</p></div>
      <div><h3>Pictures first, then the figures</h3><p>Look from above, fly over the tongue in 3D, step into old photographs, and read what the ice means in the figures and in water, with their sources.</p></div>
    </div>
  </div></div>
</section>


<section class="s" id="how">
  <div class="wrap">
    <div class="sh">
      <div>
        <p class="eyebrow">What you can do</p>
        <h2>Seven ways to look at a glacier.</h2>
        <p>Point at one, or tap it, to see it work.</p>
      </div>
    </div>
    <div class="how">
      <div class="vstage" id="vstage" aria-hidden="true"></div>
      <ol class="feat" id="feat"></ol>
    </div>
  </div>
</section>
<section class="s alt" id="science">
  <div class="wrap">
    <div class="sh"><div>
      <p class="eyebrow">Data and method</p>
      <h2>Real measurements, from named sources.</h2>
      <p>Every picture is a satellite scene and every figure comes from a published source. Nothing is drawn in or generated, and what we compute ourselves is labelled as computed.</p>
    </div></div>
    <div class="sci">
      <div><h3>Satellite pictures, not illustrations</h3><p>Each picture is a Sentinel-2 or Landsat scene, shown with its date. We crop it to a fixed frame and render the colours; we do not paint, retouch or generate anything.</p></div>
      <div><h3>The best picture is picked by a scoring</h3><p>Cloud, cloud shadow and snow over the tongue are scored for every scene in late summer, the same way for every glacier and year.</p></div>
      <div><h3>Figures as the source states them</h3><p>Lengths, areas, volumes and thicknesses appear as published: no rounding, no unit conversion. A value we calculate is marked as computed and never credited to the source.</p></div>
      <div><h3>Every figure says where it is from</h3><p>A small source note beside the figures names the dataset it comes from.</p></div>
      <div><h3>No source, no number</h3><p>Where a figure cannot be read from its source we leave it out, and where the origin of a name is unknown the page says so.</p></div>
      <div><h3>Reviewed and tested before release</h3><p>Each glacier is reviewed step by step: frame, outline, pictures, 3D view, figures and texts. Figures are compared with their source pages, and automated tests run before every release.</p></div>
    </div>
    <p class="note">The glacier figures are Swiss for now; the other regions show their pictures and, where a source is read, its figures.</p>
  </div>
</section>
<section class="closing">
  <div class="wrap">
    <h2>Every glacier ends in a tongue. Go and look at yours.</h2>
    <a class="btn-red" href="#regions">Choose a glacier</a>
  </div>
</section>
</main>

<footer><div class="wrap">
  <div>
    <a class="brand" href="#top"><img src="images/home/logo-white.svg" alt="" width="32" height="30"><b>Tongues from Space</b></a>
    <p>Created to increase glacial awareness, by Jochem Braakhekke. Non-commercial. Code MIT, own texts CC BY 4.0.</p>
  </div>
  <div class="src">
    <p>Satellite pictures: contains modified Copernicus Sentinel data (Sentinel-2); older pictures from Landsat 5 and 7, USGS. Glacier statistics (Switzerland): GLAMOS. Background: Sentinel-2 cloudless by <a href="https://s2maps.eu" target="_blank" rel="noopener">EOX</a> (CC BY-NC-SA 4.0), © OpenStreetMap contributors.</p>
  </div>
</div></footer>

<dialog class="player" id="player">
  <button type="button" id="closePlayer">Close ✕</button>
  <video id="vid" controls playsinline muted preload="none" poster="teaser/teaser-wide-poster.jpg">
    <source src="teaser/teaser-wide.webm" type="video/webm">
    <source src="teaser/teaser-wide.mp4" type="video/mp4">
  </video>
</dialog>

<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"></script>
<script src="js/regions.js"></script>
<script src="js/search.js"></script>
<script src="data/home-glaciers.js"></script>
<script>
const $ = id => document.getElementById(id);

/* The picker is the front page (/); the dashboards live at the address of their region (js/00-regions.js, `path`).
   Opened as /home.html (local use from the source tree) its links go to the local dashboard, index.html. */
const LOCAL = /home\.html$/.test(location.pathname);
const REGION_PATH = Object.fromEntries(REGIONS_ALL.flatMap(r => r.children || [r]).filter(c => c.path).map(c => [c.id, c.path]));
/* Links of the old site: /#g=aletsch&m=compare opened the Swiss dashboard at the root. Any hash that names a dashboard setting goes to the dashboard of its region. */
(() => {
  const h = location.hash.slice(1), q = new URLSearchParams(h);
  if (!['g', 'm', 'a', 'b', 'from', 'to', 'one', 's', 'ol', 't', 'r', 'fun'].some(k => q.has(k))) return;
  const region = q.get('r') || 'ch'; q.delete('r');
  const rest = q.toString();
  location.replace(LOCAL ? 'index.html#' + h : (REGION_PATH[region] || REGION_PATH.ch) + '/' + (rest ? '#' + rest : ''));
})();

/* Deep space, drawn like the map viewer's backdrop (spaceCanvas in js/05-map.js): dark blue gradient, a soft Milky Way band, nebula glows, small stars. Fixed seed. */
(() => {
  const w = 1600, h = 1000, perStar = 1000, scale = 1;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  let seed = 20261009; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#04070d'); g.addColorStop(1, '#0a1426'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  const glow = (cx, cy, r, rgb, a) => { const q = x.createRadialGradient(cx, cy, 0, cx, cy, r); q.addColorStop(0, `rgba(${rgb},${a})`); q.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = q; x.fillRect(cx - r, cy - r, 2 * r, 2 * r); };
  glow(w * .22, h * .28, w * .55, '84,72,170', .11); glow(w * .84, h * .72, w * .5, '38,110,170', .10); glow(w * .5, h * .5, w * .4, '60,70,120', .05);
  x.save(); x.translate(w / 2, h / 2); x.rotate(-0.38);
  const band = x.createLinearGradient(0, -h * .22, 0, h * .22); band.addColorStop(0, 'rgba(150,170,230,0)'); band.addColorStop(.5, 'rgba(150,170,230,.055)'); band.addColorStop(1, 'rgba(150,170,230,0)');
  x.fillStyle = band; x.fillRect(-w, -h * .22, 2 * w, h * .44);
  for (let i = 0, n = Math.round(w * h / perStar * 1.6); i < n; i++) {
    const px = (rnd() - .5) * w * 1.5, py = (rnd() + rnd() + rnd() - 1.5) * h * .2, a = 0.12 + rnd() * 0.35;
    x.fillStyle = `rgba(215,226,255,${a.toFixed(2)})`; x.fillRect(px, py, .9 * scale, .9 * scale);
  }
  x.restore();
  for (let i = 0, n = Math.round(w * h / perStar); i < n; i++) {
    const px = rnd() * w, py = rnd() * h, k = rnd(), bright = k > .975, big = k > .88, r = (0.4 + Math.pow(rnd(), 4) * 1.0) * scale * (bright ? 2.8 : big ? 1.7 : 1), a = bright ? 0.9 : 0.2 + rnd() * 0.5;
    if (big) glow(px, py, r * (bright ? 7 : 5), '190,210,255', bright ? .3 : .18);
    if (bright) { x.strokeStyle = 'rgba(225,235,255,.45)'; x.lineWidth = .8 * scale; x.beginPath(); x.moveTo(px - r * 4, py); x.lineTo(px + r * 4, py); x.moveTo(px, py - r * 4); x.lineTo(px, py + r * 4); x.stroke(); }
    x.fillStyle = `rgba(215,226,255,${a.toFixed(2)})`; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
  }
  c.toBlob(blob => { const u = 'url(' + URL.createObjectURL(blob) + ')'; document.querySelectorAll('.hero, footer').forEach(el => { el.style.backgroundImage = u; }); });
})();

/* ---------- before / after ---------- */
(() => {
  const ba = $('ba'), r = ba.querySelector('input');
  const set = v => { ba.style.setProperty('--pos', v + '%'); r.value = v; };
  let stop = false, z = 1, tx = 0, ty = 0;
  const halt = () => { stop = true; };
  // zoom is a transform of the two pictures (not of the frame), so the line and the years stay put; pixels are scaled, no filter
  const view = () => {
    const W = ba.clientWidth, H = ba.clientHeight;
    tx = Math.max(-(z - 1) * W / 2, Math.min((z - 1) * W / 2, tx));
    ty = Math.max(-(z - 1) * H / 2, Math.min((z - 1) * H / 2, ty));
    ba.style.setProperty('--tf', `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${z.toFixed(3)})`);
    ba.classList.toggle('zoomed', z > 1.001);
    scaleBar(W, H);
  };
  // scale bar: the pictures are the picture box of the Aletsch record (data/regions/ch/aletsch: lon 7.8781889 to 8.184029341, lat 46.35728576 to 46.58120342), shown as 1600 px wide (object-fit: cover)
  const FRAME_M = (8.184029341122477 - 7.8781889) * 111320 * Math.cos((46.35728576470588 + 46.58120341176471) / 2 * Math.PI / 180);      // computed here: the box's width in metres, about 23.5 km
  const sb = ba.querySelector('.scale'), sbl = sb.querySelector('.sl'), sbb = sb.querySelector('.sbar');
  const scaleBar = (W, H) => {
    const mPerPx = FRAME_M / 1600 / (Math.max(W / 1600, H / 1701) * z);
    const want = 130 * mPerPx, steps = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000], m = steps.filter(x => x <= want).pop() || steps[0];
    sbb.style.width = (m / mPerPx).toFixed(1) + 'px'; sbl.textContent = m >= 1000 ? (m / 1000) + ' km' : m + ' m';
  };
  const zoomAt = (z2, px, py) => {                 // px, py: the point that stays under the finger, from the centre
    z2 = Math.max(1, Math.min(6, z2));
    tx = px - (px - tx) * z2 / z; ty = py - (py - ty) * z2 / z; z = z2; view();
  };
  const rel = e => { const b = ba.getBoundingClientRect(); return [e.clientX - b.left - b.width / 2, e.clientY - b.top - b.height / 2]; };
  view();
  addEventListener('resize', view);
  r.addEventListener('input', () => { halt(); set(r.value); });
  ba.querySelectorAll('.zoom button').forEach(btn => btn.addEventListener('click', () => { halt(); zoomAt(z * (btn.dataset.z === 'in' ? 1.6 : 1 / 1.6), 0, 0); }));
  ba.addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); halt(); const [px, py] = rel(e); zoomAt(z * Math.exp(-e.deltaY * .01), px, py); }, {passive: false});  // trackpad pinch arrives as ctrl+wheel
  // one finger: the line moves the slider, elsewhere a zoomed picture is panned; two fingers pinch
  const ptrs = new Map(); let mode = '', last = null, d0 = 0, z0 = 1;
  const slide = e => { const b = ba.getBoundingClientRect(); set(Math.max(0, Math.min(100, 100 * (e.clientX - b.left) / b.width))); };
  ba.addEventListener('pointerdown', e => {
    if (e.target.closest('.zoom')) return;
    halt(); ptrs.set(e.pointerId, [e.clientX, e.clientY]); ba.setPointerCapture(e.pointerId);
    if (ptrs.size === 2) { const [a, c] = [...ptrs.values()]; d0 = Math.hypot(a[0] - c[0], a[1] - c[1]); z0 = z; mode = 'pinch'; return; }
    const b = ba.getBoundingClientRect(), lineX = b.left + b.width * parseFloat(getComputedStyle(ba).getPropertyValue('--pos')) / 100;
    mode = z > 1.001 && Math.abs(e.clientX - lineX) > 28 ? 'pan' : 'slide'; last = [e.clientX, e.clientY];
    if (mode === 'slide') slide(e);
  });
  ba.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (mode === 'pinch' && ptrs.size === 2) { const [a, c] = [...ptrs.values()], b = ba.getBoundingClientRect(); zoomAt(z0 * Math.hypot(a[0] - c[0], a[1] - c[1]) / d0, (a[0] + c[0]) / 2 - b.left - b.width / 2, (a[1] + c[1]) / 2 - b.top - b.height / 2); }
    else if (mode === 'pan') { tx += e.clientX - last[0]; ty += e.clientY - last[1]; last = [e.clientX, e.clientY]; view(); }
    else if (mode === 'slide') slide(e);
  });
  const up = e => { ptrs.delete(e.pointerId); if (!ptrs.size) mode = ''; else { mode = 'pan'; last = [...ptrs.values()][0]; } };
  ba.addEventListener('pointerup', up); ba.addEventListener('pointercancel', up);
  if (matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  const t0 = performance.now() + 900;       // a short pause, then one sweep so the visitor sees it can be dragged; meanwhile it zooms slowly in on the tongue and stays there
  const aim = k => { const W = ba.clientWidth, H = ba.clientHeight; z = 1 + k; tx = -.025 * W * k * 1.3; ty = -.28 * H * k * 1.3; view(); };   // the tongue's end sits at about 52% / 78% of the picture
  const tick = now => {
    if (stop) return;
    const t = (now - t0) / 9000;
    if (t < 0) return requestAnimationFrame(tick);
    const e = Math.min(t, 1), sm = e * e * (3 - 2 * e);
    set(t >= 1 ? 50 : 50 + 36 * Math.sin(t * Math.PI * 4) * (1 - t * .6));
    aim(2 * sm);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();

/* ---------- what you can do: a clip per point (scripts/make_home_clips.py) ---------- */
(() => {
  const POINTS = [
    ['years',   'Watch the years pass',   'The best picture of each year in one loop: snow, ice, lakes and green slopes shifting from year to year.'],
    ['compare', 'Slide between summers',  'Drag a line across two years and watch one landscape turn into another.'],
    ['fly',     'Fly over the ice in 3D', 'The satellite picture draped over the terrain: swoop along the glacier and look up at the peaks.'],
    ['then',    'Step into old photographs', 'Historic photographs, set into the 3D view where the photographer stood (the Swiss glaciers for now).'],
    ['numbers', 'Discover and read the numbers', 'What to look for, hikes and bike routes with the trails where the tongue is in view, and the area and length of every glacier; for Switzerland also thickness and volume, with their sources.'],
    ['size',    'Size it up against a city', 'Drag the outline of a glacier onto Zürich, Bern or Basel and see how big it really is.'],
    ['share',   'Take it with you',       'Download a picture or an animation for your phone, ready to post.']
  ];
  const stage = $('vstage'), feat = $('feat'), still = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const vids = [], btns = [];
  let cur = -1, locked = false, started = false;
  POINTS.forEach(([k, title, text], i) => {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'metadata'; v.poster = 'images/home/clips/' + k + '.jpg'; v.src = 'images/home/clips/' + k + '.mp4';
    v.addEventListener('ended', () => { if (!locked) select((i + 1) % POINTS.length); });
    v.addEventListener('timeupdate', () => { if (v.duration) btns[i].style.setProperty('--p', (100 * v.currentTime / v.duration) + '%'); });
    stage.appendChild(v); vids.push(v);
    const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button';
    b.innerHTML = '<span class="n">' + (i + 1) + '</span><b>' + title + '</b><span class="t">' + text + '</span>';
    b.onclick = () => { locked = true; select(i, true); };
    if (matchMedia('(hover:hover)').matches) b.onpointerenter = () => { if (cur !== i) { locked = true; select(i, true); } };
    li.appendChild(b); feat.appendChild(li); btns.push(b);
  });
  function select(i, user) {
    if (i === cur && !user) return;
    cur = i;
    vids.forEach((v, j) => { v.classList.toggle('on', j === i); if (j !== i) { v.pause(); btns[j].style.setProperty('--p', '0%'); } });
    btns.forEach((b, j) => j === i ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current'));
    vids[i].loop = locked; vids[i].currentTime = 0; vids[i].play().catch(() => {});
  }
  const fc = document.createElement('li'), fb = document.createElement('button'); fb.type = 'button'; fb.className = 'film-cell'; fb.id = 'film';
  fb.innerHTML = '<span class="n" style="color:#fff">▶</span><b>The whole story</b><span class="t">Watch the 1-minute teaser.</span>'; fc.appendChild(fb); feat.appendChild(fc);
  // show the first poster at once; start playing when the section scrolls into view
  vids[0].classList.add('on'); btns[0].setAttribute('aria-current', 'true'); cur = 0;
  if (!still && 'IntersectionObserver' in window) new IntersectionObserver((es, o) => { if (es[0].isIntersecting && !started) { started = true; if (!locked) select(0, true); o.disconnect(); } }, { threshold: .4 }).observe(stage);
})();

/* ---------- teaser dialog ---------- */
const player = $('player'), vid = $('vid');
const openFilm = () => { player.showModal(); vid.muted = false; vid.play().catch(() => {}); };
$('watch').onclick = $('film').onclick = openFilm;      // the 'film' button is made by the clip code above
$('closePlayer').onclick = () => player.close();
player.addEventListener('close', () => vid.pause());
player.addEventListener('click', e => { if (e.target === player) player.close(); });

/* ---------- regions: paths are the real addresses of js/00-regions.js ---------- */
const REGIONS = REGIONS_ALL.flatMap(r => (r.children || [r]).filter(c => c.picker).map(c => {      // the records of js/regions.js: the same list as the dashboard's region menu, plus the planned regions
  const soon = !c.ready || HIDDEN_REGIONS.includes(c.id);      // not published (yet): shown, not clickable
  const n = (window.HOME_GLACIERS || []).filter((g) => g.region === c.id && !g.parent).length;      // glaciers the data holds for the region
  return { id: c.id, group: r.name, name: c.name, soon, href: c.path ? c.path + '/' : undefined, ...c.picker, n: c.ready ? (soon ? 'In the making' : `${n} glaciers`) : undefined };
}));
/* The count in the search box: the glaciers of the regions that are open, so it is right on the public site (Switzerland alone) and grows with each region. */
{ const open = new Set(REGIONS.filter((r) => !r.soon).map((r) => r.id)), n = (window.HOME_GLACIERS || []).filter((g) => open.has(g.region) && !g.parent).length; if (n) $('gsearch').placeholder = `…or search ${n} glaciers`; }


const map = L.map('map', { worldCopyJump: true, minZoom: 2, maxZoom: 12, scrollWheelZoom: false }).setView([67, 8], 3);      // the five regions; the planned ones are one zoom out
map.on('focus', () => map.scrollWheelZoom.enable()); map.on('blur', () => map.scrollWheelZoom.disable());
L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg', { maxNativeZoom: 14, maxZoom: 17 }).addTo(map);
L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/overlay_bright_3857/default/g/{z}/{y}/{x}.png', { maxNativeZoom: 16, maxZoom: 17, opacity: .9 }).addTo(map);

const pick = $('pick'), tiles = $('tiles'), list = $('iList');
const byRegion = id => (window.HOME_GLACIERS || []).filter(g => g.region === id);
/* a region's glaciers, largest first, each ice cap followed by its own outlets (also largest first) */
const ordered = id => { const all = byRegion(id), top = all.filter(g => !g.parent).sort((a, b) => b.area - a.area); return top.flatMap(g => [g, ...all.filter(x => x.parent === g.id).sort((a, b) => b.area - a.area)]); };
const nameOf = g => g.name + (g.approx ? ' ≈' : '');      // ≈: the name of the outlet is inferred, not certain (as in the dashboard)
const fmtArea = a => a.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' km²';      // the value of the data file, no rounding
const regionHref = r => LOCAL ? 'index.html' + (r.id === 'ch' ? '' : '#r=' + r.id) : r.href;
const glacierHref = (r, g) => { const q = 'g=' + encodeURIComponent(g.parent || g.id) + (g.parent ? '&sub=' + g.sub : ''); return LOCAL ? 'index.html#' + (r.id === 'ch' ? '' : 'r=' + r.id + '&') + q : r.href + '#' + q; };

pick.innerHTML = '<option value="">Choose a glacier…</option>';
let lastGroup = null, grp = null;
for (const r of REGIONS) {
  if (r.group !== lastGroup) { lastGroup = r.group; }
  grp = document.createElement('optgroup'); grp.label = r.group === r.name ? r.name : r.group + ' · ' + r.name; pick.appendChild(grp);
  const o = new Option(r.soon ? r.name + ' (in the making)' : 'All of ' + r.name, 'r:' + r.id); o.disabled = !!r.soon; grp.appendChild(o);
  if (!r.soon) for (const g of ordered(r.id)) grp.appendChild(new Option((g.parent ? '\u00A0\u00A0\u00A0\u00A0\u00A0' : '\u00A0\u00A0') + nameOf(g), 'g:' + g.id));
  r.marker = L.marker(r.ll, { icon: L.divIcon({ className: 'pin' + (r.soon ? ' soon' : '') + (r.side ? ' ' + r.side : ''), html: '<span>' + r.name + '</span>', iconSize: [0, 0] }), keyboard: true, title: r.name }).addTo(map);
  if (r.soon && !r.n) continue;
  if (!r.soon) r.marker.on('click', () => chooseRegion(r.id));
  const t = document.createElement('button'); t.type = 'button'; t.className = 'tile'; t.dataset.id = r.id; t.disabled = !!r.soon;
  t.innerHTML = '<span class="c">' + r.group + '</span><b>' + r.name + '</b><small>' + r.n + '</small>';
  if (!r.soon) t.onclick = () => chooseRegion(r.id);
  tiles.appendChild(t);
}

/* fly to a place, leaving it clear of the card on the left */
function fly(ll, zoom) {
  const off = matchMedia('(min-width:901px)').matches ? 170 : 0;
  const c = map.unproject(map.project(ll, zoom).subtract([off, 0]), zoom);
  map.flyTo(c, zoom, { duration: 1.1 });
}
const glLayer = L.layerGroup().addTo(map);
/* The catchment of the chosen glacier: its outline (data/home-outlines.js, generated, thinned; loaded on the first choice). */
const outLayer = L.layerGroup().addTo(map);
let outlinesAsked = null, shownOutline = null;
const loadOutlines = () => outlinesAsked || (outlinesAsked = new Promise(res => { const sc = document.createElement('script'); sc.src = 'data/home-outlines.js'; sc.onload = sc.onerror = () => res(window.HOME_OUTLINES || {}); document.head.appendChild(sc); }));
function showOutline(gid) {
  shownOutline = gid; outLayer.clearLayers();
  if (!gid) return;
  loadOutlines().then(all => {
    if (shownOutline !== gid || !all[gid]) return;      // another glacier was chosen meanwhile
    for (const ring of all[gid]) {      // a white casing under a red line: it shows on snow and on dark rock alike
      L.polygon(ring, { color: '#fff', weight: 5, opacity: .7, fill: false, interactive: false }).addTo(outLayer);
      L.polygon(ring, { color: '#C8322A', weight: 2, opacity: 1, fillColor: '#C8322A', fillOpacity: .12, interactive: false }).addTo(outLayer);
    }
  });
}
let glMarkers = {};
function drawGlaciers(r) {
  glLayer.clearLayers(); glMarkers = {};
  if (!r) return;
  for (const g of byRegion(r.id)) {
    const m = L.marker(g.tip, { icon: L.divIcon({ className: 'gdot' + (g.parent ? ' sub' : ''), html: '<i></i>', iconSize: [0, 0] }), keyboard: true, title: g.name })
      .bindTooltip(nameOf(g) + (g.parent ? ' · outlet' : ''), { direction: 'top', offset: [0, -8], className: 'gtip' }).addTo(glLayer);
    m.on('click', () => chooseGlacier(g.id)); glMarkers[g.id] = m;
  }
}

function clearMarks() {
  document.querySelectorAll('.pin,.gdot').forEach(p => p.classList.remove('on'));
  tiles.querySelectorAll('.tile').forEach(b => b.removeAttribute('aria-current'));
}
function reset() { showOutline(null); clearMarks(); drawGlaciers(null); $('info').hidden = true; pick.value = ''; history.replaceState(null, '', location.pathname); }

function chooseRegion(id, doFly = true) {
  const r = REGIONS.find(x => x.id === id);
  if (!r || r.soon) return reset();
  showOutline(null); clearMarks(); drawGlaciers(r);
  pick.value = 'r:' + id;
  r.marker.getElement().classList.add('on');
  tiles.querySelector('[data-id="' + id + '"]').setAttribute('aria-current', 'true');
  const gs = ordered(id);
  $('iBack').hidden = true;
  $('iLab').textContent = r.group === r.name ? r.n : r.group + ' · ' + r.n;
  $('iName').textContent = r.name; $('iText').textContent = r.text;
  list.hidden = false; list.innerHTML = '';
  for (const g of gs) { const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button'; if (g.parent) li.className = 'sub';
    b.innerHTML = nameOf(g) + '<small>' + fmtArea(g.area) + '</small>'; b.onclick = () => chooseGlacier(g.id);
    b.onmouseenter = () => glMarkers[g.id] && glMarkers[g.id].openTooltip(); b.onmouseleave = () => glMarkers[g.id] && glMarkers[g.id].closeTooltip();
    li.appendChild(b); list.appendChild(li); }
  $('iGo').textContent = 'Open the region'; $('iGo').href = regionHref(r); $('iGo2').hidden = true; $('info').hidden = false;
  if (doFly) fly(r.ll, r.zoom);
  history.replaceState(null, '', '#' + id);
}

function chooseGlacier(gid, doFly = true) {
  const g = (window.HOME_GLACIERS || []).find(x => x.id === gid); if (!g) return;
  const r = REGIONS.find(x => x.id === g.region); if (r.soon) return;
  if (!$('info').dataset.region || $('info').dataset.region !== r.id || !glMarkers[gid]) { clearMarks(); drawGlaciers(r); r.marker.getElement().classList.add('on'); tiles.querySelector('[data-id="' + r.id + '"]').setAttribute('aria-current', 'true'); }
  $('info').dataset.region = r.id;
  document.querySelectorAll('.gdot').forEach(p => p.classList.remove('on')); glMarkers[gid].getElement().classList.add('on');
  pick.value = 'g:' + gid;
  $('iBack').hidden = false; $('iBack').textContent = '← All of ' + r.name; $('iBack').onclick = () => chooseRegion(r.id);
  $('iLab').textContent = r.group === r.name ? r.name : r.group + ' · ' + r.name;
  const parent = g.parent && (window.HOME_GLACIERS || []).find(x => x.id === g.parent);
  $('iName').textContent = g.name; $('iText').textContent = (parent ? 'Outlet of ' + parent.name + '. ' : '') + 'Area ' + fmtArea(g.area) + '.';
  list.hidden = true; $('iGo').textContent = 'Open ' + g.name; $('iGo').href = glacierHref(r, g);
  $('iGo2').hidden = true; $('info').hidden = false;
  if (doFly) fly(g.tip, g.parent ? 11 : r.id === 'ch' ? 10 : 8);      // an outlet of an ice cap: close in on its tongue; (the map's zoom limit used to cap Switzerland at 10)
  glMarkers[gid].openTooltip();
  showOutline(gid);
  history.replaceState(null, '', '#glacier=' + gid);      // the picker's own link; #g= is a dashboard link
}
pick.onchange = () => { const [k, id] = pick.value.split(/:(.+)/); if (k === 'r') chooseRegion(id); else if (k === 'g') chooseGlacier(id); else reset(); };
const start = location.hash.slice(1);
if (start.startsWith('glacier=')) chooseGlacier(decodeURIComponent(start.slice(8)));
else if (REGIONS.some(r => r.id === start && !r.soon)) chooseRegion(start, false);
</script>
<script>
/* ---------- search: any language, forgiving of typos (js/search.js); the names in other languages (data/glacier-aliases.js, Wikidata, CC0) load when the box is first used.
   Its own script on purpose: it needs the region records and nothing of the map, so it works when the map library cannot be loaded. ---------- */
(() => {
  const el = (id) => document.getElementById(id);
  const LOCAL_PAGE = /home\.html$/.test(location.pathname);
  const regions = REGIONS_ALL.flatMap((r) => r.children || [r]).filter((c) => c.ready && !HIDDEN_REGIONS.includes(c.id));      // the regions that are open
  const regionOf = (id) => regions.find((r) => r.id === id);
  const area = (a) => a.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' km²';      // the value of the data file, no rounding
  let items = [], aliasesAsked = false;
  const boxes = [];      // one entry per search box on the page (the one in the first screen, the one at the map)
  const lang = (c) => { try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(c) || c; } catch (e) { return c; } };
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const build = () => {
    const al = window.GLACIER_ALIASES || {};
    items = (window.HOME_GLACIERS || []).filter((g) => regionOf(g.region)).map((g) => ({ id: g.id, label: g.name, names: (al[g.id] && al[g.id].names) || [], region: g.region, area: g.area, parent: g.parent, sub: g.sub, weight: Math.log10(1 + g.area) * 0.01 }));
  };
  build();
  const askAliases = () => { if (aliasesAsked) return; aliasesAsked = true; const sc = document.createElement('script'); sc.src = 'data/glacier-aliases.js'; sc.onload = () => { build(); boxes.forEach((b) => { if (b.input.value.trim()) b.render(); }); }; document.head.appendChild(sc); };
  /* a search that finds nothing: offer to tell us (the Worker accepts only glaciers on Wikidata's list, see worker.js "please add this glacier") */
  let askCfg = null;
  const askConfig = () => askCfg || (askCfg = fetch('/ask/config').then((r) => (r.ok ? r.json() : { open: false })).catch(() => ({ open: false })));
  const loadTurnstile = () => (window.turnstile ? Promise.resolve() : new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; sc.async = true; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); }));
  const offerAsk = async (stat, q) => {
    const cfg = await askConfig();
    if (!cfg.open || stat.hidden || !stat.textContent.includes(`“${q}”`) || stat.querySelector('.ask')) return;
    const w = document.createElement('div'); w.className = 'ask';
    const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Ask us to add this glacier';
    const m = document.createElement('p'); m.className = 'askmsg'; m.setAttribute('role', 'status');
    const t = document.createElement('div'); t.className = 'askcheck'; t.hidden = true;
    w.append(b, t, m); stat.append(w);
    b.onclick = async () => {
      b.disabled = true; m.textContent = '';
      try {
        await loadTurnstile(); t.hidden = false;
        window.turnstile.render(t, { sitekey: cfg.siteKey, theme: 'light', callback: async (token) => {
          t.hidden = true; m.textContent = 'Sending…';
          try {
            const r = await fetch('/ask/glacier', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: q, token, lang: (navigator.language || '').slice(0, 2).toLowerCase() }) }), j = await r.json().catch(() => ({}));
            if (r.ok) { b.hidden = true; m.textContent = `Thank you! We have noted ${j.label || q}.`; }
            else { b.disabled = false; m.textContent = j.message || j.error || 'That did not work. Please try again.'; }
          } catch { b.disabled = false; m.textContent = 'That did not work. Please try again.'; }
        }, 'error-callback': () => { b.disabled = false; t.hidden = true; m.textContent = 'The check could not be loaded. Please try again.'; } });
      } catch { b.disabled = false; m.textContent = 'The check could not be loaded. Please try again.'; }
    };
  };
  const setup = (input) => {
    const root = input.closest('.search'), box = root.querySelector('.res'), stat = root.querySelector('.sstat'), pre = input.id + '-r';
    let active = -1, shown = [];
    const close = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
    function render() {
      const q = input.value.trim();
      stat.hidden = true;
      if (!q) { box.innerHTML = ''; return close(); }
      shown = GlacierSearch.search(q, items, { limit: 8 });
      if (!shown.length) { box.innerHTML = ''; close(); stat.hidden = false; stat.textContent = `No glacier found for “${q}”. Try another spelling, or choose a region on the map below.`; offerAsk(stat, q); return; }
      const unsure = shown[0].score < 0.8;
      box.innerHTML = (unsure ? '<li class="hd" role="presentation">Did you mean…</li>' : '') + shown.map((r, i) => {
        const also = GlacierSearch.fold(r.name) !== GlacierSearch.fold(r.item.label) ? `<small class="al">also called “${esc(r.name)}”${r.lang ? ' (' + esc(lang(r.lang)) + ')' : ''}</small>` : '';
        return `<li role="option" id="${pre}${i}" data-i="${i}"><span class="n"><b>${esc(r.item.label)}</b>${also}</span><small>${r.item.parent ? 'Outlet of ' + esc(items.find((x) => x.id === r.item.parent).label) : esc(regionOf(r.item.region).name)} · ${area(r.item.area)}</small></li>`;
      }).join('');
      box.hidden = false; input.setAttribute('aria-expanded', 'true'); setActive(unsure ? -1 : 0);
    }
    function setActive(i) {
      active = i;
      box.querySelectorAll('[role=option]').forEach((li, k) => li.setAttribute('aria-selected', k === i ? 'true' : 'false'));
      if (i >= 0) input.setAttribute('aria-activedescendant', pre + i); else input.removeAttribute('aria-activedescendant');
    }
    function choose(i) {
      const r = shown[i]; if (!r) return;
      input.value = r.item.label; close();
      if (typeof chooseGlacier === 'function') {      // the map is there: go to the region section and open the glacier's card
        document.querySelector('.mapbox').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth', block: 'center' });      // the map itself, not the top of the section (the Why block is above it)
        chooseGlacier(r.item.id);
      } else {      // no map (its library did not load): open the glacier's page
        const rg = regionOf(r.item.region), q = 'g=' + encodeURIComponent(r.item.parent || r.item.id) + (r.item.parent ? '&sub=' + r.item.sub : '');
        location.href = LOCAL_PAGE ? 'index.html#' + (rg.id === 'ch' ? '' : 'r=' + rg.id + '&') + q : rg.path + '/#' + q;
      }
    }
    input.addEventListener('focus', askAliases);
    input.addEventListener('input', () => { askAliases(); render(); });
    input.addEventListener('keydown', (e) => {
      const n = shown.length;
      if (e.key === 'ArrowDown' && n) { e.preventDefault(); if (box.hidden) render(); else setActive((active + 1) % n); }
      else if (e.key === 'ArrowUp' && n) { e.preventDefault(); setActive((active - 1 + n) % n); }
      else if (e.key === 'Enter') { if (!box.hidden && shown.length) { e.preventDefault(); choose(active >= 0 ? active : 0); } }
      else if (e.key === 'Escape') { if (!box.hidden) { e.preventDefault(); close(); } else input.value = ''; }
    });
    box.addEventListener('mousedown', (e) => { const li = e.target.closest('[data-i]'); if (li) { e.preventDefault(); choose(Number(li.dataset.i)); } });
    box.addEventListener('mousemove', (e) => { const li = e.target.closest('[data-i]'); if (li && Number(li.dataset.i) !== active) setActive(Number(li.dataset.i)); });
    document.addEventListener('click', (e) => { if (!root.contains(e.target)) close(); });
    boxes.push({ input, render });
  };
  document.querySelectorAll('.search input[role=combobox]').forEach(setup);
})();
</script>
</body>
</html>
