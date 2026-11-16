/* The scroll effects of the front page (home.html, css/home.css "scroll story"). A classic script, no libraries, transforms and opacity only (no filters).
   - the red reading-progress line at the top, and the header: dark once the page has moved, away while reading down, back when scrolling up
   - the hero moves slower than the page and fades out as it leaves (--hp, 0 to 1, read by the CSS)
   - .rv: appears (rises and fades in) when it comes into view, one after the other within a group (--d)
   - .lit: the paragraphs of the Why block grow bright as they reach the middle of the screen, and dim again when they have gone past (--lit)
   Without IntersectionObserver or with reduced motion nothing is hidden: the head script of the page only switches html.js-rv on when these effects can run.
   The story with the pinned clip ("what you can do") has its own code in the page. */
(function () {
  var root = document.documentElement;
  window.__rvOk = true;
  var still = matchMedia('(prefers-reduced-motion:reduce)').matches;
  var bar = document.querySelector('header.bar'), prog = document.getElementById('progress'), hero = document.querySelector('.hero');
  var lap = document.getElementById('laptop'), how = document.getElementById('how');
  var lits = Array.prototype.slice.call(document.querySelectorAll('.lit'));

  /* reveal: a group is the children of one parent that are marked .rv; each waits a little longer than the one before */
  if (root.classList.contains('js-rv')) {
    var groups = new Map();
    document.querySelectorAll('.rv').forEach(function (el) {
      var g = groups.get(el.parentElement) || []; groups.set(el.parentElement, g); el.style.setProperty('--d', Math.min(g.length, 5) * 90 + 'ms'); g.push(el);
    });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    document.querySelectorAll('.rv').forEach(function (el) { io.observe(el); });
  }

  var lastY = scrollY, ticking = false;
  function frame() {
    ticking = false;
    var y = scrollY, h = innerHeight, max = Math.max(1, root.scrollHeight - h);
    if (prog) prog.style.transform = 'scaleX(' + Math.min(1, y / max).toFixed(4) + ')';
    if (bar) {
      bar.classList.toggle('solid', y > 40);
      var down = y > lastY + 4, up = y < lastY - 4;
      if (y < 80 || up) bar.classList.remove('away'); else if (down && y > h * 0.6) bar.classList.add('away');
      if (down || up) lastY = y;
    }
    if (lap && !still) { var q = how.getBoundingClientRect(), t = Math.max(0, Math.min(1, (h - q.top) / (q.height + h))); lap.style.setProperty('--ry', (-18 + t * 36).toFixed(1) + 'deg'); lap.style.setProperty('--rx', (6 - Math.sin(t * Math.PI) * 4).toFixed(1) + 'deg'); }      // the laptop of "Create and share" turns from left to right while the section passes
    if (!still) { var tile = 2000 * Math.max(innerWidth / 1600, h / 1000); root.style.setProperty('--tile', tile.toFixed(0) + 'px'); root.style.setProperty('--sy', ((y * 0.12) % tile).toFixed(1) + 'px'); }      /* the stars drift up slowly (12% of the scroll) in every starry section; the picture is two heights tall (second half mirrored, so no seam) and repeats; the offset wraps at its height */
    if (hero && !still) hero.style.setProperty('--hp', Math.max(0, Math.min(1, y / (hero.offsetHeight * 0.85))).toFixed(3));
    for (var i = 0; i < lits.length; i++) {
      var r = lits[i].getBoundingClientRect(), mid = (r.top + r.bottom) / 2, d = Math.abs(mid - h * 0.52) / (h * 0.42);
      lits[i].style.setProperty('--lit', still ? 1 : Math.max(0, Math.min(1, 1.15 - d)).toFixed(3));
    }
  }
  function ask() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  addEventListener('scroll', ask, { passive: true }); addEventListener('resize', ask); frame();

  /* the header must not hide while a menu inside it is open (the language switch) */
  if (bar) bar.addEventListener('focusin', function () { bar.classList.remove('away'); });
})();
