import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { ROOT } from './data';
import { fold, GENERIC } from '../shared/fold';

/** js/search.js is a classic script for the front page; here it runs in a vm with a fake window. */
const w: any = {}; vm.runInNewContext(readFileSync(join(ROOT, 'js', 'search.js'), 'utf8'), { window: w });
const S = w.GlacierSearch as { fold(s: string): string; search(q: string, items: any[], o?: { limit?: number }): { item: any; score: number; name: string; lang: string | null }[]; GENERIC: Set<string>; dl(a: string, b: string, m: number): number };

// the real glaciers of the site, with their names in other languages (data/glacier-aliases.js)
const load = (f: string, key: string) => { const x: any = {}; vm.runInNewContext(readFileSync(join(ROOT, 'data', f), 'utf8'), { window: x }); return x[key]; };
const glaciers: any[] = load('home-glaciers.js', 'HOME_GLACIERS'), aliases: Record<string, { names: [string, string][] }> = load('glacier-aliases.js', 'GLACIER_ALIASES');
const items = glaciers.map((g) => ({ id: g.id, label: g.name, names: aliases[g.id]?.names ?? [], weight: 0 }));
const top = (q: string, n = 1) => S.search(q, items, { limit: n }).map((r) => r.item.id);

describe('the front page search', () => {
  it('folds exactly like the tooling does', () => {
    for (const s of ['Brúarjökull', 'Þórisjökull', 'Großer Aletsch', 'Østre Svartisen', 'Kvitøyjøkulen', 'Glacier d\'Aletsch', 'Fée', 'ÅÄÖ']) expect(S.fold(s)).toBe(fold(s));
    expect([...S.GENERIC].sort()).toEqual([...GENERIC].sort());
  });
  it('finds a glacier by its name, with or without the accents', () => {
    expect(top('Brúarjökull')).toEqual(['bruarjokull']);
    expect(top('bruarjokull')).toEqual(['bruarjokull']);
    expect(top('Skeiðarárjökull')).toEqual(['skeidararjokull']);
    expect(top('thorisjokull')).toEqual(['thorisjokull']);
  });
  it('forgives typos: a wrong, a missing, an extra or a swapped letter', () => {
    expect(top('Aletch')).toContain('aletsch');
    expect(top('Alestch')).toContain('aletsch');      // swapped
    expect(top('Aletsssch')).toContain('aletsch');      // extra
    expect(top('Skeidararjokul')).toEqual(['skeidararjokull']);
    expect(top('Breidamerkurjokul')).toEqual(['breidamerkurjokull']);
    expect(top('Eyjafjalajokull')).toEqual(['eyjafjallajokull']);
    expect(top('Hofsjokul')).toEqual(['hofsjokull']);
    expect(top('Mirdalsjokull')).toEqual(['myrdalsjokull']);
    expect(top('Jostedalsbren')).toEqual(['jostedalsbreen']);
    expect(top('Negribren')).toEqual(['negribreen']);
  });
  it('knows names in other languages', () => {
    expect(top('Rhone glacier')).toEqual(['rhone']);
    expect(top('ghiacciaio del Rodano')).toEqual(['rhone']);      // Italian
    expect(top('glacier du Rhône')).toEqual(['rhone']);      // French
    expect(top('Gorner Glacier')).toEqual(['gorner']);
    expect(top('glacier du Gorner')).toEqual(['gorner']);
    expect(top('Rhonegletscher')).toEqual(['rhone']);
  });
  it('a language and a typo together, and a name typed half way', () => {
    expect(top('ghiaccaio del Rodno')).toEqual(['rhone']);
    expect(top('Gorner Glaicer')).toEqual(['gorner']);
    expect(top('Aletsc')).toContain('aletsch');
    expect(top('Kvitoy')).toEqual(['kvitoyjokulen']);
  });
  it('two words written as one, and one as two', () => {
    expect(S.search('storisstraumen', items).length).toBeGreaterThan(0);
    const demo = [{ id: 'pm', label: 'Perito Moreno', names: [] }];
    expect(S.search('peritomoreno', demo)[0]?.item.id).toBe('pm');
    expect(S.search('perito morreno', demo)[0]?.item.id).toBe('pm');
  });
  it('says which name matched, and a language it is in', () => {
    const r = S.search('ghiacciaio del Rodano', items, { limit: 1 })[0]!;
    expect(r.item.id).toBe('rhone'); expect(S.fold(r.name)).toMatch(/rodano/); expect(typeof r.lang).toBe('string');      // (a name several languages spell alike carries the first of them)
  });
  it('searches a lone qualifier such as "Great" (part of names like Great Aletsch Glacier)', () => {
    expect(S.search('Great', items).length).toBeGreaterThan(0);
    expect(top('Great Aletsch')).toEqual(['aletsch']);
  });
  it('finds nothing for nonsense, only the word glacier, or an empty box', () => {
    expect(S.search('zqxvw', items)).toEqual([]);
    expect(S.search('glacier', items)).toEqual([]);
    expect(S.search('  ', items)).toEqual([]);
  });
  it('a typo does not make a different glacier win over the right one', () => {
    expect(top('Gornergletcher')).toEqual(['gorner']);
    expect(top('Fiescher')).toEqual(['fiescher']);
    expect(top('Findel')).toEqual(['sgi-B56-03']);
    expect(top('Langjokull')).toEqual(['langjokull']);
  });
  it('returns several suggestions for an unsure query, best first', () => {
    const r = S.search('svartisen', items, { limit: 5 }).map((x) => x.item.id);
    expect(r).toEqual(expect.arrayContaining(['vestre-svartisen', 'ostre-svartisen']));
  });
});
