import { useEffect, useRef, useState } from 'preact/hooks';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ScreenProps } from '../Wizard';
import { bearingFrom, stripCorners, stripLocal, stripPoint, type Strip } from '../../shared/geo';
import type { LatLon } from '../../shared/schema';

const BASE = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg';
const icon = (cls: string) => L.divIcon({ className: '', html: `<div class="${cls}"></div>`, iconSize: [0, 0] });
type Cam = { az: number; el: number; dist: number };
const round = (v: number, d = 0) => +v.toFixed(d);

/**
 * The 3D strip: from the tongue tip, `azimuth` is up the glacier; it reaches `back` metres below the tip, `up` metres above it and `half` to each side.
 * Drag the far end (turns and lengthens it), the side handle (width) and the near handle (how far below the tip), or type the numbers.
 * The start camera is taken from the real 3D view in the "Real page" tab: orbit there, press the button above the page.
 */
export function StripScreen({ st, setPatch, setBlock }: ScreenProps) {
  const g = st.glacier!, p = g.placement!, tip = p.tip as LatLon;
  const start = p.strip3d ?? { azimuth: 0, half: 2000, back: 1000, up: 6500 };
  const [s, setS] = useState<Strip>({ azimuth: start.azimuth, half: start.half, back: start.back, up: start.up });
  const [cell, setCell] = useState<string>(p.strip3d?.cell ? String(p.strip3d.cell) : '');
  const [cam, setCam] = useState<Cam | null>(p.strip3d?.cam ?? null);
  const el = useRef<HTMLDivElement>(null);
  const parts = useRef<{ map: L.Map; poly: L.Polygon; far: L.Marker; side: L.Marker; near: L.Marker } | null>(null);
  const live = useRef(s); live.current = s;
  const active = useRef<L.Marker | null>(null);

  useEffect(() => {
    const map = L.map(el.current!, { attributionControl: false });
    L.tileLayer(BASE, { maxNativeZoom: 14, maxZoom: 17 }).addTo(map);
    const poly = L.polygon(stripCorners(tip, live.current), { color: '#2D6E8E', weight: 2, fillOpacity: 0.12, interactive: false }).addTo(map);
    L.circleMarker(tip, { radius: 6, color: '#fff', weight: 2, fillColor: '#C8322A', fillOpacity: 1 }).bindTooltip('Tongue tip (from the placement)', { direction: 'top' }).addTo(map);
    map.fitBounds(poly.getBounds(), { paddingTopLeft: [60, 60], paddingBottomRight: [330, 60] });
    const mk = (cls: string) => L.marker(tip, { draggable: true, icon: icon(cls), zIndexOffset: 1000 }).addTo(map);
    const far = mk('wz-h wz-h-far'), side = mk('wz-h'), near = mk('wz-h');
    far.bindTooltip('Far end: drag to turn and lengthen', { direction: 'top' }); side.bindTooltip('Width', { direction: 'top' }); near.bindTooltip('How far below the tip', { direction: 'top' });
    far.on('drag', () => { const b = bearingFrom(tip, [far.getLatLng().lat, far.getLatLng().lng]); setS({ ...live.current, azimuth: round(b.azimuth, 1), up: Math.max(500, round(b.metres)) }); });
    side.on('drag', () => { const l = stripLocal(tip, live.current, [side.getLatLng().lat, side.getLatLng().lng]); setS({ ...live.current, half: Math.max(200, round(Math.abs(l.across))) }); });
    near.on('drag', () => { const l = stripLocal(tip, live.current, [near.getLatLng().lat, near.getLatLng().lng]); setS({ ...live.current, back: Math.max(0, round(-l.along)) }); });
    for (const m of [far, side, near]) { m.on('dragstart', () => { active.current = m; }); m.on('dragend', () => { active.current = null; }); }
    parts.current = { map, poly, far, side, near };
    return () => { map.remove(); };
  }, []);

  // handles and polygon follow the numbers; the one being dragged stays under the pointer
  useEffect(() => {
    const q = parts.current;
    if (!q) return;
    q.poly.setLatLngs(stripCorners(tip, s));
    if (active.current !== q.far) q.far.setLatLng(stripPoint(tip, s, s.up, 0));
    if (active.current !== q.side) q.side.setLatLng(stripPoint(tip, s, s.up / 2, s.half));
    if (active.current !== q.near) q.near.setLatLng(stripPoint(tip, s, -s.back, 0));
  }, [s.azimuth, s.half, s.back, s.up]);

  // the camera comes from the real 3D view (the wizard dispatches it); the page may also have one already
  useEffect(() => { const on = (e: Event) => setCam((e as CustomEvent<Cam>).detail); addEventListener('wz-cam', on); return () => removeEventListener('wz-cam', on); }, []);

  useEffect(() => {
    const c = Number(cell);
    setBlock(!(s.up > 0) || !(s.half > 0) ? 'Length and width must be above zero.' : cell && !(c > 0) ? 'The cell size must be a number above zero, or empty.' : null);
    setPatch({ strip3d: { azimuth: s.azimuth, half: s.half, back: s.back, up: s.up, ...(cell && c > 0 ? { cell: c } : {}), ...(cam ? { cam } : {}) } });
  }, [s.azimuth, s.half, s.back, s.up, cell, cam && cam.az + '|' + cam.el + '|' + cam.dist]);

  const num = (k: keyof Strip, d = 0) => (
    <input inputMode="decimal" value={String(s[k])} onInput={(e) => { const v = Number((e.target as HTMLInputElement).value); if (Number.isFinite(v)) setS({ ...s, [k]: round(v, d) }); }} />
  );
  return (
    <div style="position:absolute;inset:0">
      <div ref={el} class="wz-map" />
      <div class="wz-readout">
        <h3>3D strip</h3>
        <label class="field"><span>Azimuth up the glacier, degrees</span>{num('azimuth', 1)}</label>
        <div class="row2">
          <label class="field"><span>Half width, m</span>{num('half')}</label>
          <label class="field"><span>Below the tip, m</span>{num('back')}</label>
        </div>
        <label class="field"><span>Up the glacier, m</span>{num('up')}</label>
        <label class="field"><span>Terrain grid cell, m (optional)</span><input inputMode="decimal" value={cell} onInput={(e) => setCell((e.target as HTMLInputElement).value)} placeholder="the region's default" /></label>
        <h3>Start camera</h3>
        {cam
          ? <p class="note">Azimuth {round((cam.az * 180) / Math.PI, 1)}°, elevation {round((cam.el * 180) / Math.PI, 1)}°, distance {round(cam.dist)} m. <button type="button" class="linkish" onClick={() => setCam(null)}>Use the default</button></p>
          : <p class="note">The default camera. To set one: open the <b>Real page</b> tab, orbit the 3D view to where it should start, and press <b>Use this 3D view as the start camera</b>.</p>}
      </div>
    </div>
  );
}
