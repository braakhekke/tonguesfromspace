import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ScreenProps } from '../Wizard';
import * as api from '../api';
import { parseYears } from '../years';
import { ruleDiff } from '../rules';
import { axisTicks, dayDiff, fmtDay, isoAt, ranges, sceneLabel, scanRange } from '../axis';
import { balanceYearEnd, pickScene, sceneWindow, type Candidate } from '../../shared/season';
import type { BalanceYear, SceneRule } from '../../shared/schema';

const PRESETS: Record<string, { label: string; by: Omit<BalanceYear, 'source'>; warn?: string }> = {
  north: { label: 'Northern hemisphere: 1 October to 30 September', by: { start: '10-01', end: '09-30', label: 'ends-in' } },
  south: { label: 'Southern hemisphere: 1 April to 31 March', by: { start: '04-01', end: '03-31', label: 'ends-in' }, warn: 'Not verified. Sources differ by country and glacier: take the dates from the source of this glacier\'s figures, and decide how a year that spans two calendar years is named.' },
  custom: { label: 'Other: fill in the dates', by: { start: '01-01', end: '12-31', label: 'ends-in' } },
};
const DEFAULT_RULE: SceneRule = { daysBeforeEnd: 60, daysAfterEnd: 10, maxCloud: 0.05, maxCloudTongue: 0.01, maxSnow: 0.2, fallbackCloud: 0.3, minCoverage: 1, noDataMarginM: 1000, oneOrbit: false, note: '' };

type Mark = Candidate & { landsat?: boolean; usable?: boolean; why?: string; level?: string; basis?: string; gaps?: 'slc-off' | 'outside-glacier'; shadow?: number };
type Status = 'ok' | 'weak' | 'none' | 'out' | 'unscanned';
const W = 840, LEFT = 74, RIGHT = 16, X0 = -150, X1 = 80;
const FULL = 1 - 1e-9; // a picture must cover 100 % of the picture box
const COLOUR: Record<Status, string> = { ok: '#2D6E8E', weak: '#F2A93B', none: '#C8322A', out: '#C8322A', unscanned: '#DDE3E6' };
const WORD: Record<Status, string> = { ok: 'has a scene', weak: 'only cloudy scenes', none: 'no scene', out: 'its scene is outside the window', unscanned: 'not scanned yet' };

/** A scene counts only if it covers the whole picture box (and, for Landsat, can be used at all). */
const covers = (m: Mark) => m.coverage >= FULL || !!m.gaps; // the allowances: Landsat 7 stripes (filled), or all missing data far from the glacier
const usable = (m: Mark) => covers(m) && (!m.landsat || m.usable !== false);
const whyNot = (m: Mark) => (m.why ? m.why : !covers(m) ? `covers only ${(m.coverage * 100).toFixed(0)} % of the picture box; 100 % is required` : '');

export function SeasonScreen({ st, step, setPatch, setBlock }: ScreenProps) {
  const g = st.glacier!;
  const prop = g.balanceYear ? null : st.proposals?.[step.id]?.data; // a tool's proposal, unless the season is already confirmed
  // a rule proposed after this step was confirmed, and what it would change: offered, never applied by itself
  const offered = g.sceneRule ? st.proposals?.[step.id]?.data?.sceneRule : null;
  const diff = offered ? ruleDiff(g.sceneRule!, offered) : [];
  const [by, setBy] = useState<BalanceYear>(g.balanceYear ?? prop?.balanceYear ?? { ...PRESETS.north!.by, source: '' });
  const [rule, setRule] = useState<SceneRule>({ ...(g.sceneRule ?? prop?.sceneRule ?? DEFAULT_RULE), minCoverage: 1 });
  const [preset, setPreset] = useState(by.start === '10-01' && by.end === '09-30' ? 'north' : 'custom');
  const thisYear = new Date().getUTCFullYear();
  // the text is kept as typed: parsing it on every keystroke used to delete what you were typing
  const [yearsText, setYearsText] = useState(`1980-${thisYear}`);
  const years = useMemo(() => parseYears(yearsText, thisYear), [yearsText]);
  const [s2, setS2] = useState<Record<number, Candidate[]>>({});
  const [ls, setLs] = useState<Record<number, Mark[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [labelAll, setLabelAll] = useState(false);
  const [margin, setMargin] = useState(0); // days to look beyond the window, to see what a wider window would catch
  const [scanned, setScanned] = useState<string | null>(null); // the window the shown scans were made with
  const today = new Date().toISOString().slice(0, 10);
  const windowKey = `${by.end}|${rule.daysBeforeEnd}|${rule.daysAfterEnd}|${margin}|${rule.noDataMarginM ?? 0}`;

  // scenes already chosen for this glacier (confirmed, or proposed from the previous site): drawn on their rows
  const known = useMemo(() => {
    const src: Record<string, any> = st.scenes?.years ?? st.proposals?.['glacier.scenes']?.data?.years ?? {};
    return Object.fromEntries(Object.entries(src).filter(([, v]) => v?.chosen).map(([y, v]) => [Number(y), v.chosen as { date: string; sensor: string; orbit?: string }]));
  }, [st]);

  const scanS2 = async () => {
    setBusy('Sentinel-2'); setErr(null);
    try {
      const out: Record<number, Candidate[]> = { ...s2 };
      for (const y of years.filter((y) => y >= 2015)) {
        const range = scanRange(by, rule, y, margin, today);
        if (!range || range.to < '2015-06-23') continue; // its window has not opened yet, or Sentinel-2 did not exist
        setBusy(`Sentinel-2 ${y}`);
        const r = await api.scan(st.region.id, g.id, y, range.from, range.to);
        out[y] = r.candidates.map((c) => ({ sensor: 'sentinel-2', ...c })); setS2({ ...out });
      }
      setScanned(windowKey);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const scanLs = async () => {
    setBusy('Landsat'); setErr(null);
    try {
      const out: Record<number, Mark[]> = { ...ls };
      const list = years.filter((y) => y >= 1972);
      for (const [i, y] of list.entries()) {
        const range = scanRange(by, rule, y, margin, today);
        if (!range || range.to < '1972-07-23') continue;
        setBusy(`Landsat ${y} (${i + 1} of ${list.length})`);
        const r = await api.landsatScan(st.region.id, g.id, y, range.from, range.to, rule.noDataMarginM ?? 0);
        out[y] = r.candidates.map((c) => ({ sensor: c.sensor, date: c.date, id: c.id, cloud: c.cloud, shadow: c.shadow, snow: c.snow, coverage: c.coverage, landsat: true, usable: c.usable, why: c.why, gaps: c.gaps, level: c.level, basis: c.basis }));
        setLs({ ...out });
      }
      setScanned(windowKey);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };

  useEffect(() => {
    const monthDay = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
    setBlock(!by.source.trim() ? 'Say where the balance-year dates come from.' : !monthDay.test(by.start) || !monthDay.test(by.end) ? 'Dates are MM-DD.' : !rule.note.trim() ? 'Write what the scene statistics showed (the note).' : null);
    setPatch({ balanceYear: by, sceneRule: rule });
  }, [JSON.stringify(by), JSON.stringify(rule)]);

  // ---- the window as calendar dates, shown for the latest complete year; it applies to every year relative to its own year end
  const refYear = thisYear - 1;
  const refEnd = balanceYearEnd(by, refYear);
  const winFrom = isoAt(refEnd, -rule.daysBeforeEnd), winTo = isoAt(refEnd, rule.daysAfterEnd);
  const pickDate = (side: 'from' | 'to') => (e: Event) => {
    const v = (e.target as HTMLInputElement).value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    const d = side === 'from' ? dayDiff(refEnd, v) : dayDiff(v, refEnd);
    setRule({ ...rule, ...(side === 'from' ? { daysBeforeEnd: Math.max(0, Math.min(120, d)) } : { daysAfterEnd: Math.max(0, Math.min(60, d)) }) });
  };

  // ---- per year: what is known, what was found, and how it stands
  const rows = useMemo(() => years.map((y) => {
    const end = balanceYearEnd(by, y), w = sceneWindow(by, rule, y);
    const marks: Mark[] = [...(s2[y] ?? []), ...(ls[y] ?? [])];
    const good = marks.filter(usable);
    const picked = good.length ? pickScene(good, y, by, rule) : null;
    const k = known[y] ? { ...known[y]!, off: dayDiff(known[y]!.date, end), inside: known[y]!.date >= w.from && known[y]!.date <= w.to } : null;
    const scanned = y in s2 || y in ls;
    const inWin = good.filter((m) => m.date >= w.from && m.date <= w.to);
    const status: Status = k ? (k.inside ? 'ok' : 'out') : picked ? (picked.clear ? 'ok' : 'weak') : inWin.some((m) => m.cloud <= rule.fallbackCloud) ? 'weak' : scanned ? 'none' : 'unscanned';
    return { y, end, w, marks, picked, k, status, inWindow: inWin.length, partial: marks.filter((m) => !covers(m) && m.date >= w.from && m.date <= w.to).length };
  }), [years.join(), JSON.stringify(by), JSON.stringify(rule), s2, ls, known]);

  const byStatus = (s: Status) => rows.filter((r) => r.status === s).map((r) => r.y);
  const missing = byStatus('none'), weak = byStatus('weak'), out = byStatus('out'), unscanned = byStatus('unscanned');
  const shown = onlyGaps ? rows.filter((r) => r.status !== 'ok') : rows;

  const ROW = shown.length > 14 ? 28 : 56, dense = shown.length > 14;
  const H = shown.length * ROW + 52;
  const x = (off: number) => LEFT + ((off - X0) / (X1 - X0)) * (W - LEFT - RIGHT);
  const ticks = axisTicks(refEnd, X0, X1);
  const setNum = (k: keyof SceneRule) => (e: Event) => setRule({ ...rule, [k]: Number((e.target as HTMLInputElement).value) / 100 });
  const lane = (m: Mark) => (dense ? 0 : (m.orbit ?? (m.landsat ? 'R200' : 'R100')) < 'R085' ? -7 : 7);
  const sc = (m: Mark) => (m.cloud <= rule.maxCloud && m.snow <= rule.maxSnow ? '#2D6E8E' : m.cloud <= rule.fallbackCloud ? '#9DB3BF' : '#D5DBDE');
  // a text label beside a mark: left of it when the mark is near the right edge of the graph
  const label = (off: number, cy: number, text: string, strong: boolean) => {
    const right = x(off) > W - 190;
    return <text class={'scenelab' + (strong ? ' strong' : '')} x={x(off) + (right ? -9 : 9)} y={cy + 3.5} text-anchor={right ? 'end' : 'start'}>{text}</text>;
  };
  const nLs = years.filter((y) => y >= 1972).length, nS2 = years.filter((y) => y >= 2015).length;

  return (
    <div class="wz-pad" style="max-width:none">
      {diff.length > 0 && JSON.stringify(rule) !== JSON.stringify({ ...rule, ...offered, note: rule.note }) && (
        <div class="warn" style="max-width:900px;margin-bottom:14px">
          <b>A different scene rule was proposed since you confirmed this step.</b> It would change: {diff.join('; ')}.
          <div style="margin-top:8px"><button type="button" class="btn" style="display:inline-flex;padding:7px 14px" onClick={() => setRule({ ...rule, ...offered, minCoverage: 1, note: rule.note })}>Use the proposed rule (keeps your note)</button> <span class="note">Then confirm again: the scene review, which depends on this rule, is redone.</span></div>
        </div>
      )}
      <div class="row2" style="max-width:900px">
        <div class="cardx">
          <h4>Balance year</h4>
          <div class="seg" role="group">{Object.entries(PRESETS).map(([k, p]) => <button type="button" key={k} aria-pressed={preset === k} onClick={() => { setPreset(k); setBy({ ...p.by, source: by.source }); }}>{k === 'north' ? 'North' : k === 'south' ? 'South' : 'Other'}</button>)}</div>
          <p class="note" style="margin:0 0 10px">{PRESETS[preset]!.label}</p>
          {PRESETS[preset]!.warn && <div class="warn" style="margin-bottom:10px">{PRESETS[preset]!.warn}</div>}
          <div class="row3">
            <label class="field"><span>Starts</span><input value={by.start} onInput={(e) => setBy({ ...by, start: (e.target as HTMLInputElement).value })} /></label>
            <label class="field"><span>Ends</span><input value={by.end} onInput={(e) => setBy({ ...by, end: (e.target as HTMLInputElement).value })} /></label>
            <label class="field"><span>Named after</span><select value={by.label} onChange={(e) => setBy({ ...by, label: (e.target as HTMLSelectElement).value as BalanceYear['label'] })}><option value="ends-in">year it ends in</option><option value="starts-in">year it starts in</option></select></label>
          </div>
          <label class="field"><span>Where do these dates come from?</span><input value={by.source} onInput={(e) => setBy({ ...by, source: (e.target as HTMLInputElement).value })} placeholder="the source of this glacier's yearly figures" /></label>
        </div>
        <div class="cardx">
          <h4>Scene window and limits</h4>
          <div class="row2">
            <label class="field"><span>First day</span><input type="date" value={winFrom} max={winTo} onChange={pickDate('from')} aria-label="First day of the scene window" /></label>
            <label class="field"><span>Last day</span><input type="date" value={winTo} min={winFrom} onChange={pickDate('to')} aria-label="Last day of the scene window" /></label>
          </div>
          <p class="note" style="margin:-6px 0 12px">Shown for {refYear}, whose balance year ends {fmtDay(new Date(refEnd + 'T00:00:00Z'))}. Every year uses the same window around its own year end: {rule.daysBeforeEnd} days before, {rule.daysAfterEnd} after. At most 120 before and 60 after.</p>
          <div class="row3">
            <label class="field"><span>Max cloud %</span><input inputMode="decimal" value={+(rule.maxCloud * 100).toFixed(2)} onInput={setNum('maxCloud')} /></label>
            <label class="field"><span>Max snow %</span><input inputMode="decimal" value={+(rule.maxSnow * 100).toFixed(2)} onInput={setNum('maxSnow')} /></label>
            <label class="field"><span>Fallback cloud %</span><input inputMode="decimal" value={+(rule.fallbackCloud * 100).toFixed(2)} onInput={setNum('fallbackCloud')} /></label>
          </div>
          <label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" checked={rule.oneOrbit} onChange={(e) => setRule({ ...rule, oneOrbit: (e.target as HTMLInputElement).checked })} /> One orbit for all years</label>
          <label class="field" style="margin-top:12px"><span>Missing data allowed beyond the glacier outline, metres</span><input type="number" min="0" max="5000" step="100" value={rule.noDataMarginM ?? 0} onInput={(e) => setRule({ ...rule, noDataMarginM: Math.max(0, Math.min(5000, Number((e.target as HTMLInputElement).value) || 0)) })} aria-label="Margin in metres" /><small>0 = strict. A Landsat scene whose missing data lies entirely farther than this from the glacier outline still counts as covering the box.</small></label>
          <p class="coverage-rule"><b>100 %</b> of the picture box must be covered. A scene that covers less is never used, whatever its cloud, with two allowances: <b>Landsat 7 stripe gaps</b> (after 31 May 2003), which are filled along the flow of the ice while the footprint still holds the whole box, and <b>missing data far from the glacier</b>: the whole of it more than {rule.noDataMarginM ?? 0} m from the confirmed outline.{!st.outlines && <b style="color:var(--accent)"> The outline is not confirmed yet, so this allowance cannot be applied.</b>}</p>
        </div>
      </div>

      <div class="cardx" style="max-width:900px">
        <h4>What the satellite saw: every scene over this picture box</h4>
        <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
          <label class="field" style="margin:0"><span>Years to look at ({years.length})</span><input value={yearsText} onInput={(e) => setYearsText((e.target as HTMLInputElement).value)} style="width:230px" placeholder="1980-2026, or 2016, 2020-2022" /></label>
          <button type="button" class="btn" disabled={!!busy || nS2 === 0} onClick={scanS2}>{`Scan ${nS2} Sentinel-2 years`}</button>
          <button type="button" class="btn" disabled={!!busy || nLs === 0} onClick={scanLs}>{`Scan ${nLs} Landsat years`}</button>
          {busy && <span class="note" style="margin:0 0 10px">Asking {busy}…</span>}
        </div>
        {err && <div class="warn" style="margin-top:10px">{err}{/credential|account|502/i.test(err) ? ' Run `npm run credentials` in the project folder: it asks for your Copernicus client id and secret and checks them.' : ''}</div>}
        <p class="note">Sentinel-2 starts in 2015, Landsat in 1972 (before 1984 only as Level-1, and the 1970s Landsat 1 to 3 are MSS: 60 m, no blue band). Cloud, snow and coverage are measured over the picture box, not the whole scene. A hollow mark is a scene that cannot be used: it does not cover the whole box, or its sensor is not usable yet. Each year is scanned for exactly its scene window (above), and the limits decide how every scene found is classified and picked.</p>
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-top:6px">
          <label class="field" style="margin:0;flex-direction:row;align-items:center;gap:8px"><span style="text-transform:none;letter-spacing:0;font-size:13px;font-weight:400;color:var(--rock)">Also look</span><input type="number" min="0" max="60" value={margin} onInput={(e) => setMargin(Math.max(0, Math.min(60, Number((e.target as HTMLInputElement).value) || 0)))} style="width:70px" aria-label="Days to look beyond the window" /><span style="text-transform:none;letter-spacing:0;font-size:13px;font-weight:400;color:var(--rock)">days beyond the window, to see what a wider one would catch (0 = exactly the window)</span></label>
        </div>
        <p class="note" aria-live="polite">{scanned === null ? `Scanning ${scanRange(by, rule, refYear, margin, today) ? `${fmtDay(new Date(scanRange(by, rule, refYear, margin, today)!.from + 'T00:00:00Z'))} to ${fmtDay(new Date(scanRange(by, rule, refYear, margin, today)!.to + 'T00:00:00Z'))} in each year` : ''}.` : scanned === windowKey ? 'The scans match the window above.' : <b style="color:var(--accent)">The window changed since the last scan: scan again.</b>}</p>
      </div>

      <div class="cardx gaps" style="max-width:900px">
        <h4>Which years are missing</h4>
        <div class="gaprow"><i style={`background:${COLOUR.none}`} /><b>No scene</b><span>{missing.length ? ranges(missing) : 'none'}</span></div>
        <div class="gaprow"><i style={`background:${COLOUR.weak}`} /><b>Only cloudy scenes</b><span>{weak.length ? ranges(weak) : 'none'}</span></div>
        {out.length > 0 && <div class="gaprow"><i style={`background:${COLOUR.out}`} /><b>Scene outside the window</b><span>{ranges(out)}</span></div>}
        <div class="gaprow"><i style={`background:${COLOUR.unscanned}`} /><b>Not scanned yet</b><span>{unscanned.length ? ranges(unscanned) : 'none'}</span></div>
        {rows.some((r) => r.partial > 0) && <p class="note" style="margin:8px 0 0">{rows.reduce((a, r) => a + r.partial, 0)} scenes inside the window were left out because they cover less than 100 % of the box.</p>}
        <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-top:10px"><input type="checkbox" checked={labelAll} onChange={(e) => setLabelAll((e.target as HTMLInputElement).checked)} /> Label every usable scene with its satellite, orbit and day (otherwise only the chosen one and the one the rule picks)</label>
        <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-top:10px"><input type="checkbox" checked={onlyGaps} onChange={(e) => setOnlyGaps((e.target as HTMLInputElement).checked)} /> Show only the years that need attention ({rows.filter((r) => r.status !== 'ok').length} of {rows.length})</label>
      </div>

      <svg class="tl" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Scenes per year against the balance-year end" style="max-width:900px">
        {[0, 1].map((side) => ticks.map((t) => <text key={`${side}-${t.off}`} x={x(t.off)} y={side ? H - 10 : 14} text-anchor="middle" class={t.end ? 'endlab' : ''}>{t.label}</text>))}
        {ticks.map((t) => <line key={t.off} x1={x(t.off)} x2={x(t.off)} y1={20} y2={H - 24} stroke="#EDF0F2" />)}
        {shown.map((r, i) => {
          const cy = 26 + i * ROW + ROW / 2;
          const bad = r.status === 'none' || r.status === 'out';
          return (
            <g key={r.y}>
              <rect x={0} y={cy - ROW / 2 + 2} width={5} height={ROW - 4} fill={COLOUR[r.status]}><title>{`${r.y}: ${WORD[r.status]}`}</title></rect>
              <rect class="win" x={x(-rule.daysBeforeEnd)} y={cy - ROW / 2 + 3} width={x(rule.daysAfterEnd) - x(-rule.daysBeforeEnd)} height={ROW - 6} />
              <line class="end" x1={x(0)} x2={x(0)} y1={cy - ROW / 2 + 2} y2={cy + ROW / 2 - 2} />
              <text class="yr" x={12} y={cy + 4} style={bad ? 'fill:#C8322A' : ''}>{r.y}</text>
              {r.status === 'none' && <text x={x(-rule.daysBeforeEnd) + 8} y={cy + 4} style="fill:#C8322A;font-weight:600">no scene found</text>}
              {r.k && r.k.off >= X0 && r.k.off <= X1 && <rect x={x(r.k.off) - 5} y={cy - 5} width={10} height={10} transform={`rotate(45 ${x(r.k.off)} ${cy})`} fill={r.k.inside ? '#5B4B8A' : '#C8322A'} stroke="#fff" stroke-width="1.5"><title>{`${r.k.date} ${r.k.sensor}: ${r.k.inside ? 'inside' : 'OUTSIDE'} the window`}</title></rect>}
              {r.marks.map((m) => {
                const off = dayDiff(m.date, r.end);
                if (off < X0 || off > X1) return null;
                const inW = m.date >= r.w.from && m.date <= r.w.to, cyy = cy + lane(m), size = dense ? 3 : 3.5 + 4 * Math.min(1, m.coverage), ok = usable(m);
                const tip = `${fmtDay(new Date(m.date + 'T00:00:00Z'))} ${m.date.slice(0, 4)} · ${m.landsat ? m.sensor : 'Sentinel-2 ' + (m.orbit ?? '')}${m.level ? ' ' + m.level : ''}: cloud ${(m.cloud * 100).toFixed(1)} %${m.shadow ? ` (QA shadow ${(m.shadow * 100).toFixed(0)} %, mostly terrain shadow)` : ''}, snow ${(m.snow * 100).toFixed(1)} %, covers ${(m.coverage * 100).toFixed(0)} % of the box${m.basis ? ` (${m.basis === 'box' ? 'measured over the box' : 'scene figure'})` : ''}${ok ? '' : `. Not used: ${whyNot(m)}`}`;
                if (m.landsat) return <rect key={m.id ?? m.date + m.sensor} x={x(off) - size} y={cyy - size} width={2 * size} height={2 * size} fill={ok ? sc(m) : '#fff'} stroke={!ok ? '#93A0A7' : m.gaps ? '#5B4B8A' : m.snow > rule.maxSnow ? '#F2A93B' : '#fff'} stroke-width={ok ? 2 : 1.2} stroke-dasharray={m.gaps ? '2 1.5' : undefined} opacity={inW ? 1 : 0.3}><title>{tip}</title></rect>;
                return <circle key={m.date + (m.orbit ?? '')} cx={x(off)} cy={cyy} r={size} fill={ok ? sc(m) : '#fff'} stroke={!ok ? '#93A0A7' : m.snow > rule.maxSnow ? '#F2A93B' : '#fff'} stroke-width={ok ? 2 : 1.2} opacity={inW ? 1 : 0.3}><title>{tip}</title></circle>;
              })}
              {r.picked && <circle class="pick" cx={x(dayDiff(r.picked.scene.date, r.end))} cy={cy + lane(r.picked.scene as Mark)} r={dense ? 7 : 11} />}
              {/* which satellite, orbit and day: on the scene already chosen, and on the one the rule picks (or on every scene) */}
              {r.k && r.k.off >= X0 && r.k.off <= X1 && label(r.k.off, cy, sceneLabel(r.k), true)}
              {r.picked && !(r.k && r.k.date === r.picked.scene.date) && label(dayDiff(r.picked.scene.date, r.end), cy + lane(r.picked.scene as Mark), sceneLabel(r.picked.scene), false)}
              {labelAll && r.marks.filter((m) => usable(m) && m.date >= r.w.from && m.date <= r.w.to && m.date !== r.picked?.scene.date && m.date !== r.k?.date).map((m) => label(dayDiff(m.date, r.end), cy + lane(m), sceneLabel(m), false))}
            </g>
          );
        })}
        <text x={x(-rule.daysBeforeEnd)} y={H - 24} text-anchor="start" style="font-size:10px">{fmtDay(new Date(winFrom + 'T00:00:00Z'))}</text>
        <text x={x(rule.daysAfterEnd)} y={H - 24} text-anchor="end" style="font-size:10px">{fmtDay(new Date(winTo + 'T00:00:00Z'))}</text>
      </svg>
      <div class="legend">
        <span><i style="background:#2D6E8E" />clear</span><span><i style="background:#9DB3BF" />some cloud</span><span><i style="background:#D5DBDE" />too cloudy</span>
        <span><i style="background:#fff;border:2px solid #F2A93B" />snow above the limit</span><span><i style="background:#fff;border:2px solid #C8322A" />the scene the rule picks</span>
        <span><i style="background:#2D6E8E;border-radius:0" />square = Landsat</span><span><i style="background:#2D6E8E;border-radius:0;outline:1.5px dashed #5B4B8A" />dashed = allowed below 100 % (Landsat 7 stripes, filled; or missing data far from the glacier)</span><span><i style="background:#fff;border:1.2px solid #93A0A7" />hollow = cannot be used (less than 100 % of the box, or sensor not usable yet)</span>
        <span><i style="background:#5B4B8A;border-radius:0;transform:rotate(45deg)" />scene already chosen</span>
      </div>
      {rows.some((r) => r.k) && (
        <div class="cardx" style="max-width:900px"><h4>Scenes already chosen</h4><p style="margin:0;font-size:13px"><b>{rows.filter((r) => r.k?.inside).length}</b> of {rows.filter((r) => r.k).length} lie inside this window.{rows.some((r) => r.k && !r.k.inside) ? <span style="color:var(--accent)"> Outside: {rows.filter((r) => r.k && !r.k.inside).map((r) => `${r.y} (${r.k!.date})`).join(', ')}.</span> : ' Every one of them.'}</p></div>
      )}
      {rows.some((r) => r.marks.length) && (
        <div class="cardx" style="max-width:900px">
          <h4>What the rule would do</h4>
          {rows.filter((r) => r.marks.length).map((r) => <p key={r.y} style="margin:0 0 4px;font-size:13px"><b>{r.y}</b>: {r.picked ? `${r.picked.scene.date} · ${sceneLabel(r.picked.scene).split(' · ')[0]}${r.picked.clear ? '' : ' (not clear)'}` : <span style="color:var(--accent)">no usable scene</span>}, {r.inWindow} in the window of {r.marks.length} seen</p>)}
        </div>
      )}
      <label class="field" style="max-width:900px"><span>Note: what did the scene statistics show, and why these values?</span><textarea rows={3} value={rule.note} onInput={(e) => setRule({ ...rule, note: (e.target as HTMLTextAreaElement).value })} placeholder="e.g. Clear scenes cluster in the last two weeks of September; October scenes are mostly snow-covered." /></label>
    </div>
  );
}
