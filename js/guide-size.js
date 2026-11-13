/* The guide on the size page (size.html). The engine is js/guide-core.js, shared with the Explorer (js/15-guide.js).
   The size page's own scripts are plain inline scripts, so everything here reads the page itself: buttons, classes, attributes.
   Built as its own bundle by scripts/build_site.py. It does not open by itself here: the Guide button under the page links opens it,
   and so does the Explorer's guide when it sends the visitor over (chapter "Compare sizes"). Not in an embed. */
import { $, sleep, shown, ICON, input, did, createGuide } from './guide-core.js';

const stage = $('stage');
const q = s => /** @type {HTMLElement} */ (document.querySelector(s));
/** @param {Element|null} el */
const press = el => !!el && el.getAttribute('aria-pressed') === 'true';
const is3d = () => document.body.classList.contains('is-3d');
const modeBtn = m => q('#modeSwitch [data-mode="' + m + '"]');
const tenBtn = () => q('#allTen button');
const released = () => Date.now() - input.down > 600;
const paneOpen = () => !$('videoSheet').hidden;
const fmtOn = () => (['vfWide', 'vfReel', 'vfFeed', 'vfCustom'].find(id => press($(id))) || '');
const to = async (api, m) => { if (is3d() !== (m === '3d')) { modeBtn(m).click(); await api.until(() => is3d() === (m === '3d'), 15000); } if (m === '3d') await api.until(() => !shown($('s3Busy')), 40000); await sleep(500); };
const closePane = () => { if (paneOpen()) $('vsClose').click(); };

const SIZE = [
  { id: 'size-area', icon: ICON.area, title: 'On your city', line: 'A glacier’s outline over a place you know', where: 'Area', used: () => modeBtn('2d'),
    async setup(api){ closePane(); await to(api, '2d'); },
    beats: [
      { say: 'Pick a glacier.', target: () => $('gList'), done: c => did('click', 'gList', c.t0), praise: 'Its outline lies on the map.', quick: true },
      { say: 'Pick a city, or type your own.', target: () => $('placeGroup'), done: c => did('click', 'cities', c.t0) || did('click', 'cityForm', c.t0), praise: 'Glacier and city, at the same scale.' },
      { say: 'Drag the outline to where you want it.', drag: () => $('map'), done: c => did('down', 'map', c.t0) && released(), praise: 'It moves; its size stays.' },
      { say: 'This button turns it.', target: () => $('rotR'), skipIf: () => !shown($('rotR')), done: c => did('click', 'rotR', c.t0), praise: 'Lay it any way you like.' }
    ] },
  { id: 'size-volume', icon: ICON.cube, title: 'One block of ice', line: 'All the ice of a glacier, to throw around', where: 'Volume', used: () => modeBtn('3d'),
    async setup(api){ closePane(); await to(api, '3d'); },
    beats: [
      { say: 'Grab the ice cube and throw it.', drag: () => $('s3d'), done: c => did('down', 'view3d', c.t0) && released(), praise: 'All the ice of the glacier as one block.' },
      { say: 'Press Volume again: a ball.', target: () => modeBtn('3d'), skipIf: () => $('modeSwitch').dataset.shape === 'ball', done: () => $('modeSwitch').dataset.shape === 'ball', praise: 'The same ice, as a ball.' },
      { say: 'Drop it again.', target: () => $('s3Again'), done: c => did('click', 's3Again', c.t0), praise: 'The panel on the right has its numbers.' }
    ] },
  { id: 'size-ten', icon: ICON.ten, title: 'All ten at once', line: 'Every glacier of the list, side by side', where: 'Choose › Ten', used: tenBtn,
    async setup(api){ closePane(); await to(api, '3d'); },
    beats: [
      { say: 'Switch on Ten.', target: tenBtn, skipIf: () => press(tenBtn()), done: () => press(tenBtn()), praise: 'All ten glaciers at once.' },
      { say: 'Now Total Swiss.', target: () => $('totalSw'), skipIf: () => !shown($('totalSw')), done: () => press($('totalSw')), praise: 'All Swiss glaciers together as one block.' }
    ] },
  { id: 'size-make', icon: ICON.image, title: 'Your visual', line: 'A picture or animation of what you built', where: 'Create and share › Your visual', used: () => $('videoBtn'),
    async setup(api){ if (!paneOpen()) $('videoBtn').click(); await api.until(() => paneOpen() && shown($('videoFrame')), 20000); await sleep(400); },
    beats: [
      { say: 'Choose a shape for it.', target: () => $('vfWide') && $('vfWide').parentElement, init: c => { c.base = fmtOn(); }, done: c => fmtOn() !== c.base, praise: 'The frame shows exactly what you get.' },
      { say: 'Image or animation?', target: () => q('#videoSheet .vs-kind'), skipIf: () => !shown($('vkVideo')), done: c => did('click', 'vkImage', c.t0) || did('click', 'vkVideo', c.t0), praise: 'An animation lets the block fall again.' },
      { say: 'Download it.', target: () => $('vsGo'), done: c => did('click', 'vsGo', c.t0), praise: 'Yours to share.' }
    ] }
];
const CHAPTERS = [
  { id: 'size', title: 'Compare sizes', kicker: 'Compare sizes', head: 'How big is a glacier?', tracks: SIZE },
  { id: 'start', title: 'Explorer', kicker: 'Another page', head: 'See it from space', foot: 'The guide continues there.',
    link: { href: $('navExplorer') ? $('navExplorer').getAttribute('href') : 'index.html', open: 'start', icon: ICON.image, title: 'Back to the Explorer', line: 'Satellite pictures year by year, 3D and the glacier’s story' } }
];

if (!document.documentElement.classList.contains('embed')) createGuide({
  stage, chapters: CHAPTERS, autoOpen: false,
  firstHead: () => 'How big is a glacier?',
  obstacles: () => [$('rotR') && $('rotR').parentElement, $('zoomIn') && $('zoomIn').parentElement, $('s3Again') && $('s3Again').parentElement, $('s3ZoomIn') && $('s3ZoomIn').parentElement, stage.querySelector('.tfs-scale')],      // the page's toolbars, in 2D and in 3D
  launcherHost: () => document.querySelector('.controls .brand-btns')
});
