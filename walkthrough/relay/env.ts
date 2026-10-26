/// <reference types="@cloudflare/workers-types" />
import type { BalanceYear, SceneRule } from '../shared/schema';
import type { Bounds } from '../shared/schema';

export interface Env {
  ASSETS: Fetcher;
  CACHE?: KVNamespace;
  LANDSAT?: R2Bucket;
  GALLERY?: R2Bucket;
  ALLOWED_ORIGINS?: string;
  TURNSTILE_SECRET?: string;
  TURNSTILE_SITEKEY?: string;
  GALLERY_ADMIN_TOKEN?: string;
  CDSE_IDENTITY?: string;
  CDSE_SH?: string;
  [secret: string]: unknown; // CDSE_CLIENT_ID, CDSE_CLIENT_SECRET, and _2 .. _15
}

/** What the Worker knows about a glacier: generated/glacier-index.json (npm run data). */
export type IndexEntry = { region: string; name: string; pictureBox: Bounds; balanceYear: BalanceYear; sceneRule: SceneRule; hasScenes: boolean };
export type GlacierIndex = Record<string, IndexEntry>;

export type Deps = {
  index: GlacierIndex;
  fetch: typeof fetch;
  now: () => number;
};
