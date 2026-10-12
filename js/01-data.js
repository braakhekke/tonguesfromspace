/* =====================================================================
   1. Static data
   ===================================================================== */
const FIRST_YEAR = 2016;
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({length: CURRENT_YEAR - FIRST_YEAR + 1}, (_, i) => FIRST_YEAR + i);

/* Swiss-wide annual loss of glacier volume, hydrological years (Oct–Sep), GLAMOS / SCNAT annual reports.
   approx: the press release gave a rounded or "almost/over" figure. Add a row each autumn. */
/* National ice volume: GLAMOS "Swisswide Glacier Mass Balance" gives the volume of all Swiss glaciers for every year (glaciers.js, swiss_volume: [year, km³, change %]).
   Where that file is missing, or for years after its last one, the figures below are used: 46.4 km³ at the end of 2024 (annual report 2024) and the annual losses.
   Ice to water: density 0.9, so 1 km³ ice = 0.9 trillion litres. */
const SWISS_SERIES = (window.GLACIER_DATA && window.GLACIER_DATA.swiss_volume) || [];
const ICE_2024 = (SWISS_SERIES.find(r => r[0] === 2024) || [0, 46.4])[1];
function iceVolume(year){            // km³ at the end of the hydrological year (September)
  const row = SWISS_SERIES.find(r => r[0] === year);
  if (row) return row[1];
  let v = ICE_2024;
  if (year < 2024) for (let y = 2024; y > year; y--) { const n = VOLUME_LOSS.find(d => d.y === y); v = v / (1 - (n ? n.v : 0) / 100); }
  if (year > 2024) for (let y = 2025; y <= year; y++) { const n = VOLUME_LOSS.find(d => d.y === y); v = v * (1 - (n ? n.v : 0) / 100); }
  return v;
}
const EIFFEL_M = 330;                        // height of the Eiffel Tower with antennas (Société d'exploitation de la Tour Eiffel, since 2022)
const PITCH_M2 = 7140;                       // a football pitch of the usual international size, 105 x 68 m
const BUS_M = 12;                            // a standard city bus is about 12 m long (an articulated one 18 m)
const LAKE_ZURICH_KM3 = 3.9;                 // volume of Lake Zurich
const POOL_L = 2.5e6;                        // Olympic pool, 50 x 25 x 2 m
const SWISS_SUPPLY_KM3 = 0.93;               // all drinking and process water supplied in Switzerland per year (SVGW: 900-950 million m³)
const HOUSEHOLD_L_DAY = 142;                 // household use per person and day (SVGW)
const SWISS_POP = 9.0e6;
const VOLUME_LOSS = [
  {y:2016, v:1.5, approx:true}, {y:2017, v:3.0}, {y:2018, v:2.5}, {y:2019, v:2.0, approx:true},
  {y:2020, v:2.0, approx:true}, {y:2021, v:1.0, approx:true}, {y:2022, v:5.9}, {y:2023, v:4.4},
  {y:2024, v:2.4}, {y:2025, v:3.0}, {y:2026, v:5.5}
];
/* the GLAMOS file replaces the typed figures of the years it covers (and drops the "approx" marks) */
SWISS_SERIES.forEach(([y, , pct]) => {
  if (y < FIRST_YEAR || pct == null) return;
  const row = VOLUME_LOSS.find(n => n.y === y), v = -pct;
  if (row) { row.v = v; delete row.approx; } else VOLUME_LOSS.push({y, v});
});
VOLUME_LOSS.sort((a, b) => a.y - b.y);

/* Built-in list: the ten largest glaciers by area in SGI2016 (largest entities >14.5 km²).
   Areas: SGI1850, SGI2016 and, where published, SGI2023/24 (GLAMOS via de.wikipedia "Liste Schweizer Gletscher").
   build_outlines.py replaces the ranking with the newest inventory and adds outlines. */
const DEFAULTS = [
  { id:'aletsch', tongue:[46.424,8.032], keys:['grosser aletsch'], name:'Grosser Aletsch', local:'Grosser Aletschgletscher', canton:'Valais', range:'Bernese Alps',
    center:[46.47,8.04], bounds:[[46.40,7.95],[46.56,8.12]], a1850:105.6, a1973:86.6, a2016:78.49, aNew:[75.79,2023], len:[26.5,24.0,22.6],
    lede:'The largest glacier in the Alps. Several firn streams meet at Konkordiaplatz before the tongue curves south-west towards the Massa gorge above Brig.',
    look:'Follow the tongue south of the bend at Märjelen and compare where clean ice gives way to grey rock. The dark medial moraines running down the middle are easy to follow from year to year.',
    note:'In summer 2026 almost six metres of ice disappeared at one measuring point at Konkordiaplatz, about as much as in the extreme year 2022. This is a single point, not an average of the whole glacier.<small class="srcline">Source: GLAMOS, reported by wetter.net (September 2026)</small>' },
  { id:'gorner', tongue:[45.978,7.778], keys:['gorner'], name:'Gorner', local:'Gornergletscher', canton:'Valais', range:'Pennine Alps',
    center:[45.95,7.81], bounds:[[45.90,7.72],[46.00,7.90]], a1850:66.0, a1973:59.7, a2016:41.24, aNew:[35.37,2023], len:[15.9,13.5,12.4],
    lede:'The second-largest glacier in Switzerland by area, flowing west from Monte Rosa towards Zermatt. Its main tributary is the Grenzgletscher.',
    look:'Look at the confluence with the Grenzgletscher, where the ice-marginal Gornersee forms.',
    note:'' },
  { id:'fiescher', tz:14, tongue:[46.468,8.145], keys:['fiescher'], name:'Fiescher', local:'Fieschergletscher', canton:'Valais', range:'Bernese Alps',
    center:[46.49,8.15], bounds:[[46.42,8.08],[46.57,8.22]], a1850:37.4, a1973:34.2, a2016:29.75, aNew:[28.51,2023], len:[17.1,15.4,14.7], lenYear:2012,
    lede:'The second-longest glacier in the Alps, draining south from the Finsteraarhorn and Gross Fiescherhorn towards the village of Fiesch in the Goms valley.',
    look:'Follow the narrow lower tongue towards Fiesch and watch the bare rock along its flanks.',
    note:'' },
  { id:'unteraar', tongue:[46.563,8.252], keys:['unteraar'], name:'Unteraar', local:'Unteraargletscher', canton:'Bern', range:'Bernese Alps',
    center:[46.56,8.24], bounds:[[46.51,8.12],[46.61,8.33]], a1850:33.4, a1973:29.5, a2016:22.70, aNew:[20.36,2024], len:[14.5,12.9,11.8],
    lede:'Formed where the Finsteraar and Lauteraar glaciers merge, the Unteraar flows east into the Grimselsee, the reservoir behind the Grimsel hydropower dams.',
    look:'Debris covers nearly the whole tongue, so it looks grey rather than white. Watch the front near the lake and the dark central moraine where the two source glaciers join.',
    note:'The debris cover is typically 5 to 15 cm thick and acts like an insulating layer, so mass loss is somewhat slowed.<small class="srcline">Source: Wikipedia (Unteraargletscher)</small>',
    sceneNote:'Because shade covers the tongue in September and October, most images of this glacier are from August.' },
  { id:'oberaletsch', tz:14.25, tongue:[46.414,7.992], keys:['oberaletsch'], name:'Oberaletsch', local:'Oberaletschgletscher', canton:'Valais', range:'Bernese Alps',
    center:[46.43,7.98], bounds:[[46.39,7.90],[46.48,8.05]], a1850:26.6, a1973:22.8, a2016:17.05, aNew:null, len:[10.4,9.1,8.8], lenYear:2011,
    lede:'Until about 1880 a tributary of the Great Aletsch. Both glaciers have since retreated so far that they no longer meet.',
    look:'Compare the gap between the Oberaletsch tongue and the Great Aletsch, and the Beich glacier, the western arm that joins it.',
    note:'' },
  { id:'corbassiere', tz:14.25, tongue:[45.987,7.296], keys:['corbassiere'], name:'Corbassière', local:'Glacier de Corbassière', canton:'Valais', range:'Pennine Alps',
    center:[45.97,7.30], bounds:[[45.92,7.24],[46.03,7.36]], a1850:20.7, a1973:18.3, a2016:14.95, aNew:[14.08,2023], len:[12.9,10.1,9.6],
    lede:'A long valley glacier flowing north from the Grand Combin above the Val de Bagnes, 9.8 km long.',
    look:'Follow the narrow lower tongue and the moraine walls it has left along its sides.',
    note:'' },
  { id:'morteratsch', tz:14.5, tongue:[46.421,9.931], keys:['morteratsch'], name:'Morteratsch', local:'Vadret da Morteratsch', canton:'Graubünden', range:'Bernina Range',
    center:[46.41,9.93], bounds:[[46.37,9.86],[46.46,9.99]], a1850:19.3, a1973:16.4, a2016:14.93, aNew:null, len:[8.9,7.0,6.2],
    lede:'Flowing north from Piz Bernina in the Engadin. Together with the Pers glacier from Piz Palü it drains via the Inn into the Danube and the Black Sea.',
    look:'The tongue is reached on foot from Morteratsch station; time panels along the glacier trail show where the ice stood in past years. Compare the tongue tip and the junction with the Pers glacier.',
    note:'Of the ten glaciers here it is the only one that drains to the Black Sea; the others drain to the North Sea or the Mediterranean.<small class="srcline">Source: Wikipedia (Morteratsch Glacier)</small>' },
  { id:'zmutt', tz:14.25, tongue:[45.99,7.672], keys:['zmutt'], name:'Zmutt', local:'Zmuttgletscher', canton:'Valais', range:'Pennine Alps',
    center:[45.99,7.62], bounds:[[45.95,7.54],[46.03,7.70]], a1850:19.8, a1973:16.9, a2016:14.82, aNew:null, len:[8.6,6.7,null], lenYear:null,
    lede:'Flowing east below the north face of the Matterhorn towards Zermatt, fed by the Tiefmatten and Stockji glaciers.',
    look:'Most of the lower tongue is covered in debris and looks like a rocky valley floor. Use the bright ice upstream and the reservoir at Zmutt as reference points.',
    note:'' },
  { id:'rhone', tz:14.5, tongue:[46.588,8.385], keys:['rhone'], name:'Rhone', local:'Rhonegletscher', canton:'Valais', range:'Urner Alps',
    center:[46.61,8.39], bounds:[[46.56,8.33],[46.66,8.44]], a1850:20.2, a1973:17.6, a2016:14.64, aNew:null, len:[9.2,8.0,7.7],
    lede:'The source of the river Rhône, flowing south from the Dammastock towards Gletsch at the Furka and Grimsel passes.',
    look:'A lake has formed where the tongue used to lie on the rock step above Gletsch. Compare its size and the bare rock around it from year to year.',
    note:'In summer 2026 the Rhône glacier lost more than four metres of ice in a single month. Meltwater has carved cavities under the tongue that collapse into pits.<small class="srcline">Source: Euronews, 7 August 2026 (Matthias Huss, GLAMOS)</small>' },
  { id:'trift', tz:14.5, tongue:[46.678,8.364], keys:['trift'], name:'Trift', local:'Triftgletscher (Gadmen)', canton:'Bern', range:'Urner Alps',
    center:[46.67,8.36], bounds:[[46.63,8.30],[46.72,8.43]], a1850:19.3, a1973:16.5, a2016:14.56, aNew:null, len:[7.6,5.8,3.7],
    lede:'A glacier above the Gadmen valley whose tongue sank into a growing lake in the early 2000s, leaving the Triftsee, spanned by a suspension bridge.',
    look:'The lake below the steep ice fall is the best marker for how far the tongue has retreated.',
    note:'' }
];

/* "Did you know?" and "Where the name comes from" per glacier. Only documented facts; uncertain origins say so. */
/* Hike and bike near each tongue. Route numbers and distances from the tongue tip: SchweizMobil route data of the Federal Roads Office (ASTRA) on geo.admin.ch, checked October 2026;
   the title links to the page the description follows. `bike: null` = no marked SchweizMobil bike route within about 3 km of the tongue. */
const TRAILS = {
 aletsch: {
  hike: { title: 'Aletsch Panoramaweg (route 39)', text: 'Belalp to Riederalp, high above the glacier with several viewpoints. Passes 1.3 km from the tongue.', url: 'https://schweizmobil.ch/en/hiking-in-switzerland/route-39', kind: 'wander' },
  bike: { title: 'Moosfluh Enduro (mountain bike route 131)', text: 'From the Moosfluh viewpoint down to Mörel. Passes 1.4 km from the tongue.', url: 'https://schweizmobil.ch/en/mountainbiking-in-switzerland/route-131', kind: 'mtb' } },
 gorner: {
  hike: { title: 'Gornergrat to Riffelberg', text: 'From the Gornergrat down past the Riffelsee: 4.7 km, about 1 h 25 min, T2.', url: 'https://wegwandern.ch/wanderung/wanderung-gornergrat-zermatt-rotenboden-riffelsee-riffelberg-wandern/', kind: 'wander' }, bike: null },
 fiescher: {
  hike: { title: 'Aletsch Panoramaweg, Märjelensee to Bellwald (route 39)', text: 'Passes 0.7 km from the tongue; the Burghütte stands at the foot of the glacier.', url: 'https://schweizmobil.ch/en/hiking-in-switzerland/route-39', kind: 'wander' },
  bike: { title: 'Valais Panorama Bike (mountain bike route 81)', text: 'Through the upper Goms, 3.0 km from the tongue.', url: 'https://schweizmobil.ch/en/mountainbiking-in-switzerland/route-81', kind: 'mtb' } },
 unteraar: {
  hike: { title: 'Grimsel Hospiz to the Lauteraarhütte', text: 'Along the Grimselsee to the hut above the glacier: 10.2 km, about 4 h.', url: 'https://www.interlaken.swiss/erlebnisse/tour/wandern-am-ursprung-der-aare', kind: 'wander' }, bike: null },
 corbassiere: {
  hike: { title: 'Cabane de Panossière via the Col des Otanes', text: 'Circular tour from Mauvoisin with views of the glacier from the pass: 12.9 km, about 6 h 15 min.', url: 'https://www.novo-monde.com/en/panossiere-hut-valais/', kind: 'wander' }, bike: null },
 zmutt: {
  hike: { title: 'Zermatt to the Schönbielhütte', text: 'Over the moraine above the glacier, the Matterhorn north face alongside: 11 km, about 4 h.', url: 'https://www.bergwelten.com/t/w/24489', kind: 'wander' }, bike: null },
 rhone: {
  hike: { title: 'Furka-Höhenweg, Oberwald to the Furkapass (route 51)', text: 'Views of the Rhône glacier and the Goms: 11 km, about 5½ h, demanding. Passes 1.4 km from the tongue.', url: 'https://schweizmobil.ch/en/hiking-in-switzerland/route-51', kind: 'wander' },
  bike: { title: 'Rhone-Route (Veloland route 1)', text: 'Starts in Andermatt; the first stage climbs the Furka Pass. Passes 0.7 km from the tongue.', url: 'https://schweizmobil.ch/en/cycling-in-switzerland/route-1', kind: 'velo' } },
 trift: {
  hike: { title: 'Triftbrücke', text: 'A 170 m suspension bridge with the glacier at the head of the lake: about 1.5 h from the top station.', url: 'https://www.myswitzerland.com/en-gb/experiences/route/trift-bridge-a-spectacular-pedestrian-bridge/', kind: 'wander' }, bike: null },
 fee: {
  hike: { title: 'Längfluh to Saas-Fee', text: 'From the Längfluh viewpoint above the glacier to the village: 6.5 km, about 2 h 15 min.', url: 'https://www.valais.ch/de/shop/bergbahnen/bergbahnfahrt-nach-langfluh-saas-fee', kind: 'wander' }, bike: null },
 findel: {
  hike: { title: 'Naturweg, Riffelalp to Sunnegga', text: 'Through a stone-pine forest to the retreating glacier, with Matterhorn views: 6.2 km, about 1 h 40 min.', url: 'https://zermatt.swiss/p/naturweg-nr-19-01tVj000005EvuoIAC', kind: 'wander' }, bike: null }
};
/* swisstopo's approximate WGS84 to LV95 formulas (about 1 m), for the map links */
const lv95 = (lon, lat) => {
  const p = (lat * 3600 - 169028.66) / 10000, l = (lon * 3600 - 26782.5) / 10000;
  return [2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3,
          1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3].map(Math.round);
};
const TRAIL_LAYERS = { wander: 'Wanderland', velo: 'Veloland', mtb: 'Mountainbikeland' };
function trailMaps(g, kind){       // the SchweizMobil map around the tongue, with the route layer on
  const at = g.inv && g.inv.terminus ? g.inv.terminus.tip : g.tongue; if (!at) return '';
  const [E, N] = lv95(at[1], at[0]);
  return `<span class="tr-maps"><a href="https://map.schweizmobil.ch/?lang=en&amp;E=${E}&amp;N=${N}&amp;resolution=25&amp;layers=${TRAIL_LAYERS[kind]}" target="_blank" rel="noopener">SchweizMobil map</a></span>`;
}
function trailsHtml(g, key){
  const t = TRAILS[key]; if (!t) return '';
  const row = (label, r, kindFallback) => r
    ? `<div class="tr-row"><b>${label}</b> ${r.url ? `<a href="${r.url}" target="_blank" rel="noopener">${r.title}</a>` : r.title}<span class="tr-t">${r.text}</span>${trailMaps(g, r.kind)}</div>`
    : `<div class="tr-row"><b>${label}</b><span class="tr-t">No marked bike route within about 3 km of the tongue.</span>${trailMaps(g, kindFallback)}</div>`;
  return `${row('Hike', t.hike, 'wander')}${row('Bike', t.bike, 'velo')}`;
}
const GLACIER_INFO = {
 "aletsch": {
  "fact": "The Aletsch region has its own legend: the Rollibock, a huge goat-like creature with long horns, fiery eyes and icicles for fur, who lives in the ice of the glacier. He appears when people harm nature. In one story he drowns a poacher in Lake Märjelen, the glacier lake beside the ice whose floods once devastated the valleys below, which people explained with an angry Rollibock. Today he is the mascot of the Aletsch Arena and stands for respect for nature.",
  "name": "Named after the Alp Aletsch below it, first recorded in 1231 as <em>Alech</em>. Where the name itself comes from is unknown.",
  "factSrc": "Bergwelten and Alpenverein (Rollibock legend); Aletsch Arena (Rollibock Club, mascot)",
  "src": "Historical Dictionary of Switzerland (Aletschgletscher)"
 },
 "gorner": {
  "fact": "Its ice-marginal lake, the Gornersee, fills every year and usually drains in summer in a glacial lake outburst flood. With its tributaries it forms the second-largest glacier system in the Alps after the Aletsch (53 km², 2007).",
  "name": "From the <em>Gorneren</em>, the high pastures above Zermatt: in 1579 the farmers' guild regulated when sheep could graze there. <em>Gorner</em> is assumed to come from Romansh <em>cornu</em>, \"horned\". Zermatt people also called the Monte Rosa peaks the <em>Gornerhorn</em> in the early 19th century.",
  "factSrc": "Wikipedia (Gorner Glacier)",
  "src": "Wikipedia (Gornergrat); Gornergrat Bahn (history of the name)"
 },
 "fiescher": {
  "fact": "In 1678 the people of Fiesch vowed to live virtuously and to pray that the Aletsch glacier would stop growing, because it threatened their valley. In 2010 the Vatican allowed them to change the vow: their annual procession now also prays about climate change and glacier melting.",
  "name": "\"Of Fiesch\": named after the village and valley below it. The village appears as <em>Vios</em> in 1203 and <em>Viesch</em> in 1438.",
  "factSrc": "Beobachter (\"Um Gottes willen\"); swissinfo.ch",
  "src": "Historical Dictionary of Switzerland (Fiesch)"
 },
 "unteraar": {
  "fact": "In the 19th century the naturalists Franz Josef Hugi and Louis Agassiz spent many months here. Agassiz and his team lived under a huge boulder on the medial moraine, which they named the \"Hôtel des Neuchâtelois\", while they studied the glacier. It was one of the first subjects of glaciology.",
  "name": "\"Lower Aare glacier\": the larger of the two sources of the river Aare, with the Oberaar glacier. The Aare, 288 km, is the longest river that flows entirely within Switzerland.",
  "factSrc": "Wikipedia (Unteraargletscher); Agassiz, Life and Correspondence (1893)",
  "src": "Wikipedia (Unteraargletscher); MySwitzerland.com (Aare)"
 },
 "oberaletsch": {
  "fact": "Until about 1880 it still flowed into the Aletsch glacier. Both glaciers have retreated so far that they no longer join.",
  "name": "\"Upper Aletsch glacier\" (German <em>Ober-</em>, upper): it shares its name with the Aletsch glacier it once joined.",
  "factSrc": "Wikipedia (Oberaletsch Glacier)",
  "src": "Wikipedia (Oberaletsch Glacier)"
 },
 "corbassiere": {
  "fact": "It starts above 4,000 m on the north slope of the Grand Combin and its tongue ends at about 2,300 m. It is 9.8 km long.",
  "name": "A French place name of the Val de Bagnes; its origin is not documented in the sources we checked.",
  "factSrc": "Wikipedia (Corbassière Glacier)",
  "src": "Wikipedia (Corbassière Glacier)"
 },
 "morteratsch": {
  "fact": "With about 1.2 km³ of ice it is the third-largest glacier in the Eastern Alps, after the Pasterze and the Gepatschferner.",
  "name": "A legend explains the name: Annetta, a farmer's daughter, died of sorrow while her beloved herdsman Aratsch was away as a soldier. When he returned he rode into a crevasse, and her ghost is said to wander the alp crying \"Mort Aratsch!\" (\"Aratsch is dead\"). A documented etymology is not in the sources we checked.",
  "factSrc": "Wikipedia (Morteratsch Glacier)",
  "src": "Wikipedia (Morteratsch Glacier); Pontresina Tourism (Legends in the Bernina glacier region)"
 },
 "zmutt": {
  "fact": "Debris now covers about 32 % of the glacier surface, up from about 13 % in 1859. This debris slowed the glacier's response: its length and area have changed little compared with debris-free glaciers, although the mass loss is similar. Water from the Zmutt valley is collected at the Z'Mutt pumping station of the Grande Dixence system.",
  "name": "Named after the hamlet of Zmutt in the municipality of Zermatt. The origin of the name is not documented in the sources we checked.",
  "factSrc": "The Cryosphere, vol. 13 (2019), Zmuttgletscher study; Grande Dixence SA",
  "src": "Wikipedia (Zmutt)"
 },
 "rhone": {
  "fact": "Every summer an ice grotto was dug into the glacier at the Hotel Belvédère on the Furka Pass, a tradition since about 1870, and up to 100,000 people a year came to see it. To slow the melting, the lowest part of the tongue was covered with white fleece. In September 2026 Valais rejected the operator's appeal against the order to restore the site, so the grotto can no longer be operated. Can you spot the tarpaulins on the tongue in the images?",
  "name": "From the river it feeds: the Rhône (Latin <em>Rhodanus</em>). Its etymology is unclear; Celtic and Greek origins have been proposed.",
  "factSrc": "showcaves.com (Eisgrotte Rhonegletscher); freizeit.ch; <a href=\"https://www.swissinfo.ch/eng/glaciers-permafrost/swiss-rh%C3%B4ne-glacier-ice-cave-ordered-closed/92010080\" target=\"_blank\" rel=\"noopener\">swissinfo.ch, 5 September 2026</a>",
  "src": "Historical Dictionary of Switzerland; Wikipedia (Rhône)"
 },
 "trift": {
  "fact": "In the 2004/05 measuring year the Trift glacier retreated by 216 m, more than any other monitored glacier in Switzerland, because its tongue ended in a lake that sped up the melting. A suspension bridge about 170 m long (opened 2009, replacing one built in 2004) spans the Triftsee so hikers can still reach the hut.",
  "name": "German <em>Trift</em> is a path along which livestock is driven, from <em>treiben</em>, \"to drive\".",
  "factSrc": "plattformj.ch (glacier measurements, 2006); Wikipedia (Trift Bridge)",
  "src": "Duden"
 },
 "fee": {
  "fact": "At Mittelallalin, 3,500 m high, glaciologist Benedikt Schnyder carved an artificial ice cave into the glacier: the Ice Pavilion, 5,500 m² with a 71 m tunnel. It closed in 2024 for safety reasons, because the glacier retreats; a virtual reality experience replaced it.",
  "name": "Named after Saas-Fee, the village below it, which appears as <em>Vee</em> in 1304. Where the name itself comes from is not documented in the sources we checked.",
  "factSrc": "showcaves.com (Eispavillon Mittelallalin)",
  "src": "Historical Dictionary of Switzerland (Saas-Fee)"
 },
 "findel": {
  "fact": "Around the middle of the 19th century its tongue still reached down to about 2,100 m, near the hamlet of Findeln and below the tree line. Since then it has retreated by more than 2.5 km, and since the 1970s by more than 1 km. Its meltwater, the Findelbach, joins the Gornera and the Zmuttbach to form the Matter Vispa.",
  "name": "Named after the hamlet of Findeln, 2 km east of Zermatt at 2,051 m, near where the tongue once ended. The origin of the name Findeln itself is not documented in the sources we checked.",
  "factSrc": "Wikipedia (Findelgletscher)",
  "src": "Wikipedia (Findeln)"
 }
};

