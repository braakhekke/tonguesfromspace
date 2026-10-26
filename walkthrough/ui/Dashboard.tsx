import { useEffect, useState } from 'preact/hooks';
import './wizard.css';
import * as api from './api';
import { go } from './nav';

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** the glaciers by rank, each ice cap followed by its outlets */
const inListOrder = (list: api.Overview['regions'][number]['glaciers']) => {
  const top = list.filter((g) => !g.parent).sort((a, b) => (a.rank || 99) - (b.rank || 99));
  return top.flatMap((g) => [g, ...list.filter((o) => o.parent === g.id).sort((a, b) => (a.rank || 99) - (b.rank || 99))]);
};

export function Dashboard() {
  const [o, setO] = useState<api.Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState<null | { kind: 'region' } | { kind: 'glacier'; region: string }>(null);
  const [f, setF] = useState({ name: '', id: '', lat: '', lon: '' });
  const load = () => api.overview().then(setO).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  if (err) return <div class="dash"><h1>Something is wrong</h1><p class="lede">{err}</p></div>;
  if (!o) return <div class="dash"><p>Loading…</p></div>;

  // the most useful thing: where you stopped. First glacier with work left, else first region with work left.
  const resume = (() => {
    for (const r of o.regions) {
      if (r.regionProgress.next) return { label: r.name, sub: 'Region setup', go: `/onboard/${r.id}/-/${r.regionProgress.next}`, done: r.regionProgress.done, total: r.regionProgress.total };
      for (const g of r.glaciers) if (g.next) return { label: g.name, sub: r.name, go: `/onboard/${r.id}/${g.id}/${g.next}`, done: g.done, total: g.total };
    }
    return null;
  })();

  const create = async () => {
    const centre: [number, number] = [Number(f.lat), Number(f.lon)];
    const id = f.id || slugify(f.name);
    try {
      if (adding?.kind === 'region') { await api.newRegion(id, f.name, centre); go(`/onboard/${id}/-/region.unit`); }
      else if (adding) { await api.newGlacier(adding.region, id, f.name, centre); go(`/onboard/${adding.region}/${id}/glacier.record`); }
    } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div class="dash">
      <h1>Onboarding</h1>
      <p class="lede">One walk-through for every region and glacier. It remembers where you stopped, because progress is read from the data files themselves.</p>
      {o.problems.length > 0 && <div class="warn" style="margin-bottom:18px"><b>Data problems</b><ul>{o.problems.map((p) => <li key={p}>{p}</li>)}</ul></div>}
      {resume && (
        <div class="resume">
          <div><small>Continue where you left off</small><b>{resume.label}</b><small>{resume.sub} · {resume.done} of {resume.total} steps</small></div>
          <a class="btn" href={resume.go}>Continue</a>
        </div>
      )}
      <div class="rgrid">
        {o.regions.map((r) => (
          <div class="rcard" key={r.id}>
            <h3>{r.name}</h3>
            <p class="meta">{r.id} · {r.status}</p>
            <a class="grow" href={`/onboard/${r.id}/-/${r.regionProgress.next ?? 'region.unit'}`}>
              <span>Region setup</span><span class="bar"><b style={`width:${(r.regionProgress.done / Math.max(1, r.regionProgress.total)) * 100}%`} /></span>
            </a>
            {inListOrder(r.glaciers).map((g) => (
              <a class="grow" key={g.id} style={g.parent ? 'margin-left:18px' : ''} href={`/onboard/${r.id}/${g.id}/${g.next ?? 'glacier.record'}`}>
                <b>{g.parent && '↳ '}{g.name}{g.done < 1 && <span class="pill-draft">draft</span>}</b>
                <span class="bar"><b style={`width:${(g.done / Math.max(1, g.total)) * 100}%`} /></span>
              </a>
            ))}
            <p style="margin:12px 0 0"><button type="button" class="btn line" onClick={() => { setAdding({ kind: 'glacier', region: r.id }); setF({ name: '', id: '', lat: '', lon: '' }); }}>+ Add a glacier</button></p>
          </div>
        ))}
        <div class="rcard">
          <h3>A new region</h3>
          <p class="meta">A region is data, never code.</p>
          <button type="button" class="btn line" onClick={() => { setAdding({ kind: 'region' }); setF({ name: '', id: '', lat: '', lon: '' }); }}>+ Add a region</button>
        </div>
      </div>
      {adding && (
        <div class="cardx" style="margin-top:22px;max-width:560px">
          <h4>{adding.kind === 'region' ? 'New region' : `New glacier in ${adding.region}`}</h4>
          <label class="field"><span>Name</span><input value={f.name} onInput={(e) => setF({ ...f, name: (e.target as HTMLInputElement).value })} autofocus /></label>
          <label class="field"><span>Address (the URL)</span><input placeholder={slugify(f.name)} value={f.id} onInput={(e) => setF({ ...f, id: (e.target as HTMLInputElement).value })} /><small>Lower-case letters, digits and hyphens. It is the page address, so choose it once.</small></label>
          <div class="row2">
            <label class="field"><span>Latitude</span><input inputMode="decimal" value={f.lat} onInput={(e) => setF({ ...f, lat: (e.target as HTMLInputElement).value })} /></label>
            <label class="field"><span>Longitude</span><input inputMode="decimal" value={f.lon} onInput={(e) => setF({ ...f, lon: (e.target as HTMLInputElement).value })} /></label>
          </div>
          <div class="row2"><button type="button" class="btn" disabled={!f.name || !f.lat || !f.lon} onClick={create}>Create and start</button><button type="button" class="btn line" onClick={() => setAdding(null)}>Cancel</button></div>
        </div>
      )}
    </div>
  );
}
