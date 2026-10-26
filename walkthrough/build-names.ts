/**
 * The names of the glaciers in each glacier's picture: `npm run walkthrough -- names` writes data/glacier-names.js, which the dashboard's layer "Glacier names" draws.
 * For every glacier of the records, the glaciers whose position lies inside its picture box:
 *  - from Wikidata (CC0): items that are glaciers, with their position and their label in the language of the place (German, French, Italian ... first, then English),
 *  - from the Randolph Glacier Inventory 6.0 (via GLIMS, sources/glims.ts): the glaciers the inventory NAMES, where Wikidata has none of that name nearby;
 *  and the glacier itself with the name the site uses (`self`). A name is the source's own, as it states it; an unnamed glacier is not listed.
 * Needs the network; run by hand when glaciers or boxes change, the result is committed.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadAll } from './data';
import { km } from '../shared/geo';
import { pick } from './propose-glims';
import { rgiNear } from './sources/glims';
import { shortName } from './export';
import { core } from './build-aliases';

export type NameEntry = { n: string; la: number; lo: number; a?: number; self?: 1 };

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;      // about 10 m
/** The languages a region's glaciers are named in, best first: Wikidata gives the first label it has. */
export const LANGS: Record<string, string> = { ch: 'de,fr,it,rm,en', 'is-vatnajokull': 'is,en', 'is-rest': 'is,en', 'no-mainland': 'nb,nn,no,en', 'no-svalbard': 'nb,no,en' };

/** Wikidata glaciers around a point: name (in the language of the place), position. Items without a label of their own (their label is their number) are left out. */
export async function wikidataNamed(lat: number, lon: number, radiusKm: number, langs: string, f: typeof fetch = fetch): Promise<{ n: string; la: number; lo: number }[]> {
  const query = `SELECT ?item ?itemLabel ?c WHERE { SERVICE wikibase:around { ?item wdt:P625 ?c . bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "${radiusKm}" . } ?item wdt:P31/wdt:P279* wd:Q35666 . SERVICE wikibase:label { bd:serviceParam wikibase:language "${langs}". } }`;
  const r = await f('https://query.wikidata.org/sparql?' + new URLSearchParams({ query }), { headers: { 'User-Agent': 'tonguesfromspace-build/1.0 (https://tonguesfromspace.org)', Accept: 'application/sparql-results+json' } });
  if (!r.ok) throw new Error(`Wikidata answered ${r.status}`);
  const j = (await r.json()) as { results: { bindings: { itemLabel: { value: string }; c: { value: string } }[] } };
  const seen = new Set<string>(), out: { n: string; la: number; lo: number }[] = [];
  for (const b of j.results.bindings) {
    const m = /Point\(([-\d.e]+) ([-\d.e]+)\)/.exec(b.c.value), n = b.itemLabel.value;
    if (!m || /^Q\d+$/.test(n)) continue;
    const k = `${n}|${r4(Number(m[2]))}|${r4(Number(m[1]))}`;
    if (!seen.has(k)) { seen.add(k); out.push({ n, la: r4(Number(m[2])), lo: r4(Number(m[1])) }); }
  }
  return out;
}

export async function namesInBox(box: [[number, number], [number, number]], centre: [number, number], ownName: string, langs: string, f: typeof fetch = fetch, max = 80): Promise<NameEntry[]> {
  const [[s, w], [n, e]] = box, mid: [number, number] = [(s + n) / 2, (w + e) / 2];
  const radius = km([s, w], [n, e]) / 2 + 2;      // half the diagonal of the box, and a little more
  const inBox = (la: number, lo: number) => la >= s && la <= n && lo >= w && lo <= e;
  const [wd, rgi] = await Promise.all([wikidataNamed(mid[0], mid[1], radius, langs, f).catch(() => []), rgiNear(mid[0], mid[1], radius, f).catch(() => [])]);
  const own = pick(rgi, centre), ownCore = core(ownName), selfAt: [number, number] = own ? own.centre : centre;
  const list: NameEntry[] = [];
  const dup = (name: string, la: number, lo: number) => list.some((x) => core(x.n) === core(name) && km([x.la, x.lo], [la, lo]) < 4);
  const near = Math.max(12, 2 * Math.sqrt(own?.areaKm2 ?? 0));      // a big glacier's own item can lie tens of km from the centre of its outline
  const isSelf = (name: string, la: number, lo: number) => !!ownCore && core(name) === ownCore && km(selfAt, [la, lo]) < near;      // the glacier itself, under the same or another spelling
  for (const x of wd) if (inBox(x.la, x.lo) && !isSelf(x.n, x.la, x.lo) && !dup(x.n, x.la, x.lo)) list.push({ n: x.n, la: x.la, lo: x.lo });
  for (const g of rgi.sort((a, b) => b.areaKm2 - a.areaKm2)) {      // the inventory's names, where Wikidata has none of that name nearby
    if (!g.name || !inBox(g.centre[0], g.centre[1]) || (own && g.rgiId === own.rgiId) || isSelf(g.name, g.centre[0], g.centre[1]) || dup(g.name, g.centre[0], g.centre[1])) continue;
    list.push({ n: g.name, la: r4(g.centre[0]), lo: r4(g.centre[1]), a: g.areaKm2 });
  }
  list.sort((a, b) => km(selfAt, [a.la, a.lo]) - km(selfAt, [b.la, b.lo]));      // nearest first: the page keeps the first of two labels that collide
  const self: NameEntry = { n: ownName, la: r4(selfAt[0]), lo: r4(selfAt[1]), self: 1 };
  return [self, ...list.slice(0, max)];
}

export async function buildNames(log: (m: string) => void = () => {}, f: typeof fetch = fetch): Promise<Record<string, NameEntry[]>> {
  const out: Record<string, NameEntry[]> = {};
  for (const { region, glaciers } of loadAll().regions) for (const { glacier: g } of glaciers) {
    if (!g.placement) continue;
    const key = g.dataKey ?? g.id;
    out[key] = await namesInBox(g.placement.pictureBox, g.centre, region.id === 'ch' ? shortName(g.name) : g.name, LANGS[region.id] ?? 'en', f);
    log(`${g.name}: ${out[key]!.length - 1} named glaciers in the picture`);
    await new Promise((r) => setTimeout(r, 150));
  }
  return out;
}
export const namesFile = (n: Record<string, NameEntry[]>) => `// the names of the glaciers in each glacier's picture: names from Wikidata (CC0) and the Randolph Glacier Inventory 6.0 (via GLIMS), the glacier itself with the name of the site. Made by \`npm run walkthrough -- names\`, drawn by the dashboard's layer "Glacier names"\nwindow.GLACIER_NAMES = ${JSON.stringify(n)};\n`;
export const writeNames = (n: Record<string, NameEntry[]>) => writeFileSync(join(ROOT, 'data', 'glacier-names.js'), namesFile(n));
