/**
 * The relay, as the wizard runs it on this computer: scene candidates and pictures asked BY MEANING (a glacier, a year, a date), never by raw Copernicus request.
 * The relay builds the request from the glacier's record (the picture box and scene rule the owner confirmed), so a glacier that is not in the index cannot be asked for.
 * This is the design the production Worker moves to; for now the public Worker (worker/worker.js) still relays raw requests, and this one serves only the walkthrough.
 */
import { candidates, image } from './relay';
import type { Deps, Env } from './env';

const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' } });

export async function handle(request: Request, env: Env, deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  const p = url.pathname;
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Use GET' }, 405);
  if (p === '/api/ping') return json({ relay: true, glaciers: Object.keys(deps.index).length });
  let m: RegExpExecArray | null;
  if ((m = /^\/api\/candidates\/([a-z0-9-]+)\/(latest|\d{4})$/.exec(p))) return candidates(env, deps, m[1]!, m[2]!, ip);
  if ((m = /^\/api\/image\/([a-z0-9-]+)\/(\d{4}-\d{2}-\d{2})\/([a-z0-9]+)\/(\d{1,3})$/.exec(p)))
    return image(env, deps, m[1]!, m[2]!, m[3]!, m[4]!, url.searchParams.get('orbit'), ip);
  if ((m = /^\/api\/landsat\/([a-z0-9-]+)\/(\d{4})\.jpg$/.exec(p))) {
    if (!env.LANDSAT) return json({ error: 'Not found' }, 404);
    const o = await env.LANDSAT.get(`landsat/${m[1]}/${m[2]}.jpg`);
    if (!o) return json({ error: 'Not found' }, 404);
    return new Response(o.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400', ETag: o.httpEtag } });
  }
  return json({ error: 'Not found' }, 404);
}
