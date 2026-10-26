import { useEffect, useState } from 'preact/hooks';
import type { ScreenProps } from '../Wizard';
import type { Source } from '../../shared/schema';

const blank = (): Source => ({ id: '', name: '', url: 'https://', licence: '', commercialUse: true });

export function RegionScreen({ st, step, setPatch, setBlock }: ScreenProps) {
  const r = st.region;
  const p = st.proposals?.[step.id]?.data; // a tool's proposal; what is already confirmed wins
  const [unitRule, setUnitRule] = useState(r.unitRule ?? p?.unitRule ?? '');
  const [count, setCount] = useState(String(r.count ?? p?.count ?? ''));
  // confirmed sources first, then the ones a tool proposed that are not in the region yet (the layer probe adds those)
  const proposed: Source[] = (p?.sources ?? []).filter((s: Source) => ![...r.sources, ...(r.layerSources ?? [])].some((x) => x.id === s.id));
  const confirmedAll = [...r.sources, ...(r.layerSources ?? [])];
  const [sources, setSources] = useState<Source[]>(confirmedAll.length || proposed.length ? [...confirmedAll, ...proposed] : [blank()]);
  const upd = (i: number, p: Partial<Source>) => setSources(sources.map((s, j) => (j === i ? { ...s, ...p } : s)));

  useEffect(() => {
    const clean = sources.filter((s) => s.id || s.name);
    const bad = clean.find((s) => !/^[a-z0-9-]+$/.test(s.id) || !s.name || !/^https?:\/\/.+\..+/.test(s.url) || !s.licence);
    setBlock(!unitRule ? 'Write the unit rule.' : clean.length === 0 ? 'Add at least one source.' : bad ? `Source "${bad.id || bad.name || '?'}" needs an id (a-z, 0-9, -), a name, a web address and a licence.` : null);
    // sources a layer fetch found live in layerSources, outside this step's hash: confirming them does not turn later steps stale
    setPatch({ unitRule, count: count ? Number(count) : undefined, sources: clean.filter((s) => !s.layers?.length), layerSources: clean.filter((s) => s.layers?.length) });
  }, [unitRule, count, JSON.stringify(sources)]);

  const nonCommercial = sources.filter((s) => s.id && !s.commercialUse);
  return (
    <div class="wz-pad">
      <label class="field">
        <span>What counts as "a glacier" in {r.name}?</span>
        <textarea rows={3} value={unitRule} onInput={(e) => setUnitRule((e.target as HTMLTextAreaElement).value)} placeholder="e.g. The ten largest glaciers by area in the national inventory, named units only." />
        <small>A rule someone else could apply and get the same list.</small>
      </label>
      <label class="field" style="max-width:200px"><span>How many glaciers</span><input inputMode="numeric" value={count} onInput={(e) => setCount((e.target as HTMLInputElement).value)} /></label>
      <div class="cardx">
        <h4>Sources, each with its licence</h4>
        {proposed.length > 0 && <p class="note" style="margin:0 0 8px">{proposed.length} proposed from the layers fetched for a glacier: {proposed.map((s) => s.name).join('; ')}. {st.proposals?.[step.id]?.note}</p>}
        <details class="srclist" open={sources.length <= 3}>
          <summary>List <small>({sources.length} {sources.length === 1 ? 'source' : 'sources'})</small></summary>
        {sources.map((s, i) => (
          <div key={i} style="border-top:1px solid var(--rule-2);padding-top:12px;margin-top:12px">
            <div class="row3">
              <label class="field"><span>Id</span><input value={s.id} onInput={(e) => upd(i, { id: (e.target as HTMLInputElement).value })} placeholder="national-inventory" /></label>
              <label class="field"><span>Name</span><input value={s.name} onInput={(e) => upd(i, { name: (e.target as HTMLInputElement).value })} /></label>
              <label class="field"><span>Licence</span><input value={s.licence} onInput={(e) => upd(i, { licence: (e.target as HTMLInputElement).value })} placeholder="CC BY 4.0" /></label>
            </div>
            <label class="field"><span>Web address</span><input value={s.url} onInput={(e) => upd(i, { url: (e.target as HTMLInputElement).value })} /></label>
            <label class="field"><span>Citation, exactly as the source states it</span><textarea rows={2} value={s.citation ?? ''} onInput={(e) => upd(i, { citation: (e.target as HTMLTextAreaElement).value })} /></label>
            <label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" checked={s.commercialUse} onChange={(e) => upd(i, { commercialUse: (e.target as HTMLInputElement).checked })} /> Allows commercial use</label>
          </div>
        ))}
        <p style="margin:14px 0 0"><button type="button" class="btn line" onClick={() => setSources([...sources, blank()])}>+ Add a source</button></p>
        </details>
        {nonCommercial.length > 0 && <p class="note">{nonCommercial.map((s) => s.name).join(', ')} {nonCommercial.length === 1 ? 'allows' : 'allow'} only non-commercial use, so the site stays non-commercial.</p>}
      </div>
      {step.status === 'stale' && <p class="note">Something this depends on changed. Look again, then confirm.</p>}
    </div>
  );
}
