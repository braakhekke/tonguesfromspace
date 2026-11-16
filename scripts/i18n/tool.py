#!/usr/bin/env python3
"""Helpers for the translated texts (docs/I18N.md). Languages: de (default), fr. Put `--lang fr` anywhere on the command line.

    python3 scripts/i18n/tool.py add  misses.json           # new English strings (the page's own debug list) -> i18n/todo.json
    python3 scripts/i18n/tool.py list [N] [--from K]        # print the next N untranslated strings, numbered (default 150)
    python3 scripts/i18n/tool.py apply chunk.tsv             # lines "number<TAB>German" -> i18n/de.json (numbers of the last `list`)
    python3 scripts/i18n/tool.py build                       # i18n/de.json + i18n/extra.json -> js/i18n-de.js
    python3 scripts/i18n/tool.py check                       # exit 1 when js/i18n-de.js is not what build would write
    python3 scripts/i18n/tool.py stats
"""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LANG = "de"
if "--lang" in sys.argv:
    i = sys.argv.index("--lang"); LANG = sys.argv[i + 1]; del sys.argv[i:i + 2]
assert LANG in ("de", "fr"), "--lang de|fr"
TODO = os.path.join(ROOT, "i18n/todo.json")      # the English strings, one list for every language
DE = os.path.join(ROOT, "i18n/%s.json" % LANG)      # key -> text in the language
LAST = os.path.join(ROOT, "i18n/.last-list%s.json" % ("" if LANG == "de" else "-" + LANG))
OUT = os.path.join(ROOT, "js/i18n-%s.js" % LANG)
EXTRA = os.path.join(ROOT, "i18n/extra%s.json" % ("" if LANG == "de" else "-" + LANG))      # hand-written entries and templates

_NUM = r"\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?"
_ITEM = r"[+\u2212\-]?(?:%s)(?:[-:](?:%s))*(?: ?(?:mm|km|m|%%)(?![A-Za-z]))?(?: at (?:%s) m)?" % (_NUM, _NUM, _NUM)
NUMRE = re.compile(r"(?:%s)(?:, (?:%s)){2,}|%s" % (_ITEM, _ITEM, _NUM))      # a run of three or more plain number items (dates, values) counts as one; else every number; the same pattern as js/i18n.js
_ITEM2 = r"[+\u2212\-]?\{#\}(?:[-:]\{#\})*(?: ?(?:mm|km|m|%)(?![A-Za-z]))?(?: at \{#\} m)?"
RUN2 = re.compile(r"%s(?:, %s){2,}" % (_ITEM2, _ITEM2))

def collapse(k):
    """An already abstracted text: runs of {#}-only items become one {#} (the old form of stored keys)."""
    return RUN2.sub("{#}", k)

TAG = re.compile(r"<[^>]*>")
def letters(n):
    return chr(97 + n) if n < 26 else chr(97 + n // 26 - 1) + chr(97 + n % 26)

def tokenise(h):
    """HTML key: every tag becomes ⟨a⟩ ⟨b⟩ … in order (the page puts its own tags back), white space collapsed."""
    tags = []
    def r(m):
        tags.append(m.group(0)); return "\u27e8" + letters(len(tags) - 1) + "\u27e9"
    return " ".join(TAG.sub(r, h).split()), tags

def fixkey(k):
    """The stored form of a key: html keys start with <>, are tokenised, numbers are {#}."""
    if k.startswith("<>"): return "<>" + abstract(tokenise(k[2:])[0])
    return abstract(k)

def fixval(v):
    if v.startswith("<>"): v = v[2:]
    return tokenise(v)[0] if TAG.search(v) else v

def abstract(k):
    """Every number of a text becomes {#}: one entry then serves every value ("Source {#}")."""
    return NUMRE.sub("{#}", k)

def positional(k, v):
    """The German value with {#} (in the order of the English numbers) or {n} -> only {n}."""
    n = [0]
    def r(m):
        n[0] += 1
        return "{%d}" % n[0]
    return re.sub(r"\{#\}", r, v) if "{#}" in v else v

def load(p, d):
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else d

def save(p, o):
    with open(p, "w", encoding="utf-8") as f:
        json.dump(o, f, ensure_ascii=False, indent=0, sort_keys=False)

def main():
    a = sys.argv[1:]
    cmd = a[0]
    todo, de = load(TODO, {}), load(DE, {})
    if cmd != "stats":      # old stored forms (html with tags) -> tokenised
        todo = {collapse(fixkey(k)): v for k, v in todo.items()}
        de = {collapse(fixkey(k)): collapse(fixval(v) if k.startswith("<>") else v) for k, v in de.items()}
        save(TODO, todo); save(DE, de)
    if cmd == "add":
        new = load(a[1], {})
        n = 0
        import html as H
        known = {abstract(k) for k in de}
        for k, v in new.items():
            k = fixkey(k)
            if k not in todo: todo[k] = v; n += 1
        for k in [k for k in todo if k.startswith("<>")]:      # the pieces of a sentence with markup are part of it
            for piece in re.split(r"<[^>]*>", k[2:]):
                piece = " ".join(H.unescape(piece).split())
                if piece in todo and piece not in de: del todo[piece]
        save(TODO, todo); print("added", n, "total", len(todo))
    elif cmd == "list":
        n = int(a[1]) if len(a) > 1 and a[1].isdigit() else 150
        # skip strings that are decided to stay as they are (de value == key)
        skip = re.compile(r"^[\d.,\s]+(km²|km|m|%|km³)?$|^\d{1,2} [A-Z][a-z]+( \d{4})?$|(jökull|jøkelen|breen|isen|Folgefonna|jokull)( ≈)?$|^Leaflet$|≈$", re.I)
        ger = set()      # German texts (and the pieces of German html) already on the page: not English, so not to translate
        extra = load(EXTRA, {})
        for v in list(de.values()) + list(extra.values()):
            v = abstract(v[2:] if v.startswith("<>") else v)
            ger.add(v)
            for piece in re.split("\u27e8[a-z]+\u27e9", v):
                piece = " ".join(piece.split())
                if piece: ger.add(piece)
        for k in todo:
            if k not in de and (skip.search(k) or abstract(k[2:] if k.startswith("<>") else k) in ger): de[k] = k
        save(DE, de)
        pieces = set()      # the pieces of a sentence with markup are translated with it
        for k in todo:
            if k.startswith("<>"):
                for piece in re.split("\u27e8[a-z]+\u27e9", k[2:]):
                    piece = " ".join(piece.split())
                    if len(piece) > 3: pieces.add(piece)
        keys = [k for k in todo if k not in de and k not in pieces][:n]
        save(LAST, keys)
        for i, k in enumerate(keys): print(f"{i}\t{k}")
        print(f"-- {len(keys)} shown, {len([k for k in todo if k not in de])} untranslated", file=sys.stderr)
    elif cmd == "apply":
        keys = load(LAST, [])
        got = set()
        for line in open(a[1], encoding="utf-8"):
            line = line.rstrip("\n")
            if not line.strip() or "\t" not in line: continue
            parts = line.split("\t")
            i, t = parts[0], parts[1]
            if not i.strip().isdigit(): continue
            i = int(i); got.add(i)
            de[parts[2].strip() if len(parts) > 2 and parts[2].strip() else keys[i]] = fixval(t.strip()) if keys[i].startswith("<>") else t.strip()
        # whatever of the last list was not given stays as it is (names, numbers): record it as unchanged so it is not listed again
        for i, k in enumerate(keys):
            if i not in got: de[k] = k
        save(DE, de); print("translated", len(got), "unchanged", len(keys) - len(got), "total", len(de))
    elif cmd in ("build", "check"):
        body = {}
        for k, v in de.items():
            if v == k: continue
            html = k.startswith("<>")
            if v.startswith("<>"): v = v[2:]
            k = k[2:] if html else k
            if html:
                kt = set(re.findall("\u27e8[a-z]+\u27e9", k)); vt = set(re.findall("\u27e8[a-z]+\u27e9", v))
                if kt != vt: print("CHECK tags:", k[:70], kt ^ vt)
            body[abstract(k)] = positional(k, v)
        for k, v in load(EXTRA, {}).items():
            body[abstract(k)] = positional(k, v)
        for k, v in body.items():      # a value may only use as many {n} as its key has numbers
            if "{}" in k or "{g}" in k: continue
            if k.count("{#}") < len(re.findall(r"\{\d+\}", v)) or any(int(x) > k.count("{#}") for x in re.findall(r"\{(\d+)\}", v)):
                print("CHECK numbers:", k[:80], "->", v[:80])
        text = "/* %s texts for js/i18n.js. GENERATED by scripts/i18n/tool.py build --lang %s from i18n/%s.json and %s: do not edit here. */\nwindow.TFS_%s = " % ({"de": "German", "fr": "French"}[LANG], LANG, LANG, os.path.basename(EXTRA), LANG.upper()) + json.dumps(body, ensure_ascii=False, indent=0) + ";\n"
        if cmd == "check":
            ok = os.path.exists(OUT) and open(OUT, encoding="utf-8").read() == text
            print(("%s is current" % os.path.basename(OUT)) if ok else ("%s is OUT OF DATE: run python3 scripts/i18n/tool.py build --lang %s" % (os.path.basename(OUT), LANG)))
            sys.exit(0 if ok else 1)
        with open(OUT, "w", encoding="utf-8") as f: f.write(text)
        print("wrote", OUT, len(body), "entries")
    elif cmd == "stats":
        print("todo", len(todo), "translated", len([k for k in todo if k in de]))

main()
