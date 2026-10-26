import { useEffect, useState } from 'preact/hooks';
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
  const set = (k: 'model' | 'res' | 'reason') => (ev: Event) => setF({ ...f, [k]: (ev.target as HTMLInputElement).value });
  return (
    <div class="wz-pad">
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
