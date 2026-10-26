import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { accountsIn, check, withAccount } from './credentials';

describe('.dev.vars handling', () => {
  it('adds an account and keeps everything else', () => {
    const out = withAccount('ALLOWED_ORIGINS=http://localhost\n', 1, 'sh-abc', 's3cret');
    expect(out).toBe('ALLOWED_ORIGINS=http://localhost\nCDSE_CLIENT_ID=sh-abc\nCDSE_CLIENT_SECRET=s3cret\n');
  });
  it('replaces the same account, leaves the others alone', () => {
    const first = withAccount('', 1, 'old', 'oldsecret'), both = withAccount(first, 2, 'two', 'twosecret'), again = withAccount(both, 1, 'new', 'newsecret');
    expect(again).toContain('CDSE_CLIENT_ID=new'); expect(again).not.toContain('oldsecret'); expect(again).toContain('CDSE_CLIENT_ID_2=two');
    expect(again.match(/CDSE_CLIENT_ID=/g)).toHaveLength(1);
  });
  it('lists accounts by number, never by value', () => expect(accountsIn(withAccount(withAccount('', 1, 'a', 'b'), 3, 'c', 'd'))).toEqual([1, 3]));
});

describe('checking a login', () => {
  const answer = (status: number): typeof fetch => async () => new Response('{}', { status });
  it('accepts a working client', async () => expect(await check('i', 's', answer(200))).toMatchObject({ ok: true }));
  it('says a refused client is refused, without echoing it', async () => {
    const r = await check('my-id', 'my-secret', answer(401));
    expect(r.ok).toBe(false); expect(r.message).not.toContain('my-secret'); expect(r.message).not.toContain('my-id');
  });
  it('says so when Copernicus cannot be reached', async () => expect((await check('i', 's', (async () => { throw new Error('offline'); }) as typeof fetch)).message).toMatch(/Could not reach/));
});

/** The real command, run as a person would, with a fake Copernicus: ids typed on stdin, the file written, the secret never printed. */
describe('npm run credentials', () => {
  const run = async (ok: boolean) => {
    const dir = mkdtempSync(join(tmpdir(), 'tfs-cred-')), file = join(dir, '.dev.vars');
    writeFileSync(file, 'ALLOWED_ORIGINS=http://localhost\n');
    const srv = createServer((_q, r) => { r.statusCode = ok ? 200 : 401; r.end('{}'); });
    await new Promise<void>((go) => srv.listen(0, go));
    const port = (srv.address() as { port: number }).port;
    // asynchronous: the fake Copernicus lives in this process and must be free to answer while the command runs
    const out = await new Promise<string>((done) => {
      const c = spawn('npx', ['tsx', join(import.meta.dirname, 'credentials.ts')], { env: { ...process.env, TFS_DEV_VARS: file, CDSE_IDENTITY: `http://127.0.0.1:${port}` } });
      let text = ''; c.stdout.on('data', (d) => (text += d)); c.stderr.on('data', (d) => (text += d));
      c.on('close', () => done(text));
      c.stdin.end('client-123\nsuper-secret-456\n');
    });
    srv.close();
    return { dir, file, out };
  };
  it('saves a working client to .dev.vars (readable by the owner only) and never prints the secret', async () => {
    const r = await run(true);
    expect(r.out).toContain('Copernicus accepted the login'); expect(r.out).not.toContain('super-secret-456');
    expect(readFileSync(r.file, 'utf8')).toBe('ALLOWED_ORIGINS=http://localhost\nCDSE_CLIENT_ID=client-123\nCDSE_CLIENT_SECRET=super-secret-456\n');
    expect(statSync(r.file).mode & 0o077).toBe(0);
    rmSync(r.dir, { recursive: true, force: true });
  }, 60_000);
  it('saves nothing when Copernicus refuses the client', async () => {
    const r = await run(false);
    expect(r.out).toContain('refused'); expect(r.out).toContain('Nothing was saved'); expect(r.out).not.toContain('super-secret-456');
    expect(readFileSync(r.file, 'utf8')).toBe('ALLOWED_ORIGINS=http://localhost\n'); expect(existsSync(r.file)).toBe(true);
    rmSync(r.dir, { recursive: true, force: true });
  }, 60_000);
});
