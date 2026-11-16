/**
 * The entry of the Worker (wrangler.toml `main`): the relay by meaning under /api/, everything else is the Worker as it was (worker.js: the raw relay under /cdse/,
 * the gallery, the Landsat pictures; the static site is served by the assets binding).
 *
 * The relay by meaning (worker/relay/): the page sends a glacier, a date, a colour style and a tile; the relay builds the Copernicus request from the glacier's record in
 * glacier-index.json (made from data/regions by `npm run walkthrough -- export`), so there is no request body to check and an unknown glacier cannot be asked for.
 * The page moves from /cdse/ to /api/ later; until then both work, and /cdse/ stays as it is.
 */
import legacy from './worker.js';
import { handle } from './relay/index';
import index from './glacier-index.json';
import type { Env, GlacierIndex } from './relay/env';

export const deps = { index: index as unknown as GlacierIndex, fetch: (...a: Parameters<typeof fetch>) => fetch(...a), now: () => Date.now() };

/* The languages of the site live in the address: /de/… and /fr/… show the same files as /… (the page reads its language from the address, js/i18n.js). English has no prefix.
   Whatever a page asks for under its own prefix (relative names, the relay, the gallery) is answered as the same path without the prefix, so nothing in the pages needs to know. */
const LANG_PATH = /^\/(de|fr)(\/.*)?$/;
const WORKER_FIRST = /^\/(api\/|cdse\/|gallery\/|ask\/|ev$|data\/landsat\/|data\/home-bg\/)|\.mp4$/;      // the paths wrangler.toml runs the Worker for (run_worker_first); the others are files
const ROOT_FILES = /((?:src|href|poster)=")(?!https?:|data:|mailto:|#|\/|\?)((?:css|js|fonts|images|data|logo|teaser)\/|config\.js)/g;      // files (not pages) are named from the root: one address, one cache entry for every language

async function localised(request: Request, env: Env, ctx: unknown, lang: string, rest: string) {
  const url = new URL(request.url), inner = new URL(url);
  inner.pathname = rest;
  const req = new Request(inner, request);
  if (WORKER_FIRST.test(rest)) return route(req, env, ctx);
  const res = await env.ASSETS.fetch(req);
  const loc = res.headers.get('Location');
  if (res.status >= 300 && res.status < 400 && loc) {      // /de/size.html -> /size becomes /de/size
    const u = new URL(loc, inner), h = new Headers(res.headers);
    if (u.origin === url.origin) h.set('Location', `/${lang}${u.pathname}${u.search}${u.hash}`);
    return new Response(null, { status: res.status, headers: h });
  }
  if (!(res.headers.get('Content-Type') || '').includes('text/html')) return res;
  let html = await res.text();
  html = html.replace(/^(<!doctype html>\s*<html lang=")en(")/i, `$1${lang}$2`)
    .replace(/(<link rel="canonical" href="https:\/\/[^/"]+)(\/[^"]*")/, `$1/${lang}$2`)
    .replace(/(<meta property="og:url" content="https:\/\/[^/"]+)(\/[^"]*")/, `$1/${lang}$2`)
    .replace(ROOT_FILES, '$1/$2');
  const h = new Headers(res.headers);
  ['Content-Length', 'Content-Encoding', 'ETag'].forEach((k) => h.delete(k));
  return new Response(html, { status: res.status, headers: h });
}

function route(request: Request, env: Env, ctx: unknown): Promise<Response> | Response {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return handle(request, env, deps);
  return (legacy as { fetch(r: Request, e: Env, c: unknown): Promise<Response> }).fetch(request, env, ctx);
}

export default {
  fetch(request: Request, env: Env, ctx: unknown) {
    const url = new URL(request.url), m = LANG_PATH.exec(url.pathname);
    if (m) {
      if (!m[2]) return Response.redirect(`${url.origin}/${m[1]}/${url.search}`, 301);
      return localised(request, env, ctx, m[1], m[2]);
    }
    return route(request, env, ctx);
  },
};
