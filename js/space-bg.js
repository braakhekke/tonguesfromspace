/* Deep space, drawn like the map viewer's backdrop (spaceCanvas in js/05-map.js): dark blue gradient, a soft Milky Way band, nebula glows, small stars. Fixed seed. */
(() => {
  const w = 1600, h = 1000, perStar = 2400, scale = 1;
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
  window.tfsSpace = new Promise(res => c.toBlob(blob => res('url(' + URL.createObjectURL(blob) + ')')));      // the picture as a CSS url(); pages that draw their own bar later wait for it (js/top-bar.js)
  // the same picture twice, the second time mirrored: it repeats without a seam (the home page's drifting stars, --tfs-space2)
  const m = document.createElement('canvas'); m.width = w; m.height = 2 * h; const y = m.getContext('2d');
  y.drawImage(c, 0, 0); y.save(); y.translate(0, 2 * h); y.scale(1, -1); y.drawImage(c, 0, 0); y.restore();
  m.toBlob(blob => document.documentElement.style.setProperty('--tfs-space2', 'url(' + URL.createObjectURL(blob) + ')'));
  window.tfsSpace.then(u => { document.documentElement.style.setProperty('--tfs-space', u); document.querySelectorAll('.bar:not(.tbar):not(.bar-solid-only)').forEach(el => { el.style.backgroundImage = u; }); });
})();
