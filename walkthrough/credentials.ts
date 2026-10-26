/**
 * npm run credentials [-- --account 2]
 * Asks for a Copernicus Data Space OAuth client (id, then the secret, hidden while you type), checks it with a real login, and saves it
 * to .dev.vars (git-ignored, mode 600). The dev server reads that file on every request, so no restart is needed.
 * The secret is never printed. A second account (--account 2 ... 15) is the failover the Worker uses when one runs out of units.
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { ROOT } from './data';

export const devVarsPath = () => process.env.TFS_DEV_VARS ?? join(ROOT, '.dev.vars');
const names = (account: number) => (account === 1 ? ['CDSE_CLIENT_ID', 'CDSE_CLIENT_SECRET'] : [`CDSE_CLIENT_ID_${account}`, `CDSE_CLIENT_SECRET_${account}`]) as [string, string];

/** The text of a .dev.vars with this account's two lines set, everything else kept as it was. */
export function withAccount(existing: string, account: number, id: string, secret: string): string {
  const [kid, ksecret] = names(account), lines = existing.split('\n').filter((l, i, a) => !(l === '' && i === a.length - 1));
  const keep = lines.filter((l) => !new RegExp(`^\\s*(${kid}|${ksecret})\\s*=`).test(l));
  return [...keep, `${kid}=${id}`, `${ksecret}=${secret}`].join('\n') + '\n';
}

/** Which accounts a .dev.vars holds (numbers only, never values). */
export function accountsIn(text: string): number[] {
  const out: number[] = [];
  for (let i = 1; i <= 15; i++) { const [a, b] = names(i); if (new RegExp(`^\\s*${a}\\s*=\\s*\\S`, 'm').test(text) && new RegExp(`^\\s*${b}\\s*=\\s*\\S`, 'm').test(text)) out.push(i); }
  return out;
}

/** A real login. Returns a sentence about the result, never the secret and never the token. */
export async function check(id: string, secret: string, f: typeof fetch = fetch, identity = process.env.CDSE_IDENTITY ?? 'https://identity.dataspace.copernicus.eu'): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await f(`${identity}/auth/realms/CDSE/protocol/openid-connect/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }) });
    if (r.ok) return { ok: true, message: 'Copernicus accepted the login.' };
    return { ok: false, message: r.status === 401 || r.status === 400 ? 'Copernicus refused this client id and secret (HTTP ' + r.status + '). Check them at shapps.dataspace.copernicus.eu.' : `Copernicus answered HTTP ${r.status}.` };
  } catch (e) { return { ok: false, message: `Could not reach Copernicus: ${(e as Error).message}` }; }
}

/**
 * Answers from the terminal, one reader for all questions (a second reader would lose lines that were already buffered when the
 * input is pasted or piped). The secret is not echoed. Without a terminal it simply reads lines.
 */
function reader() {
  const tty = !!process.stdin.isTTY;
  let muted = false;
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: tty });
  if (tty) { const w = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput.bind(rl); (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => { if (!muted) w(s); }; }
  const lines = rl[Symbol.asyncIterator]();
  return {
    async ask(question: string, hidden: boolean): Promise<string> {
      process.stdout.write(question);
      muted = hidden && tty;
      const r = await lines.next();
      muted = false;
      if (hidden && tty) process.stdout.write('\n');
      return ((r.value as string | undefined) ?? '').trim();
    },
    close: () => rl.close(),
  };
}

async function main() {
  const at = process.argv.indexOf('--account'), account = at >= 0 ? Number(process.argv[at + 1]) : 1;
  if (!Number.isInteger(account) || account < 1 || account > 15) throw new Error('--account is a number from 1 to 15');
  const path = devVarsPath(), existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const have = accountsIn(existing);
  console.log(have.length ? `Accounts already in .dev.vars: ${have.join(', ')}.` : 'No Copernicus account in .dev.vars yet.');
  console.log(`Copernicus Data Space OAuth client for account ${account} (create one at https://shapps.dataspace.copernicus.eu/dashboard).`);
  const rd = reader();
  const id = await rd.ask('  Client ID: ', false), secret = await rd.ask('  Client secret (not shown): ', true);
  rd.close();
  if (!id || !secret) throw new Error('Both the client id and the secret are needed.');
  const res = await check(id, secret);
  console.log(res.message);
  if (!res.ok) { process.exitCode = 1; console.log('Nothing was saved.'); return; }
  writeFileSync(path, withAccount(existing, account, id, secret), { mode: 0o600 });
  try { chmodSync(path, 0o600); } catch { /* not everywhere */ }
  console.log(`Saved to ${path} (git-ignored, readable by you only). The dev server picks it up on the next request: no restart needed.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e) => { console.error((e as Error).message); process.exitCode = 1; });
