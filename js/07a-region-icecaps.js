/* =====================================================================
   7a. The right panel of the ice-cap regions (Vatnajökull and the rest of Iceland, Svalbard, mainland Norway)
       The Swiss story (GLAMOS figures, the Switzerland tab, hikes) has no counterpart here, so these regions have their own: Discover (what to look for, news, a fact, the name, the
       Copernicus scenes), Stats (area at the dates of the region's inventories, length, heights, extra cards of single glaciers) and a tab for the region. The same cards, tiles, tabs and
       About block as the Swiss panel (css/style.css, aboutFrame in js/07-render.js). Called from renderStory.
       Only documented facts, each with its source (the numbered notes, SOURCES in js/07-render.js): the inventories behind the data files (RGI 6.0 and the Icelandic Met Office, NVE, the
       Norwegian Polar Institute), the texts of single glaciers in js/07b-icecap-texts.js, and the surface change measured here from the ArcticDEM strips (the terrain file of Breiðamerkurjökull).
   ===================================================================== */
const nfIs = (x, d = 0) => x.toLocaleString('en-GB', {minimumFractionDigits: d, maximumFractionDigits: d});
const IS_CHANGE = {};      // glacier id -> the surface change 2016 to 2022 in the terrain file (filled when the file has loaded; only Breiðamerkurjökull has one)
/* What differs from region to region in the panel: the heading of the overview, the lede of the tab, the title of the list */
const IC_REGION = {
  'is-vatnajokull': {tab: 'Vatnajökull', h2: ice => ice.name || 'Vatnajökull', sub: 'Ice cap in south-east Iceland', list: 'Largest outlets', one: 'outlet',
    lede: (ice, os) => `${ice.entities || 0} glacier basins of at least 2 km² with ${nfIs(ice.areaKm2 || 0)} km² of ice around the year 2000${fn('is_rgi')}. Each basin drains one outlet glacier. Click a red outlet on the map to see its snout in Sentinel-2 pictures.`,
    listNote: () => `Areas of the drainage basins, about 2000${fn('is_rgi')}. Only the red outlets have pictures so far.`, tiles: ice => [{v: nfIs(ice.areaKm2 || 0), s: 'km²', k: 'Ice area', d: 'around 2000', f: 'is_rgi'}, {v: ice.entities || 0, k: 'Glacier basins', d: 'of at least 2 km²', f: 'is_rgi'}]},
  'is-rest': {tab: 'Iceland', h2: () => 'Iceland outside Vatnajökull', sub: 'Ice caps and glaciers of Iceland', list: 'The ten largest', one: 'glacier',
    lede: (ice, os) => `The ten largest glaciers of Iceland outside Vatnajökull, which has a page of its own. Basins of the Randolph Glacier Inventory that touch are counted as one ice cap: Iceland has ${ice.entities || 0} of them outside Vatnajökull, with ${nfIs(ice.areaKm2 || 0)} km² of ice around the year 2000${fn('is_rgi')}; the ten shown hold ${nfIs(100 * os.reduce((t, o) => t + o.rgi.areaKm2, 0) / (ice.areaKm2 || 1))} % of it. Click a red glacier on the map.`,
    listNote: () => `Ice caps and glaciers by area, about 2000${fn('is_rgi')}.`, tiles: ice => [{v: nfIs(ice.areaKm2 || 0), s: 'km²', k: 'Ice area outside Vatnajökull', d: 'around 2000', f: 'is_rgi'}, {v: ice.entities || 0, k: 'Ice caps and glaciers', d: 'basins that touch counted as one', f: 'is_rgi'}]},
  'no-mainland': {tab: 'Norway', h2: () => 'Mainland Norway', sub: 'Glaciers and ice caps of mainland Norway', list: 'The ten largest', one: 'glacier',
    lede: (ice, os) => `The ten largest glaciers of mainland Norway by area in the glacier inventory of 2018–2019 of NVE, the Norwegian Water Resources and Energy Directorate${fn('no_nve')}. Together they hold ${nfIs(os.reduce((t, o) => t + o.rgi.areaKm2, 0))} km² of the 2,328 km² of ice of the country${fn('no_nve')}. Click a red glacier on the map.`,
    listNote: () => `By area in 2018–2019${fn('no_nve')}.`, tiles: ice => [{v: '2,328', s: 'km²', k: 'Glacier area of Norway', d: '2018–2019', f: 'no_nve'}]},
  'no-svalbard': {tab: 'Svalbard', h2: () => 'Svalbard', sub: 'Archipelago in the Arctic Ocean, Norway', list: 'Ten large glaciers', one: 'glacier',
    lede: (ice, os) => `Ten of the largest glaciers of the Svalbard archipelago, the islands around Spitsbergen, by their area in 2020 in the inventory of the Norwegian Polar Institute${fn('sj_npi')}. The inventory has ${nfIs(ice.entities || 0)} glacier units with ${nfIs(ice.areaKm2 || 0)} km² of ice in 2020. Most of the big ones end in the sea. Click a red glacier on the map.`,
    listNote: () => `Named glacier units by area in 2020${fn('sj_npi')}. The two largest units of the inventory that carry only the name Austfonna are not included: the inventory does not say which outlet they are.`, tiles: ice => [{v: nfIs(ice.areaKm2 || 0), s: 'km²', k: 'Glacier area, 2020', d: `${nfIs(ice.entities || 0)} glacier units`, f: 'sj_npi'}]}
};
/* One stat card: a group of tiles under a red header, as the Swiss Stats tab */
function statGroupIs(key, title, sum, tiles){
  return `<details class="stat-group dcard coll" name="stats" data-card="${key}"${cardOpen(key) ? ' open' : ''}><summary><h4><span class="ico">${ICONS[key] || ICONS.area}</span>${title}</h4>${sum ? `<span class="sum-v">${sum}</span>` : ''}</summary>
    <div class="stat-row ${key}">${tiles.map(t => `<div class="stat${t.hero ? ' hero wide' : ''}${t.loss ? ' loss' : ''}"><span class="v">${t.v ?? '—'}${t.s ? ` <small>${t.s}</small>` : ''}</span><span class="k">${t.k}${t.f ? fn(t.f) : ''}</span>${t.d ? `<span class="d">${t.d}</span>` : ''}</div>`).join('')}</div></details>`;
}
const minus = s => String(s).replace('-', '−');
/* What to look for, from the data alone: where the tongue is and how the front has moved. Documented text of the glacier (07b) follows it. */
function lookAuto(g){
  const ser = areaSeries(g), now = ser[ser.length - 1], then = ser.length > 1 ? ser[0] : null, O = g.outlines || {}, bits = [];
  const lag = (IC_INFO[g.id] || {}).lowest, low = lag ? lag.text : g.rgi.zmin > 0 ? `at about ${nfIs(g.rgi.zmin)} m above sea level (${REGION.inventory.short} ${REGION.inventory.about}${fn(REGION.inventory.source)})` : `where the ice ends in the sea (${REGION.inventory.short} ${REGION.inventory.about}${fn(REGION.inventory.source)})`;
  bits.push(`The picture is centred on the tongue of ${g.name}, the lowest ice of the ${g.units > 1 ? 'glacier complex' : 'glacier'}, ${low}. Use the 3D view to see the shape of the valley.`);
  if (g.tongueName) bits.push(`The lowest tongue belongs to ${g.tongueName}${REGION.id === 'no-mainland' ? ` (${REGION.inventory.short}'s name for the glacier unit)` : ''}.`);
  if (then && now && then.km2 > 0) bits.push(`Its area was ${nfIs(then.km2)} km² in ${then.label} and ${nfIs(now.km2)} km² in ${now.label} (${nfIs(100 * Math.abs(now.km2 - then.km2) / then.km2)} % ${now.km2 < then.km2 ? 'less' : 'more'}); switch on the old outline in the Layers menu to see where the ice stood${fn(O.lia && REGION.id === 'no-mainland' ? 'no_old' : REGION.inventory.source)}.`);
  return bits.join(' ');
}
function renderStoryIcecap(){
  const g = glacierPicked ? currentGlacier() : null, ice = (ICECAP && ICECAP.icecap) || {}, storyEl = document.getElementById('story'), R = IC_REGION[REGION.id];
  if (typeof updateRightTab === 'function') updateRightTab();
  const key = currentGlacier().id + '|' + !!g, keepScroll = storyEl.scrollTop, same = storyEl.dataset.key === key;      // the same glacier (or the same overview) as the last drawing
  const openCards = same ? [...storyEl.querySelectorAll('details.coll[open]')].map(cardKey) : [];
  storyEl.dataset.glacier = currentGlacier().id; storyEl.dataset.key = key; storyEl.classList.remove('empty');
  dynSources = [];
  const info = (g && IC_INFO[g.id]) || {}, dcardIc = (title, inner) => `<details class="card dcard coll" name="vat"><summary><div class="card-h">${title}</div></summary><div class="dbody">${inner}</div></details>`;
  const own = GLACIERS.map(x => ({name: x.name, areaKm2: x.rgi.areaKm2, id: x.id, pick: true}));
  const all = (REGION.inventory.listAll ? ((ICECAP && ICECAP.basins) || []).map(b => ({...b, pick: false})) : []).concat(own).sort((a, b) => b.areaKm2 - a.areaKm2);
  const largest = dcardIc(R.list, `<ul class="blist">` +
    all.slice(0, 10).map(b => `<li class="${b.pick ? 'go' : 'off'}" ${b.pick ? `data-id="${b.id}"` : ''}><span>${b.name || REGION.unnamed}</span><small>${nfIs(b.areaKm2)} km²${b.pick ? '' : ' · soon'}</small></li>`).join('') +
    `</ul><p class="srcline">${R.listNote()}</p>`);
  const lede = R.lede(ice, GLACIERS);
  const tab = t => `role="tab" data-tab="${t}" aria-selected="${storyTab === t}"`, panel = (t, inner) => `<div class="tab-panel" data-panel="${t}" ${storyTab === t ? '' : 'hidden'}>${inner}</div>`;
  const ch = g && IS_CHANGE[g.id], ser = g ? areaSeries(g) : [], now = ser[ser.length - 1];
  const tilesArea = g && now ? [{hero: true, loss: ser.length > 1 && now.km2 < ser[0].km2, v: nfIs(now.km2), s: 'km²', k: `Glacier area, ${now.label}`, f: REGION.id === 'no-svalbard' ? 'sj_npi' : REGION.id === 'no-mainland' ? 'no_nve' : 'is_imo'}]
    .concat(ser.slice(0, -1).reverse().map(a => ({v: nfIs(a.km2), s: 'km²', k: `Area ${a.label}`, f: REGION.id === 'no-svalbard' ? 'sj_npi' : REGION.id === 'no-mainland' ? 'no_old' : 'is_rgi', d: a.km2 > 0 ? `${now.km2 < a.km2 ? '−' : '+'}${nfIs(100 * Math.abs(now.km2 - a.km2) / a.km2)} % to ${now.label}` : ''}))) : [];
  const extra = g && info.groups ? info.groups() : [];
  const cards = g ? [
    statGroupIs('area', 'Area', now ? `${nfIs(now.km2)} km²` : '', tilesArea),
    statGroupIs('length', 'Length and height', '', [
      g.rgi.lengthKm ? {v: nfIs(g.rgi.lengthKm, 1), s: 'km', k: 'Length', d: `longest flow line, ${REGION.inventory.about}`, f: REGION.inventory.source} : null,
      {v: nfIs(g.rgi.zmax), s: 'm', k: 'Highest point', d: `of the outline, ${REGION.inventory.about}`, f: REGION.inventory.source},
      info.lowest ? {v: 'about 0', s: 'm', k: 'Lowest ice', d: info.lowest.d, f: info.lowest.f} : {v: g.rgi.zmin > 0 ? nfIs(g.rgi.zmin) : 'about 0', s: 'm', k: 'Lowest ice', d: g.rgi.zmin > 0 ? `${REGION.inventory.about}, the inventory's lowest point` : 'the front ends in the sea', f: REGION.inventory.source}].filter(Boolean))
  ].concat(extra.map(([k, title, sum, tiles]) => statGroupIs(k, title, sum, tiles))).concat(ch ? [statGroupIs('volume', 'Surface since 2016', `${nfIs(ch.meanM, 1).replace('-', '−')} <small>m</small>`, [
      {hero: true, loss: true, v: nfIs(ch.meanM, 1).replace('-', '−'), s: 'm', k: `Mean surface change ${ch.from} to ${ch.to}`, f: 'is_arctic', d: 'the lower glacier, inside the 2000 outline, from the ArcticDEM strips'},
      {v: nfIs(ch.km3, 2).replace('-', '−'), s: 'km³', k: 'Volume of the surface change', d: `over ${nfIs(ch.areaKm2, 1)} km² of the 3D strip`}])] : []).join('')
    : statGroupIs('area', R.h2(ice), '', R.tiles(ice));
  const lookText = g ? [lookAuto(g), info.look ? info.look() : ''].filter(Boolean).join('</p><p>') : '';
  const discover = g ? [
    dcard('eye', 'What to look for', `<p>${lookText}</p>`),
    info.news ? dcard('news', 'In the news', `<p>${info.news()}</p>`) : '',
    info.fact ? dcard('bulb', 'Did you know?', `<p>${info.fact()}</p>`) : '',
    info.name || g.placename ? dcard('tag', 'The name', `<p>${info.name ? info.name() : placenameText(g)}</p>`) : '',
    cbYears().length ? dcard('scene', 'Copernicus Browser', `<p>These are the satellite scenes on the map${fn('s2')}. Open one in the Copernicus Browser, the free viewer of the Copernicus Data Space Ecosystem, to zoom in, try other band combinations or look at neighbouring dates.</p><div class="cb-links">${cbButtonsHtml()}</div>`) : ''
  ].join('') : largest;
  storyEl.innerHTML = (g ? `<h2>${g.name}</h2><p class="sub">${[g.canton, g.range].filter(Boolean).join(', ')}</p><p class="lede">${info.lede ? info.lede(g) : (g.lede || '')}</p>`
                         : `<h2>${R.h2(ice)}</h2><p class="sub">${R.sub}</p><p class="lede">${lede}</p>`) +
    `<div class="tabs" role="tablist" aria-label="About ${g ? g.name : R.h2(ice)}">
      <button type="button" ${tab('look')}>Discover</button><button type="button" ${tab('figures')}>Stats</button><button type="button" ${tab('swiss')}>${R.tab}</button></div>` +
    panel('look', discover) + panel('figures', `<div class="stats">${cards}</div>`) +
    panel('swiss', `<p class="lede">${lede}</p><div class="stats">${statGroupIs('area', R.h2(ice), '', R.tiles(ice))}</div>` + largest.replace('name="vat"', 'name="vat2"')) +
    aboutFrame(aboutChaptersIc());
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
/* The name of a Svalbard glacier: what the Norwegian Polar Institute's place names say (definition and origin) */
function placenameText(g){
  const p = g.placename; if (!p) return '';
  const cap = s => s.replace(/\.?$/, '.'), origin = (p.origin || '').replace(/^B\. = /, '');
  return `${p.definition ? cap(p.definition.trim()) + ' ' : ''}${origin ? `Name origin: ${cap(origin)}` : ''}${gfn(NPI_NAMES_SRC)}`;
}
/* the dates of the ArcticDEM strips, from the header of the terrain file (About, The 3D view) */
function fillStrips(){
  const el = document.getElementById('isStrips'); if (!el || !glacierPicked) return;
  loadBundle(bundleId(currentGlacier())).then(b => { const e2 = document.getElementById('isStrips'); if (e2 && b && b.yearly) e2.innerHTML = b.yearly.strips.map(s => fmtDate(s.date)).join('; '); const n = document.getElementById('isStripsN'); if (n && b && b.yearly) n.textContent = `${b.yearly.strips.length} strips`; });
}

/* ---------------- About: the chapters of the regions, in the format of the Swiss ones (aboutFrame) ---------------- */
const IC_WHY = {
  'is-vatnajokull': 'At Breiðamerkurjökull the ice has left a lagoon.',
  'is-rest': 'At Mýrdalsjökull and Langjökull the outlets have left lakes and bare ground behind.',
  'no-mainland': 'At Jostedalsbreen the arms that reached down to the valleys have pulled back.',
  'no-svalbard': 'In Svalbard many glaciers end in the sea, and their fronts can advance or collapse within a few years.'
};
function icSeasonText(){
  const S = REGION.season, id = REGION.id;
  const clear = (a, b, t, why) => `<p>One Sentinel-2 scene per glacier and year: the clearest view between ${a} and ${b}. Only scenes that cover the whole picture count. Every acquisition is scored for cloud (and cloud shadow) cover; the scene with at most 5 % cloud that lies closest to ${t} wins${why}. If none is that clear, the least cloudy scene up to 30 % is used and marked "some clouds" (dashed). The pictures are rendered from Level-1C data with the Copernicus Browser true colour process, which keeps shaded slopes natural.</p>
    <p>Where it can be, one satellite orbit is used for all years, so the glacier is seen under the same angle and at the same time of day every time: the orbit that gives a usable scene in most years wins. Where the weather is bad, a scene may be chosen by hand instead.</p>`;
  if (id === 'is-vatnajokull') return `${clear('1 August', '15 October', '30 September', ', the end of the melt season, when the ice is at its bare minimum')}
        <p>Iceland is cloudy: for Breiðamerkurjökull in 2023 the scene is the one of 15 September (the automatic choice, 13 October, was mostly snow).</p>
        <p>Why not later: fresh snow soon covers the ice in October, and the figures of the glaciological year (autumn to autumn) belong to the end of the melt season.</p>
        ${landsatAbout('1 August to 15 October, the clear one closest to 30 September')}`;
  if (id === 'is-rest') return `${clear('1 August', '15 October', '30 September', ', the end of the melt season, when the ice is at its bare minimum')}
        <p>Iceland is cloudy, and the highland ice caps are often under cloud: some years have only a scene with some clouds, or none.</p>
        <p>Why not later: fresh snow soon covers the ice in October.</p>
        ${landsatAbout('1 August to 15 October, the clear one closest to 30 September')}`;
  if (id === 'no-mainland') return `${clear('20 July', '30 September', '1 September', ', the end of the melt season, before the first autumn snow on the high ice (the scene names in NVE\'s data of the glacier inventory 2018–2019 point to late August and early September)')}
        <p>Western Norway is among the cloudiest places of Europe: some years have only a scene with some clouds, or none.</p>
        ${landsatAbout('20 July to 30 September, the clear one closest to 1 September')}`;
  return `${clear('20 July', '15 September', '25 August', ', when the ice is bare: snow can cover the glaciers again from September')}
        <p>Svalbard lies so far north that the sun does not set from April to August; Sentinel-2 passes the islands often, which gives many scenes per season, but summer fog and cloud are common.</p>
        ${landsatAbout('20 July to 15 September, the clear one closest to 25 August')}`;
}
function icWhyOnly(){
  const id = REGION.id, tongue = `<p><em>The picture is the tongue, not the whole glacier.</em> Because of size and storage reasons, the big glaciers only show the tongue in their image boxes, not the full extent: the satellite picture of a glacier is a square of up to 25 km around its tongue. In the dock below the map, <em>Tongue</em> shows the extent of the image box, and <em>Whole glacier</em> shows the extent of the whole glacier, its outline, where the map shows only the background layer outside the box. The tongue is the lowest point of the outline of the glacier, by the terrain model; where many points are about as low (a calving front in the sea) the one in the middle of them.</p>`;
  if (id === 'is-vatnajokull') return `<p>The site shows twelve outlets of the Vatnajökull ice cap: the seven largest by the area of their drainage basins in the Randolph Glacier Inventory 6.0${fn('is_rgi')} (Skeiðarárjökull, Brúarjökull, Breiðamerkurjökull, Dyngjujökull, Síðujökull (with Skaftárjökull), Köldukvíslarjökull and Tungnaárjökull) and five added by choice: Sylgjujökull, Fláajökull, Heinabergsjökull with Skálafellsjökull (two neighbouring basins shown as one unit), Hoffellsjökull and Svínafellsjökull. Sylgjujökull is named in the inventory; the basins of the other four have no name there, and each is identified by the place where its lowest ice lies. Vatnajökull has many more outlets; they are listed under Largest outlets and can be added one by one. Breiðamerkurjökull has the most detailed pages: its 3D view has an ice surface for every year, the other outlets use the terrain tiles as they are.</p>${tongue}`;
  if (id === 'is-rest') return `<p>The site shows the ten largest glaciers of Iceland outside Vatnajökull. A glacier here is an ice cap or glacier: the basins of the Randolph Glacier Inventory 6.0 that touch each other are counted as one${fn('is_rgi')}. The ten are, in order of area: Langjökull, Hofsjökull, Mýrdalsjökull, Drangajökull, Eyjafjallajökull, Tungnafellsjökull, Þórisjökull, Eiríksjökull, Þrándarjökull and Tindfjallajökull (the area is of about 2000; Snæfellsjökull, with 12.5 km², is eleventh).</p>${tongue}`;
  if (id === 'no-mainland') return `<p>The site shows the ten largest glaciers of mainland Norway by the area of NVE's glacier inventory of 2018–2019${fn('no_nve')}, the same ten as NVE's own list of the largest glaciers. A glacier here is what NVE calls a main glacier: the glacier units that hang together. Older lists (for example Wikipedia's) give other areas and a different order, because they use older inventories or count arms of Jostedalsbreen, like Myklebustbreen, separately; here NVE's 2018–2019 outlines decide. The ten are Jostedalsbreen, Vestre Svartisen, Søndre Folgefonna, Østre Svartisen, Blåmannsisen, Hardangerjøkulen, Myklebustbreen, Okstindbreen, Øksfjordjøkelen and Nordre Folgefonna.</p>${tongue}`;
  return `<p>The site shows ten of the largest glaciers of the Svalbard archipelago. A glacier here is a named glacier unit of the glacier inventory of the Norwegian Polar Institute (a drainage basin), by its area in 2020${fn('sj_npi')}: Storisstraumen, Bråsvellbreen, Negribreen, Hinlopenbreen, Kvitøyjøkulen, Etonbreen, Stonebreen, Hochstetterbreen, Schweigaardbreen and Monacobreen. The ice caps Austfonna (about 7,800 km²) and Vestfonna are not shown as a whole: Austfonna is split in the inventory into basins, and the two largest units that carry only the name Austfonna (697 and 651 km²) are left out because the inventory does not say which outlet they are. Austfonna is still on the map, as the white basins around the red ones.</p>${tongue}`;
}
function icFigures(){
  const id = REGION.id;
  const out = {
    'is-vatnajokull': `<p><em>Area.</em> The area of September 2025 is the ice of the Icelandic Met Office outline of 17 September 2025 (drawn from Sentinel-2 pictures) inside the drainage basin of the Randolph Glacier Inventory 6.0, counted on a grid of 100 m here. The inventory itself is from about 2000 (its area, length and highest point are shown as such and not as today's), and the 2025 outline shows how much ice is left inside it. The Icelandic Met Office outlines of about 1890 (the Little Ice Age maximum) and 2025 can be switched on in the Layers menu; they end at the edge of the area shown.</p>
        <p><em>Retreat, mass loss and mass balance since about 1890</em> of Breiðamerkurjökull are not measured here: they are the figures of Guðmundsson, Björnsson and Pálsson (2017), who compared elevation models of 2010 (lidar), 1945 and about 1890, old maps, photographs and written records. The terminus retreated 4 to 7 km (the range is theirs), exposing about 115 km² of land, and the glacier lost 70 ± 8 km³ of water equivalent, two thirds of it after the middle of the 20th century.</p>
        <p><em>Surface since 2016</em> of Breiðamerkurjökull is measured here, from the ArcticDEM strips of the 3D view: the mean change of the surface between the summers of 2016 and 2022 over the part of the 3D area that lies inside the 2000 outline and above the water of the lagoon (the area is named on the tile). It is a change of height of the surface (ice and what ice left behind), not of water equivalent.</p>`,
    'is-rest': `<p><em>Area.</em> The area of 2025 is the ice of the Icelandic Met Office outline of 17 September 2025 (drawn from Sentinel-2 pictures) inside the area of the ice cap in the Randolph Glacier Inventory 6.0, counted on a grid of 100 m here (50 m for the small ones). The inventory is from about 2000: its area, length and highest point are shown as such, and the 2025 outline shows how much ice is left inside it. Length is the longest flow line of an outlet of the ice cap. The Icelandic Met Office outlines of about 1890 (the Little Ice Age maximum) and 2025 can be switched on in the Layers menu; they are cut to the area around the ice cap.</p>`,
    'no-mainland': `<p><em>Area.</em> The area of 2018–2019 is that of NVE's glacier inventory made from Sentinel-2 pictures of 2018 and 2019${fn('no_nve')}: all units of the main glacier added up. The earlier area is that of NVE's inventory of 1947–1985, made from maps and aerial photographs${fn('no_old')}, the units that lie on or next to the glacier of today and not in another glacier. The years of the older outlines differ from glacier to glacier and the two inventories were made with different methods, so the difference is an indication of the change, not an exact measure. Length, lowest and highest point are NVE's values for the glacier units.</p>
        <p><em>Mass balance</em> of single glaciers is measured by NVE on a few glaciers, such as Engabreen (since 1970); it is not shown here, because it belongs to a single arm, not to the ice cap.</p>`,
    'no-svalbard': `<p><em>Area.</em> The areas of 2020, 2001–2010, 1990 and 1936–1972 are those of the same glacier unit in the four outlines of the Norwegian Polar Institute${fn('sj_npi')}. They were made with different data (aerial photographs, SPOT and Landsat images, Sentinel-2), so small differences are within the uncertainty. The area of a glacier that ends in the sea includes the part of the front that moves; a surge makes a glacier grow in a few years and the area can grow over time (Storisstraumen). Length and heights are those of the 2001–2010 outlines.</p>`
  };
  return out[id];
}
function icView3d(){
  const id = REGION.id, day = {'is-vatnajokull': '15 September', 'is-rest': '15 September', 'no-mainland': '1 September', 'no-svalbard': '25 August'}[id];
  const ref = {'is-vatnajokull': 'ÍslandsDEM (10 m, Náttúrufræðistofnun Íslands and Landmælingar Íslands)', 'is-rest': 'ÍslandsDEM (10 m, Náttúrufræðistofnun Íslands and Landmælingar Íslands)',
    'no-mainland': 'the terrain model of Kartverket (1 m)', 'no-svalbard': 'the S0 terrain model of the Norwegian Polar Institute (20 m)'}[id];
  const hand = id === 'is-vatnajokull' ? ' For Breiðamerkurjökull the place and direction were drawn by hand on the satellite picture (18 km along the shore of the lagoon and 10 km up the glacier, up the glacier is towards north-west, 318°, from the front on the west shore of the lagoon); for the other outlets they come from the outline by a rule.' : '';
  return `<p>The area is a strip along the glacier: from 1.5 km below the tongue tip up the glacier, as wide as the tongue. Its place and direction come from the outline by a rule: the tip is the lowest point of the outline, the direction is from the tip to the ice around it, the width is the contiguous ice across the first kilometres above the tip (2 to 9 km each way) and the length is the ice up the glacier (3.5 to 10 km).${hand} The camera starts below the tip and looks up the glacier, with the satellite picture of the chosen year draped over the terrain.</p>
        <p><em>Heights and the ice surface of each year</em> come from ArcticDEM, the dated 2 m surface models of the Polar Geospatial Center, made from Maxar WorldView stereo images. <span id="isStripsN">Several</span> strips were used for the glacier on screen, acquired on <span id="isStrips">…</span>. Strips that cover too little of the area or sit far from the reference on the ground are left out. Every strip is moved onto ${ref}, taken from the terrain tiles of Mapterhorn, with the median difference on the ground beside the glaciers (it agrees to a few metres or better), and sampled on the grid of the strip (the mean of 9 cells of 2 m spread over the grid cell).</p>
        <p>The surface of a year is its surface on ${day}, the end of the melt season. Where a summer strip (bare ice, not the snow of winter) lies within 45 days the year is <em>measured</em>; between strips the surface is <em>interpolated</em> in time, grid point by grid point; before the first and after the last strip it is <em>held</em>: the nearest surface stays, so the 3D view shows no further thinning although the satellite picture does. The 3D note says which of the three applies to the year on screen. Single strips that disagree with their neighbours in time (a failed match, cloud) are left out grid point by grid point, lone spikes are smoothed, and where the strip holds the sea or a lagoon it is flat.</p>
        <p>A glacier whose terrain file has not been made yet uses the terrain tiles of Mapterhorn alone (one elevation model for all years, older than the pictures), and says so in the note. Peaks, volcanoes and passes come from OpenStreetMap. The 3D view has no radar pins and no historic photographs here.</p>`;
}
function icOutdoors(){
  const tr = FEATURES.trails;
  return `<p><em>Footpaths and tracks</em> ${tr ? '(Layers menu) come from OpenStreetMap: footpaths in yellow, tracks, mostly roads for four-wheel-drive vehicles, in red, cut to the picture area. The violet band marks where a person 1.7 m tall can see the ice front from the path (our own calculation from the terrain tiles of Mapterhorn: the ice of the newest outline in the lowest 1.5 km of the tongue, 20 m steps along the path, a stretch counts when it sees at least a quarter of the points; the ice has moved since the model was made; trees and buildings are not counted).' : 'are not shown in this region yet.'}</p>
        <p><em>Street View</em> ${FEATURES.streetview ? '(the layer Panoramas): panoramas near the glacier, chosen by hand from those that see the ice; Google\'s own viewer opens in the panel, nothing of the pictures is stored here.' : 'is not shown in this region: there are no panoramas near the glaciers, or none that see the ice.'}</p>
        <p><em>Place names</em> in 3D (peaks, volcanoes, passes) come from OpenStreetMap.</p>`;
}
function aboutChaptersIc(){
  const ch = (id, title, body) => `<details class="about-ch" name="aboutch" id="${id}"><summary>${title}</summary><div class="about-sec">${body}</div></details>`;
  return [
    ch('ch-1', 'Why Tongues from Space', `
        <p>A glacier ends in its tongue: the lowest stretch of ice, where the glacier is thinnest and melts the most. It is also where change is easiest to see. Every summer the tip pulls back and leaves bare rock, a lake or a new valley floor behind, and a satellite pixel of 10 m is fine enough to show it. ${IC_WHY[REGION.id]}</p>
        <p>I believe in pictures. A number can be read a hundred times without it staying with you, but a before-and-after image is understood at once and remembered. That is why the pictures come first here, and the figures sit next to them.</p>
        <p>I hope this dashboard sparks awareness of glaciers and of why they matter to society. — Jochem Braakhekke</p>`),
    ch('ch-2', 'The satellite images', icSeasonText()),
    aboutSentinel(''),
    aboutColours(),
    ch('ch-5', 'Which glaciers, and why only the tongue', icWhyOnly()),
    ch('ch-6', 'Glacier figures', icFigures()),
    ch('ch-10', 'The 3D view', icView3d()),
    ch('ch-12', 'Footpaths, Street View and names', icOutdoors()),
    ch('ch-9', 'Sources', `<ol class="src-list">${SOURCE_LIST.map(k => `<li id="fn-${k}" title="Click to go back to the text">${SOURCES[k]()}</li>`).join('')}${dynSources.map((h, i) => `<li id="fn-g${i + 1}" title="Click to go back to the text">${h}</li>`).join('')}</ol>`)
  ].join('\n      ');
}
