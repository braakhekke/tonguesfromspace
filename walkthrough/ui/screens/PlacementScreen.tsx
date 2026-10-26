import { useEffect, useRef, useState } from 'preact/hooks';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ScreenProps } from '../Wizard';
import { featuresBounds, imageGrid, km, southernmost } from '../../shared/geo';
import type { Bounds, LatLon } from '../../shared/schema';

/** Leave room for the readout on the right and the tools on the top left, so no handle sits under them. */
const FIT: L.FitBoundsOptions = { paddingTopLeft: [70, 70], paddingBottomRight: [330, 70] };
const BASE = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg';
const icon = (cls: string, html = '') => L.divIcon({ className: '', html: `<div class="${cls}">${html}</div>`, iconSize: [0, 0] });

/** From the confirmed outline when there is one; otherwise a plain 16 km square around the glacier marker. */
const proposal = (c: LatLon, outline?: { geometry: { type: string; coordinates: any[] } }[]): { box: Bounds; tip: LatLon } => {
  const ob = outline?.length ? featuresBounds(outline) : null;
  if (ob) {
    // the outline's box plus 15 %, and its southernmost point as a first guess for the tip (the real tip is the LOWEST point of the front)
    const [[s, w], [n, e]] = ob, pLat = (n - s) * 0.15, pLon = (e - w) * 0.15;
    return { box: [[s - pLat, w - pLon], [n + pLat, e + pLon]], tip: southernmost(outline!) ?? c };
  }
  const dLat = 8 / 111.2, dLon = 8 / (111.2 * Math.cos((c[0] * Math.PI) / 180));
  return { box: [[c[0] - dLat, c[1] - dLon], [c[0] + dLat, c[1] + dLon]], tip: c };
};

export function PlacementScreen({ st, step, setPatch, setBlock }: ScreenProps) {
  const g = st.glacier!;
  const tool = g.placement ? null : st.proposals?.[step.id]?.data; // a tool's tip and box, unless already confirmed
  const cur = st.outlines?.epochs.find((e) => e.kind === 'new')?.geojson?.features;
  const prop = tool ? { box: tool.pictureBox as Bounds, tip: tool.tip as LatLon } : proposal(g.centre, cur);
  const start = g.placement ?? prop;
  const offered = g.placement ? st.proposals?.[step.id]?.data : null; // a proposal that arrived after this step was confirmed
  const differs = !!offered && (JSON.stringify(offered.pictureBox) !== JSON.stringify(g.placement!.pictureBox) || JSON.stringify(offered.tip) !== JSON.stringify(g.placement!.tip));
  const [box, setBox] = useState<Bounds>((g.placement?.pictureBox ?? prop.box) as Bounds);
  const [tip, setTip] = useState<LatLon>(g.placement?.tip ?? prop.tip);
  const el = useRef<HTMLDivElement>(null);
  const live = useRef({ box, tip });
  live.current = { box, tip };
  const active = useRef<L.Marker | null>(null); // the handle being dragged keeps the pointer's position
  const parts = useRef<{ map: L.Map; rect: L.Rectangle; corners: L.Marker[]; mover: L.Marker; tipM: L.Marker } | null>(null);
  void start;

  useEffect(() => {
    const map = L.map(el.current!, { attributionControl: false, zoomSnap: 0.25, zoomControl: false });
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    L.tileLayer(BASE, { maxNativeZoom: 14, maxZoom: 17 }).addTo(map);
    const b = live.current.box;
    map.fitBounds(b as L.LatLngBoundsLiteral, FIT);
    for (const ep of st.outlines?.epochs ?? []) L.geoJSON(ep.geojson as any, { interactive: false, style: { color: ep.kind === 'new' ? '#E5443B' : '#F2A93B', weight: 2, fill: false, dashArray: ep.kind === 'old' ? '6 5' : undefined } }).addTo(map);
    L.circleMarker(g.centre, { radius: 5, color: '#fff', weight: 2, fillColor: '#2D6E8E', fillOpacity: 1 }).bindTooltip('Glacier marker', { direction: 'top' }).addTo(map);
    const rect = L.rectangle(b as L.LatLngBoundsLiteral, { color: '#C8322A', weight: 2, fill: true, fillOpacity: 0.04, interactive: false }).addTo(map);
    const mk = (cls: string, html: string, at: L.LatLngExpression) => L.marker(at, { draggable: true, icon: icon(cls, html), zIndexOffset: 1000 }).addTo(map);
    const corners = [mk('wz-corner', '', [b[0][0], b[0][1]]), mk('wz-corner', '', [b[0][0], b[1][1]]), mk('wz-corner', '', [b[1][0], b[1][1]]), mk('wz-corner', '', [b[1][0], b[0][1]])];
    const mover = mk('wz-move', '✥', [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2]);
    const tipM = mk('wz-tip', '', live.current.tip);
    // corners: SW, SE, NE, NW. Dragging one moves its two edges.
    const edges = [[0, 0], [0, 1], [1, 1], [1, 0]] as const; // [lat index, lon index]
    corners.forEach((c, i) => c.on('drag', () => {
      const p = c.getLatLng(), nb: Bounds = [[...live.current.box[0]] as LatLon, [...live.current.box[1]] as LatLon];
      nb[edges[i]![0]][0] = p.lat; nb[edges[i]![1]][1] = p.lng;
      const [s, n] = [Math.min(nb[0][0], nb[1][0]), Math.max(nb[0][0], nb[1][0])], [w, e] = [Math.min(nb[0][1], nb[1][1]), Math.max(nb[0][1], nb[1][1])];
      setBox([[s, w], [n, e]]);
    }));
    let last: L.LatLng | null = null;
    mover.on('dragstart', () => { last = mover.getLatLng(); });
    mover.on('drag', () => {
      const p = mover.getLatLng(), d = [p.lat - last!.lat, p.lng - last!.lng]; last = p;
      const bb = live.current.box;
      setBox([[bb[0][0] + d[0]!, bb[0][1] + d[1]!], [bb[1][0] + d[0]!, bb[1][1] + d[1]!]]);
    });
    tipM.on('drag', () => { const p = tipM.getLatLng(); setTip([p.lat, p.lng]); });
    for (const m of [...corners, mover, tipM]) { m.on('dragstart', () => { active.current = m; }); m.on('dragend', () => { active.current = null; }); }
    parts.current = { map, rect, corners, mover, tipM };
    return () => { map.remove(); };
  }, []);

  // keep handles and rectangle in step with the state (dragging one corner moves the others)
  useEffect(() => {
    const p = parts.current;
    if (!p) return;
    const [[s, w], [n, e]] = box;
    p.rect.setBounds([[s, w], [n, e]]);
    const pos: L.LatLngTuple[] = [[s, w], [s, e], [n, e], [n, w]];
    p.corners.forEach((c, i) => { if (active.current !== c) c.setLatLng(pos[i]!); });
    if (active.current !== p.mover) p.mover.setLatLng([(s + n) / 2, (w + e) / 2]);
  }, [box]);

  const [[s, w], [n, e]] = box;
  const wKm = km([s, w], [s, e]), hKm = km([s, w], [n, w]);
  const grid = imageGrid(box);
  const inside = tip[0] >= s && tip[0] <= n && tip[1] >= w && tip[1] <= e;
  const tooBig = wKm * hKm > 2500;

  useEffect(() => {
    setBlock(!inside ? 'The tip is outside the picture box.' : tooBig ? 'The picture box is far too big for one glacier.' : null);
    // exactly as proposed or dragged: a box copied from somewhere keeps every digit it came with
    setPatch({ tip: [tip[0], tip[1]], pictureBox: [[s, w], [n, e]] });
  }, [box, tip]);

  const square = () => {
    const side = Math.max(wKm, hKm), c: LatLon = [(s + n) / 2, (w + e) / 2];
    const dLat = side / 2 / 111.2, dLon = side / 2 / (111.2 * Math.cos((c[0] * Math.PI) / 180));
    setBox([[c[0] - dLat, c[1] - dLon], [c[0] + dLat, c[1] + dLon]]);
  };

  return (
    <div style="position:absolute;inset:0">
      <div ref={el} class="wz-map" />
      {differs && (
        <div class="wz-offer">
          <b>A different box was proposed</b>
          <span>{st.proposals[step.id]!.note}</span>
          <button type="button" onClick={() => { setBox(offered.pictureBox as Bounds); setTip(offered.tip as LatLon); const m = parts.current?.map; m?.fitBounds(offered.pictureBox as L.LatLngBoundsLiteral, FIT); }}>Use the proposed box and tip</button>
        </div>
      )}
      <div class="wz-tools">
        <button type="button" onClick={square}>Make square</button>
        <button type="button" onClick={() => parts.current?.map.fitBounds(box as L.LatLngBoundsLiteral, FIT)}>Fit view</button>
      </div>
      <div class="wz-readout" aria-live="polite">
        <h4>What this box costs</h4>
        <dl>
          <dt>Size</dt><dd>{wKm.toFixed(1)} × {hKm.toFixed(1)} km</dd>
          <dt>Picture</dt><dd>{grid.w} × {grid.h} px</dd>
          <dt>Ground pixel</dt><dd>10 m</dd>
          <dt>Requests per picture</dt><dd class={grid.tiles.length > 1 ? '' : ''}>{grid.tiles.length}</dd>
        </dl>
        <p class={'hint' + (inside ? '' : ' bad')}>{!inside ? 'The yellow tip is outside the box.' : grid.tiles.length > 1 ? `Over 2,500 px (about 25 km): every picture is fetched in ${grid.tiles.length} equal tiles.` : 'One request per picture.'}</p>
        <p class="hint">{!g.placement && cur ? 'Proposed from the outline: the tip is its southernmost point, a guess. Move it to the lowest point of the ice front. ' : ''}Red squares: resize. Red dot: move. Yellow ring: tongue tip. {step.status === 'stale' ? 'Something upstream changed: look again.' : ''}</p>
      </div>
    </div>
  );
}
