#!/usr/bin/env python3
"""Finds texts that do not fit in German: clipped, cut with an ellipsis, spilling out of their box, or overlapping another text.

Opens each page in English and in German at the same width and state, and reports only what happens in German and not in English.
Needs scripts/serve.py on :8000 and Playwright.

    python3 scripts/i18n/layout_check.py [--phone] [--shots DIR] [PAGE ...]      # PAGE like "home.html" or "index.html#g=aletsch&m=single"
"""
import json, sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8000/"
CLICKS = ["#view3dBtn", "#viewMap", "#modeCompare", "#modeTimelapse", "#modeSingle", "#landsatI", "#tuneSwitch", "#layersBtn", "#moreBtn", "#embedBtn", "#videoBtn", "#shareBtn", "#metaBtn", "#v3mLayers", ".gd-launch", "[data-mode=\"3d\"]", "#totalSw", ".lay-btn", ".dock-dl", "#lbToggle"]
PAGES = ["home.html", "gallery.html", "404.html", "provenance.html", "provenance.html?id=B36-26", "size.html", "index.html#g=aletsch&m=single", "index.html#g=rhone&m=compare"]

JS = r"""
() => {
  const out = [];
  const vis = el => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0' && !el.closest('[hidden]'); };
  const path = el => { const p = []; for (let e = el; e && e.nodeType === 1 && p.length < 5; e = e.parentElement) p.push(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '')); return p.join('<'); };
  const items = [];
  const stuck = el => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
  const hiddenInDetails = el => { const d = el.closest('details:not([open])'); return d && !(el.closest('summary') && el.closest('summary').parentElement === d); };
  const all = document.querySelectorAll('body *');
  for (const el of all) {
    if (['SCRIPT', 'STYLE', 'SVG', 'PATH', 'NOSCRIPT'].includes(el.tagName.toUpperCase()) || el.closest('svg')) continue;
    let text = '';
    const rects = [];
    for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) { text += n.nodeValue; const r = document.createRange(); r.selectNodeContents(n); for (const q of r.getClientRects()) if (q.width > 0 && q.height > 0) rects.push(q); }
    if (!text.trim() || !rects.length || !vis(el) || hiddenInDetails(el)) continue;
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const key = path(el);
    const t = text.trim().replace(/\s+/g, ' ');
    const ov = v => v === 'hidden' || v === 'clip' || v === 'auto' || v === 'scroll';
    if ((cs.textOverflow === 'ellipsis' || ov(cs.overflowX)) && el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') out.push({ k: 'clipped-x', key, t });
    if (ov(cs.overflowY) && cs.overflowY !== 'auto' && cs.overflowY !== 'scroll' && el.scrollHeight > el.clientHeight + 2 && cs.display !== 'inline') out.push({ k: 'clipped-y', key, t });
    // text spills out of the nearest ancestor that clips or has a background box
    let un = { l: 1e9, t: 1e9, r: -1e9, b: -1e9 };
    for (const q of rects) { un.l = Math.min(un.l, q.left); un.t = Math.min(un.t, q.top); un.r = Math.max(un.r, q.right); un.b = Math.max(un.b, q.bottom); }
    if (box.width && (un.r > box.right + 2 || un.l < box.left - 2) && cs.display !== 'inline' && !cs.whiteSpace.startsWith('pre')) out.push({ k: 'spill-x', key, t });
    if (un.r > innerWidth + 2 && un.l < innerWidth) out.push({ k: 'off-screen', key, t });
    items.push({ el, un, key, t, stuck: stuck(el) });
  }
  const cv = document.createElement('canvas').getContext('2d');
  for (const sel of document.querySelectorAll('select')) {
    if (!vis(sel) || !sel.options.length) continue;
    const cs = getComputedStyle(sel); cv.font = cs.font;
    const text = sel.options[sel.selectedIndex].text, avail = sel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 18;
    if (cv.measureText(text).width > avail + 1) out.push({ k: 'select-clipped', key: path(sel), t: text });
  }
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.el.contains(b.el) || b.el.contains(a.el) || a.stuck !== b.stuck) continue;
    const w = Math.min(a.un.r, b.un.r) - Math.max(a.un.l, b.un.l), h = Math.min(a.un.b, b.un.b) - Math.max(a.un.t, b.un.t);
    if (w > 3 && h > 3) {
      const sa = (a.un.r - a.un.l) * (a.un.b - a.un.t), sb = (b.un.r - b.un.l) * (b.un.b - b.un.t);
      if (w * h > 0.25 * Math.min(sa, sb)) out.push({ k: 'overlap', key: a.key + ' x ' + b.key, t: a.t.slice(0, 40) + ' | ' + b.t.slice(0, 40) });
    }
  }
  return out;
}
"""

def run(pg, url, lang):
    pg.add_init_script(f"try{{localStorage.setItem('tfs-lang','{lang}')}}catch(e){{}}")

def main():
    a = sys.argv[1:]
    phone = "--phone" in a
    shots = a[a.index("--shots") + 1] if "--shots" in a else None
    pages = [x for x in a if not x.startswith("--") and x != shots] or PAGES
    res = {}
    with sync_playwright() as p:
        b = p.chromium.launch()
        for url in pages:
            found = {}
            for lang in ("en", "de"):
                c = b.new_context(viewport={"width": 390, "height": 800} if phone else {"width": 1300, "height": 850}, has_touch=phone)
                c.add_init_script("try{localStorage.setItem('tfs-guide',JSON.stringify({seen:true}));localStorage.setItem('tfs-teaser','1');localStorage.setItem('tfs-lang','%s')}catch(e){}" % lang)
                pg = c.new_page(); pg.goto(BASE + url); pg.wait_for_timeout(5000)
                found[lang] = [dict(i, key="base>" + i["key"]) for i in pg.evaluate(JS)]
                if url.startswith("index.html") or url.startswith("size.html"):
                    for sel in CLICKS:
                        try:
                            el = pg.locator(sel).first
                            if el.count() and el.is_visible():
                                el.click(timeout=800, force=True); pg.wait_for_timeout(600)
                                found[lang] += [dict(i, key=sel + ">" + i["key"]) for i in pg.evaluate(JS)]
                                if shots and lang == "de": pg.screenshot(path=f"{shots}/click{sel.replace('#', '_').replace('.', '_').replace(chr(34), '').replace('[', '').replace(']', '').replace('=', '')}-{'ph' if phone else 'dt'}.png")
                        except Exception: pass
                if shots:
                    name = url.replace("/", "_").replace("#", "_").replace("?", "_").replace("&", "_").replace("=", "_")
                    pg.screenshot(path=f"{shots}/{name}-{'ph' if phone else 'dt'}-{lang}.png", full_page=False)
                c.close()
            en = {(i["k"], i["key"]) for i in found["en"]}
            new = [i for i in found["de"] if (i["k"], i["key"]) not in en]
            res[url] = new
            print(f"== {url}: {len(new)} new in German ({len(found['en'])} already in English)")
            for i in new[:60]: print("  ", i["k"], "|", i["t"][:70], "|", i["key"][:110])
        b.close()
    json.dump(res, open("/private/tmp/claude-588421604/s/layout.json", "w"), ensure_ascii=False, indent=1)

main()
