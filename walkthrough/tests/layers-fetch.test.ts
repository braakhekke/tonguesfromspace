import { describe, expect, it } from 'vitest';
import { fetchLayers, readLicence, textOf, type Provider } from '../layers/fetch';

const box: [[number, number], [number, number]] = [[46.3, 8.0], [46.5, 8.1]];
const wmts = '<ows:Abstract>Data released under &lt;a rel="license" href="x"&gt;Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License&lt;/a&gt;. For commercial usage see x</ows:Abstract>';
const eox: Provider = { id: 'eox', layer: 'basemap', name: 'EOX', url: 'https://eox.test/', covers: { global: true }, probe: { type: 'reach', url: 'https://eox.test/x' },
  licence: { url: 'https://eox.test/caps.xml', extract: 'released under (Creative Commons.{0,120}?License)', nonCommercialIf: 'NonCommercial' } };

describe('layer fetching', () => {
  it('reads text the way a person would see it', () => {
    expect(textOf('<p>a<b>b</b>c</p><script>x()</script>d')).toContain('abc');
    expect(textOf(wmts)).toContain('Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License.');
  });
  it('reads a licence that contains a dot (4.0) and flags non-commercial use', async () => {
    const f = (async () => new Response(wmts)) as unknown as typeof fetch;
    const l = await readLicence(eox, f);
    expect(l.read).toBe(true);
    expect(l.licence).toBe('Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License');
    expect(l.commercialUse).toBe(false);
  });
  it('says NOT READ when the page cannot be read, never a guess', async () => {
    const f = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    const l = await readLicence(eox, f);
    expect(l.read).toBe(false);
    expect(l.licence).toMatch(/NOT READ/);
  });
  it('enables a layer whose service answers, reports one that does not, and lists only used sources', async () => {
    const down: Provider = { ...eox, id: 'osm', layer: 'trails', name: 'Trails', licence: undefined, probe: { type: 'reach', url: 'https://down.test/' } };
    const f = (async (u: string) => (String(u).startsWith('https://down.test') ? new Response('', { status: 503 }) : new Response(wmts))) as unknown as typeof fetch;
    const r = await fetchLayers(box, ['glamos-sgi2023'], f, [eox, down]);
    expect(r.layers.basemap).toMatchObject({ state: 'enabled', provider: 'eox' });
    expect(r.layers.trails).toMatchObject({ state: 'unavailable' });
    expect(r.layers.outlines).toMatchObject({ state: 'enabled', provider: 'glamos-sgi2023' });
    expect(r.sources.map((s) => s.id)).toEqual(['eox']);
    expect(r.sources[0]!.layers).toEqual(['basemap']);
  });
  it('finds the ITS_LIVE region mosaic of a place, smallest region first, and says so when there is none', async () => {
    const item = (rgi: string, bbox: number[]) => ({ bbox, properties: { rgi, temporal_coverage_type: 'annual' } });
    const stac = JSON.stringify({ features: [item('RGI05A', [-75, 59, -8, 84]), item('RGI06A', [-26, 62, -10, 67])] });
    const prov: Provider = { id: 'itslive', layer: 'velocity', name: 'ITS_LIVE', url: 'https://its.test/', covers: { global: true }, probe: { type: 'itslive', stac: 'https://stac.test/items', cog: 'https://cog.test/{rgi}_{year}.tif', year: 2020 } };
    const asked: string[] = [];
    const f = (async (u: string) => { asked.push(String(u)); return String(u).startsWith('https://stac.test') ? new Response(stac) : new Response('', { status: 200 }); }) as unknown as typeof fetch;
    const iceland: [[number, number], [number, number]] = [[64, -17], [64.2, -16.8]];
    const r = await fetchLayers(iceland, [], f, [prov]);
    expect(r.layers.velocity).toMatchObject({ state: 'enabled', provider: 'itslive' });
    expect(asked).toContain('https://cog.test/RGI06A_2020.tif');
    const none = await fetchLayers([[-30, 80], [-29.9, 80.1]], [], f, [prov]);      // Antarctic Peninsula-ish: no region in this catalogue
    expect(none.layers.velocity).toMatchObject({ state: 'unavailable' });
  });
});
