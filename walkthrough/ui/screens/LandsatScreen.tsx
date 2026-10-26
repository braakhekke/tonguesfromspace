import { useEffect, useState } from 'preact/hooks';
import * as api from '../api';
import type { ScreenProps } from '../Wizard';

/** Builds the Landsat pictures from the confirmed box, outline and scene rule (scripts/build_landsat.py) and lists what it made. Confirming says the years were looked at. */
export function LandsatScreen({ st, setPatch, setBlock }: ScreenProps) {
  const g = st.glacier!, [s, setS] = useState<api.LandsatState | null>(null), [err, setErr] = useState<string | null>(null);
  const load = () => api.landsatState(st.region.id, g.id).then(setS).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (!s?.running) return; const t = setInterval(load, 2500); return () => clearInterval(t); }, [s?.running]);
  useEffect(() => {
    const b = s?.built;
    setBlock(s?.running ? 'The build is running.' : !b ? 'Build the pictures first.' : null);
    setPatch(b ? { years: b.years, ...(b.firstYear !== undefined ? { firstYear: b.firstYear, lastYear: b.lastYear } : {}) } : null);
  }, [s?.running, s?.built?.years, s?.built?.firstYear, s?.built?.lastYear]);
  const build = () => { setErr(null); api.landsatBuild(st.region.id, g.id).then(setS).catch((e) => setErr(e.message)); };
  const far = (y: { shiftM?: [number, number] }) => !!y.shiftM && Math.hypot(y.shiftM[0], y.shiftM[1]) > 150;
  return (
    <div class="wz-pad">
      <div class="cardx" style="margin-bottom:16px">
        <h4>Landsat pictures of {g.name}</h4>
        <p style="margin:0 0 10px">Built from the confirmed picture box, outline and scene rule. It asks the public Landsat archive (Planetary Computer) for every year and can take several minutes; the answers are cached, so a second run is quick.</p>
        <button type="button" class="btn" disabled={!!s?.running} onClick={build}>{s?.running ? 'Building…' : s?.built ? 'Build again' : 'Build the Landsat pictures'}</button>
        {err && <p class="note" style="color:#C8322A">{err}</p>}
      </div>
      {s?.built && (
        <div class="cardx" style="margin-bottom:16px">
          <h4>{s.built.years} {s.built.years === 1 ? 'year' : 'years'}{s.built.firstYear ? `, ${s.built.firstYear} to ${s.built.lastYear}` : ''}</h4>
          <table style="width:100%;font-size:13px"><tbody>
            {s.built.list.map((y) => (
              <tr key={y.year}><td>{y.year}</td><td>{y.date}</td><td>{y.sat}</td>
                <td style={far(y) ? 'color:#C8322A' : ''}>{y.shiftM ? `shifted ${Math.round(Math.hypot(y.shiftM[0], y.shiftM[1]))} m` : ''}{far(y) ? ' (over 150 m: look)' : ''}</td>
                <td>{y.filled ? 'stripes filled' : ''}</td></tr>
            ))}
          </tbody></table>
        </div>
      )}
      {s && s.log.length > 0 && <pre class="cardx" style="max-height:260px;overflow:auto;font-size:11.5px;white-space:pre-wrap">{s.log.join('\n')}</pre>}
    </div>
  );
}
