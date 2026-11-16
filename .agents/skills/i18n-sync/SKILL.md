---
name: i18n-sync
description: Bring German and French (and any later language) along whenever a visible text of the site is added or changed. Use this for EVERY change to a page that touches what a visitor reads, even a small one - a label, button, tooltip, title, aria-label, placeholder, alt text, a new element, an About chapter, a glacier story, a sources list, text drawn on a canvas (export pictures, video, 3D labels, legends) or text in CSS - and when a page shows English inside /de/ or /fr/, when tests/test_i18n.py fails, or when a translated text is clipped or overlaps. Holds the collect, add, list, apply, build, check order of scripts/i18n/ and the traps that silently leave a text untranslated.
---

# Languages: every text change in every language

The owner's rule (2026-11-14): whenever anything is added to a page or a text is edited, every language is brought along **in the same change**. A text without entries falls back to English on `/de/…` and `/fr/…`. That fallback is deliberate (never a wrong translation), which is exactly why a forgotten text is easy to miss: nothing breaks, the page just reads half English.

**Read `docs/I18N.md` first.** It is the reference for how the layer works, the key forms (`<>…` with `⟨a⟩` tokens, `{#}` for numbers, `{}` / `{g}` templates) and the known limits. This skill is the working order and the traps.

## Does the change touch text?

Yes if it changes any of: a text node, `title`, `aria-label`, `placeholder`, `alt`, `data-why`, the page title; text drawn on a canvas; a string built in code ("12 m since 2016"); text in CSS `content:'…'`, an SVG or an image; an About chapter, a glacier story, a sources list, a field note. Editing an English sentence counts as much as adding one: the old entry no longer matches, so the edited sentence shows in English until the dictionaries have the new text.

Glacier and place names and plain numbers are never keys; identical English and target strings need no entry.

## The order

Work files go in the scratchpad, not in the repository.

1. **English first**, as always. If an About chapter changed, run `python3 scripts/build_about_static.py` (the About of the explorer and of `size.html` must stay the same text; AGENTS.md).
2. **A server on port 8000.** `collect.py` and `layout_check.py` talk to `http://localhost:8000/` only. Reuse the owner's `serve.py` if it runs (`curl -s -m 5 http://localhost:8000/cdse/ping`); otherwise start one (skill `run-site`).
3. **Collect what has no entry, per language** (each language has its own dictionary, so the misses differ):
   ```
   python3 scripts/i18n/collect.py <scratch>/miss-de.json --lang de
   python3 scripts/i18n/collect.py <scratch>/miss-fr.json --lang fr
   python3 scripts/i18n/tool.py add <scratch>/miss-de.json
   python3 scripts/i18n/tool.py add <scratch>/miss-fr.json
   ```
   `--only explorer|size|home|prov|gallery` limits it to one page, `--phone` collects the phone layout (its menu and cards have texts the desktop never shows). The list of English keys (`i18n/todo.json`) is shared by all languages.
4. **Translate, one language at a time:**
   ```
   python3 scripts/i18n/tool.py --lang de list 20        # numbered, the next untranslated strings
   # write "number<TAB>translation" lines to <scratch>/de.tsv
   python3 scripts/i18n/tool.py --lang de apply <scratch>/de.tsv
   ```
   then the same with `--lang fr`. A third column stores the entry under another English key (a template).
5. **Build and check both:**
   ```
   python3 scripts/i18n/tool.py build --lang de && python3 scripts/i18n/tool.py build --lang fr
   python3 scripts/i18n/tool.py check && python3 scripts/i18n/tool.py --lang fr check
   python3 -m unittest discover -s tests -p 'test_i18n.py' -v
   ```
   `check` without `--lang` only looks at German. `build` prints `CHECK tags:` or `CHECK numbers:` for an entry whose tokens or numbers do not match its key and still writes the file: read its output and fix those entries.
6. **Layout.** German and French run longer than English.
   `python3 scripts/i18n/layout_check.py --lang de [--phone] [--shots DIR] [PAGE…]`, then `--lang fr`. It reports what is clipped, cut, spilling or overlapping only in the language. It is noisy for rotated text and sticky bars, so look at the screenshots. Fixes go under `html[data-i18n-long]` (both languages) in `css/style.css`, `css/home.css`, `gallery.html`, or in the CSS string of `js/i18n.js` for the switch itself.
7. **Look at the page** in each language at desktop and phone size (skill `run-site`: `shot.py '<page>' --lang de`).
8. **Tell the owner** which texts got entries in which language, and which stay English and why.

## Traps

- **`apply` decides for everything it was shown.** Every string of the last `list` that is not in your file is recorded as "stays as it is" and is never listed again. That is right for names and numbers and wrong for a sentence you meant to do later. So list only as many as you will handle now (`list 20`, not the default 150), and leave a string out only when it truly stays. To undo one, remove its `"text": "text"` line from `i18n/<lang>.json` (or put the translation there) and build again.
- **`apply` uses the numbers of the last `list` of that language.** Do not run another `list` in between, and never apply German numbers with `--lang fr`.
- **`list` and `check` also write.** They rewrite the dictionary in its stored form, and `list` marks numbers, dates and glacier names as unchanged by itself. Only `stats` is read-only: `python3 scripts/i18n/tool.py [--lang fr] stats`.
- **Collect only finds what its clicks reach.** A text behind a new button or panel is invisible to it until the button's selector is in `CLICKS` of `scripts/i18n/collect.py` (and of `layout_check.py`). Add the selector in the same change. For a single string, a small JSON file `{"The English text": "where it appears"}` given to `tool.py add` does the same.
- **Text in CSS, an SVG or an image is not in the page's text** and the dictionary cannot reach it: give it a line per language under `html[lang="de"]` / `html[lang="fr"]` (today only `#miniToggle`).
- **Labels built in code** show English until their template is in `i18n/extra.json` (German) or `i18n/extra-fr.json` (French). Canvas text goes through the same dictionary; code can call `window.tfsT(text)`.
- **Code that compares page text** (`SAT_MSG` in `js/08-controls.js`) breaks in another language: compare a state or a data attribute, never the words.
- **`js/i18n-de.js` and `js/i18n-fr.js` are generated.** Never edit them; edit `i18n/<lang>.json` or `i18n/extra*.json` and build.
- **Not public yet:** the long texts of Iceland, Norway and Svalbard are not in the dictionaries. Do not translate them as a side effect; say what was left.

## How each language is written

- **German: Swiss standard German.** *ss* for *ß*, 1’291, «guillemets», "du".
- **French: Swiss French.** « guillemets », a narrow no-break space in 1 291 and before `: ; ! ? »`, "vous" in sentences, the infinitive for buttons (*Choisir*, *Comparer*).
- **In both, the decimal point stays** (75.79 km²).
- **External figures are copied from the English text, digits only** (AGENTS.md, external numbers): a translation never converts, rounds or respells a figure, and `{#}` keeps every number of the English key in order.
- Keep the calm, compact tone. A translation much longer than the English usually breaks the layout: look for the shorter wording before adding CSS.

## A new language

It follows the same path: `scripts/i18n/tool.py` (`LANG`), `i18n/<lang>.json` and `i18n/extra-<lang>.json`, the generated `js/i18n-<lang>.js`, the address prefix in `worker/main.ts`, `wrangler.toml`, `scripts/serve.py` and the test server, `hreflang` and sitemap in `scripts/build_site.py`, the switch in `js/i18n.js`, `tests/test_i18n.py`, and `docs/I18N.md`. From then on "every language" in the rule includes it.
