import { useEffect, useState } from 'preact/hooks';
import type { ScreenProps } from '../Wizard';
import { LAYERS, type LayerId, type Source } from '../../../shared/schema';
import * as api from '../api';

type Row = { state: 'enabled' | 'unavailable' | null; provider: string; reason: string };
const INFO: Record<LayerId, [string, string]> = {
  basemap: ['Base maps', 'Background maps under the picture.'],
  outlines: ['Outlines', 'The old and the newest glacier outline.'],
  trails: ['Trails and ice front in view', 'Hiking paths, and where the front can be seen from them.'],
  thickness: ['Ice thickness (modelled)', 'The national modelled glacier thickness map (swisstopo "Glacier thickness").'],
  radar: ['Radar thickness points', 'Measured ice thickness points (GLAMOS radar).'],
  velocity: ['Ice speed', 'Surface velocity from satellite feature tracking (ITS_LIVE annual mosaics).'],
  streetview: ['Street View', 'Panorama ids only (nothing is stored).'],
  aerial: ['Aerial pictures', 'National orthophoto service, by year.'],
  oldest: ['Oldest aerial picture', 'If none exists: say "none exists, oldest year looked for: …".'],
  landsat: ['Landsat', 'Pictures before Sentinel-2 and gap years.'],
  latest: ['Latest picture', 'The newest Sentinel-2 scene of the last 60 days.'],
};

export function LayersScreen({ st, step, setPatch, setBlock }: ScreenProps) {
  const g = st.glacier!;
  // the sources of the region plus the ones the layer probe proposed for it (they are confirmed in the region step)
  const sources = [...st.region.sources, ...(st.proposals?.['region.unit']?.data?.sources ?? []).filter((s: { id: string }) => !st.region.sources.some((x) => x.id === s.id))];
  const found = st.proposals?.[step.id]?.data as { layers?: Record<string, any>; evidence?: Partial<Record<LayerId, { note: string; tried: string[] }>> } | undefined;
  const [probing, setProbing] = useState(!!st.probing);
  useEffect(() => {
    if (!probing) return;
    const t = setInterval(() => api.state(st.region.id, g.id).then((s) => { if (!s.probing) { setProbing(false); location.reload(); } }), 2000);
    return () => clearInterval(t);
  }, [probing]);
  const [rows, setRows] = useState<Record<LayerId, Row>>(() => Object.fromEntries(LAYERS.map((l) => {
    const s = g.layers?.[l] ?? found?.layers?.[l];
    return [l, s ? { state: s.state, provider: s.state === 'enabled' ? s.provider : '', reason: s.state === 'unavailable' ? s.reason : '' } : { state: null, provider: '', reason: '' }];
  })) as Record<LayerId, Row>);
  const upd = (l: LayerId, p: Partial<Row>) => setRows({ ...rows, [l]: { ...rows[l], ...p } });

  useEffect(() => {
    const open = LAYERS.filter((l) => { const r = rows[l]; return !r.state || (r.state === 'enabled' && !r.provider) || (r.state === 'unavailable' && r.reason.trim().length < 8); });
    setBlock(open.length ? `${open.length} of ${LAYERS.length} layers still need a decision: ${open.map((l) => INFO[l][0]).slice(0, 3).join(', ')}${open.length > 3 ? '…' : ''}` : null);
    const used = new Set(LAYERS.flatMap((l) => (rows[l].state === 'enabled' ? [rows[l].provider] : [])));
    setPatch({ layerSources: sources.filter((x: Source) => used.has(x.id) && x.layers?.length), layers: Object.fromEntries(LAYERS.filter((l) => rows[l].state).map((l) => [l, rows[l].state === 'enabled' ? { state: 'enabled', provider: rows[l].provider } : { state: 'unavailable', reason: rows[l].reason.trim() || 'pending' }])) });
  }, [JSON.stringify(rows)]);

  return (
    <div class="wz-pad">
      <div class="probebar">
        <button type="button" class="btn line" disabled={probing} onClick={() => { setProbing(true); api.probeLayers(st.region.id, g.id); }}>{probing ? 'Fetching the layers…' : found ? 'Fetch the layers again' : 'Fetch the layers now'}</button>
        <span class="note" style="margin:0">{probing ? 'Asking each service over the picture box.' : found ? `Fetched automatically when the box was confirmed (${st.proposals[step.id]!.at.slice(0, 16).replace('T', ' ')} UTC); the choices below start from what was found. Sources found are proposed in the region step.` : 'Starts by itself when the picture box is confirmed.'}</span>
      </div>
      {sources.length === 0 && <div class="warn" style="margin-bottom:14px">The region has no sources yet. Add them in the region step: an enabled layer must name one.</div>}
      {LAYERS.map((l) => (
        <div class="lrow" key={l}>
          <div><b>{INFO[l][0]}</b><small>{INFO[l][1]}</small>{found?.evidence?.[l] && <small class="ev" title={found.evidence[l]!.tried.join('\n')}>{found.evidence[l]!.note}</small>}</div>
          <div>
            <div class="seg" role="group">
              <button type="button" aria-pressed={rows[l].state === 'enabled'} onClick={() => upd(l, { state: 'enabled' })}>Available</button>
              <button type="button" aria-pressed={rows[l].state === 'unavailable'} onClick={() => upd(l, { state: 'unavailable' })}>Not available</button>
            </div>
            {rows[l].state === 'enabled' && (
              <label class="field" style="margin:0"><span>Provider</span>
                <select value={rows[l].provider} onChange={(e) => upd(l, { provider: (e.target as HTMLSelectElement).value })}><option value="">Choose a source…</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                {(() => { const x = sources.find((y) => y.id === rows[l].provider); return x ? <small class={/^NOT READ/i.test(x.licence) ? 'bad' : ''}>Licence: {x.licence}{x.commercialUse ? '' : ' (non-commercial)'}</small> : null; })()}
              </label>
            )}
            {rows[l].state === 'unavailable' && (
              <label class="field" style="margin:0"><span>Because…</span>
                <input value={rows[l].reason} onInput={(e) => upd(l, { reason: (e.target as HTMLInputElement).value })} placeholder="what was looked for, and where" />
                {rows[l].reason.trim().length > 0 && rows[l].reason.trim().length < 8 && <small>A little more: what was looked for, and where.</small>}
              </label>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
