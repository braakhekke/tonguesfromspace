/* Languages of every page (classic script in the <head> after config.js): English, German, French.

   English is the language of the source. The other languages are layers on top: js/i18n-<lang>.js holds a dictionary English -> that language and this file applies it
   to the page as it is built and as it changes (a MutationObserver), so the texts written by the scripts are covered without touching them.

   The language is in the ADDRESS: /de/... and /fr/... (English has no prefix). On the public site the Worker serves the same files under the prefix (worker/main.ts);
   serve.py does the same locally. A switch is a plain link to the same page in the other language (search and hash are kept). Root-absolute links to our own pages are given the prefix here.

   The dictionary keys are
     - a text node or an attribute value (title, aria-label, placeholder, alt, data-why), white space collapsed;
     - an element's inner HTML (key contains "<"), for a sentence with inline markup (links, bold) where the word order differs;
     - a template with {} for the changing parts ("Scenes found for {} of {} years"); the value may use {1}, {2} to reorder.
   An exact entry wins over a template. Names (glaciers, places) and numbers are never keys.

   Where the switch sits: next to the social icons in the right panel of the explorer and the size page (three small links), as a drop-down in the header of the other pages (front page, gallery,
   field notes), a fixed drop-down where a page has no header, and a line in the phone menu.
   Debug: localStorage 'tfs-i18n-debug' = "1" collects what had no entry in window.tfsI18n.miss(). window.tfsT(text) translates a string for code that draws text itself (canvas). */
(function () {
  'use strict';
  var LANGS = [['en', 'EN', 'English'], ['de', 'DE', 'Deutsch'], ['fr', 'FR', 'Fran\u00e7ais']];
  var pm = /^\/(de|fr)(?=\/|$)/.exec(location.pathname), lang = pm ? pm[1] : 'en', pfx = pm ? '/' + pm[1] : '';
  var lq = /[?&]lang=(de|fr|en)\b/.exec(location.search);      // the old way (before the language was in the address): go to the address
  if (lq && !pm) {
    var rest0 = location.search.replace(/([?&])lang=(?:de|fr|en)&?/, '$1').replace(/[?&]$/, '');
    location.replace((lq[1] === 'en' ? '' : '/' + lq[1]) + location.pathname + rest0 + location.hash);
    return;
  }
  document.documentElement.setAttribute('lang', lang);
  if (lang !== 'en') document.documentElement.setAttribute('data-i18n-long', '');      // CSS for the longer languages hangs on this
  var debug = false; try { debug = localStorage.getItem('tfs-i18n-debug') === '1'; } catch (e) { }
  var missed = {};
  window.tfsLang = lang;
  window.tfsI18n = { lang: lang, miss: function () { return Object.keys(missed); } };
  window.tfsT = function (s) { return s; };
  var GROUP = { en: 'Language', de: 'Sprache', fr: 'Langue' };

  /* ---------- the switch (all pages) ---------- */
  function target(l) {      // this page in language l, same search and hash
    var rest = pfx ? location.pathname.slice(pfx.length) || '/' : location.pathname;
    return (l === 'en' ? '' : '/' + l) + rest + location.search + location.hash;
  }
  var css = '.lang-sw{display:inline-flex;align-items:center;gap:1px;padding:2px;border-radius:999px;background:rgba(127,127,127,.16);font:600 10.5px/1 "Schibsted Grotesk",system-ui,sans-serif;letter-spacing:.04em;flex:none;vertical-align:middle;margin:0 0 0 6px;color:var(--moraine,#5b6b75)}'
    + '.lang-sw a{all:unset;box-sizing:border-box;cursor:pointer;padding:5px 6px;border-radius:999px;color:inherit;opacity:.85;min-width:22px;text-align:center}'
    + '.lang-sw a:hover{opacity:1;color:#C8322A}'
    + '.lang-sw a[aria-current="true"]{background:#fff;color:#14222b;opacity:1;box-shadow:0 1px 2px rgba(0,0,0,.25);cursor:default}'
    + '.lang-sw a:focus-visible,.lang-dd button:focus-visible,.lang-dd a:focus-visible{outline:2px solid #C8322A;outline-offset:1px}'
    + '.social .lang-sw{margin-left:8px}'
    + '.lang-dd{position:relative;display:inline-block;flex:none;vertical-align:middle;margin-left:14px;font:600 11px/1 "Schibsted Grotesk",system-ui,sans-serif;letter-spacing:.04em}'
    + '.lang-dd > button{all:unset;box-sizing:border-box;position:relative;cursor:pointer;display:inline-flex;align-items:center;gap:5px;padding:6px 9px;border-radius:999px;background:rgba(255,255,255,.16);color:#fff}'
    + '.lang-dd > button svg{display:block;flex:none;width:9px;height:9px;min-width:0;max-width:none;margin:0;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}'      /* every size is set here: the field notes page has a rule for all its svg (min-width:860px, for the charts) */
    + '.lang-dd a::before,.lang-dd a::after{content:none!important}'      /* the header pages enlarge the tap area of their nav links with ::after (phones); on the links of this list those areas covered the whole list, so every tap chose the last language */
    + '.lang-dd > button[aria-expanded="true"] svg{transform:rotate(180deg)}'
    + '.lang-dd ul{box-sizing:border-box;position:absolute;right:0;top:calc(100% + 6px);z-index:100002;margin:0;padding:3px;list-style:none;min-width:116px;background:#fff;color:#14222b;border-radius:11px;box-shadow:0 6px 22px rgba(0,0,0,.28)}'
    + '.lang-dd ul[hidden]{display:none}'
    + '.lang-dd li a{all:unset;box-sizing:border-box;display:block;cursor:pointer;padding:8px 10px;border-radius:8px;font:600 12.5px/1.1 "Schibsted Grotesk",system-ui,sans-serif;letter-spacing:0;white-space:nowrap}'
    + '.lang-dd li a:hover{background:rgba(20,34,43,.07)}'
    + '.lang-dd li a[aria-current="true"]{background:rgba(200,50,42,.1);color:#C8322A;cursor:default}'
    + 'header.bar nav .lang-dd ul li a,header.bar nav .lang-dd ul li a:hover{color:#14222b;font-size:12.5px;opacity:1}header.bar nav .lang-dd ul li a[aria-current="true"],header.bar nav .lang-dd ul li a[aria-current="true"]:hover{color:#C8322A}'      /* "ul li a": stronger than the phone rule for the header links of the longer languages below, which made this list smaller in German and French */
    + '.lang-dd.fixed{position:fixed;top:8px;right:8px;z-index:100001;margin:0}.lang-dd.fixed > button{background:rgba(14,26,34,.78)}'
    + '@media(max-width:700px){.lang-dd{margin-left:6px}}'
    + '@media(max-width:640px){.lang-dd > button::after{content:"";position:absolute;inset:-14px -3px}.lang-dd li a{padding:11px 12px}}'      /* phones: the button\'s tap area reaches past it like the header links\'; taller rows in the list */
    + '@media(max-width:520px){header.bar nav{gap:11px;min-width:0}header.bar nav a{font-size:11.5px}header.bar nav .nav-home{display:none}.lang-dd{margin-left:2px}.lang-dd > button{padding:6px 8px}html[data-i18n-long] header.bar nav{gap:9px}html[data-i18n-long] header.bar nav a{font-size:11px;white-space:nowrap}}'
    + '@media(max-width:380px){header.bar nav,html[data-i18n-long] header.bar nav{gap:7px}header.bar nav a,html[data-i18n-long] header.bar nav a{font-size:10.5px}.bar .wrap{padding:0 10px;gap:6px}.lang-dd > button{padding:6px 7px}}'      /* very narrow phones: the five links and the button fit the width */
    + '.phone-menu .lang-li{display:flex;gap:6px;align-items:center;cursor:default}.phone-menu .lang-li .lang-sw{margin:0;color:inherit}.phone-menu .lang-li .lang-sw a{padding:6px 9px;min-width:30px}';
  function links(cls) {
    var w = document.createElement('div');
    w.className = cls; w.setAttribute('role', 'group'); w.setAttribute('aria-label', GROUP[lang]); w.translate = false;
    LANGS.forEach(function (l) {
      var a = document.createElement('a');
      a.href = target(l[0]); a.textContent = l[1]; a.lang = l[0]; a.hreflang = l[0]; a.title = l[2]; a.setAttribute('aria-label', l[2]);
      if (l[0] === lang) a.setAttribute('aria-current', 'true');
      w.appendChild(a);
    });
    return w;
  }
  function makeSwitch() { return links('lang-sw'); }
  function makeDropdown(fixed) {
    var w = document.createElement('div'); w.className = 'lang-dd' + (fixed ? ' fixed' : ''); w.translate = false;
    var b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-haspopup', 'true'); b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-label', GROUP[lang] + ': ' + LANGS.filter(function (l) { return l[0] === lang; })[0][2]);
    b.innerHTML = '<span>' + lang.toUpperCase() + '</span><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4.5l4 4 4-4"/></svg>';
    var ul = document.createElement('ul'); ul.hidden = true; ul.setAttribute('aria-label', GROUP[lang]);
    LANGS.forEach(function (l) {
      var li = document.createElement('li'), a = document.createElement('a');
      a.href = target(l[0]); a.textContent = l[2]; a.lang = l[0]; a.hreflang = l[0];
      if (l[0] === lang) a.setAttribute('aria-current', 'true');
      li.appendChild(a); ul.appendChild(li);
    });
    b.addEventListener('click', function (e) { e.stopPropagation(); var on = ul.hidden; ul.hidden = !on; b.setAttribute('aria-expanded', String(on)); });
    w.appendChild(b); w.appendChild(ul);
    return w;
  }
  function refreshLinks() { var a = document.querySelectorAll('.lang-sw a, .lang-dd a'); for (var i = 0; i < a.length; i++) a[i].setAttribute('href', target(a[i].lang)); }
  document.addEventListener('click', function (e) {      // capture: the phone menu stops clicks on their way up
    var a = e.target.closest && e.target.closest('.lang-sw a, .lang-dd a');
    if (a) { e.preventDefault(); if (a.lang !== lang) location.href = target(a.lang); return; }
    if (!(e.target.closest && e.target.closest('.lang-dd'))) closeMenus();
  }, true);
  document.addEventListener('pointerover', function (e) { if (e.target.closest && e.target.closest('.lang-sw, .lang-dd')) refreshLinks(); });
  document.addEventListener('focusin', function (e) { if (e.target.closest && e.target.closest('.lang-sw, .lang-dd')) refreshLinks(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenus(); });
  function closeMenus() { var m = document.querySelectorAll('.lang-dd ul:not([hidden])'); for (var i = 0; i < m.length; i++) { m[i].hidden = true; m[i].previousSibling.setAttribute('aria-expanded', 'false'); } }

  var styled = false;
  function place() {      // idempotent: the right panel and the phone menu are drawn again and again
    if (!document.body) return;
    if (!styled) { styled = true; var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }
    var soc = document.querySelectorAll('.social'), i;
    for (i = 0; i < soc.length; i++) if (!soc[i].querySelector('.lang-sw')) soc[i].appendChild(makeSwitch());
    var pmn = document.querySelectorAll('.phone-menu');
    for (i = 0; i < pmn.length; i++) if (!pmn[i].querySelector('.lang-li') && pmn[i].children.length) {
      var g = document.createElement('li'); g.className = 'group lang-li-g'; g.setAttribute('role', 'presentation'); g.textContent = GROUP[lang];
      var li = document.createElement('li'); li.className = 'lang-li'; li.appendChild(makeSwitch());
      pmn[i].appendChild(g); pmn[i].appendChild(li);
    }
    if (document.querySelector('.lang-dd')) return;
    var bar = document.querySelector('header.bar nav');
    if (bar) bar.appendChild(makeDropdown(false));
    else if (!document.querySelector('.social') && !document.getElementById('mhead')) document.body.appendChild(makeDropdown(true));
  }
  var placeT = 0;
  function schedule() { if (!placeT) placeT = setTimeout(function () { placeT = 0; place(); }, 50); }
  function boot() {
    place();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    if (!document.querySelector('.lang-dd, .lang-sw')) setTimeout(place, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  if (lang === 'en') return;

/* ---------- other languages: load the dictionary, then translate ---------- */
  function start() {
    var D = window['TFS_' + lang.toUpperCase()] || {}, exact = Object.create(null), numd = Object.create(null), tpl = [];
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
    var LX = {      // what differs by language besides the dictionary
      de: { by: 'von ', myr: 'm/Jahr', none: 'keine', thou: '\u2019', day: function (d) { return d + '.'; },
        months: { January: 'Januar', February: 'Februar', March: 'März', April: 'April', May: 'Mai', June: 'Juni', July: 'Juli', August: 'August', September: 'September', October: 'Oktober', November: 'November', December: 'Dezember',
          Jan: 'Jan.', Feb: 'Feb.', Mar: 'März', Apr: 'Apr.', Jun: 'Juni', Jul: 'Juli', Aug: 'Aug.', Sep: 'Sept.', Sept: 'Sept.', Oct: 'Okt.', Nov: 'Nov.', Dec: 'Dez.' } },
      fr: { by: 'par ', myr: 'm/an', none: 'aucun', thou: '\u202f', fix: function (s) { return s.replace(/ ([:;!?»])/g, '\u00a0$1').replace(/« /g, '«\u00a0'); }, day: function (d) { return d === '1' ? '1er' : d; },
        months: { January: 'janvier', February: 'février', March: 'mars', April: 'avril', May: 'mai', June: 'juin', July: 'juillet', August: 'août', September: 'septembre', October: 'octobre', November: 'novembre', December: 'décembre',
          Jan: 'janv.', Feb: 'févr.', Mar: 'mars', Apr: 'avr.', Jun: 'juin', Jul: 'juil.', Aug: 'août', Sep: 'sept.', Sept: 'sept.', Oct: 'oct.', Nov: 'nov.', Dec: 'déc.' } }
    }[lang];
    function localNum(s) { return s.replace(/(\d),(?=\d{3}(?!\d))/g, '$1' + LX.thou); }      // Swiss writing: 1,291 -> 1’291 (German), 1 291 (French); the decimal point stays
    function lookupNum(core) {
      if (!/\d/.test(core)) return undefined;
      var ab = abstract(core), d = numd[ab.a];
      return d === undefined ? undefined : fill(d, ab.nums);
    }

    var MONTHS = LX.months;
    var DATE = new RegExp('\\b(\\d{1,2}) (' + Object.keys(MONTHS).join('|') + ')\\b(?!\\w)', 'g');
    function dates(s) { return s.replace(DATE, function (_, d, m) { return LX.day(d) + ' ' + MONTHS[m]; }); }
    function lookup(core, depth) {
      if (exact[core] !== undefined) return exact[core];
      var nd = lookupNum(core); if (nd !== undefined) return nd;
      if (depth < 2 && core.indexOf(' · ') > 0) {      // "Switzerland · 3D · Image": the pieces one by one
        var any = false, parts = core.split(' · ').map(function (p) { var t = lookup(p, depth + 2); if (t === undefined && /^by .+/.test(p)) t = LX.by + p.slice(3); if (t !== undefined) any = true; return t === undefined ? p : t; });
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
    function post(s) { return s.replace(/\bm\/yr\b/g, LX.myr).replace(/(\d{4}) none\b/g, '$1 ' + LX.none); }
    function fin(s) { var o = localNum(dates(post(s))); return LX.fix ? LX.fix(o) : o; }      // dates, thousands and (French) the spaces before : ; ! ? » that must not break
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
      var out = fin(d); if (debug) produced[norm(out)] = 1;
      return lead + out + trail;
    }
    window.tfsT = function (s) { var d = typeof s === 'string' ? tr(s) : undefined; return d === undefined ? s : d.trim(); };
    /* every text the page draws on a canvas (export pictures, 3D labels, legends, the video) goes through the same dictionary: one memo, so frames cost nothing */
    (function () {
      var C = window.CanvasRenderingContext2D; if (!C || !C.prototype) return;
      var memo = Object.create(null), n = 0;
      function t(s) { if (typeof s !== 'string' || s.length > 400) return s; var r = memo[s]; if (r === undefined) { if (n > 3000) { memo = Object.create(null); n = 0; } r = memo[s] = window.tfsT(s); n++; } return r; }
      ['fillText', 'strokeText'].forEach(function (f) { var o = C.prototype[f]; C.prototype[f] = function (s) { arguments[0] = t(s); return o.apply(this, arguments); }; });
      var m = C.prototype.measureText; C.prototype.measureText = function (s) { return m.call(this, t(s)); };
    })();

    var ATTRS = ['title', 'aria-label', 'placeholder', 'alt', 'data-why', 'data-tip', 'aria-description'], PAGES = /^\/(?:(?:index|home|size|gallery|provenance|404)(?:\.html)?|(?:switzerland|iceland|norway|svalbard)(?:\/.*)?)?$/;
    var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, CODE: 1, PRE: 1, SVG: 0 };
    var written = new WeakMap(), INLINE = { A: 1, B: 1, STRONG: 1, EM: 1, I: 1, SPAN: 1, SUP: 1, SUB: 1, BR: 1, SMALL: 1, U: 1, MARK: 1, ABBR: 1, TIME: 1 };
    var hasHtmlKeys = Object.keys(exact).concat(Object.keys(numd)).some(function (k) { return k.indexOf('\u27e8') >= 0; });
    function skipped(el) { return el.closest && el.closest('[translate="no"],.notranslate,script,style,textarea'); }

    function doText(n) {
      var v = n.nodeValue; if (written.get(n) === v) return;
      var d = tr(v); if (d !== undefined && d !== v) { n.nodeValue = d; written.set(n, d); }
    }
    function fixLink(a) {      // a link to a page of our own that starts at the root keeps the language: /size -> /de/size
      var h = a.getAttribute('href'); if (!h || h.charAt(0) !== '/' || h.charAt(1) === '/') return;
      var m = /^([^?#]*)(.*)$/.exec(h); if (!PAGES.test(m[1])) return;
      a.setAttribute('href', pfx + m[1] + m[2]);
    }
    function doAttrs(el) {
      if (el.tagName === 'A') fixLink(el);
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
      if (d !== undefined) d = fin(d);
      if (d === undefined) { if (debug && mixed(el) && html.indexOf('<svg') < 0) missed['<>' + tk.t] = 1; return false; }
      el.innerHTML = untoken(d, tk.tags); el.setAttribute('data-i18n', '1'); var as = el.getElementsByTagName('a'); for (var k = 0; k < as.length; k++) fixLink(as[k]); return true;
    }
    function walk(root) {
      if (root.nodeType === 3) { if (!skipped(root.parentNode || document.body)) doText(root); return; }
      if (root.nodeType !== 1 || skipped(root)) return;
      if (root.hasAttribute('data-i18n')) return;
      doAttrs(root);      // first: a sentence with markup that is translated as a whole (below) still keeps its own title and link
      if (doHtml(root)) return;
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
    var OPTS = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat('href') };
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
  var src = A['js/i18n-' + lang + '.js'] || 'js/i18n-' + lang + '.js';
  var base = ''; try { var cs = document.currentScript && document.currentScript.src; if (cs) base = cs.replace(/js\/[^/]*$/, ''); } catch (e) { }
  if (!/^(\/|https?:)/.test(src)) src = base + src;
  if (document.readyState === 'loading') {
    document.write('<script src="' + src + '"><\/script><script>window.tfsI18nStart&&window.tfsI18nStart()<\/script>');
    window.tfsI18nStart = start;
  } else {
    var s = document.createElement('script'); s.src = src; s.onload = start; document.head.appendChild(s);
  }
})();
