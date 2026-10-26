/** Copernicus Data Space client: several OAuth accounts, token reuse, failover when one is out of processing units. */
import type { Env } from './env';

type Account = { n: number; id: string; secret: string };
const accounts = (env: Env): Account[] => {
  const out: Account[] = [];
  for (let i = 1; i <= 15; i++) {
    const x = i === 1 ? '' : '_' + i;
    const id = env['CDSE_CLIENT_ID' + x], secret = env['CDSE_CLIENT_SECRET' + x];
    if (typeof id === 'string' && typeof secret === 'string' && id && secret) out.push({ n: i, id, secret });
  }
  return out;
};

const tokens = new Map<number, { token: string; until: number }>();
const spent = new Map<number, number>(); // account -> ms until which it counts as out of units

export const hasAccounts = (env: Env) => accounts(env).length > 0;

async function token(env: Env, a: Account, f: typeof fetch, force: boolean, now: number): Promise<string> {
  const t = tokens.get(a.n);
  if (!force && t && t.until > now + 30_000) return t.token;
  const r = await f(`${env.CDSE_IDENTITY ?? 'https://identity.dataspace.copernicus.eu'}/auth/realms/CDSE/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: a.id, client_secret: a.secret }),
  });
  if (!r.ok) throw new Error(`Copernicus login failed (account ${a.n}, HTTP ${r.status})`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  tokens.set(a.n, { token: j.access_token, until: now + j.expires_in * 1000 });
  return j.access_token;
}

export async function callCdse(env: Env, f: typeof fetch, now: number, path: '/api/v1/process' | '/api/v1/statistics', body: unknown, accept: string): Promise<Response> {
  const list = accounts(env);
  const fresh = list.filter((a) => !((spent.get(a.n) ?? 0) > now));
  const used = list.filter((a) => (spent.get(a.n) ?? 0) > now);
  let last: Response | null = null, failure: unknown = null;
  for (const a of [...fresh, ...used]) {
    try {
      const go = async (force: boolean) =>
        f(`${env.CDSE_SH ?? 'https://sh.dataspace.copernicus.eu'}${path}`, {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { Authorization: `Bearer ${await token(env, a, f, force, now)}`, 'Content-Type': 'application/json', Accept: accept },
        });
      let r = await go(false);
      if (r.status === 401) r = await go(true);
      if (r.status === 403 && /INSUFFICIENT_PROCESSING_UNITS/.test(await r.clone().text())) {
        spent.set(a.n, now + 3_600_000);
        last = r;
        continue;
      }
      return r;
    } catch (e) { failure = e; }
  }
  if (last) return last;
  throw failure instanceof Error ? failure : new Error('No Copernicus account available.');
}

export const _resetForTests = () => { tokens.clear(); spent.clear(); };
