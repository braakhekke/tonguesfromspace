/**
 * Fetching the map layers of a glacier: for a picture box, ask every provider of walkthrough/providers.json whether it has something there,
 * READ its licence from the licence page (never from memory), and turn the answers into a decision for every layer plus the sources
 * to list. Nothing is confirmed here: the result is a proposal.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { LAYERS, type Bounds, type LayerId, type Source } from '../shared/schema';
import { ROOT } from '../data';

const Licence = z.object({
  url: z.string().url(),
  extract: z.string().describe('a regular expression; its first group (or the whole match) is the licence text, copied as the page states it'),
  commercialIf: z.string().optional(),
  nonCommercialIf: z.string().optional(),
  citation: z.string().optional().describe('a regular expression for the citation the page asks for'),
});
const Probe = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tile'), url: z.string(), zoom: z.number(), year: z.number().optional(), minBytes: z.number().default(1000) }),
  z.object({ type: z.literal('tile-years'), url: z.string(), zoom: z.number(), from: z.number(), to: z.number() }),
  z.object({ type: z.literal('stac'), url: z.string().url(), collection: z.string(), days: z.number().optional() }),
  z.object({ type: z.literal('overpass'), url: z.string().url(), filter: z.string() }),
  z.object({ type: z.literal('reach'), url: z.string().url() }),
  z.object({ type: z.literal('none'), reason: z.string() }),
]);
export const Provider = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), layer: z.enum(LAYERS), name: z.string(), url: z.string().url(),
  covers: z.union([z.object({ global: z.literal(true) }), z.object({ bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]) })]),
  probe: Probe, licence: Licence.optional(),
  render: z.object({ url: z.string(), maxNativeZoom: z.number().optional(), overlay: z.boolean().optional(), group: z.enum(['base', 'shade', 'labels']).optional(), lastYear: z.number().optional(), label: z.string(), sym: z.string().optional(), credit: z.string() }).optional()
    .describe('how the page draws this source as a map layer (tiles); a source without it is listed but not drawn'),
});
export type Provider = z.infer<typeof Provider>;
export const loadProviders = (file = join(ROOT, 'walkthrough', 'providers.json')): Provider[] => z.object({ providers: z.array(Provider) }).parse(JSON.parse(readFileSync(file, 'utf8'))).providers;

/** Readable text of a page: entities decoded first (an XML service description escapes its HTML), scripts and styles dropped, inline tags removed without a gap, other tags as a space. */
export const textOf = (html: string) => html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<\/?(a|b|i|em|strong|span|abbr)\b[^>]*>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const lonLatToTile = (lon: number, lat: number, z: number) => { const n = 2 ** z, r = (lat * Math.PI) / 180; return { x: Math.floor(((lon + 180) / 360) * n), y: Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n) }; };
const centre = (b: Bounds): [number, number] => [(b[0][1] + b[1][1]) / 2, (b[0][0] + b[1][0]) / 2]; // lon, lat
const covers = (p: Provider, b: Bounds) => 'global' in p.covers || (() => { const [lon, lat] = centre(b), [w, s, e, n] = (p.covers as { bbox: number[] }).bbox as [number, number, number, number]; return lon >= w && lon <= e && lat >= s && lat <= n; })();

export type Found = { ok: boolean; note: string; image?: string; year?: number };

async function get(f: typeof fetch, url: string, init?: RequestInit, ms = 25_000) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try { return await f(url, { ...init, signal: ac.signal, headers: { 'User-Agent': 'Mozilla/5.0 (tongues-from-space onboarding)', ...(init?.headers ?? {}) } }); } finally { clearTimeout(t); }
}

export async function probe(p: Provider, box: Bounds, f: typeof fetch, now = Date.now()): Promise<Found> {
  const pr = p.probe, [lon, lat] = centre(box);
  try {
    if (pr.type === 'none') return { ok: false, note: pr.reason };
    if (pr.type === 'reach') { const r = await get(f, pr.url); return { ok: r.ok, note: r.ok ? 'the landing page answers' : `HTTP ${r.status}` }; }
    if (pr.type === 'tile') {
      const { x, y } = lonLatToTile(lon, lat, pr.zoom), url = pr.url.replace('{z}', String(pr.zoom)).replace('{x}', String(x)).replace('{y}', String(y)).replace('{year}', String(pr.year ?? ''));
      const r = await get(f, url), n = r.ok ? (await r.arrayBuffer()).byteLength : 0;
      return { ok: r.ok && n >= pr.minBytes, note: r.ok ? `a tile of ${Math.round(n / 1000)} KB at the middle of the box` : `HTTP ${r.status}`, image: url };
    }
    if (pr.type === 'tile-years') {
      // the oldest year that has a real picture: years without one all return the same few placeholder tiles, so a size that repeats is a placeholder
      const { x, y } = lonLatToTile(lon, lat, pr.zoom), sizes = new Map<number, number>();
      for (let yr = pr.from; yr <= pr.to; yr++) { const r = await get(f, pr.url.replace('{year}', String(yr)).replace('{z}', String(pr.zoom)).replace('{x}', String(x)).replace('{y}', String(y))); sizes.set(yr, r.ok ? (await r.arrayBuffer()).byteLength : 0); }
      const count = new Map<number, number>(); for (const s of sizes.values()) count.set(s, (count.get(s) ?? 0) + 1);
      const real = [...sizes].filter(([, s]) => s > 1000 && (count.get(s) ?? 0) < 3).map(([yr]) => yr).sort((a, b) => a - b)[0];
      if (!real) return { ok: false, note: `no real picture between ${pr.from} and ${pr.to}: every year returned a placeholder` };
      return { ok: true, year: real, note: `the oldest picture at the middle of the box is from ${real} (years before it return only the placeholder tiles; check it by looking at it)`, image: pr.url.replace('{year}', String(real)).replace('{z}', String(pr.zoom)).replace('{x}', String(x)).replace('{y}', String(y)) };
    }
    if (pr.type === 'stac') {
      const [[s, w], [n, e]] = box, from = pr.days ? new Date(now - pr.days * 864e5).toISOString().slice(0, 10) + 'T00:00:00Z' : '1972-01-01T00:00:00Z', to = new Date(now).toISOString().slice(0, 10) + 'T23:59:59Z';
      const r = await get(f, pr.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collections: [pr.collection], bbox: [w, s, e, n], datetime: `${from}/${to}`, limit: 1 }) });
      if (!r.ok) return { ok: false, note: `HTTP ${r.status}` };
      const j = (await r.json()) as { features?: unknown[]; context?: { matched?: number }; numberMatched?: number };
      const matched = j.numberMatched ?? j.context?.matched ?? (j.features?.length ?? 0);
      return { ok: (j.features?.length ?? 0) > 0, note: `${matched}${pr.days ? ` scene(s) in the last ${pr.days} days` : ' scene(s) over the box'} in ${pr.collection}` };
    }
    // overpass: how many paths lie in the box
    const [[s, w], [n, e]] = box;
    const r = await get(f, pr.url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'tongues-from-space-onboarding/1.0' }, body: `data=${encodeURIComponent(`[out:json][timeout:25];way${pr.filter}(${s},${w},${n},${e});out count;`)}` }, 40_000);
    if (!r.ok) return { ok: false, note: `Overpass answered HTTP ${r.status}${r.status >= 500 ? ' (busy; try again)' : ''}` };
    const j = (await r.json()) as { elements?: { tags?: { ways?: string } }[] };
    const count = Number(j.elements?.[0]?.tags?.ways ?? 0);
    return { ok: count > 0, note: `${count} footpath and track ways in the box` };
  } catch (e) { return { ok: false, note: `no answer (${(e as Error).name === 'AbortError' ? 'timed out' : (e as Error).message})` }; }
}

/** The licence as the page states it; "NOT READ" with the page's address when it cannot be read (the person then reads it). */
export async function readLicence(p: Provider, f: typeof fetch, cache = new Map<string, Promise<string | null>>()): Promise<{ licence: string; commercialUse: boolean; citation?: string; read: boolean }> {
  const spec = p.licence;
  if (!spec) return { licence: `NOT READ: no licence page is listed for ${p.name}; find its terms at ${p.url}`, commercialUse: false, read: false };
  if (!cache.has(spec.url)) cache.set(spec.url, get(f, spec.url).then(async (r) => (r.ok ? textOf(await r.text()) : null)).catch(() => null));
  const text = await cache.get(spec.url)!;
  const m = text ? new RegExp(spec.extract, 'i').exec(text) : null;
  if (!text || !m) return { licence: `NOT READ: ${spec.url} ${text === null ? 'could not be opened by this tool' : 'did not contain the expected licence text'}. Open it, find the licence and write it here`, commercialUse: false, read: false };
  const licence = (m[1] ?? m[0]).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 400);
  const nonComm = spec.nonCommercialIf ? new RegExp(spec.nonCommercialIf, 'i').test(m[0]) : false;
  const comm = spec.commercialIf ? new RegExp(spec.commercialIf, 'i').test(text) : false;
  const cit = spec.citation ? new RegExp(spec.citation, 'i').exec(text)?.[1]?.replace(/\s+/g, ' ').trim() : undefined;
  return { licence, commercialUse: !nonComm && comm, citation: cit, read: true };
}

export type LayersResult = {
  layers: Partial<Record<LayerId, { state: 'enabled'; provider: string; others?: string[]; note?: string } | { state: 'unavailable'; reason: string }>>;
  sources: Source[];
  evidence: Partial<Record<LayerId, { note: string; image?: string; tried: string[] }>>;
};

/** `outlineSources`: the sources of the outlines already confirmed (they ARE the outlines layer). */
export async function fetchLayers(box: Bounds, outlineSources: string[], f: typeof fetch = fetch, providers = loadProviders(), now = Date.now()): Promise<LayersResult> {
  const results = await Promise.all(providers.map(async (p) => ({ p, here: covers(p, box), found: covers(p, box) ? await probe(p, box, f, now) : ({ ok: false, note: 'outside the area this source covers' } as Found) })));
  const lic = new Map<string, Promise<string | null>>(), out: LayersResult = { layers: {}, sources: [], evidence: {} };
  const used = new Set<string>();
  for (const layer of LAYERS) {
    const list = results.filter((r) => r.p.layer === layer), good = list.filter((r) => r.here && r.found.ok);
    const tried = list.map((r) => `${r.p.name}: ${r.found.note}`);
    if (layer === 'outlines') {
      out.layers.outlines = outlineSources.length ? { state: 'enabled', provider: outlineSources[0]!, ...(outlineSources.length > 1 ? { others: outlineSources.slice(1) } : {}), note: 'the outlines chosen in the outline step' } : { state: 'unavailable', reason: 'no outline has been chosen yet' };
      continue;
    }
    if (good.length) {
      out.layers[layer] = { state: 'enabled', provider: good[0]!.p.id, ...(good.length > 1 ? { others: good.slice(1).map((r) => r.p.id) } : {}), note: good.map((r) => r.found.note).join('; ') };
      out.evidence[layer] = { note: good.map((r) => `${r.p.name}: ${r.found.note}`).join('\n'), image: good[0]!.found.image, tried };
      good.forEach((r) => used.add(r.p.id));
    } else {
      out.layers[layer] = { state: 'unavailable', reason: list.length ? `looked at ${tried.join(' | ')}` : 'no provider for this layer is listed in walkthrough/providers.json for this area' };
      out.evidence[layer] = { note: 'nothing found', tried };
    }
  }
  for (const r of results.filter((x) => used.has(x.p.id))) {
    const l = await readLicence(r.p, f, lic);
    out.sources.push({ id: r.p.id, name: r.p.name, url: r.p.url, licence: l.licence, commercialUse: l.commercialUse, ...(l.citation ? { citation: l.citation } : {}), layers: [r.p.layer] });
  }
  return out;
}
