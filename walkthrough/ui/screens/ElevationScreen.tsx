import { useEffect, useState } from 'preact/hooks';
import * as api from '../api';
import type { ScreenProps } from '../Wizard';

/** The elevation model of the 3D view. Nothing is guessed: the person writes what the model's own source says. */
export function ElevationScreen({ st, setPatch, setBlock }: ScreenProps) {
  const e = st.glacier!.elevation, strip = st.glacier!.placement?.strip3d;
  const [f, setF] = useState({ model: e?.model ?? '', res: e ? String(e.resolutionM) : '', yearly: e?.yearlySurfaces ?? false, reason: e?.reason ?? '' });
  useEffect(() => {
    const res = Number(f.res);
    setBlock(!f.model.trim() ? 'Name the elevation model.' : !(res > 0) ? 'The resolution in metres is missing.' : f.reason.trim().length < 20 ? 'Say what was checked: coverage, resolution, the dates of the surfaces, and where.' : null);
    setPatch({ model: f.model.trim(), resolutionM: res, yearlySurfaces: f.yearly, reason: f.reason.trim() });
  }, [JSON.stringify(f)]);
  const g = st.glacier!, [ts, setTs] = useState<api.TerrainState | null>(null), [terr, setTerr] = useState<string | null>(null);
  const loadT = () => api.terrainState(st.region.id, g.id).then(setTs).catch((x) => setTerr(x.message));
  useEffect(() => { loadT(); }, []);
  useEffect(() => { if (!ts?.running) return; const t = setInterval(loadT, 3000); return () => clearInterval(t); }, [ts?.running]);
  const bake = () => { setTerr(null); api.terrainBuild(st.region.id, g.id).then(setTs).catch((x) => setTerr(x.message)); };
  const tb = ts?.built;
  const set = (k: 'model' | 'res' | 'reason') => (ev: Event) => setF({ ...f, [k]: (ev.target as HTMLInputElement).value });
  return (
    <div class="wz-pad">
      <div class="cardx" style="margin-bottom:16px">
        <h4>Baked 3D terrain file</h4>
        <p style="margin:0 0 10px">The same for every region: the file the 3D view loads, made from the confirmed strip, with the peak names (OpenStreetMap; swisstopo in Switzerland). It needs the internet and can take a quarter of an hour. Build it after the strip is confirmed; a changed strip makes it stale.</p>
        <button type="button" class="btn" disabled={!!ts?.running || !strip} onClick={bake}>{ts?.running ? 'Building…' : tb ? 'Build again' : 'Build the terrain file'}</button>
        {tb && <p class="note">{tb.file}, built {tb.built ?? '?'}; {tb.names} peak names{tb.namesSource ? ` (${tb.namesSource})` : ''}{tb.names === 0 && tb.namesSource ? ': the source has none in the strip' : ''}; {tb.yearly ? 'yearly ice surfaces' : 'one surface for all years'}.{!tb.matchesStrip && <b style="color:#C8322A"> The file holds another strip than the record: build again.</b>}</p>}
        {tb?.quality && <div class="note" style={`border-left:3px solid ${tb.quality.status === 'warn' ? '#C8322A' : 'var(--crevasse)'};padding-left:10px;margin-top:8px`}>
          <b style={tb.quality.status === 'warn' ? 'color:#C8322A' : ''}>{tb.quality.status === 'warn' ? 'Warning: the surfaces have seams.' : 'No seams over the limit.'}</b> {(tb.quality.seams * 100).toFixed(2)} % of the cells{tb.quality.seamsYear ? ` of ${tb.quality.seamsYear}` : ''} jump by more than 25 m from a neighbour where the newest surface is smooth; steep cells {(tb.quality.steep * 100).toFixed(1)} %, roughness {tb.quality.rough} m (computed here, with scripts/terrain_quality.py).
          {tb.quality.why.map((w) => <div>{w}</div>)}
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">{tb.quality.relief.map((n) => <figure style="margin:0"><img src={`/__onboard/terrain-relief?name=${encodeURIComponent(n)}`} alt={`Shaded relief of ${n.replace(/\.png$/, '')}`} style="max-width:260px;height:auto;border:1px solid var(--rule)" /><figcaption style="font-size:11px">{n.replace(/^.*-(base|\d{4})\.png$/, (_, k) => (k === 'base' ? 'newest surface' : k))}</figcaption></figure>)}</div>
          <div>Look for hard-edged patches and straight lines on the ice that are not on the newest surface. This only warns: nothing is blocked, and the confirmation below is still yours.</div>
        </div>}
        {tb && !tb.quality && <p class="note">Not measured yet: <code>python3 scripts/terrain_quality.py --write {g.dataKey ?? g.id}</code></p>}
        {!tb && !ts?.running && <p class="note">No terrain file yet.</p>}
        {ts && ts.log.length > 0 && <pre class="note" style="max-height:140px;overflow:auto">{ts.log.slice(-8).join('\n')}</pre>}
        {terr && <p class="note" style="color:#C8322A">{terr}</p>}
      </div>
      {strip && <div class="cardx" style="margin-bottom:16px"><h4>The model has to cover this strip</h4><p style="margin:0">{Math.round((strip.up + strip.back) / 100) / 10} km long ({strip.up} m above the tongue tip, {strip.back} m below it) and {Math.round(strip.half * 2) / 1000} km wide, azimuth {strip.azimuth}° up the glacier.</p></div>}
      <label class="field"><span>Elevation model</span><input value={f.model} onInput={set('model')} placeholder="e.g. the national model's name and edition" /><small>As its source names it. The terrain credit of this region on the page is where it is told to visitors.</small></label>
      <label class="field"><span>Resolution, metres</span><input inputMode="decimal" value={f.res} onInput={set('res')} /><small>The model's own figure, as its source states it, not the grid the 3D view is drawn on.</small></label>
      <label class="field"><span>Yearly ice surfaces</span>
        <span class="check"><input type="checkbox" checked={f.yearly} onChange={(ev) => setF({ ...f, yearly: (ev.target as HTMLInputElement).checked })} /> dated surfaces exist: the 3D view can show the ice of each year</span>
        <small>Leave it off for a single surface: the 3D view then shows the same ground for every year, and says so.</small>
      </label>
      <label class="field"><span>What was checked</span><textarea rows={5} value={f.reason} onInput={set('reason')} placeholder="Coverage of the strip, resolution, which editions or strips (with their years), and where you read it." /></label>
    </div>
  );
}
