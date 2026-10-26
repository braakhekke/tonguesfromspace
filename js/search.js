/* The front page's glacier search: names compared across spellings and languages, tolerant of typos. A classic script (window.GlacierSearch), tested in walkthrough/search.test.ts.
   - fold(): lower case, accents dropped, ß ss, ð d, þ th, æ ae, ø o ... (the same as shared/fold.ts: a test keeps them equal), so "Brúarjökull" and "bruarjokull" are one word.
   - the words for "glacier" in many languages, and small words, count little: "glacier" alone must not match everything.
   - a word may differ by a letter or two (more for longer words), by a swap of two letters, or still be half typed; two words may be written as one ("perito moreno", "peritomoreno").
   An item has a label and names in other languages [lang, name]; the best name decides, and the result says which name matched. */
(function () {
  var MAP = { 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'đ': 'd', 'ð': 'd', 'þ': 'th', 'ł': 'l', 'ı': 'i', 'ħ': 'h' };
  function fold(s) {
    return String(s).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[ßæœøđðþłıħ]/g, function (c) { return MAP[c] || c; }).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
  }
  // the plain words for "glacier": alone they say nothing. The other small words (great, upper, north ...) are part of names ("Great Aletsch Glacier"), so alone they are searched.
  var KIND = new Set(['glacier', 'glaciar', 'gletscher', 'gletsjer', 'ghiacciaio', 'glaciare', 'vadret', 'vadrec', 'glatscher', 'jokull', 'jokul', 'breen', 'bre', 'brae', 'isbre', 'glac', 'gl']);
  var GENERIC = new Set(['glacier', 'glaciar', 'gletscher', 'gletsjer', 'ghiacciaio', 'glaciare', 'vadret', 'vadrec', 'glatscher', 'jokull', 'jokul', 'breen', 'bre', 'brae', 'isbre', 'glac', 'gl', 'the', 'der', 'die', 'das', 'de', 'du', 'des', 'la', 'le', 'el', 'il', 'lo', 'of', 'von', 'dei', 'del', 'dell', 'dal', 'da', 'grosser', 'grosse', 'gross', 'great', 'grand', 'grande', 'big', 'little', 'small', 'upper', 'lower', 'north', 'south', 'east', 'west', 'nordre', 'sondre', 'ostre', 'vestre']);

  // the same qualifier in other languages: "Great Aletsch" is "Grosser Aletschgletscher" (search words only, no data)
  var SAME = [['great', 'grosser', 'grosse', 'gross', 'grand', 'grande', 'big'], ['little', 'small', 'klein', 'kleiner', 'petit', 'petite'], ['upper', 'ober', 'oberer', 'obere'], ['lower', 'unter', 'unterer', 'untere'], ['north', 'nord', 'nordre'], ['south', 'sud', 'sondre']];
  var GROUP = {}; SAME.forEach(function (g, i) { g.forEach(function (t) { GROUP[t] = i; }); });

  /** Damerau-Levenshtein (adjacent swaps count as one), stops early: returns max + 1 when the distance is above max. */
  function dl(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev2 = null, prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i]; var rowMin = i;
      for (j = 1; j <= b.length; j++) {
        var c = a[i - 1] === b[j - 1] ? 0 : 1;
        var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur[j] = v; if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev; prev = cur;
    }
    return prev[b.length];
  }
  var allow = function (n) { return n <= 2 ? 0 : n <= 4 ? 1 : n <= 8 ? 2 : 3; };

  /** How well one typed word fits one word of a name, 0 to 1. */
  function word(q, t) {
    if (q === t) return 1;
    if (GROUP[q] !== undefined && GROUP[q] === GROUP[t]) return 0.9;
    if (t.indexOf(q) === 0) return q.length >= 2 ? 0.94 : 0.5;      // half typed
    var a = allow(q.length), best = 0;
    if (t.indexOf(q) > 0 && q.length >= 3) best = 0.78;      // a part of a compound: "aletsch" in "mittelaletsch"
    if (a > 0) {
      var d = dl(q, t, a); if (d <= a) best = Math.max(best, 0.86 - 0.16 * d);
      var d2 = dl(q, t.slice(0, Math.min(t.length, q.length + 1)), a); if (d2 <= a) best = Math.max(best, 0.8 - 0.14 * d2);      // a typo in a half-typed word
    }
    return best;
  }

  /** How well the typed words fit the words of one name, 0 to 1 (0 = a typed word that matters finds nothing). */
  function fit(qw, nw, plain) {
    var sum = 0, wsum = 0, i, j, failed = false;
    for (i = 0; i < qw.length; i++) {
      var generic = !plain && GENERIC.has(qw[i]), best = 0;
      for (j = 0; j < nw.length; j++) { var s = word(qw[i], nw[j]); if (s > best) best = s; }
      if (best < 0.5) { if (generic) continue; failed = true; break; }      // "glacier" may be missing; a real word may not
      var w = generic ? 0.25 : 1; sum += w * best; wsum += w;
    }
    var whole = failed || !wsum ? 0 : sum / wsum;
    // written as one word, or as two: "peritomoreno" for "perito moreno"
    var jq = qw.join(''), jn = nw.filter(function (t) { return plain || !GENERIC.has(t); }).join('');
    if (jq.length >= 5 && jn.length >= 5) { var a = allow(Math.min(jq.length, jn.length)), d = dl(jq, jn, a); if (d <= a) whole = Math.max(whole, 0.84 - 0.14 * d); }
    return whole;
  }

  /** items: [{ id, label, names: [[lang, name], ...], ... }]. Returns [{ item, score, name, lang }], best first. */
  function search(query, items, opts) {
    var limit = (opts && opts.limit) || 8, qw = fold(query).split(' ').filter(Boolean), out = [], plain = false;
    if (!qw.length) return out;
    if (qw.every(function (t) { return KIND.has(t); })) return out;      // only "glacier": nothing to go on
    if (qw.every(function (t) { return GENERIC.has(t); })) qw = qw.filter(function (t) { return !KIND.has(t); }), plain = true;      // only "great": the qualifier is what is searched
    items.forEach(function (it) {
      var cands = [[null, it.label]].concat(it.names || []), best = 0, bn = it.label, bl = null;
      cands.forEach(function (c) { var s = fit(qw, fold(c[1]).split(' ').filter(Boolean), plain); if (s > best + 1e-9) { best = s; bn = c[1]; bl = c[0]; } });
      if (best >= (plain ? 0.7 : 0.5)) out.push({ item: it, score: best + (it.weight || 0), name: bn, lang: bl });
    });
    out.sort(function (a, b) { return b.score - a.score || String(a.item.label).localeCompare(String(b.item.label)); });
    return out.slice(0, limit);
  }

  window.GlacierSearch = { fold: fold, search: search, GENERIC: GENERIC, dl: dl };
})();
