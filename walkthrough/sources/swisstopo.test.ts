import { describe, expect, it } from 'vitest';
import { lowestPoint, toLv95 } from './swisstopo';
import { addressFor } from '../propose-glamos';

/** A fake height service: the height is the northing divided by 100, so the lowest point is the southernmost one. */
const fake: typeof fetch = async (url: any) => {
  const n = Number(new URL(String(url)).searchParams.get('northing'));
  return new Response(JSON.stringify({ height: String(n / 100) }));
};

describe('the lowest point of an outline', () => {
  it('finds a low point that sits at the very END of a long vertex list (a truncating sample missed this once)', async () => {
    // 5,000 vertices going round, the southernmost one last
    const ring: number[][] = [];
    for (let i = 0; i < 4999; i++) { const a = (i / 4999) * Math.PI; ring.push([8.0 + 0.05 * Math.cos(a), 46.45 + 0.05 * Math.sin(a)]); } // the northern half
    ring.push([8.03, 46.40]); // the lowest, last
    ring.push(ring[0]!);
    const low = await lowestPoint({ type: 'Polygon', coordinates: [ring] }, fake);
    expect(low!.lat).toBeCloseTo(46.4, 5);
    expect(low!.lon).toBeCloseTo(8.03, 5);
  });
  it('gives up cleanly when the service does not answer', async () => {
    const dead: typeof fetch = async () => new Response('', { status: 500 });
    expect(await lowestPoint({ type: 'Polygon', coordinates: [[[8, 46], [8.1, 46], [8.1, 46.1], [8, 46]]] }, dead)).toBeNull();
  }, 30_000);
  it('LV95 round trip is where Aletsch is', () => {
    const [e, n] = toLv95(8.032, 46.504);
    expect(e).toBeGreaterThan(2_640_000); expect(e).toBeLessThan(2_650_000);
    expect(n).toBeGreaterThan(1_145_000); expect(n).toBeLessThan(1_155_000);
  });
});

describe('addresses from names', () => {
  it.each([['Grosser Aletschgletscher', 'aletsch'], ['Rhonegletscher', 'rhone'], ['Findelgletscher', 'findel'], ['Triftgletscher', 'trift'], ['Corbassière', 'corbassiere']])('%s -> %s', (name, id) => expect(addressFor(name)).toBe(id));
});
