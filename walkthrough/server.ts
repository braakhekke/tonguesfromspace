/**
 * The walkthrough on this computer: `npm run walkthrough:serve`, then open http://localhost:5174/onboard
 * One small Node server, local only (nothing here is deployed or part of the site):
 *   /onboard/**   the wizard (walkthrough/ui, bundled by esbuild on every request)
 *   /__onboard/*  the engine: state, confirm, create, scans (the same engine as the CLI)
 *   /api/*        the relay, run locally with a file cache; Copernicus credentials from .dev.vars (never committed)
 *   /css, /fonts  the site's own tokens and typeface, so the wizard looks like the site
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { build } from 'esbuild';
import { dataRoot, loadAll, ROOT } from './data';
import { readProposals, writeProposal } from './proposals';
import { confirm, dependents, loadCtx, newGlacier, newRegion, progress, saveCtx } from './engine';
import { handle } from './relay/index';
import { callCdse } from './relay/cdse';
import { sha } from './relay/cache';
import { imageGrid } from './shared/geo';
import { searchLandsat } from './sources/landsat';
import { isProbing, probeGlacierLayers } from './probe-layers';
import { parseStatistics, statisticsBody, STATS_RES_M } from './shared/copernicus';
import type { Env, GlacierIndex } from './relay/env';
import { Glacier } from './shared/schema';
import { resolveOutlines } from './site-data';

const PORT = Number(process.env.TFS_WALKTHROUGH_PORT ?? 5174);
const cacheDir = () => process.env.TFS_CACHE ?? join(ROOT, '.cache');

/** The KV of the Worker, on disk: the same cache logic runs locally, and pictures are paid for once. */
class FileKV {
  dir = join(cacheDir(), 'kv');
  constructor() { mkdirSync(this.dir, { recursive: true }); }
  private f = async (k: string) => join(this.dir, await sha(k));
  async getWithMetadata(k: string) {
    const f = await this.f(k);
    if (!existsSync(f + '.bin')) return { value: null, metadata: null };
    const b = readFileSync(f + '.bin');
    return { value: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), metadata: JSON.parse(readFileSync(f + '.json', 'utf8')) };
  }
  async put(k: string, v: ArrayBuffer, o: { metadata?: unknown }) {
    const f = await this.f(k);
    writeFileSync(f + '.bin', Buffer.from(v));
    writeFileSync(f + '.json', JSON.stringify(o.metadata ?? {}));
  }
}

function devVars(): Record<string, string> {
  const p = join(ROOT, '.dev.vars');
  const out: Record<string, string> = {};
  if (existsSync(p)) for (const line of readFileSync(p, 'utf8').split('\n')) { const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line); if (m) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, ''); }
  return { ...out, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => /^CDSE_/.test(k)) as [string, string][]) };
}

/** What the relay knows about the glaciers: the ones whose placement and season are confirmed (not a generated file: read from the records, always current). */
function indexNow(): GlacierIndex {
  const { regions } = loadAll();
  const idx: GlacierIndex = {};
  for (const { region, glaciers } of regions)
    for (const { glacier: g, scenes } of glaciers)
      if (g.placement && g.balanceYear && g.sceneRule && g.seasonConfirmation) idx[g.id] = { region: region.id, name: g.name, pictureBox: g.placement.pictureBox, balanceYear: g.balanceYear, sceneRule: g.sceneRule, hasScenes: !!scenes };
  return idx;
}

/**
 * Who may call this server. It writes files and spends Copernicus quota, and any web page open in the same browser can
 * send a request to localhost, so "from localhost" is not enough:
 *  - the Host header must be local (stops DNS rebinding),
 *  - a request the browser marks cross-site is refused (stops <img src="http://localhost:5174/api/image/..."> on another site),
 *  - a write needs the X-Onboard header: a custom header makes a cross-site request preflighted, and we never answer a preflight.
 */
export function allowed(req: Pick<IncomingMessage, 'headers' | 'method'>): string | null {
  const h = req.headers;
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(String(h.host ?? ''))) return 'local only';
  if (h['sec-fetch-site'] === 'cross-site') return 'cross-site requests are refused';
  if (req.method === 'POST') {
    if (h['x-onboard'] !== '1') return 'missing X-Onboard header';
    if (h.origin && new URL(String(h.origin)).host !== h.host) return 'the origin is not this server';
  }
  return null;
}
const send = (res: ServerResponse, status: number, v: unknown) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(v)); };
const body = async (req: IncomingMessage) => { const c: Buffer[] = []; for await (const x of req) c.push(x as Buffer); return c.length ? JSON.parse(Buffer.concat(c).toString('utf8')) : {}; };
const dirsOf = (p: string) => (existsSync(p) ? readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : []);

const kv = new FileKV();

async function api(req: IncomingMessage, res: ServerResponse, url: URL) {
  const p = url.pathname;
  if (p.startsWith('/api/')) {
    // Landsat pictures come from the R2 bucket in production; locally from .cache/landsat (put there by import-old-scenes)
    const landsat = { get: async (key: string) => { const f = join(cacheDir(), key); return existsSync(f) ? { body: new Uint8Array(readFileSync(f)), httpEtag: `"dev-${statSync(f).mtimeMs}"` } : null; } };
    const env = { ASSETS: { fetch: async () => new Response('', { status: 404 }) }, CACHE: kv, LANDSAT: landsat, ...devVars() } as unknown as Env;
    const r = await handle(new Request('http://localhost' + req.url, { method: req.method, headers: { 'CF-Connecting-IP': 'dev' } }), env, { index: indexNow(), fetch: (...a) => fetch(...a), now: () => Date.now() });
    res.statusCode = r.status;
    r.headers.forEach((v, k) => res.setHeader(k, v));
    if (p.startsWith('/api/landsat/')) res.setHeader('Cache-Control', 'no-cache'); // the pictures are rebuilt by hand while you work: always ask the file (the ETag follows its date)
    return void res.end(Buffer.from(await r.arrayBuffer()));
  }
  if (p === '/__onboard/overview') {
    const { regions, drafts, problems } = loadAll();
    const out = dirsOf(dataRoot()).map((rid) => {
      const c = loadCtx(rid), rp = progress(c);
      return { id: rid, name: c.region.name, status: c.region.status, centre: c.region.centre, regionProgress: { done: rp.done, total: rp.total, next: rp.next }, glaciers: dirsOf(join(dataRoot(), rid)).map((gid) => { const cg = loadCtx(rid, gid), pr = progress(cg); return { id: gid, name: cg.glacier?.name ?? gid, done: pr.done, total: pr.total, next: pr.next }; }) };
    });
    return send(res, 200, { regions: out, drafts, problems, published: regions.length });
  }
  if (p === '/__onboard/state') {
    const c = loadCtx(url.searchParams.get('region')!, url.searchParams.get('glacier'));
    const pr = progress(c);
    return send(res, 200, { region: c.region, glacier: c.glacier, scenes: c.scenes, outlines: c.outlines ? resolveOutlines(c.outlines) : null, proposals: Object.fromEntries(Object.entries(readProposals(c.region.id, c.glacier?.id ?? null)).map(([k, v]) => [k, { at: v.at, by: v.by, note: v.note, data: JSON.stringify(v.data).length < 20_000 ? v.data : null, heavy: JSON.stringify(v.data).length >= 20_000 }])), probing: c.glacier ? isProbing(c.region.id, c.glacier.id) : false, steps: pr.steps, next: pr.next, done: pr.done, total: pr.total });
  }
  if (p === '/__onboard/confirm' && req.method === 'POST') {
    const b = await body(req);
    const c = loadCtx(b.region, b.glacier);
    const before = dependents(b.step, c);
    saveCtx(confirm(c, b.step, b.patch ?? {}, b.by || 'owner', b.reason || ''));
    // box and outlines are set: start fetching every map layer right away (a proposal, not data)
    if (b.step === 'glacier.placement' && b.glacier) void probeGlacierLayers(b.region, b.glacier, fetch, (m) => console.log(`[layers ${b.glacier}] ${m}`)).catch((e) => console.error(`[layers ${b.glacier}] ${e.message}`));
    return send(res, 200, { ok: true, staled: before });
  }
  if (p === '/__onboard/proposal') return send(res, 200, readProposals(url.searchParams.get('region')!, url.searchParams.get('glacier'))[url.searchParams.get('step')!]?.data ?? null);
  if (p === '/__onboard/propose' && req.method === 'POST') { const b = await body(req); writeProposal(b.region, b.glacier ?? null, b.step, b.by || 'tool', b.note || '', b.data); return send(res, 200, { ok: true }); }
  if (p === '/__onboard/probe-layers' && req.method === 'POST') { const b = await body(req); void probeGlacierLayers(b.region, b.glacier, fetch).catch((e) => console.error(`[layers ${b.glacier}] ${e.message}`)); return send(res, 200, { ok: true }); }
  if (p === '/__onboard/dependents') return send(res, 200, dependents(url.searchParams.get('step')!, loadCtx(url.searchParams.get('region')!, url.searchParams.get('glacier'))));
  if (p === '/__onboard/new-region' && req.method === 'POST') { const b = await body(req); newRegion(b.id, b.name, b.centre); return send(res, 200, { ok: true }); }
  if (p === '/__onboard/new-glacier' && req.method === 'POST') { const b = await body(req); newGlacier(b.region, b.id, b.name, b.centre); return send(res, 200, { ok: true }); }
  if (p === '/__onboard/save-draft' && req.method === 'POST') {
    // a draft of the base record (not a confirmation): lets the form be saved while the person is still typing
    const b = await body(req); const c = loadCtx(b.region, b.glacier);
    if (!c.glacier) throw new Error('no such glacier');
    saveCtx({ ...c, glacier: Glacier.parse({ ...c.glacier, ...b.patch }) });
    return send(res, 200, { ok: true });
  }
  if (p === '/__onboard/landsat-scan' || p === '/__onboard/scan') {
    // every scene over the picture box in the window the page asks for: the scene window of that year, never a range of our own
    const c = loadCtx(url.searchParams.get('region')!, url.searchParams.get('glacier'));
    const box = c.glacier?.placement?.pictureBox, from = url.searchParams.get('from') ?? '', to = url.searchParams.get('to') ?? '', year = Number(url.searchParams.get('year'));
    const landsat = p === '/__onboard/landsat-scan', first = landsat ? '1972-07-23' : '2015-06-23', today = new Date().toISOString().slice(0, 10);
    if (!box) throw new Error('this glacier has no picture box yet');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to || to < first || to > today || Date.parse(to) - Date.parse(from) > 400 * 864e5) throw new Error(`a window from ${first} to today is needed (from=YYYY-MM-DD&to=YYYY-MM-DD, at most 400 days)`);
    const start = from < first ? first : from;
    const marginM = Number(url.searchParams.get('margin') ?? 0) || 0, outline = c.outlines?.epochs.find((e) => e.kind === 'new')?.geojson?.features.map((f) => f.geometry as { type: string; coordinates: any });
    if (landsat) return send(res, 200, { year, from: start, to, candidates: await searchLandsat(box, start, to, fetch, { outline, marginM }) });
    const g = imageGrid(box), lat = (box[0][0] + box[1][0]) / 2;
    const key = `scan:${c.glacier!.id}:${start}:${to}`;
    const hit = await kv.getWithMetadata(key);
    if (hit.value) return send(res, 200, JSON.parse(new TextDecoder().decode(hit.value as ArrayBuffer)));
    const r = await callCdse({ ...devVars() } as unknown as Env, fetch, Date.now(), '/api/v1/statistics', statisticsBody(g.bbox, start, to, STATS_RES_M / Math.cos((lat * Math.PI) / 180)), 'application/json');
    if (!r.ok) throw new Error(`Copernicus said ${r.status}`);
    const out = { year, from: start, to, candidates: parseStatistics(await r.json()) };
    if (to < today) await kv.put(key, new TextEncoder().encode(JSON.stringify(out)).buffer as ArrayBuffer, {});
    return send(res, 200, out);
  }
  return send(res, 404, { error: 'unknown call' });
}

const MIME: Record<string, string> = { '.css': 'text/css', '.woff2': 'font/woff2', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Walkthrough | Tongues from Space</title>
<link rel="stylesheet" href="/css/tokens.css"><link rel="stylesheet" href="/__ui/main.css"></head><body><div id="app"></div><script type="module" src="/__ui/main.js"></script></body></html>`;

/** The wizard, bundled on every request (a few hundred milliseconds): no watcher, no stale bundle. */
async function bundle() {
  const r = await build({ entryPoints: [join(ROOT, 'walkthrough', 'ui', 'main.tsx')], bundle: true, write: false, outdir: 'out', format: 'esm', target: 'es2022', jsx: 'automatic', jsxImportSource: 'preact', sourcemap: 'inline', loader: { '.png': 'dataurl', '.svg': 'dataurl' }, logLevel: 'silent' });
  return Object.fromEntries(r.outputFiles.map((f) => [f.path.split('/').pop()!, f.text]));
}

export function start(port = PORT) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const p = url.pathname;
    try {
      const refused = allowed(req);
      if (refused) return send(res, 403, { error: refused });
      if (p.startsWith('/__onboard/') || p.startsWith('/api/')) return await api(req, res, url);
      if (p === '/__ui/main.js' || p === '/__ui/main.css') {
        const out = await bundle();
        res.setHeader('Content-Type', MIME[extname(p)]!); res.setHeader('Cache-Control', 'no-store');
        return void res.end(out[p.slice('/__ui/'.length)] ?? '');
      }
      if (p.startsWith('/css/') || p.startsWith('/fonts/')) {
        const f = normalize(join(ROOT, p));
        if (!f.startsWith(join(ROOT, p.split('/')[1]!)) || !existsSync(f) || !statSync(f).isFile()) return send(res, 404, { error: 'not found' });
        res.setHeader('Content-Type', MIME[extname(f)] ?? 'application/octet-stream');
        return void res.end(readFileSync(f));
      }
      if (p === '/' || p.startsWith('/onboard')) { res.setHeader('Content-Type', 'text/html'); res.setHeader('Cache-Control', 'no-store'); return void res.end(PAGE); }
      return send(res, 404, { error: 'not found' });
    } catch (e) {
      return send(res, 400, { error: (e as Error).message });
    }
  });
  return new Promise<import('node:http').Server>((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  start().then(() => console.log(`Walkthrough: http://localhost:${PORT}/onboard   (the data it writes is data/regions; Ctrl+C to stop)`));
}
