/* =====================================================================
   0. Regions: everything that differs from one part of the world to the next
      One entry per region (a country, or an area inside a country: Iceland > Vatnajökull). The page reads its data file, its scene season, its texts, its credits and its
      feature switches from the chosen region, so adding a region means adding an entry here (and its data, and its centre in worker/worker.js), not editing the code.
      The region is named by the address on the public site (/iceland/) or by the link (#r=is, local use and old links); no r means Switzerland. Choosing another region from the title menu opens its link and reloads, so every
      region starts clean and only its own data is loaded.

      This file is a plain script loaded synchronously (no defer) after js/regions.js (the records) and before everything else: it picks the region and writes the tag of its data file into the page, so that file loads in
      step with the others and nothing else is fetched. Keep it to these few functions.
   ===================================================================== */
const REGIONS = REGIONS_ALL.map(r => r.children ? {...r, children: r.children.filter(c => !HIDDEN_REGIONS.includes(c.id))} : r).filter(r => r.children ? r.children.length : !HIDDEN_REGIONS.includes(r.id));
/* the entries a visitor can choose, flat, each with the country it belongs to */
const REGION_LIST = REGIONS.flatMap(r => r.children ? r.children.map(c => ({...c, parent: r})) : [r]);
const regionById = id => REGION_LIST.find(r => (r.id === id || (r.aliases || []).includes(id)) && r.ready);      // aliases: the ids of old links (#r=is-vatnajokull)
/* A region can have its own address on the public site (path: 'iceland' -> https://tonguesfromspace.org/iceland/): search engines and link previews do not see
   the #r= part. PATH_REGION is the region named by the address, SITE_BASE the folder the site lives in ('/' on such a page, '' otherwise: relative names then resolve as they always did).
   Every file the page fetches by a relative name goes through SITE_BASE (asset(), siteFile()), because the page itself sits two folders deeper. */
const PATH_REGION = (() => {
  for (const r of REGION_LIST) for (const p of [r.path, ...(r.pathAlso || [])]) {
    const m = p && r.ready && location.pathname.match(new RegExp('^(.*/)' + p + '(/(index\\.html)?)?$'));
    if (m) return {r, base: m[1]};
    const g = p && r.ready && r.glacierPages && location.pathname.match(new RegExp('^(.*/)' + p + '/([a-z0-9-]+)(/(index\\.html)?)?$'));      // /switzerland/aletsch/: the page of one glacier
    if (g) return {r, base: g[1], glacier: g[2]};
  }
  return null;
})();
const SITE_BASE = PATH_REGION ? PATH_REGION.base : '';
const siteFile = name => SITE_BASE + name;
const REGION = (PATH_REGION && PATH_REGION.r) || regionById(new URLSearchParams(location.hash.slice(1)).get('r')) || regionById('ch');
const FEATURES = REGION.features;
/* Glacier pages (/switzerland/aletsch/): link previews and search engines do not see the #g= part, so the built site has a page for each glacier with its own title and picture. The page opens on its glacier;
   writeHash (04-state.js) keeps the address in step with the chosen glacier, so every link the page hands out (share, embed) is the page of that glacier. */
const glacierSlug = id => (REGION.glacierSlugs || {})[id] || id;
const slugGlacier = slug => Object.keys(REGION.glacierSlugs || {}).find(k => REGION.glacierSlugs[k] === slug) || slug;
const glacierPath = id => PATH_REGION && REGION.glacierPages ? PATH_REGION.base + REGION.path + '/' + (id ? glacierSlug(id) + '/' : '') + location.search : '';
if (PATH_REGION && PATH_REGION.glacier && REGION.glacierPages && !new URLSearchParams(location.hash.slice(1)).get('g'))
  history.replaceState(null, '', location.pathname + location.search + '#g=' + slugGlacier(PATH_REGION.glacier) + '&m=single');      // the page of a glacier opens on its newest year
/* The link that opens a region: on the built site (it has the map of hashed names in config.js) a region with a path opens at its address, otherwise (local use) the plain address with #r= */
const regionLink = id => {
  const r = REGION_LIST.find(x => x.id === id), built = PATH_REGION || (window.TFS_CONFIG && Object.keys(window.TFS_CONFIG.assets || {}).length);
  if (built) return (SITE_BASE || location.pathname.replace(/index\.html$/, '')) + (r && r.path ? r.path + '/' : '') + location.search;
  return location.pathname + location.search + (id === 'ch' ? '' : '#r=' + id);
};
/* the data file of the region: one tag, written here so it is fetched at once and runs before the page's own scripts */
document.write(`<script defer src="${siteFile(REGION.data)}"><\/script>`);
document.write(`<script defer src="${siteFile('data/boxes.js')}"><\/script>`);      // window.GLACIER_BOXES: the picture box, tip and 3D strip of every glacier of every region (scripts/tools/box-editor.html)
