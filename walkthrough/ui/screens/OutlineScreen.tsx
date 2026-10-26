import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ScreenProps } from '../Wizard';
import { areaKm2 } from '../../../shared/geo';
import * as api from '../api';

const BASE = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg';
type Feat = { type: 'Feature'; properties: Record<string, unknown> | null; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: any[] } };
type Epoch = { kind: 'old' | 'new'; year: string; source: string; candidates: Feat[]; chosen: Set<number>; file: string; ref?: { file: string; id: string; field: string }; date?: string; by?: string };
/** One dated outline of the glacier (GLIMS holds many): kept with the glacier (`keep`), or used as the past outline of the then-and-now picture (`past`). */
type Dated = { date: string; by: string | null; area: number | null; feature: Feat; keep: boolean; past: boolean };
const OLD = [0xF2, 0xA9, 0x3B], NEW = [0xE5, 0x44, 0x3B];      // the site's own colours for the old and the new outline (css/tokens.css --old, --new)
/** Oldest amber to newest red, along the years between the first and the last outline. */
const ramp = (t: number) => `rgb(${OLD.map((o, i) => Math.round(o + (NEW[i]! - o) * t)).join(',')})`;
const MAX_DRAWN = 3000;

const round = (c: any): any => (typeof c[0] === 'number' ? [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5] : c.map(round));

/** Accepts a FeatureCollection, a Feature or a bare geometry; keeps the polygons. */
function polygonsOf(json: any): Feat[] {
  const feats: any[] = json?.type === 'FeatureCollection' ? json.features : json?.type === 'Feature' ? [json] : json?.coordinates ? [{ type: 'Feature', properties: null, geometry: json }] : [];
  return feats.filter((f) => f?.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));
}
const inRing = (pt: [number, number], ring: number[][]) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!; if (yi! > pt[1] !== yj! > pt[1] && pt[0] < ((xj! - xi!) * (pt[1] - yi!)) / (yj! - yi!) + xi!) c = !c; } return c; };
const contains = (f: Feat, lat: number, lon: number) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).some((p: number[][][]) => inRing([lon, lat], p[0]!));
const label = (f: Feat) => Object.entries(f.properties ?? {}).filter(([, v]) => typeof v === 'string' || typeof v === 'number').slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · ');

export function OutlineScreen({ st, step, setPatch, setBlock }: ScreenProps) {
  const g = st.glacier!;
  const sources = st.region.sources.length ? st.region.sources : st.proposals?.['region.unit']?.data?.sources ?? []; // the proposed ones until the region step is confirmed
  const recProp = g.recordConfirmation ? null : st.proposals?.['glacier.record']?.data;
  const recordArea: number = recProp?.areaKm2 ?? g.areaKm2;
  const hasProposal = !!st.proposals?.[step.id];
  const [prop, setProp] = useState<any>(st.proposals?.[step.id]?.data ?? null); // candidates a tool found, with the right polygon already selected
  useEffect(() => { if (hasProposal && !prop) api.proposal(st.region.id, g.id, step.id).then(setProp).catch(() => {}); }, []);
  const saved = (k: 'old' | 'new'): Epoch | null => {
    const e = st.outlines?.epochs.find((x) => x.kind === k);
    return e ? { kind: k, year: String(e.year), source: e.source, ref: e.ref, date: e.date, by: e.by, candidates: (e.geojson?.features ?? []) as Feat[], chosen: new Set((e.geojson?.features ?? []).map((_, i) => i)), file: 'saved selection' } : null;
  };
  const proposed = (k: 'old' | 'new'): Epoch | null =>
    prop?.candidates?.[k]?.length ? { kind: k, year: String(prop.epochs[k].year), source: prop.epochs[k].source, date: prop.epochs[k].date, candidates: prop.candidates[k], chosen: new Set<number>(prop.preselect[k]), file: `proposed: ${prop.candidates[k].length} polygons nearby` } : null;
  const [eps, setEps] = useState<Record<'old' | 'new', Epoch | null>>({ new: saved('new') ?? proposed('new'), old: saved('old') ?? proposed('old') });
  useEffect(() => { if (prop && !eps.new && !eps.old) setEps({ new: proposed('new'), old: proposed('old') }); }, [prop]);
  /** every dated outline: the proposal's list, with what was kept before (the saved `other` epochs) and the past outline marked */
  const buildDated = (p: any): Dated[] => {
    const others = (st.outlines?.epochs ?? []).filter((e) => e.kind === 'other' && e.geojson?.features[0]), pastDate = saved('old')?.date ?? (saved('old') ? undefined : p?.epochs?.old?.date);
    const list: Dated[] = (p?.dated ?? []).map((f: Feat) => {
      const pr = (f.properties ?? {}) as { date: string; by: string | null; area_km2: number | null };
      return { date: pr.date, by: pr.by, area: pr.area_km2, feature: f, keep: others.some((e) => e.date === pr.date && e.by === pr.by), past: pr.date === pastDate };
    });
    for (const e of others) if (!list.some((d) => d.date === e.date && d.by === e.by)) list.push({ date: e.date ?? `${e.year}-01-01`, by: e.by ?? null, area: null, feature: e.geojson!.features[0] as Feat, keep: true, past: false });
    return list.sort((a, b) => a.date.localeCompare(b.date));
  };
  const [dated, setDated] = useState<Dated[]>(() => buildDated(prop));
  useEffect(() => { if (prop && !dated.length) setDated(buildDated(prop)); }, [prop]);
  const [hover, setHover] = useState<number | null>(null);
  const datedLayer = useRef<L.LayerGroup | null>(null);
  const [kind, setKind] = useState<'new' | 'old'>('new');
  const [err, setErr] = useState<string | null>(null);
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const ep = eps[kind];

  useEffect(() => {
    const m = L.map(el.current!, { attributionControl: false, zoomControl: false }).setView(g.centre, 12);
    L.control.zoom({ position: 'bottomleft' }).addTo(m);
    L.tileLayer(BASE, { maxNativeZoom: 14, maxZoom: 17 }).addTo(m);
    L.circleMarker(g.centre, { radius: 6, color: '#fff', weight: 2, fillColor: '#2D6E8E', fillOpacity: 1 }).bindTooltip('Glacier marker', { direction: 'top' }).addTo(m);
    datedLayer.current = L.layerGroup().addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => { m.remove(); };
  }, []);

  const load = async (file: File) => {
    setErr(null);
    try {
      const all = polygonsOf(JSON.parse(await file.text()));
      if (!all.length) throw new Error('No polygons found in this file. It must be GeoJSON (Polygon or MultiPolygon).');
      // a national file can hold thousands of glaciers: keep the nearest ones to the marker
      const dist = (f: Feat) => { let b = 1e9; const walk = (c: any): void => { if (typeof c[0] === 'number') b = Math.min(b, Math.hypot(c[1] - g.centre[0], (c[0] - g.centre[1]) * 0.7)); else c.forEach(walk); }; walk(f.geometry.coordinates); return b; };
      const near = all.length > MAX_DRAWN ? all.map((f) => [dist(f), f] as const).sort((a, b) => a[0] - b[0]).slice(0, MAX_DRAWN).map((x) => x[1]) : all;
      const hit = near.findIndex((f) => contains(f, g.centre[0], g.centre[1]));
      setEps({ ...eps, [kind]: { kind, year: eps[kind]?.year ?? '', source: eps[kind]?.source ?? sources[0]?.id ?? '', candidates: near, chosen: new Set(hit >= 0 ? [hit] : []), file: `${file.name}: ${all.length} polygons${all.length > near.length ? `, the nearest ${near.length} shown` : ''}` } });
    } catch (e) { setErr((e as Error).message); }
  };

  const toggle = (i: number) => { if (!ep) return; const c = new Set(ep.chosen); c.has(i) ? c.delete(i) : c.add(i); setEps({ ...eps, [kind]: { ...ep, chosen: c } }); };

  // draw: other epoch faint, this epoch's candidates grey (click to select), selected red
  useEffect(() => {
    const lg = layer.current!, m = map.current!;
    lg.clearLayers();
    const other = eps[kind === 'new' ? 'old' : 'new'];
    other?.candidates.forEach((f, i) => { if (other.chosen.has(i)) L.geoJSON(f as any, { interactive: false, style: { color: kind === 'new' ? '#F2A93B' : '#E5443B', weight: 1.5, fill: false, dashArray: '5 5' } }).addTo(lg); });
    ep?.candidates.forEach((f, i) => {
      const on = ep.chosen.has(i);
      L.geoJSON(f as any, { style: { color: on ? '#E5443B' : '#ffffff', weight: on ? 2.5 : 1, fillColor: on ? '#E5443B' : '#ffffff', fillOpacity: on ? 0.22 : 0.06 } })
        .bindTooltip(`${areaKm2(f.geometry).toFixed(2)} km²${label(f) ? ' · ' + label(f) : ''}`, { sticky: true })
        .on('click', () => toggle(i)).addTo(lg);
    });
    void m;
  }, [eps, kind]);
  // the dated outlines, oldest amber to newest red: kept ones solid, the past one dashed and thick, the rest faint; the row under the pointer stands out
  useEffect(() => {
    const lg = datedLayer.current!;
    lg.clearLayers();
    if (!dated.length) return;
    const t0 = Date.parse(dated[0]!.date), t1 = Date.parse(dated[dated.length - 1]!.date);
    dated.forEach((d, i) => {
      const t = t1 > t0 ? (Date.parse(d.date) - t0) / (t1 - t0) : 1, on = d.keep || d.past, hot = hover === i;
      L.geoJSON(d.feature as any, { interactive: false, style: { color: ramp(t), weight: hot ? 4 : d.past ? 3 : on ? 2.2 : 1, opacity: hot ? 1 : on ? 0.95 : 0.4, fill: false, dashArray: d.past ? '8 5' : on ? undefined : '3 4' } }).addTo(lg);
    });
  }, [dated, hover]);
  const fitted = useRef<string>('');
  useEffect(() => {
    if (!ep || fitted.current === ep.file + kind) return;
    fitted.current = ep.file + kind;
    const b = L.geoJSON(ep.candidates.filter((_, i) => ep.chosen.has(i)).concat(ep.chosen.size ? [] : ep.candidates.slice(0, 50)) as any).getBounds();
    if (b.isValid()) map.current!.fitBounds(b, { padding: [60, 60], maxZoom: 14 });
  }, [ep?.file, kind]);

  const sel = useMemo(() => (ep ? ep.candidates.filter((_, i) => ep.chosen.has(i)) : []), [ep]);
  const km2 = sel.reduce((a, f) => a + areaKm2(f.geometry), 0);
  const off = eps.new && kind === 'new' ? Math.abs(km2 - recordArea) / recordArea : null;

  useEffect(() => {
    const n = eps.new;
    const nSel = n ? n.candidates.filter((_, i) => n.chosen.has(i)) : [];
    setBlock(!n || !nSel.length ? 'Select the glacier on the map for the current outline.' : !/^\d{4}$/.test(n.year) ? 'Say which year the current outline describes.' : !n.source ? 'Choose the source of the outline.' : eps.old && eps.old.chosen.size && !/^\d{4}$/.test(eps.old.year) ? 'Say which year the old outline describes.' : null);
    const glims = sources.find((x: { id: string }) => x.id === 'glims')?.id ?? prop?.epochs?.old?.source ?? 'glims';
    const epochs: unknown[] = (['new', 'old'] as const).flatMap((k): unknown[] => {
      const e = eps[k];
      if (!e || !e.chosen.size || !/^\d{4}$/.test(e.year)) return [];
      const head = { kind: k, year: Number(e.year), source: e.source, ...(e.date ? { date: e.date } : {}), ...(e.by ? { by: e.by } : {}) };
      if (e.ref && e.chosen.size === e.candidates.length) return [{ ...head, ref: e.ref }];      // untouched: the record keeps pointing at the data file
      return [{ ...head, geojson: { type: 'FeatureCollection', features: e.candidates.filter((_, i) => e.chosen.has(i)).map((f) => ({ type: 'Feature', properties: f.properties && Object.fromEntries(Object.entries(f.properties).filter(([, v]) => typeof v === 'string' || typeof v === 'number').slice(0, 6)), geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) } })) } }];
    });
    for (const d of dated) if (d.keep && !d.past) epochs.push({ kind: 'other', year: Number(d.date.slice(0, 4)), date: d.date, ...(d.by ? { by: d.by } : {}), source: glims, geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { date: d.date, by: d.by }, geometry: { type: d.feature.geometry.type, coordinates: round(d.feature.geometry.coordinates) } }] } });
    setPatch(epochs.length ? { epochs } : null);
  }, [eps, dated]);

  const setPast = (i: number | null) => {      // the past outline of the then-and-now picture: one of the dated outlines, or none
    setDated(dated.map((d, j) => ({ ...d, past: j === i, keep: j === i ? false : d.keep })));
    const d = i === null ? null : dated[i]!;
    setEps({ ...eps, old: d ? { kind: 'old', year: d.date.slice(0, 4), source: eps.old?.source ?? prop?.epochs?.old?.source ?? 'glims', date: d.date, by: d.by ?? undefined, candidates: [d.feature], chosen: new Set([0]), file: `GLIMS ${d.date}` } : null });
  };
  const setKeep = (i: number, on: boolean) => setDated(dated.map((d, j) => (j === i ? { ...d, keep: on, past: on ? false : d.past } : d)));

  const set = (p: Partial<Epoch>) => setEps({ ...eps, [kind]: { ...(ep ?? { kind, year: '', source: sources[0]?.id ?? '', candidates: [], chosen: new Set(), file: '' }), ...p } });

  return (
    <div style="position:absolute;inset:0;display:grid;grid-template-columns:320px 1fr">
      <div class="wz-pad" style="max-width:none;overflow:auto;border-right:1px solid var(--rule);background:var(--sheet)">
        <div class="seg" role="group"><button type="button" aria-pressed={kind === 'new'} onClick={() => setKind('new')}>Current</button><button type="button" aria-pressed={kind === 'old'} onClick={() => setKind('old')}>Past (optional)</button></div>
        <p class="note" style="margin:0 0 12px">{kind === 'new' ? 'The glacier as the newest source shows it.' : 'An older outline, drawn dashed amber, for the then-and-now picture.'}</p>
        <label class="field"><span>GeoJSON file with candidate polygons</span><input type="file" accept=".json,.geojson,application/geo+json,application/json" onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) load(f); }} /><small>From the inventory you named in the region step. A national file is fine: the nearest polygons are shown.</small></label>
        {err && <div class="warn" style="margin-bottom:12px">{err}</div>}
        {ep && ep.candidates.length > 0 && (
          <>
            <p class="note" style="margin:0 0 10px">{ep.file}</p>
            <div class="row2">
              <label class="field"><span>Year it describes</span><input inputMode="numeric" value={ep.year} onInput={(e) => set({ year: (e.target as HTMLInputElement).value })} placeholder="2023" /></label>
              <label class="field"><span>Source</span><select value={ep.source} onChange={(e) => set({ source: (e.target as HTMLSelectElement).value })}>{sources.map((s: { id: string; name: string }) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            </div>
            <div class="cardx">
              <h4>Selected</h4>
              <p style="margin:0;font-size:22px;font-weight:700">{km2.toFixed(2)} km²</p>
              <p class="note" style="margin:2px 0 0">{sel.length} {sel.length === 1 ? 'polygon' : 'polygons'} of {ep.candidates.length}</p>
              {off !== null && <p class={'note'} style={`margin:8px 0 0;color:${off > 0.1 ? 'var(--accent)' : 'var(--crevasse)'};font-weight:600`}>Record says {recordArea} km²: {(off * 100).toFixed(1)} % {km2 > g.areaKm2 ? 'more' : 'less'}{off > 0.25 ? '. Too far apart to confirm.' : off > 0.1 ? '. Worth a second look.' : '. Close.'}</p>}
            </div>
            <p class="note">Click a polygon to select or deselect it. The one under the glacier marker was selected for you.</p>
          </>
        )}
        {dated.length > 0 && (
          <div class="cardx dated" style="margin-top:14px">
            <h4>All dated outlines ({dated.length})</h4>
            <div class="dated-ramp" style={`background:linear-gradient(90deg,${ramp(0)},${ramp(1)})`} aria-hidden="true" />
            <div class="dated-years"><span>{dated[0]!.date.slice(0, 4)}</span><span>{dated[dated.length - 1]!.date.slice(0, 4)}</span></div>
            <p class="note" style="margin:8px 0">Tick the outlines to keep with this glacier. The dot marks the <b>past outline</b> of the then-and-now picture; the site draws that one and the current one.</p>
            <label class="drow"><span class="sw none" /><span class="dt"><b>No past outline</b></span><span /><input type="radio" name="past" checked={!dated.some((d) => d.past)} onChange={() => setPast(null)} aria-label="No past outline" /></label>
            {dated.map((d, i) => (
              <div class={'drow' + (d.keep || d.past ? ' on' : '')} key={d.date + d.by} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <span class="sw" style={`background:${ramp(dated.length > 1 ? (Date.parse(d.date) - Date.parse(dated[0]!.date)) / (Date.parse(dated[dated.length - 1]!.date) - Date.parse(dated[0]!.date) || 1) : 1)}`} />
                <span class="dt"><b>{d.date}</b><small>{d.by ?? 'contributor not stated'}{d.area != null ? ` · ${d.area} km²` : ''}</small></span>
                <input type="checkbox" checked={d.keep || d.past} disabled={d.past} onChange={(e) => setKeep(i, (e.target as HTMLInputElement).checked)} aria-label={`Keep the outline of ${d.date}`} />
                <input type="radio" name="past" checked={d.past} onChange={() => setPast(i)} aria-label={`Use the outline of ${d.date} as the past outline`} />
              </div>
            ))}
            <div class="row2" style="margin-top:8px">
              <button type="button" class="linkish" onClick={() => setDated(dated.map((d) => ({ ...d, keep: !d.past })))}>Keep all</button>
              <button type="button" class="linkish" onClick={() => setDated(dated.map((d) => ({ ...d, keep: false })))}>Keep none</button>
            </div>
          </div>
        )}
        {(!ep || ep.candidates.length === 0) && <p class="note">Choose a file to begin. Nothing is downloaded for you yet: the sources and their licences are yours to name in the region step.</p>}
      </div>
      <div ref={el} />
    </div>
  );
}
