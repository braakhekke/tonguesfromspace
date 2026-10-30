import { useEffect, useState } from 'preact/hooks';
import * as api from '../api';

/** The best three Landsat scenes of each year (or of one `year`) by the scene rule, from `build_landsat.py --alternatives`, to click one: the pick goes into scripts/landsat-picks.json and is used the next time the pictures are built. */
export function LandsatAlternatives({ region, glacier, year }: { region: string; glacier: string; year?: number }) {
  const [alts, setAlts] = useState<api.LandsatAlts | null>(null), [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.landsatAlts(region, glacier).then(setAlts).catch(() => setAlts(null)); }, [region, glacier]);
  const pick = (y: number, id: string | null) => api.landsatPick(region, glacier, y, id).then(setAlts).catch((e) => setErr(e.message));
  const years = alts ? Object.entries(alts.years).filter(([y]) => year === undefined || Number(y) === year) : [];
  if (!alts) return null;
  if (!years.length) return year === undefined ? null : <p class="note">No Landsat alternatives were made for {year}: no scene passes the scene rule, or the list has not been made (python3 scripts/build_landsat.py --outlet {alts.outlet} --alternatives).</p>;
  return (
    <div class={year === undefined ? 'cardx' : ''} style={year === undefined ? 'margin-bottom:16px' : ''}>
      <h4>{year === undefined ? 'Choose the scene of each year' : `Landsat scenes for ${year}`}</h4>
      <p class="note" style="margin:0 0 10px">The best three scenes by the scene rule, best first, with their own figures from the QA band (cloud over the glacier, over the tongue, snow, cover of the picture box). Registered on the Sentinel-2 mosaic, in the colours of the build, <b>plain: the stripes of Landsat 7 are left as no data</b> (the build fills them). Click one to pick it (scripts/landsat-picks.json, used the next time the pictures are built); "in the site" is the scene of the current build. Made {alts.madeAt}.{alts.rejected.length ? ` Left out by hand: ${alts.rejected.join(', ')}.` : ''}</p>
      {err && <p class="note" style="color:#C8322A">{err}</p>}
      {years.map(([y, list]) => (
        <div key={y} style="margin:0 0 14px">
          {year === undefined && <div style="font-weight:600;margin:0 0 4px">{y}</div>}
          {alts.picks[y] && <div class="note" style="margin:0 0 4px">Your pick: {list.find((a) => a.id === alts.picks[y])?.date ?? alts.picks[y]} <a href="#" onClick={(e) => { e.preventDefault(); pick(Number(y), null); }}>take back</a></div>}
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
            {list.map((a, n) => {
              const mine = alts.picks[y] === a.id, on = mine || (!alts.picks[y] && n === 0);
              return (
                <button type="button" key={a.id} onClick={() => pick(Number(y), a.id)} style={`all:unset;cursor:pointer;display:block;border:2px solid ${mine ? '#C8322A' : on ? '#9db4cf' : '#e1e5ea'};padding:4px;background:#fff`}>
                  <img src={`/__onboard/landsat-alt-img?outlet=${alts.outlet}&name=${a.img}`} loading="lazy" style="width:100%;display:block" alt={a.date} />
                  <div style="font-size:12px;margin-top:3px"><b>{a.date}</b> {a.sat.replace('landsat-', 'Landsat ')} {a.time}{a.current ? ' · in the site' : ''}{mine ? ' · picked' : ''}</div>
                  <div class="note" style="font-size:11px">cloud {Math.round(a.cloud * 100)} % · tongue {Math.round(a.tcloud * 100)} % · snow {Math.round(a.snow * 100)} % · cover {Math.round(a.cover * 100)} %{a.clear ? '' : ' · not clear'}{a.shiftM ? ` · shifted ${Math.round(Math.hypot(a.shiftM[0], a.shiftM[1]))} m` : ''}{a.positionConfirmed ? '' : ' · position not confirmed'}</div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
