import { describe, expect, it } from 'vitest';
import { allowed } from './server';

const req = (method: string, headers: Record<string, string>) => ({ method, headers: { host: 'localhost:5174', ...headers } }) as Parameters<typeof allowed>[0];

describe('who may call the local wizard server', () => {
  it('the wizard itself can read and write', () => {
    expect(allowed(req('GET', {}))).toBeNull();
    expect(allowed(req('POST', { 'x-onboard': '1', origin: 'http://localhost:5174' }))).toBeNull();
  });
  it('a request that is not for localhost is refused (DNS rebinding)', () => {
    expect(allowed(req('GET', { host: 'evil.example' }))).toMatch(/local only/);
  });
  it('another site cannot spend quota with an <img> pointing at localhost', () => {
    expect(allowed(req('GET', { 'sec-fetch-site': 'cross-site' }))).toMatch(/cross-site/);
  });
  it('a write without the custom header is refused, which is what a cross-site form post looks like', () => {
    expect(allowed(req('POST', { 'content-type': 'text/plain' }))).toMatch(/X-Onboard/);
  });
  it('a write from another origin is refused even with the header', () => {
    expect(allowed(req('POST', { 'x-onboard': '1', origin: 'https://evil.example' }))).toMatch(/origin/);
  });
});
