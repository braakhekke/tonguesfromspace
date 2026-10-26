/**
 * Names compared across spellings and languages: lower case, accents and diacritics dropped, the letters that have a plain spelling given it
 * (ß ss, æ ae, ø o, þ th, ð d ...), anything else that is not a letter or digit a space. "Brúarjökull" and "bruarjokull" fold to the same word.
 * The front page's search (js/search.js) does the same thing in the browser; tests/ check that the two agree.
 */
const MAP: Record<string, string> = { 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'đ': 'd', 'ð': 'd', 'þ': 'th', 'ł': 'l', 'ı': 'i', 'ħ': 'h' };
export const fold = (s: string): string =>
  s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[ßæœøđðþłıħ]/g, (c) => MAP[c] ?? c).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');

/** The words for "glacier" in the languages of the regions and their neighbours: they say nothing about which glacier it is. */
export const GENERIC = new Set(['glacier', 'glaciar', 'gletscher', 'gletsjer', 'ghiacciaio', 'glaciare', 'vadret', 'vadrec', 'glatscher', 'jokull', 'jokul', 'breen', 'bre', 'brae', 'isbre', 'glac', 'gl', 'the', 'der', 'die', 'das', 'de', 'du', 'des', 'la', 'le', 'el', 'il', 'lo', 'of', 'von', 'dei', 'del', 'dell', 'dal', 'da', 'grosser', 'grosse', 'gross', 'great', 'grand', 'grande', 'big', 'little', 'small', 'upper', 'lower', 'north', 'south', 'east', 'west', 'nordre', 'sondre', 'ostre', 'vestre']);
