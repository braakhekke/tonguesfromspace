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

export default {
  fetch(request: Request, env: Env, ctx: unknown) {
    if (new URL(request.url).pathname.startsWith('/api/')) return handle(request, env, deps);
    return (legacy as { fetch(r: Request, e: Env, c: unknown): Promise<Response> }).fetch(request, env, ctx);
  },
};
