# Ice thickness map layer: removed from the layer panel

A checkbox "Ice thickness (Grab et al. 2021)" drew the swisstopo WMS layer `ch.swisstopo.geologie-gletschermaechtigkeit` over the
satellite scene footprint, with a legend card (`thickCard`, legend from api3.geo.admin.ch). It was never verified on the live service
(legend image). `index.with-thickness-layer.html` is the full page from before removal; search it for `thickToggle`, `thickCard`,
`setThickness`, `thicknessUrl`, `thickPane`. The per-glacier ice volume (water tile) still uses the same swisstopo layer name through the
identify service, so `THICK_LAYER` stays in `index.html`.
