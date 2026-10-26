import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ScreenProps } from '../Wizard';
import { areaKm2 } from '../../shared/geo';
import * as api from '../api';

const BASE = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg';
type Feat = { type: 'Feature'; properties: Record<string, unknown> | null; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: any[] } };
type Epoch = { kind: 'old' | 'new'; year: string; source: string; candidates: Feat[]; chosen: Set<number>; file: string };
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
  const hasProposal = !!st.proposals?.[step.id] && !st.outlines;
  const [prop, setProp] = useState<any>(st.proposals?.[step.id]?.data ?? null); // candidates a tool found, with the right polygon already selected
  useEffect(() => { if (hasProposal && !prop) api.proposal(st.region.id, g.id, step.id).then(setProp).catch(() => {}); }, []);
  const saved = (k: 'old' | 'new'): Epoch | null => {
    const e = st.outlines?.epochs.find((x) => x.kind === k);
    return e ? { kind: k, year: String(e.year), source: e.source, candidates: (e.geojson?.features ?? []) as Feat[], chosen: new Set((e.geojson?.features ?? []).map((_, i) => i)), file: 'saved selection' } : null;
  };
  const proposed = (k: 'old' | 'new'): Epoch | null =>
    prop?.candidates?.[k]?.length ? { kind: k, year: String(prop.epochs[k].year), source: prop.epochs[k].source, candidates: prop.candidates[k], chosen: new Set<number>(prop.preselect[k]), file: `proposed: ${prop.candidates[k].length} polygons nearby` } : null;
  const [eps, setEps] = useState<Record<'old' | 'new', Epoch | null>>({ new: saved('new') ?? proposed('new'), old: saved('old') ?? proposed('old') });
  useEffect(() => { if (prop && !eps.new && !eps.old) setEps({ new: proposed('new'), old: proposed('old') }); }, [prop]);
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
    const epochs = (['new', 'old'] as const).flatMap((k) => { const e = eps[k]; if (!e || !e.chosen.size || !/^\d{4}$/.test(e.year)) return []; return [{ kind: k, year: Number(e.year), source: e.source, geojson: { type: 'FeatureCollection', features: e.candidates.filter((_, i) => e.chosen.has(i)).map((f) => ({ type: 'Feature', properties: f.properties && Object.fromEntries(Object.entries(f.properties).filter(([, v]) => typeof v === 'string' || typeof v === 'number').slice(0, 6)), geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) } })) } }]; });
    setPatch(epochs.length ? { epochs } : null);
  }, [eps]);

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
        {(!ep || ep.candidates.length === 0) && <p class="note">Choose a file to begin. Nothing is downloaded for you yet: the sources and their licences are yours to name in the region step.</p>}
      </div>
      <div ref={el} />
    </div>
  );
}
