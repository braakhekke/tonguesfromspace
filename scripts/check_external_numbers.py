#!/usr/bin/env python3
"""Checks that every number in the Wikipedia-sourced texts of js/07b-icecap-texts.js (wp('Page') notes)
appears literally in the text of that Wikipedia page. Reports numbers that do not: they may be rounded,
converted, respelled or invented and must be compared with the source by hand. Standard library only."""
import re, json, time, urllib.request, urllib.parse
src = open('js/07b-icecap-texts.js', encoding='utf8').read()
rid = None; items = []
for line in src.split('\n'):
    m = re.match(r"^  ('?[\w-]+'?): \{\s*$", line)
    if m: rid = m.group(1).strip("'"); continue
    m = re.match(r"^\s+(lede|look|news|fact|name): \(\) => [`'](.*)[`'],?\s*$", line)
    if m and rid: items.append((rid, m.group(1), m.group(2)))
cache = {}
def page(t):
    if t not in cache:
        u = 'https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=' + urllib.parse.quote(t)
        for i in range(6):
            try:
                r = json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'tfs-check/1.0'}))); break
            except Exception: time.sleep(8 * (i + 1))
        time.sleep(1.5)
        cache[t] = ' '.join(p.get('extract', '') for p in r['query']['pages'].values())
    return cache[t]
bad = 0
for rid, k, t in items:
    titles = []
    for g in re.findall(r"wp\(([^)]*)\)", t): titles += re.findall(r"'([^']+)'", g)
    if 'IS_WIKI_BR' in t: titles.append('Breiðamerkurjökull')
    if 'IS_WIKI_JL' in t: titles.append('Jökulsárlón')
    if not titles: continue
    body = ' '.join(page(x) for x in set(titles))
    for n in set(re.findall(r'\d[\d,.]*(?:\s?%)?', re.sub(r"\$\{[^}]*\}", "", t))):
        n = n.strip().rstrip('.,')
        if n not in body and n.replace(',', '') not in body.replace(',', ''):
            bad += 1; print(f'{rid}.{k}: "{n}" not found in {titles}')
print(bad, 'numbers to check by hand (formatting differences like "12 %" vs "12%" show up too)')
