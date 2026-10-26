/**
 * Fetch every map layer for a glacier whose picture box and outlines are set, and write what was found as PROPOSALS:
 *  - glacier.layers: per layer enabled (with the source it came from) or unavailable (with what was looked for)
 *  - region.unit:    the region's confirmed sources plus the sources found here (new ones are listed in `added`)
 * The providers and how each is checked are data (walkthrough/providers.json); the licence of each is read from the service's own page.
 * Nothing becomes data until a person confirms it in the walkthrough.
 */
import { loadCtx } from './engine';
import { readProposals, writeProposal } from './proposals';
import { fetchLayers } from './layers/fetch';
import type { Source } from '../shared/schema';

const running = new Set<string>();
export const isProbing = (region: string, glacier: string) => running.has(`${region}/${glacier}`);

export async function probeGlacierLayers(region: string, glacier: string, f: typeof fetch = fetch, log: (m: string) => void = () => {}) {
  const key = `${region}/${glacier}`;
  if (running.has(key)) return null;
  const c = loadCtx(region, glacier), g = c.glacier;
  if (!g?.placement) throw new Error('The picture box is not set yet.');
  if (!c.outlines) throw new Error('The outlines are not set yet.');
  running.add(key);
  try {
    const outlineSources = c.outlines?.epochs.map((e) => e.source) ?? [];
    const found = await fetchLayers(g.placement.pictureBox, outlineSources, f);
    const on = Object.values(found.layers).filter((x) => x?.state === 'enabled').length, off = Object.values(found.layers).length - on;
    for (const [l, x] of Object.entries(found.layers)) log(`${l}: ${x?.state === 'enabled' ? `${x.provider}${x.others ? ` (+${x.others.join(', ')})` : ''}` : `not found: ${x?.reason}`}`);
    writeProposal(region, glacier, 'glacier.layers', 'fetch-layers', `Fetched ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC over the picture box: ${on} found, ${off} not found. What each service answered is under its row.`, { layers: found.layers, evidence: found.evidence });

    const prev = readProposals(region, null)['region.unit']?.data ?? {};
    const have = new Map<string, Source>([...(prev.sources ?? []).filter((x: Source) => x.layers?.length), ...c.region.sources].map((s: Source) => [s.id, s]));
    for (const s of found.sources) if (!c.region.sources.some((x) => x.id === s.id)) have.set(s.id, s); // a new reading replaces an older proposal, never a confirmed source
    const added = [...have.values()].filter((s) => !c.region.sources.some((x) => x.id === s.id)); // everything still to be confirmed, not only what this run found
    writeProposal(region, null, 'region.unit', 'probe-layers', `${added.length ? `Added ${added.map((s) => s.name).join('; ')}, found while fetching the layers of ${g.name}.` : 'No new sources.'} Licences are as each service states them; read them before confirming.`, {
      unitRule: c.region.unitRule ?? prev.unitRule ?? '', count: c.region.count ?? prev.count, sources: [...have.values()], added: added.map((s) => s.id),
    });
    return { found, added: added.map((s) => s.id) };
  } finally { running.delete(key); }
}
