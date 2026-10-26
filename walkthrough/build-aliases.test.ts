import { describe, expect, it } from 'vitest';
import { core, glaciersAround, nameTier, namesOf, sameName } from './build-aliases';
import { fold } from '../shared/fold';

describe('names in every language', () => {
  it('folds spellings: accents, ß, ð, þ, æ, ø', () => {
    expect(fold('Brúarjökull')).toBe('bruarjokull');
    expect(fold('Þórisjökull')).toBe('thorisjokull');
    expect(fold('Grosser Aletschgletscher')).toBe('grosser aletschgletscher');
    expect(fold('Østre Svartisen')).toBe('ostre svartisen');
    expect(fold('Kvitøyjøkulen')).toBe('kvitoyjokulen');
    expect(fold('Großer Aletsch')).toBe('grosser aletsch');
  });
  it('the core of a name is the glacier\'s own, without the word for glacier', () => {
    expect(core('Grosser Aletschgletscher')).toBe('aletsch');
    expect(core('Aletsch Glacier')).toBe('aletsch');
    expect(core('Glacier de Corbassière')).toBe('corbassiere');
    expect(core('Skeiðarárjökull')).toBe('skeidarar');
  });
  it('an item is ours when any of its names says the glacier\'s name', () => {
    expect(sameName('Grosser Aletschgletscher', [['en', 'Aletsch Glacier'], ['de', 'Großer Aletschgletscher']])).toBe(true);
    expect(sameName('Grosser Aletschgletscher', [['en', 'Mittelaletsch Glacier']])).toBe(true);      // contains the core: the place decides between the two, nearest first
    expect(sameName('Gorner', [['en', 'Zmutt Glacier']])).toBe(false);
  });
  it('the glacier itself beats its firn and its neighbour, whatever the distance', () => {
    const ours = 'Grosser Aletschgletscher';
    expect(nameTier(ours, [['en', 'Aletsch Glacier']])).toBe(0);
    expect(nameTier(ours, [['de', 'Grosser Aletschfirn']])).toBe(1);
    expect(nameTier(ours, [['en', 'Mittelaletsch Glacier']])).toBe(1);
    expect(nameTier(ours, [['en', 'Zmutt Glacier']])).toBe(2);
  });
  it('asks Wikidata for glaciers around a point and for their names in all languages', async () => {
    const seen: string[] = [];
    const f = (async (url: any) => {
      const u = String(url); seen.push(u);
      if (u.includes('sparql')) return new Response(JSON.stringify({ results: { bindings: [{ item: { value: 'http://www.wikidata.org/entity/Q204658' }, dist: { value: '5.5' } }] } }));
      return new Response(JSON.stringify({ entities: { Q204658: { labels: { en: { language: 'en', value: 'Aletsch Glacier' }, de: { language: 'de', value: 'Großer Aletschgletscher' } }, aliases: { fr: [{ language: 'fr', value: "Glacier d'Aletsch" }] } } } }));
    }) as unknown as typeof fetch;
    expect(await glaciersAround(46.48, 8.01, 8, f)).toEqual([{ q: 'Q204658', dist: 5.5 }]);
    expect(decodeURIComponent(seen[0]!.replace(/\+/g, ' '))).toMatch(/Point\(8\.01 46\.48\).*radius.*8.*Q35666/s);      // lon lat order, the class "glacier"
    expect((await namesOf(['Q204658'], f)).Q204658).toEqual([['en', 'Aletsch Glacier'], ['de', 'Großer Aletschgletscher'], ['fr', "Glacier d'Aletsch"]]);
  });
});
