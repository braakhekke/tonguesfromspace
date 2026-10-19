/* =====================================================================
   7a. The right panel of the Vatnajökull region (Iceland)
       The Swiss story (GLAMOS figures, the Switzerland tab, hikes) has no counterpart here, so this region has its own: Discover (what to look for, news, a fact, the name, the
       Copernicus scenes), Stats (area, length, retreat since about 1890, the lagoon, the surface since 2016) and a Vatnajökull tab (the ice cap). The same cards, tiles, tabs and About block as the
       Swiss panel (css/style.css, aboutFrame in js/07-render.js). Called from renderStory.
       Only documented facts, each with its source (the numbered notes, SOURCES in js/07-render.js): the RGI 6.0 outlines (data/vatnajokull.js), the Icelandic Met Office outlines of about 1890 and
       2025, Guðmundsson et al. (2017) for the change since about 1890, Wikipedia for the lagoon and the name, and the surface change measured here from the ArcticDEM strips (the terrain file).
   ===================================================================== */
const nfIs = (x, d = 0) => x.toLocaleString('en-GB', {minimumFractionDigits: d, maximumFractionDigits: d});
const IS_CHANGE = {};      // outlet id -> the surface change 2016 to 2022 in the terrain file (filled when the file has loaded)
/* The texts of an outlet. Each note is a numbered source (gfn) shared by the panel and the About chapter Sources. */
const IS_WIKI_BR = 'Wikipedia, <a href="https://en.wikipedia.org/wiki/Brei%C3%B0amerkurj%C3%B6kull" target="_blank" rel="noopener">Breiðamerkurjökull</a> (CC BY-SA 4.0), with the sources named there';
const IS_WIKI_JL = 'Wikipedia, <a href="https://en.wikipedia.org/wiki/J%C3%B6kuls%C3%A1rl%C3%B3n" target="_blank" rel="noopener">Jökulsárlón</a> (CC BY-SA 4.0), with the sources named there';
const IS_INFO = {
  breidamerkurjokull: {
    lede: 'The big outlet of the Vatnajökull ice cap that ends in the glacier lagoon Jökulsárlón. Its front has pulled back 4 to 7 km since about 1890, and the lagoon has grown in its place.',
    look: () => `Find the lagoon Jökulsárlón at the foot of the glacier and follow the ice front from year to year: where the ice pulls back, the lagoon grows. The lagoon covered about 8 km² in 1975 and 17.5 km² in 2004${gfn(IS_WIKI_BR)}. Icebergs break off the front and float in the lagoon before they reach the sea.`,
    news: () => `On 25 August 2024 an ice wall collapsed in a ravine outside an ice cave on Breiðamerkurjökull: one tourist died and another was seriously injured. The accident started a debate about ice cave tours in Iceland${gfn(IS_WIKI_BR + ' (reports of the BBC and of Icelandic media)')}.`,
    fact: () => `When the first settlers came, around 900 AD, the tongue of the glacier lay about 20 km further north than today's coast. During the Little Ice Age (about 1600 to 1900) it advanced until its front was about 1 km from the coast, near the river Jökulsá, around 1890${gfn(IS_WIKI_BR)}.`,
    name: () => `Breiðamerkurjökull means roughly "glacier of the wide woodland" (Breiðamörk)${gfn(IS_WIKI_BR)}. Jökulsárlón is the "glacier river lagoon": it began to form in 1933 or 1934, in the hollow that the retreating ice left${gfn(IS_WIKI_JL)}.`
  }
};
function iceTiles(ice){ return [{v: nfIs(ice.areaKm2 || 0), s: 'km²', k: 'Ice area', d: 'around 2000', f: 'is_rgi'}, {v: ice.entities || 0, k: 'Glacier basins', d: 'of at least 2 km²', f: 'is_rgi'}]; }
function statGroupIs(key, title, sum, tiles){
  return `<details class="stat-group dcard coll" name="stats" data-card="${key}"${cardOpen(key) ? ' open' : ''}><summary><h4><span class="ico">${ICONS[key] || ICONS.area}</span>${title}</h4>${sum ? `<span class="sum-v">${sum}</span>` : ''}</summary>
    <div class="stat-row ${key}">${tiles.map(t => `<div class="stat${t.hero ? ' hero wide' : ''}${t.loss ? ' loss' : ''}"><span class="v">${t.v ?? '—'}${t.s ? ` <small>${t.s}</small>` : ''}</span><span class="k">${t.k}${t.f ? fn(t.f) : ''}</span>${t.d ? `<span class="d">${t.d}</span>` : ''}</div>`).join('')}</div></details>`;
}
function renderStoryVatnajokull(){
  const g = glacierPicked ? currentGlacier() : null, ice = (ICECAP && ICECAP.icecap) || {}, storyEl = document.getElementById('story');
  if (typeof updateRightTab === 'function') updateRightTab();
  const key = currentGlacier().id + '|' + !!g, keepScroll = storyEl.scrollTop, same = storyEl.dataset.key === key;      // the same outlet (or the same overview) as the last drawing
  const openCards = same ? [...storyEl.querySelectorAll('details.coll[open]')].map(cardKey) : [];
  storyEl.dataset.glacier = currentGlacier().id; storyEl.dataset.key = key; storyEl.classList.remove('empty');
  dynSources = [];
  const info = g && IS_INFO[g.id], O = g && g.outlines, a25 = O && O.latest ? O.latest.areaInBasinKm2 : null, a00 = g ? g.rgi.areaKm2 : null;
  const dcardIs = (title, inner) => `<details class="card dcard coll" name="vat"><summary><div class="card-h">${title}</div></summary><div class="dbody">${inner}</div></details>`;
  const outlets = GLACIERS.map(x => ({name: x.name, areaKm2: x.rgi.areaKm2, id: x.id, pick: true}));
  const all = ((ICECAP && ICECAP.basins) || []).map(b => ({...b, pick: false})).concat(outlets).sort((a, b) => b.areaKm2 - a.areaKm2);
  const largest = dcardIs('Largest outlets', `<ul class="blist">` +
    all.slice(0, 10).map(b => `<li class="${b.pick ? 'go' : 'off'}" ${b.pick ? `data-id="${b.id}"` : ''}><span>${b.name || 'Unnamed outlet'}</span><small>${nfIs(b.areaKm2)} km²${b.pick ? '' : ' · soon'}</small></li>`).join('') +
    `</ul><p class="srcline">Areas of the drainage basins, about 2000${fn('is_rgi')}. Only the red outlets have pictures so far.</p>`);
  const icecapLede = `${ice.entities || 0} glacier basins of at least 2 km² with ${nfIs(ice.areaKm2 || 0)} km² of ice around the year 2000${fn('is_rgi')}. Each basin drains one outlet glacier. Click a red outlet on the map to see its snout in Sentinel-2 pictures.`;
  const tab = t => `role="tab" data-tab="${t}" aria-selected="${storyTab === t}"`, panel = (t, inner) => `<div class="tab-panel" data-panel="${t}" ${storyTab === t ? '' : 'hidden'}>${inner}</div>`;
  const ch = IS_CHANGE[currentGlacier().id];
  const tilesArea = g ? [
      {hero: true, loss: a25 < a00, v: nfIs(a25), s: 'km²', k: 'Glacier area, September 2025', f: 'is_imo'},
      {v: nfIs(a00), s: 'km²', k: 'Area about 2000', f: 'is_rgi', d: 'the RGI outline'},
      {v: `−${nfIs(100 * (a00 - a25) / a00)} %`, k: 'Change since 2000', d: `${nfIs(a00 - a25)} km² less ice inside the 2000 outline`}] : [];
  const cards = g ? [
    statGroupIs('area', 'Area', a25 ? `${nfIs(a25)} km²` : '', tilesArea),
    statGroupIs('length', 'Length and height', '', [
      {v: nfIs(g.rgi.lengthKm, 1), s: 'km', k: 'Length', d: 'longest flow line, about 2000', f: 'is_rgi'},
      {v: nfIs(g.rgi.zmax), s: 'm', k: 'Highest point', d: 'of the outline, about 2000', f: 'is_rgi'},
      {v: 'about 0', s: 'm', k: 'Lowest ice', d: 'the front ends in the lagoon, at sea level', f: 'is_wiki'}]),
    statGroupIs('change', 'Since about 1890', '4–7 <small>km</small>', [
      {hero: true, loss: true, v: '4–7', s: 'km', k: 'Retreat of the front since about 1890', f: 'is_gudm'},
      {v: '115', s: 'km²', k: 'Land exposed', d: 'by the retreat, 0.95 km² a year', f: 'is_gudm'},
      {v: '70 ± 8', s: 'km³', k: 'Ice lost (water equivalent)', d: 'about two thirds after the mid 20th century', f: 'is_gudm'},
      {v: '−0.6', s: 'm w.e. a⁻¹', k: 'Mass balance, 1890 to 2010', d: '± 0.1, mean over the whole glacier', f: 'is_gudm'},
      {v: 'up to 200', s: 'm', k: 'Lowering of the lowest ice', d: 'above 1,500 m the change is small', f: 'is_gudm'}]),
    statGroupIs('volume', 'Surface since 2016', ch ? `${nfIs(ch.meanM, 1).replace('-', '−')} <small>m</small>` : '', [
      {hero: true, loss: true, v: ch ? nfIs(ch.meanM, 1).replace('-', '−') : null, s: 'm', k: `Mean surface change ${ch ? ch.from : 2016} to ${ch ? ch.to : 2022}`, f: 'is_arctic', d: 'the lower glacier, inside the 2000 outline, from the ArcticDEM strips'},
      {v: ch ? nfIs(ch.km3, 2).replace('-', '−') : null, s: 'km³', k: 'Volume of the surface change', d: ch ? `over ${nfIs(ch.areaKm2, 1)} km² of the 3D strip` : ''}]),
    statGroupIs('drop', 'The lagoon Jökulsárlón', 'about 25 <small>km²</small>', [
      {hero: true, v: 'about 25', s: 'km²', k: 'Lagoon area today', f: 'is_wiki', d: '8 km² in 1975, 17.5 km² in 2004'},
      {v: '284', s: 'm', k: 'Greatest depth', d: 'as reported in 2009', f: 'is_wiki'},
      {v: '1933–34', k: 'Began to form', d: 'in the hollow of the retreating ice', f: 'is_wiki'}])
  ].join('') : statGroupIs('area', 'Ice cap', `${nfIs(ice.areaKm2 || 0)} km²`, iceTiles(ice));
  const discover = g ? [
    dcard('eye', 'What to look for', `<p>${info.look()}</p>`), dcard('news', 'In the news', `<p>${info.news()}</p>`), dcard('bulb', 'Did you know?', `<p>${info.fact()}</p>`), dcard('tag', 'The name', `<p>${info.name()}</p>`),
    cbYears().length ? dcard('scene', 'Copernicus Browser', `<p>These are the satellite scenes on the map${fn('s2')}. Open one in the Copernicus Browser, the free viewer of the Copernicus Data Space Ecosystem, to zoom in, try other band combinations or look at neighbouring dates.</p><div class="cb-links">${cbButtonsHtml()}</div>`) : ''
  ].join('') : largest;
  storyEl.innerHTML = (g ? `<h2>${g.name}</h2><p class="sub">${[g.canton, g.range].filter(Boolean).join(', ')}</p><p class="lede">${info.lede}</p>`
                         : `<h2>${ice.name || 'Vatnajökull'}</h2><p class="sub">Ice cap in south-east Iceland</p><p class="lede">${icecapLede}</p>`) +
    `<div class="tabs" role="tablist" aria-label="About ${g ? g.name : 'Vatnajökull'}">
      <button type="button" ${tab('look')}>Discover</button><button type="button" ${tab('figures')}>Stats</button><button type="button" ${tab('swiss')}>Vatnajökull</button></div>` +
    panel('look', discover) + panel('figures', `<div class="stats">${cards}</div>`) +
    panel('swiss', `<p class="lede">${icecapLede}</p><div class="stats">${statGroupIs('area', 'Ice cap', `${nfIs(ice.areaKm2 || 0)} km²`, iceTiles(ice))}</div>` + largest.replace('name="vat"', 'name="vat2"')) +
    aboutFrame(aboutChaptersIs());
  storyEl.querySelectorAll('.tabs button').forEach(bt => bt.onclick = () => {
    storyTab = bt.dataset.tab;
    storyEl.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', x === bt));
    storyEl.querySelectorAll('.tab-panel').forEach(pn => pn.hidden = pn.dataset.panel !== storyTab);
  });
  storyEl.querySelectorAll('.blist li.go').forEach(li => li.onclick = () => chooseGlacier(li.dataset.id));
  restoringCards = true;
  storyEl.querySelectorAll('details.coll').forEach(d => { if (openCards.includes(cardKey(d))) d.open = true; });
  setTimeout(() => { restoringCards = false; }, 100);
  storyEl.scrollTop = same ? keepScroll : 0;
  if (g && !ch && !IS_CHANGE[g.id]) loadBundle(bundleId(g)).then(b => { if (b && b.change) { IS_CHANGE[g.id] = b.change; if (document.getElementById('story').dataset.key === key) renderStory(); } });      // the surface change comes with the terrain file
  fillStrips();
}
/* the dates of the ArcticDEM strips, from the header of the terrain file (About, The 3D view) */
function fillStrips(){
  const el = document.getElementById('isStrips'); if (!el || !glacierPicked) return;
  loadBundle(bundleId(currentGlacier())).then(b => { const e2 = document.getElementById('isStrips'); if (e2 && b && b.yearly) e2.innerHTML = b.yearly.strips.map(s => fmtDate(s.date)).join('; '); const n = document.getElementById('isStripsN'); if (n) n.textContent = `${b.yearly.strips.length} strips`; });
}
/* The chapters of About for Iceland: the same list and format as the Swiss one (aboutFrame), the texts of this region */
function aboutChaptersIs(){
  const ch = (id, title, body) => `<details class="about-ch" name="aboutch" id="${id}"><summary>${title}</summary><div class="about-sec">${body}</div></details>`;
  return [
    ch('ch-1', 'Why Tongues from Space', `
        <p>A glacier ends in its tongue: the lowest stretch of ice, where the glacier is thinnest and melts the most. It is also where change is easiest to see. Every summer the tip pulls back and leaves bare rock, a lake or a new valley floor behind, and a satellite pixel of 10 m is fine enough to show it. At Breiðamerkurjökull the ice has left a lagoon.</p>
        <p>I believe in pictures. A number can be read a hundred times without it staying with you, but a before-and-after image is understood at once and remembered. That is why the pictures come first here, and the figures sit next to them.</p>
        <p>I hope this dashboard sparks awareness of glaciers and of why they matter to society. — Jochem Braakhekke</p>`),
    ch('ch-2', 'The satellite images', `
        <p>One Sentinel-2 scene per outlet and year: the clearest view between 1 August and 15 October. Only scenes that cover the whole picture count. Every acquisition is scored for cloud (and cloud shadow) cover; the scene with at most 5 % cloud that lies closest to 30 September wins, the end of the melt season, when the ice is at its bare minimum. If none is that clear, the least cloudy scene up to 30 % is used and marked "some clouds" (dashed). The pictures are rendered from Level-1C data with the Copernicus Browser true colour process, which keeps shaded slopes natural.</p>
        <p>Where it can be, one satellite orbit is used for all years, so the glacier is seen under the same angle and at the same time of day every time: the orbit that gives a usable scene in most years wins. Iceland is cloudy, so a scene may be chosen by hand instead: for Breiðamerkurjökull in 2023 it is the one of 15 September (the automatic choice, 13 October, was mostly snow).</p>
        <p>Why not later: fresh snow soon covers the ice in October, and the figures of the glaciological year (autumn to autumn) belong to the end of the melt season.</p>
        <p><em>Before 2016: Landsat.</em> Sentinel-2 starts in 2016. A switch under the years adds Landsat 5 and 7 pictures (Collection 2 Level-2, 30 m pixels instead of Sentinel-2's 10 m, so with less detail; natural colour; USGS) for the years from 1985 to 2013, with the same rules: one scene per year, 1 August to 15 October, the clear one closest to 30 September, the whole picture covered where there is such a scene. Years without a usable scene (1984, 1988, 1998, 2002, 2004, 2005, 2007) have no picture. The colours of the years are matched to each other on a patch of rock east of the tongue, so that sensors and seasons look alike. Landsat 7 pictures after 2003 have stripes of missing data; these are filled by interpolating along the direction of the ice flow, which is read from the streaks in the picture itself (medial moraines, flow lines). That is a repair of the picture, not data. Landsat 8 (2013 to 2015) is not used: its surface reflectance is not usable over the ice, shade and water here, and Sentinel-2 pictures start in 2016. Landsat pictures are not corrected for slope shading. In the 3D view they are draped over the ice surface of 2011 (the first year with a surface model) or of the year, so the older ice is shown at its height of 2011.</p>`),
    aboutSentinel(''),
    aboutColours(),
    ch('ch-5', 'Why only this glacier, and only its tongue', `
        <p>For now the site shows one outlet of the Vatnajökull ice cap, Breiðamerkurjökull, whose snout ends in the lagoon Jökulsárlón. Vatnajökull has many more outlets; they are listed under Largest outlets and can be added one by one.</p>
        <p><em>The picture is the tongue, not the whole glacier.</em> Because of size and storage reasons, the big glaciers of Iceland only show the tongue in their image boxes, not the full extent: the satellite picture of an outlet is a square of 24 km around its tongue (Breiðamerkurjökull is 53 km long). In the dock below the map, <em>Tongue</em> shows the extent of the image box, and <em>Whole glacier</em> shows the extent of the whole glacier, its outline, where the map shows only the background layer outside the box.</p>`),
    ch('ch-6', 'Glacier figures', `
        <p><em>Area.</em> The area of September 2025 is the ice of the Icelandic Met Office outline of 17 September 2025 (drawn from Sentinel-2 pictures) inside the drainage basin of the Randolph Glacier Inventory 6.0, counted on a grid of 100 m here. The inventory itself is from about 2000 (its area, length and highest point are shown as such and not as today's), and the 2025 outline shows how much ice is left inside it. The Icelandic Met Office outlines of about 1890 (the Little Ice Age maximum) and 2025 can be switched on in the Layers menu; they end at the edge of the area shown.</p>
        <p><em>Retreat, mass loss and mass balance since about 1890</em> are not measured here: they are the figures of Guðmundsson, Björnsson and Pálsson (2017), who compared elevation models of 2010 (lidar), 1945 and about 1890, old maps, photographs and written records. The terminus retreated 4 to 7 km (the range is theirs), exposing about 115 km² of land, and the glacier lost 70 ± 8 km³ of water equivalent, two thirds of it after the middle of the 20th century.</p>
        <p><em>Surface since 2016</em> is measured here, from the ArcticDEM strips of the 3D view: the mean change of the surface between the summers of 2016 and 2022 over the part of the 3D area that lies inside the 2000 outline and above the water of the lagoon (the area is named on the tile). It is a change of height of the surface (ice and what ice left behind), not of water equivalent.</p>`),
    ch('ch-10', 'The 3D view', `
        <p>An area of 18 km along the shore of the lagoon and 10 km up the glacier, with the satellite picture of the chosen year draped over the terrain: the whole lobe of the tongue and the lagoon in front of it. Its place and direction were drawn by hand on the satellite picture (up the glacier is towards north-west, 318°, from the front on the west shore of the lagoon). The camera starts at the lagoon and looks up the glacier.</p>
        <p><em>Heights</em> come from ArcticDEM, the dated 2 m surface models of the Polar Geospatial Center, made from Maxar WorldView stereo images. <span id="isStripsN">Several</span> strips were used, acquired on <span id="isStrips">…</span>. Other strips were left out: too little of the area, a poor model (ground far away from the reference), or winter strips with snow before the last summer one. Every strip is moved onto ÍslandsDEM (10 m, Náttúrufræðistofnun Íslands and Landmælingar Íslands) with the ground beside the glacier, which agrees to about 1 m, and sampled on a grid of 36 m (the mean of 9 cells of 2 m spread over the grid cell).</p>
        <p><em>The ice surface of each year</em> is its surface on 15 September. Where a summer strip (mid July to mid November, bare ice) lies within 45 days the year is <em>measured</em>; between strips the surface is <em>interpolated</em> in time, grid point by grid point; after the last strip (14 February 2024, with some snow) it is <em>held</em>: the last surface stays, so the 3D view shows no further thinning for 2024 to 2026 although the satellite picture does. The 3D note says which of the three applies to the year on screen. Single strips that disagree with their neighbours in time (a failed match, cloud) are left out grid point by grid point.</p>
        <p><em>Names</em> of the lagoons come from OpenStreetMap. The 3D view has no radar pins and no historic photographs for Iceland.</p>`),
    ch('ch-12', 'Footpaths, Street View and names', `
        <p><em>Footpaths and tracks</em> (Layers menu) come from OpenStreetMap: footpaths in yellow, tracks, mostly roads for four-wheel-drive vehicles, in red, cut to the picture area. The violet band marks where a person 1.7 m tall can see the ice front from the path (our own calculation from ÍslandsDEM: the ice of the 2025 outline in the lowest 1.5 km of the tongue, 20 m steps along the path, a stretch counts when it sees at least a quarter of the points; the ice has moved since the model was made).</p>
        <p><em>Street View</em> (the layer Panoramas): five panoramas from the shore of Jökulsárlón and the west side of the tongue, chosen by hand from those that see the ice (a few of Google, most photographed by visitors); Google's own viewer opens in the panel, nothing of the pictures is stored here. The ice front is 5 to 6 km from the lagoon's parking place: it is the far end of the view.</p>
        <p><em>Place names</em> in 3D (the lagoons) come from OpenStreetMap too.</p>`),
    ch('ch-9', 'Sources', `<ol class="src-list">${SOURCE_LIST.map(k => `<li id="fn-${k}" title="Click to go back to the text">${SOURCES[k]()}</li>`).join('')}${dynSources.map((h, i) => `<li id="fn-g${i + 1}" title="Click to go back to the text">${h}</li>`).join('')}</ol>`)
  ].join('\n      ');
}
