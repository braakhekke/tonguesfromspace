// Test and debugging hook: when window.TFS_EXPOSE is set (tests/test_site.py does, or type it in the console before the page loads),
// every exported name of the sections is readable on `window`, e.g. `state` or `currentGlacier()`. Nothing in the page uses it.

import * as m0 from './01-data.js';
import * as m1 from './02-glaciers.js';
import * as m2 from './03-imagery.js';
import * as m3 from './04-state.js';
import * as m4 from './05-map.js';
import * as m5 from './06-scene-search.js';
import * as m6 from './07-render.js';
import * as m7 from './07a-region-icecaps.js';
import * as m8 from './07b-icecap-texts.js';
import * as m9 from './08-controls.js';
import * as m10 from './09-phones.js';
import * as m11 from './10-animation.js';
import * as m12 from './11-view3d.js';
import * as m13 from './12-boot.js';
import * as m14 from './13-teaser.js';
import * as m15 from './14-streetview.js';

if (/** @type {any} */ (window).TFS_EXPOSE) {
  for (const ns of [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12, m13, m14, m15]) {
    for (const k of Object.keys(ns)) Object.defineProperty(window, k, { get: () => ns[k], configurable: true });
  }
}
