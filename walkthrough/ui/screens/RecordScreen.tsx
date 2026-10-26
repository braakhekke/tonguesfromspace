import { useEffect, useRef, useState } from 'preact/hooks';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ScreenProps } from '../Wizard';

const BASE = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg';

export function RecordScreen({ st, step, setPatch, setBlock }: ScreenProps) {
  const g = st.glacier!;
  const p = g.recordConfirmation ? null : st.proposals?.[step.id]?.data; // a tool's proposal, unless the record is already confirmed
  const real = (v: string) => (v === 'unset' ? '' : v);
  const [f, setF] = useState({ name: p?.name ?? g.name, inventoryId: p?.inventoryId ?? real(g.inventoryId), rank: p ? String(p.rank) : g.recordConfirmation ? String(g.rank) : '', area: p ? String(p.areaKm2) : g.recordConfirmation ? String(g.areaKm2) : '', source: p?.areaSource ?? (st.region.sources.some((s: { id: string }) => s.id === g.areaSource) ? g.areaSource : st.region.sources[0]?.id ?? ''), legacy: (p?.legacyIds ?? g.legacyIds ?? []).join(', ') });
  const [centre, setCentre] = useState<[number, number]>(p?.centre ?? g.centre);
  const el = useRef<HTMLDivElement>(null);
  const marker = useRef<L.Marker | null>(null);

  useEffect(() => {
    const m = L.map(el.current!, { attributionControl: false }).setView(p?.centre ?? g.centre, 11);
    L.tileLayer(BASE, { maxNativeZoom: 14, maxZoom: 17 }).addTo(m);
    marker.current = L.marker(p?.centre ?? g.centre, { draggable: true }).addTo(m).on('dragend', () => { const p = marker.current!.getLatLng(); setCentre([+p.lat.toFixed(5), +p.lng.toFixed(5)]); });
    m.on('click', (e) => { marker.current!.setLatLng(e.latlng); setCentre([+e.latlng.lat.toFixed(5), +e.latlng.lng.toFixed(5)]); });
    return () => { m.remove(); };
  }, []);

  useEffect(() => {
    const area = Number(f.area), rank = Number(f.rank);
    setBlock(!f.name ? 'The glacier needs a name.' : !f.inventoryId ? 'The inventory id is missing.' : !(rank >= 1) ? 'The rank is missing.' : !(area > 0) ? 'The area is missing.' : !f.source ? 'Choose the source of the area.' : null);
    setPatch({ id: g.id, name: f.name, inventoryId: f.inventoryId, rank, areaKm2: area, areaSource: f.source, centre, legacyIds: f.legacy.split(',').map((s: string) => s.trim()).filter(Boolean) });
  }, [JSON.stringify(f), centre.join()]);
  const set = (k: keyof typeof f) => (e: Event) => setF({ ...f, [k]: (e.target as HTMLInputElement).value });

  return (
    <div style="display:grid;grid-template-columns:minmax(300px,380px) 1fr;height:100%">
      <div class="wz-pad" style="max-width:none;overflow:auto">
        <label class="field"><span>Name</span><input value={f.name} onInput={set('name')} /></label>
        <label class="field"><span>Address</span><input value={g.id} disabled /><small>The page will be /{st.region.id}/{g.id}. Fixed once created.</small></label>
        <div class="row2">
          <label class="field"><span>Inventory id</span><input value={f.inventoryId} onInput={set('inventoryId')} /></label>
          <label class="field"><span>Rank by area</span><input inputMode="numeric" value={f.rank} onInput={set('rank')} /></label>
        </div>
        <div class="row2">
          <label class="field"><span>Area, km²</span><input inputMode="decimal" value={f.area} onInput={set('area')} /><small>Exactly as the source states it.</small></label>
          <label class="field"><span>Source of the area</span>
            <select value={f.source} onChange={set('source')}>{st.region.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </label>
        </div>
        <label class="field"><span>Ids on the old site (for old links)</span><input value={f.legacy} onInput={set('legacy')} placeholder="aletsch, sgi-B36-26" /><small>Comma separated. Old shared links with these ids are redirected here.</small></label>
        <p class="note">Marker: {centre[0]}, {centre[1]}. Click the map or drag the marker.</p>
      </div>
      <div ref={el} style="min-height:420px" />
    </div>
  );
}
