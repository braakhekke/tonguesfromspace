# Image depth ("Bildtiefe") for the historic photographs, parked

Smapshot's photo viewer lets you set an "image depth": the photograph stands as a flat plane in the 3D scene at a chosen distance, terrain nearer than the plane covers it and terrain behind it is hidden, so the old glacier appears to sit inside today's valley. This reproduces it in the 3D view (tested on the Aletsch photos in a headless browser).

Parked on purpose: taken out of the site for now. The four files hold exactly the code that was removed; each starts with a comment saying where it goes in `js/11-view3d.js` and `style.css` and which small edits go with it.

- `viewer-billboard.js`: a second tiny WebGL program draws the photo as a screen-aligned quad at a given depth in the same depth buffer as the terrain (`setBillboard(img, rect, distance)`); the photo is loaded with `crossOrigin = 'anonymous'` (the ETH image server allows it).
- `photo-ui.js`: the slider (60 m to 9 km, log scale), `setDepthMode`, `applyDepth`.
- `caption-buttons.js`, `style.css`: the "Image depth" / "Compare line" button and the slider row in the caption.

Known limits: one flat plane at one distance (as in Smapshot); stretched texture on steep DEM edges; the compare line and the ice-level rod rest while it is on; Aletsch only.
