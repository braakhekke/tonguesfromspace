/**
 * The names of every glacier in every language Wikidata has them in: `npm run walkthrough -- aliases` writes data/glacier-aliases.js, which the front page's search reads.
 * Wikidata's data is CC0 (https://www.wikidata.org/wiki/Wikidata:Licensing: "released into the public domain under Creative Commons Zero"), so the names are copied as they are.
 *
 * Which Wikidata item is a glacier of ours is decided by place AND name: a glacier item within `radiusKm` of the glacier's centre whose name in some language is the
 * glacier's own name (folded, without the word for glacier). A glacier with no such item gets no entry: the search still finds it by the name the site has.
 * Run by hand when glaciers are added; the result is committed (it needs the network, like the other data builders).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadAll } from './data';
import { fold, GENERIC } from '../shared/fold';

const UA = 'tonguesfromspace-build/1.0 (https://tonguesfromspace.org)';
export type Names = [lang: string, name: string][];
export type Alias = { q: string; names: Names };

/** Glacier items around a point, nearest first. */
export async function glaciersAround(lat: number, lon: number, radiusKm: number, f: typeof fetch = fetch): Promise<{ q: string; dist: number }[]> {
  const query = `SELECT ?item ?dist WHERE { SERVICE wikibase:around { ?item wdt:P625 ?c . bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "${radiusKm}" . bd:serviceParam wikibase:distance ?dist . } ?item wdt:P31/wdt:P279* wd:Q35666 . } ORDER BY ?dist LIMIT 25`;
  const r = await f('https://query.wikidata.org/sparql?' + new URLSearchParams({ query }), { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
  if (!r.ok) throw new Error(`Wikidata query answered ${r.status}`);
  const j = (await r.json()) as { results: { bindings: { item: { value: string }; dist: { value: string } }[] } };
  return j.results.bindings.map((b) => ({ q: b.item.value.split('/').pop()!, dist: Number(b.dist.value) }));
}

/** Labels and aliases of items, in every language (one request for up to 50 items). */
export async function namesOf(ids: string[], f: typeof fetch = fetch): Promise<Record<string, Names>> {
  const out: Record<string, Names> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const r = await f('https://www.wikidata.org/w/api.php?' + new URLSearchParams({ action: 'wbgetentities', ids: ids.slice(i, i + 50).join('|'), props: 'labels|aliases', format: 'json' }), { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`Wikidata answered ${r.status}`);
    const j = (await r.json()) as { entities: Record<string, { labels?: Record<string, { language: string; value: string }>; aliases?: Record<string, { language: string; value: string }[]> }> };
    for (const [q, e] of Object.entries(j.entities)) {
      const seen = new Set<string>(), list: Names = [];
      const add = (l: string, n: string) => { const k = l + '|' + n; if (!seen.has(k)) { seen.add(k); list.push([l, n]); } };
      for (const x of Object.values(e.labels ?? {})) add(x.language, x.value);
      for (const arr of Object.values(e.aliases ?? {})) for (const x of arr) add(x.language, x.value);
      out[q] = list;
    }
  }
  return out;
}

/** The glacier's own name, folded, without the words for glacier: "Grosser Aletschgletscher" -> "aletsch". */
export const core = (name: string) => fold(name).split(' ').filter((t) => !GENERIC.has(t)).map((t) => t.replace(/(gletscher|glacier|jokull|breen|bre)$/, '')).filter((t) => t.length > 1).join(' ');

/**
 * How well some name of the item says what our glacier is called: 0 = a name that IS the glacier's own name ("Aletsch Glacier" for Grosser Aletschgletscher),
 * 1 = a name that contains it or is contained in it ("Grosser Aletschfirn", "Mittelaletsch Glacier": a neighbour or a part), 2 = no name does.
 */
export const nameTier = (ours: string, names: Names): 0 | 1 | 2 => {
  const c = core(ours);
  if (!c) return 2;
  const cores = names.map(([, n]) => core(n)).filter(Boolean);
  if (cores.some((x) => x === c)) return 0;
  return cores.some((x) => x.length >= 4 && c.length >= 4 && (x.includes(c) || c.includes(x))) ? 1 : 2;
};
export const sameName = (ours: string, names: Names) => nameTier(ours, names) < 2;

export async function buildAliases(radiusKm = 8, log: (m: string) => void = () => {}, f: typeof fetch = fetch) {
  const out: Record<string, Alias> = {}, missing: string[] = [];
  for (const { glacier: g } of loadAll().regions.flatMap((r) => r.glaciers)) {
    const site = g.legacyIds?.[0] ?? g.id;
    const find = async (radius: number) => {
      const around = await glaciersAround(g.centre[0], g.centre[1], radius, f);
      const names = around.length ? await namesOf(around.map((x) => x.q), f) : {};
      // the best name first (the glacier itself before its firn or its neighbour), then the nearest
      return around.map((x) => ({ ...x, names: names[x.q] ?? [] })).filter((x) => sameName(g.name, x.names)).sort((a, b) => nameTier(g.name, a.names) - nameTier(g.name, b.names) || a.dist - b.dist)[0];
    };
    const hit = (await find(radiusKm)) ?? (await find(radiusKm * 3));      // an ice cap's item can sit far from our centre: look wider, never at other kinds of item (a national park of the same name is not the glacier)
    if (hit) { out[site] = { q: hit.q, names: hit.names }; log(`${g.name}: ${hit.q} (${hit.names.find(([l]) => l === 'en')?.[1] ?? hit.names[0]?.[1]}), ${hit.names.length} names`); } else { missing.push(g.name); log(`${g.name}: no Wikidata item found within ${radiusKm} km under that name (or 3 times as far)`); }
    await new Promise((r) => setTimeout(r, 250));      // politely
  }
  return { aliases: out, missing };
}

export const aliasFile = (a: Record<string, Alias>) => `// the names of every glacier in every language Wikidata has them in (CC0): made by \`npm run walkthrough -- aliases\`, read by the front page's search\nwindow.GLACIER_ALIASES = ${JSON.stringify(a)};\n`;
export const writeAliases = (a: Record<string, Alias>) => writeFileSync(join(ROOT, 'data', 'glacier-aliases.js'), aliasFile(a));
