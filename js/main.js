// The page's entry: every section in load order (the numbers in the file names). Imports run in this order, so a
// statement at the top of a file may use what the files before it set up. The classic script 00-regions.js and
// config.js run before this.
import './01-data.js';
import './02-glaciers.js';
import './03-imagery.js';
import './04-state.js';
import './05-map.js';
import './06-scene-search.js';
import './07-render.js';
import './07a-region-icecaps.js';
import './07b-icecap-texts.js';
import './08-controls.js';
import './09-phones.js';
import './10-animation.js';
import './11-view3d.js';
import './12-boot.js';
import './13-teaser.js';
import './14-streetview.js';
import './devtools.js';
