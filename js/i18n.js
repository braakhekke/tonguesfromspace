/* English / German switch for every page (classic script, loaded in the <head> after config.js).

   English is the language of the source. German is a layer on top: js/i18n-de.js holds a dictionary English -> German and this file applies it to
   the page as it is built and as it changes (a MutationObserver), so the texts written by the scripts are covered without touching them.

   The dictionary keys are
     - a text node or an attribute value (title, aria-label, placeholder, alt, data-why), white space collapsed;
     - an element's inner HTML (key contains "<"), for a sentence with inline markup (links, bold) where the word order of German differs;
     - a template with {} for the changing parts ("Scenes found for {} of {} years"); the German value may use {1}, {2} to reorder.
   An exact entry wins over a template. Names (glaciers, places) and numbers are never keys.

   The choice is kept in localStorage 'tfs-lang' ("en" | "de"), also ?lang=de once. A switch reloads the page (the hash, i.e. the state of the explorer, stays).
   Debug: localStorage 'tfs-i18n-debug' = "1" collects what had no entry in window.tfsI18n.miss(). window.tfsT(text) translates a string for code that draws text itself (canvas). */
(function () {
  'use strict';
  var KEY = 'tfs-lang', lang = 'en';
  try {
    var q = /[?&]lang=(en|de)\b/.exec(location.search);
    if (q) localStorage.setItem(KEY, q[1]);
    lang = localStorage.getItem(KEY) === 'de' ? 'de' : 'en';
  } catch (e) { var q2 = /[?&]lang=(en|de)\b/.exec(location.search); if (q2) lang = q2[1]; }
  document.documentElement.setAttribute('lang', lang);
  var debug = false; try { debug = localStorage.getItem('tfs-i18n-debug') === '1'; } catch (e) { }
  var missed = {};
  window.tfsLang = lang;
  window.tfsI18n = { lang: lang, miss: function () { return Object.keys(missed); } };
  window.tfsT = function (s) { return s; };

  /* ---------- the switch (all pages) ---------- */
  var css = '.lang-sw{display:inline-flex;align-items:center;gap:2px;padding:2px;border-radius:999px;background:rgba(127,127,127,.18);font:600 11px/1 "Schibsted Grotesk",system-ui,sans-serif;letter-spacing:.04em;flex:none;vertical-align:middle;margin:0 0 0 8px}'
    + '.lang-sw button{all:unset;box-sizing:border-box;cursor:pointer;padding:5px 8px;border-radius:999px;color:inherit;opacity:.7;min-width:26px;text-align:center}'
    + '.lang-sw button[aria-pressed="true"]{background:#fff;color:#14222b;opacity:1;box-shadow:0 1px 2px rgba(0,0,0,.25)}'
    + '.lang-sw button:focus-visible{outline:2px solid #C8322A;outline-offset:1px}'
    + '.lang-sw.fixed{position:fixed;top:8px;right:8px;z-index:100001;margin:0;background:rgba(14,26,34,.78);color:#fff}'
    + '.controls .site-nav .lang-sw,#mhead .lang-sw{color:#14222b;background:rgba(20,34,43,.08)}'
    + '.controls .site-nav{flex-wrap:wrap;align-items:center}.controls .site-nav a{padding:4px 7px}.controls .site-nav .lang-sw{margin-left:6px}'
    + '#mhead .lang-sw{margin:0 0 0 auto;font-size:10.5px}#mhead .lang-sw button{padding:5px 7px;min-width:24px}#mhead .lang-sw + .menu-btn{margin-left:8px}'
    + 'header.bar nav .lang-sw{color:#fff;background:rgba(255,255,255,.16);margin-left:14px}'
    + '@media(max-width:700px){header.bar nav .lang-sw{margin-left:6px}}'
    + '@media(max-width:520px){header.bar nav{gap:11px;min-width:0}header.bar nav a{font-size:11.5px}header.bar nav .nav-home{display:none}header.bar nav .lang-sw{margin-left:2px}header.bar nav .lang-sw button[aria-pressed="true"]{display:none}}'
    + '@media(max-width:440px){#mhead strong .home-link{font-size:15px;gap:7px}#mhead .mhead-logo{height:24px}}';
  function makeSwitch() {
    var w = document.createElement('div');
    w.className = 'lang-sw'; w.setAttribute('role', 'group'); w.setAttribute('aria-label', lang === 'de' ? 'Sprache' : 'Language'); w.translate = false;
    [['en', 'EN', 'English'], ['de', 'DE', 'Deutsch']].forEach(function (l) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = l[1]; b.lang = l[0]; b.title = l[2]; b.setAttribute('aria-label', l[2]); b.setAttribute('aria-pressed', String(lang === l[0]));
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        if (lang === l[0]) return;
        try { localStorage.setItem(KEY, l[0]); } catch (er) { }
        var u = location.search.replace(/([?&])lang=(en|de)&?/, '$1').replace(/[?&]$/, '');
        if (u !== location.search) location.replace(location.pathname + u + location.hash); else location.reload();
      });
      w.appendChild(b);
    });
    return w;
  }
  function placeSwitch() {
    if (document.querySelector('.lang-sw')) return;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var bar = document.querySelector('header.bar nav'), side = document.querySelector('.controls .site-nav'), mh = document.getElementById('mhead');
    var did = false;
    if (bar) { bar.appendChild(makeSwitch()); did = true; }
    if (side) { side.appendChild(makeSwitch()); did = true; }
    if (mh) { var st2 = mh.querySelector('strong'), mb = st2 && st2.querySelector('.menu-btn'); if (st2) st2.insertBefore(makeSwitch(), mb || null); else mh.appendChild(makeSwitch()); did = true; }
    if (!did) { var f = makeSwitch(); f.classList.add('fixed'); document.body.appendChild(f); }
  }
  function boot() { placeSwitch(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  if (lang !== 'de') return;

  /* ---------- German: load the dictionary, then translate ---------- */
  function start() {
    var D = window.TFS_DE || {}, exact = Object.create(null), numd = Object.create(null), tpl = [];
    var NUM = '\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?', ITEM = '[+\\u2212\\-]?(?:' + NUM + ')(?:[-:](?:' + NUM + '))*(?: ?(?:mm|km|m|%)(?![A-Za-z]))?(?: at (?:' + NUM + ') m)?';
    var NUMRE = new RegExp('(?:' + ITEM + ')(?:, (?:' + ITEM + ')){2,}|' + NUM, 'g');      // a run of three or more plain number items counts as one, else every number; the same pattern in scripts/i18n/tool.py
    function abstract(core) { var nums = []; return { a: core.replace(NUMRE, function (n) { nums.push(n); return '{#}'; }), nums: nums }; }
    function fill(de, nums) { return de.replace(/\{(\d+)\}/g, function (m, d) { return nums[+d - 1] === undefined ? m : nums[+d - 1]; }); }
    Object.keys(D).forEach(function (k) {
      if (k.indexOf('{#}') >= 0) { numd[k] = D[k]; return; }
      if (k === '{names}') return;
      if (k.indexOf('{}') < 0 && k.indexOf('{g}') < 0) { exact[k] = D[k]; return; }
      var NAMES = (D['{names}'] || 'x').split('|').sort(function (a, b) { return b.length - a.length; }).map(function (n) { return n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|');
      var parts = k.split(/\{\}|\{g\}/), seps = k.match(/\{\}|\{g\}/g) || [], re = '^';
      parts.forEach(function (p, i) { re += p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); if (i < seps.length) re += seps[i] === '{g}' ? '(' + NAMES + ')' : '(.+?)'; });
      tpl.push({ re: new RegExp(re + '$'), de: D[k], n: seps.length, len: k.length });
    });
    tpl.sort(function (a, b) { return b.len - a.len; });
    var norm = function (s) { return s.replace(/\s+/g, ' ').trim(); }, produced = Object.create(null);
    function localNum(s) { return s.replace(/(\d),(?=\d{3}(?!\d))/g, '$1\u2019'); }      // Swiss writing: 1,291 -> 1’291 (the decimal point stays)
    function lookupNum(core) {
      if (!/\d/.test(core)) return undefined;
      var ab = abstract(core), d = numd[ab.a];
      return d === undefined ? undefined : fill(d, ab.nums);
    }

    var MONTHS = { January: 'Januar', February: 'Februar', March: 'März', April: 'April', May: 'Mai', June: 'Juni', July: 'Juli', August: 'August', September: 'September', October: 'Oktober', November: 'November', December: 'Dezember',
      Jan: 'Jan.', Feb: 'Feb.', Mar: 'März', Apr: 'Apr.', Jun: 'Juni', Jul: 'Juli', Aug: 'Aug.', Sep: 'Sept.', Sept: 'Sept.', Oct: 'Okt.', Nov: 'Nov.', Dec: 'Dez.' };
    var DATE = new RegExp('\\b(\\d{1,2}) (' + Object.keys(MONTHS).join('|') + ')\\b(?!\\w)', 'g');
    function dates(s) { return s.replace(DATE, function (_, d, m) { return d + '. ' + MONTHS[m]; }); }
    function lookup(core, depth) {
      if (exact[core] !== undefined) return exact[core];
      var nd = lookupNum(core); if (nd !== undefined) return nd;
      if (depth < 2 && core.indexOf(' · ') > 0) {      // "Switzerland · 3D · Image": the pieces one by one
        var any = false, parts = core.split(' · ').map(function (p) { var t = lookup(p, depth + 2); if (t === undefined && /^by .+/.test(p)) t = 'von ' + p.slice(3); if (t !== undefined) any = true; return t === undefined ? p : t; });
        if (any) return parts.join(' · ');
      }
      for (var i = 0; i < tpl.length; i++) {
        var m = tpl[i].re.exec(core);
        if (!m) continue;
        var seq = 0, caps = m.slice(1).map(function (c) { var t = depth < 2 ? lookup(c, depth + 1) : undefined; return t === undefined ? c : t; });
        return tpl[i].de.replace(/\{(\d*)\}/g, function (_, d) { return caps[d ? +d - 1 : seq++] || ''; });
      }
      return undefined;
    }
    function post(s) { return s.replace(/\bm\/yr\b/g, 'm/Jahr').replace(/(\d{4}) none\b/g, '$1 keine'); }
    function tr(s) {      // whole string with its surrounding white space -> German or undefined
      var lead = /^\s*/.exec(s)[0], trail = /\s*$/.exec(s)[0], core = norm(s);
      if (!core) return undefined;
      var d = lookup(core, 0);
      if (d === undefined) {
        var n = localNum(dates(core));
        if (n !== core) return lead + n + trail;
        if (debug && !produced[core] && /[A-Za-z]{2}/.test(core) && !/^[\d\s.,:;%°+\-–—/·×()'"]*$/.test(core)) missed[core] = 1;
        return undefined;
      }
      var out = localNum(dates(post(d))); if (debug) produced[norm(out)] = 1;
      return lead + out + trail;
    }
    window.tfsT = function (s) { var d = typeof s === 'string' ? tr(s) : undefined; return d === undefined ? s : d.trim(); };

    var ATTRS = ['title', 'aria-label', 'placeholder', 'alt', 'data-why', 'data-tip', 'aria-description'];
    var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, CODE: 1, PRE: 1, SVG: 0 };
    var written = new WeakMap(), INLINE = { A: 1, B: 1, STRONG: 1, EM: 1, I: 1, SPAN: 1, SUP: 1, SUB: 1, BR: 1, SMALL: 1, U: 1, MARK: 1, ABBR: 1, TIME: 1 };
    var hasHtmlKeys = Object.keys(exact).concat(Object.keys(numd)).some(function (k) { return k.indexOf('\u27e8') >= 0; });
    function skipped(el) { return el.closest && el.closest('[translate="no"],.notranslate,script,style,textarea'); }

    function doText(n) {
      var v = n.nodeValue; if (written.get(n) === v) return;
      var d = tr(v); if (d !== undefined && d !== v) { n.nodeValue = d; written.set(n, d); }
    }
    function doAttrs(el) {
      for (var i = 0; i < ATTRS.length; i++) {
        var a = ATTRS[i]; if (!el.hasAttribute(a)) continue;
        var v = el.getAttribute(a), d = tr(v);
        if (d !== undefined && d !== v) el.setAttribute(a, d.trim());
      }
      if (el.tagName === 'INPUT' && /^(button|submit|reset)$/.test(el.type) && el.value) { var d2 = tr(el.value); if (d2 !== undefined) el.value = d2.trim(); }
    }
    function mixed(el) {      // direct text with letters next to an element child: a sentence with markup
      var t = false; for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 && /[A-Za-z]{2}/.test(c.nodeValue)) { t = true; break; }
      return t;
    }
    function tokenise(h) {      // every tag becomes a letter token in order; the page's own tags are put back after the lookup
      var tags = [];
      var t = h.replace(/<[^>]*>/g, function (m) { var n = tags.length; tags.push(m); return '\u27e8' + (n < 26 ? String.fromCharCode(97 + n) : String.fromCharCode(96 + Math.floor(n / 26)) + String.fromCharCode(97 + n % 26)) + '\u27e9'; });
      return { t: norm(t), tags: tags };
    }
    function untoken(d, tags) {
      return d.replace(/\u27e8([a-z]{1,2})\u27e9/g, function (m, l) { var n = l.length === 1 ? l.charCodeAt(0) - 97 : (l.charCodeAt(0) - 96) * 26 + l.charCodeAt(1) - 97; return tags[n] === undefined ? '' : tags[n]; });
    }
    function doHtml(el) {      // an element with inline markup: the whole inner HTML is one sentence
      if (!(hasHtmlKeys || debug) || !el.firstElementChild || skipped(el)) return false;
      for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (!INLINE[c.tagName]) return false;
      var html = el.innerHTML; if (html.length > 6000) return false;
      var tk = tokenise(html), d = exact[tk.t];
      if (d === undefined) d = lookupNum(tk.t);
      if (d === undefined) { if (debug && mixed(el) && html.indexOf('<svg') < 0) missed['<>' + tk.t] = 1; return false; }
      el.innerHTML = untoken(d, tk.tags); el.setAttribute('data-i18n', '1'); return true;
    }
    function walk(root) {
      if (root.nodeType === 3) { if (!skipped(root.parentNode || document.body)) doText(root); return; }
      if (root.nodeType !== 1 || skipped(root)) return;
      if (root.hasAttribute('data-i18n')) return;
      if (doHtml(root)) return;
      doAttrs(root);
      for (var c = root.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) doText(c);
        else if (c.nodeType === 1 && !SKIP[c.tagName]) walk(c);
      }
    }
    var queue = [], pending = false;
    function flush() {
      pending = false; var q = queue; queue = [];
      obs.disconnect();
      for (var i = 0; i < q.length; i++) { try { if (q[i].isConnected !== false) walk(q[i]); } catch (e) { } }
      obs.observe(document.documentElement, OPTS);
    }
    function push(n) { queue.push(n); if (!pending) { pending = true; (window.requestAnimationFrame || setTimeout)(flush); } }
    var OPTS = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS };
    var obs = new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i];
        if (m.type === 'childList') { for (var j = 0; j < m.addedNodes.length; j++) push(m.addedNodes[j]); }
        else if (m.type === 'characterData') push(m.target);
        else if (m.type === 'attributes') push(m.target);
      }
    });
    function first() {
      document.title = tr(document.title) || document.title;
      walk(document.documentElement);
      obs.observe(document.documentElement, OPTS);
      window.tfsI18n.retranslate = function () { walk(document.documentElement); };
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', first); else first();
  }

  /* the dictionary: a plain script (own address in the build: config.js maps js/i18n-de.js to its hashed name) */
  var A = (window.TFS_CONFIG && window.TFS_CONFIG.assets) || {};
  var src = A['js/i18n-de.js'] || 'js/i18n-de.js';
  var base = ''; try { var cs = document.currentScript && document.currentScript.src; if (cs) base = cs.replace(/js\/[^/]*$/, ''); } catch (e) { }
  if (!/^(\/|https?:)/.test(src)) src = base + src;
  if (document.readyState === 'loading') {
    document.write('<script src="' + src + '"><\/script><script>window.tfsI18nStart&&window.tfsI18nStart()<\/script>');
    window.tfsI18nStart = start;
  } else {
    var s = document.createElement('script'); s.src = src; s.onload = start; document.head.appendChild(s);
  }
})();
