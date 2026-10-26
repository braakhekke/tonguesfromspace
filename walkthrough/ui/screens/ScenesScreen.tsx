import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ScreenProps } from '../Wizard';
import * as api from '../api';
import { pickYears, rankScenes, sceneKey, sceneWindow, type Candidate, type Ranked } from '../../shared/season';
import type { BalanceYear, SceneRef, SceneRule } from '../../shared/schema';
import { needsMargin } from '../rules';
import { go } from '../nav';

type Row = { chosen: SceneRef | null; status: 'auto' | 'approved' | 'pinned' | 'none'; discarded: string[]; cands: Candidate[]; note?: string };
const SENSOR = new Proxy({} as Record<string, string>, { get: (_, k: string) => (k === 'sentinel-2' ? 'Sentinel-2' : 'Landsat ' + k.slice(8)) });
const imageOf = (glacier: string, y: number, c: SceneRef) => (c.sensor.startsWith('landsat') ? `/api/landsat/${glacier}/${y}.jpg` : `/api/image/${glacier}/${c.date}/natural/0${c.orbit ? `?orbit=${c.orbit}` : ''}`);
const fmt = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const asRef = (c: Candidate): SceneRef => ({ sensor: 'sentinel-2', date: c.date, orbit: c.orbit, cloud: +c.cloud.toFixed(4), snow: +c.snow.toFixed(4), coverage: +c.coverage.toFixed(4) });

export function ScenesScreen(props: ScreenProps) {
  const { st } = props, g = st.glacier!;
  // the confirmed season, or else the proposed one: the review can be looked at before the season is confirmed
  const sp = st.proposals?.['glacier.season']?.data;
  const by = g.balanceYear ?? sp?.balanceYear, rule = g.sceneRule ?? sp?.sceneRule;
  if (!by || !rule) return <div class="wz-pad"><div class="cardx"><h4>Balance year first</h4><p style="margin:0">The scene review needs the balance year and the scene rule. Do that step first.</p></div></div>;
  return <Review {...props} by={by} rule={rule} unconfirmedSeason={!g.balanceYear} />;
}

function Review({ st, step, setPatch, setBlock, by, rule, unconfirmedSeason }: ScreenProps & { by: BalanceYear; rule: SceneRule; unconfirmedSeason: boolean }) {
  const g = st.glacier!;
  const thisYear = new Date().getUTCFullYear(), today = new Date().toISOString().slice(0, 10);
  const lastYear = sceneWindow(by, rule, thisYear).from <= today ? thisYear : thisYear - 1;
  // confirmed scenes, or else a tool's proposal (the previous site's scenes, say), exactly as given
  const initial: Record<string, any> = st.scenes?.years ?? st.proposals?.[step.id]?.data?.years ?? {};
  const [rows, setRows] = useState<Record<number, Row>>(() =>
    Object.fromEntries(Object.entries(initial).map(([y, v]) => [Number(y), { chosen: v.chosen, status: v.status, discarded: v.discarded ?? [], cands: [], note: v.note }])));
  const rowsRef = useRef(rows); // handlers read the latest rows even when keys arrive faster than the screen redraws
  const commit = (next: Record<number, Row>) => { rowsRef.current = next; setRows(next); };
  const [cur, setCurState] = useState<number | null>(null);
  const curRef = useRef<number | null>(null);
  const setCur = (y: number | null) => { curRef.current = y; setCurState(y); setMore(3); };
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const years = Object.keys(rows).map(Number).sort((a, b) => a - b);
  const grid = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(4); // the grid's own column count, so the panel can be placed after the right card
  useEffect(() => {
    const g2 = grid.current; if (!g2) return;
    const count = () => setCols(Math.max(1, getComputedStyle(g2).gridTemplateColumns.split(' ').filter((t) => /px$/.test(t)).length));
    count(); const ro = new ResizeObserver(count); ro.observe(g2); return () => ro.disconnect();
  }, []);

  const load = async () => {
    setErr(null);
    const all: Record<number, Candidate[]> = {};
    try {
      for (let y = 2016; y <= lastYear; y++) { setBusy(`Scoring ${y}…`); all[y] = (await api.candidates(g.id, y)).candidates.map((c) => ({ sensor: 'sentinel-2', ...c })); }
    } catch (e) { setErr((e as Error).message); setBusy(null); return; }
    const flat = Object.values(all).flat();
    const discarded = Object.fromEntries(Object.entries(rows).map(([y, r]) => [Number(y), r.discarded]));
    const auto = pickYears(flat, Object.keys(all).map(Number), by, rule, discarded);
    const next: Record<number, Row> = { ...rowsRef.current }; // years that were not scored (Landsat, before 2016) stay as they are
    for (const y of Object.keys(all).map(Number)) {
      const old = rowsRef.current[y];
      const p = auto.picks[y];
      next[y] = old && old.status !== 'auto' ? { ...old, cands: all[y]! } : { chosen: p ? asRef(p.scene) : null, status: p ? 'auto' : 'none', discarded: old?.discarded ?? [], cands: all[y]! };
    }
    commit(next); setCur(curRef.current ?? Number(Object.keys(next).sort()[0])); setBusy(null);
  };

  const marginYears = needsMargin(Object.fromEntries(years.map((y) => [String(y), { chosen: rows[y]!.chosen }])), rule);
  useEffect(() => {
    const unreviewed = years.filter((y) => rows[y]!.status === 'auto');
    setBlock(marginYears.length ? `${marginYears.join(', ')}: allowed below 100 % only by a margin the confirmed scene rule does not have. Add it in Balance year and scene rule.` : years.length === 0 ? 'Score the scenes first.' : unreviewed.length ? `${unreviewed.length} ${unreviewed.length === 1 ? 'year is' : 'years are'} not reviewed: ${unreviewed.slice(0, 6).join(', ')}${unreviewed.length > 6 ? '…' : ''}` : null);
    setPatch(years.length ? { years: Object.fromEntries(years.map((y) => [String(y), { chosen: rows[y]!.chosen, status: rows[y]!.status, discarded: rows[y]!.discarded, ...(rows[y]!.note ? { note: rows[y]!.note } : {}) }])) } : null);
  }, [JSON.stringify(Object.fromEntries(years.map((y) => [y, [rows[y]!.chosen?.date, rows[y]!.status, rows[y]!.discarded.length]]))), marginYears.join()]);

  // Sentinel-2 pictures come through the relay, which needs Copernicus credentials: find out once, and say it
  const [s2Problem, setS2Problem] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<number>>(new Set());
  // a large preview of the picture under the pointer: the picture is already loaded, so it appears at once
  const [hover, setHover] = useState<{ src: string; cap: string; x: number; top: number } | null>(null);
  const [loaded, setLoaded] = useState<Set<string>>(new Set()); // thumbnails of the next-best scenes that have arrived (or failed): the rest show a spinner
  const [more, setMore] = useState(3); // how many next-best scenes are shown
  const [peek, setPeekState] = useState(false); // Space: the selected picture, large and centred
  const peekRef = useRef(false);
  const setPeek = (b: boolean) => { peekRef.current = b; setPeekState(b); };
  const capOf = (y: number, c: SceneRef) => `${y} · ${SENSOR[c.sensor]}${c.orbit ? ` ${c.orbit}` : ''} · ${fmt(c.date)}${c.cloud !== undefined ? ` · cloud ${((c.cloud ?? 0) * 100).toFixed(0)} %, snow ${((c.snow ?? 0) * 100).toFixed(0)} %` : ''}${c.gaps ? ` · ${c.gaps === 'slc-off' ? 'stripe gaps' : 'missing data far from the glacier'}` : ''}`;
  const pop = (e: MouseEvent, src: string, cap: string) => setHover({ src, cap, x: e.clientX, top: e.clientY });
  const popAt = (el: HTMLElement, src: string, cap: string) => { const r = el.getBoundingClientRect(); setHover({ src, cap, x: r.right, top: r.top + r.height / 2 }); };
  /** the magnifier on a picture: the large preview appears only from here, by hover or focus (and by tap on a touch screen) */
  const zoom = (label: string, src: string, cap: string) => (
    <span class="zoom" tabIndex={0} role="img" aria-label={`Enlarge the picture of ${label}`}
      onMouseEnter={(e) => pop(e, src, cap)} onMouseMove={(e) => pop(e, src, cap)} onMouseLeave={() => setHover(null)}
      onFocus={(e) => popAt(e.currentTarget as HTMLElement, src, cap)} onBlur={() => setHover(null)}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); popAt(e.currentTarget as HTMLElement, src, cap); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21M10.5 7.5v6M7.5 10.5h6" /></svg>
    </span>
  );
  // a tap anywhere else puts the preview away (touch screens have no pointer leaving)
  useEffect(() => { const off = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest('.zoom')) setHover(null); if (peekRef.current) setPeek(false); }; addEventListener('pointerdown', off); return () => removeEventListener('pointerdown', off); }, []);
  useEffect(() => {
    const first = years.map((y) => ({ y, c: rows[y]!.chosen })).find((x) => x.c && x.c.sensor === 'sentinel-2');
    if (!first || !first.c) return;
    fetch(imageOf(g.id, first.y, first.c)).then(async (r) => { if (!r.ok) setS2Problem(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`); }).catch(() => setS2Problem('the relay did not answer'));
  }, []);

  const set = (y: number, p: Partial<Row>) => commit({ ...rowsRef.current, [y]: { ...rowsRef.current[y]!, ...p } });
  const inWin = (y: number) => { const r = rowsRef.current[y]!, w = sceneWindow(by, rule, y); return r.cands.filter((c) => c.date >= w.from && c.date <= w.to && c.coverage >= rule.minCoverage - 1e-9 && !r.discarded.includes(sceneKey(c))); };
  const approve = (y: number) => { const r = rowsRef.current[y]!; if (r.chosen) set(y, { status: r.status === 'pinned' ? 'pinned' : 'approved' }); };
  const none = (y: number) => set(y, { chosen: null, status: 'none' });
  const discard = (y: number) => {
    const r = rowsRef.current[y]!;
    if (!r.chosen) return;
    const dk = sceneKey(r.chosen), left = inWin(y).filter((c) => sceneKey(c) !== dk);
    const w = sceneWindow(by, rule, y);
    const best = left.sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(w.target)) - Math.abs(Date.parse(b.date) - Date.parse(w.target)) || a.cloud - b.cloud)[0];
    set(y, { discarded: [...r.discarded, dk], chosen: best ? asRef(best) : null, status: best ? 'auto' : 'none' });
  };
  const swap = (y: number, c: Candidate) => set(y, { chosen: asRef(c), status: 'pinned' });

  const handlers = useRef({ approve, discard, none, swap });
  handlers.current = { approve, discard, none, swap };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const c = curRef.current;
      if (c === null || (e.target as HTMLElement).closest('textarea,input,select') || e.metaKey || e.ctrlKey) return;
      if (e.key === ' ') {
        if ((e.target as HTMLElement).closest('button,a,[role=slider]')) return; // a focused button keeps its own Space
        setPeek(!peekRef.current); e.preventDefault(); return;
      }
      if (e.key === 'Escape' && peekRef.current) { setPeek(false); e.preventDefault(); return; }
      const ys = Object.keys(rowsRef.current).map(Number).sort((a, b) => a - b), i = ys.indexOf(c);
      if (e.key === 'ArrowRight' && i < ys.length - 1) setCur(ys[i + 1]!);
      else if (e.key === 'ArrowLeft' && i > 0) setCur(ys[i - 1]!);
      else if (e.key === 'a') { handlers.current.approve(c); if (i < ys.length - 1) setCur(ys[i + 1]!); }
      else if (e.key === 'd') handlers.current.discard(c);
      else if (e.key === 'n') handlers.current.none(c);
      else if (/^[1-9]$/.test(e.key) && altsRef.current[Number(e.key) - 1]) handlers.current.swap(c, altsRef.current[Number(e.key) - 1]!.scene);
      else return;
      e.preventDefault();
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  // a saved review has no candidates in memory: fetch the selected year's when it is looked at
  useEffect(() => {
    if (cur === null || cur < 2015 || !rowsRef.current[cur] || rowsRef.current[cur]!.cands.length) return; // Sentinel-2 starts in 2015
    const y = cur;
    api.candidates(g.id, y).then((r) => { if (rowsRef.current[y]) set(y, { cands: r.candidates.map((c) => ({ sensor: 'sentinel-2', ...c })) }); }).catch(() => {});
  }, [cur]);
  // keep the card and the alternatives under it in view: the card first, then the panel so that it is fully visible
  useEffect(() => { grid.current?.querySelector<HTMLElement>('.cur')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); const t = setTimeout(() => panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 120); return () => clearTimeout(t); }, [cur]);

  const reviewed = years.filter((y) => rows[y]!.status !== 'auto').length;
  // the next best scenes for the year under the cursor, by the same ranking that made the first pick; the one already chosen is left out
  const ranked: Ranked[] = useMemo(() => {
    if (cur === null || !rows[cur]) return [];
    const r = rows[cur]!, mine = r.chosen ? `${r.chosen.sensor}:${r.chosen.date}:${r.chosen.orbit ?? ''}` : '';
    return rankScenes(r.cands, cur, by, rule, r.discarded).filter((x) => sceneKey(x.scene) !== mine);
  }, [cur, rows]);
  const shownAlts = ranked.slice(0, more);
  const altSrc = (c: Ranked['scene']) => (cur === null ? '' : imageOf(g.id, cur, asRef(c)));
  const altLoading = shownAlts.filter((a) => !loaded.has(altSrc(a.scene))).length;
  const altsRef = useRef<Ranked[]>([]);
  altsRef.current = shownAlts;

  // the next best scenes open right under the row of the selected card, inside the grid, so nothing has to be scrolled to
  const altPanel = cur !== null && rows[cur] ? (
    <div class="altrow" key="alts" ref={panelRef}>
      <div class="cardx altcard">
            <h4>Next best scenes for {cur}</h4>
            {altLoading > 0 && <div class="altload" role="status"><span class="spin" /> Loading {altLoading} of {shownAlts.length} pictures…<i><b style={`width:${Math.round(100 * (shownAlts.length - altLoading) / shownAlts.length)}%`} /></i></div>}
            {rows[cur]!.cands.length === 0 && <p class="note">{cur < 2015 || rows[cur]!.chosen?.sensor.startsWith('landsat') ? 'Alternatives are listed for Sentinel-2 years only for now: a Landsat picture is not rendered until its scene is chosen, so there is nothing to show yet.' : 'Loading the other scenes…'}</p>}
            <div class="altgrid">
              {shownAlts.map((a, k) => {
                const c = a.scene, ref = asRef(c), src = imageOf(g.id, cur, ref);
                return (
                  <button type="button" class={'alt ' + a.tier} key={sceneKey(c)} onClick={() => swap(cur, c)}>
                    <span class="th"><img loading="lazy" alt="" src={src} onLoad={() => setLoaded((l) => new Set(l).add(src))} onError={() => setLoaded((l) => new Set(l).add(src))} />{!loaded.has(src) && <span class="spin big" />}<span class="no">{k + 1}</span>{zoom(`${fmt(c.date)} ${c.orbit ?? ''}`, src, capOf(cur, ref))}</span>
                    <span class="meta"><b>{fmt(c.date)}</b> {c.orbit}<span class={'tier ' + a.tier}>{a.tier === 'clear' ? 'clear' : a.tier === 'fallback' ? 'some cloud or snow' : 'cloudy'}</span>
                      <span class="bars"><span>cloud</span><i><b style={`width:${Math.min(100, c.cloud * 400)}%;background:${c.cloud > rule.maxCloud ? '#C8322A' : '#2D6E8E'}`} /></i><span>snow</span><i><b style={`width:${Math.min(100, c.snow * 200)}%;background:${c.snow > rule.maxSnow ? '#F2A93B' : '#9DB3BF'}`} /></i></span>
                    </span>
                  </button>
                );
              })}
            </div>
            {ranked.length > 0 && (
              <p style="margin:10px 0 0;display:flex;gap:12px;align-items:center">
                {more < ranked.length && <button type="button" class="btn line" style="padding:8px 14px" onClick={() => setMore(more + 3)}>Next best 3</button>}
                <span class="note" style="margin:0">Showing {Math.min(more, ranked.length)} of {ranked.length} other scenes in the window, best first. Click one to take it (it is then pinned).</span>
              </p>
            )}
            {rows[cur]!.cands.length > 0 && ranked.length === 0 && <p class="note">No other scene in the window.</p>}
            {rows[cur]!.discarded.length > 0 && <p class="note">Discarded for {cur}: {rows[cur]!.discarded.length}. They stay listed so a re-score never brings them back.</p>}
          </div>
    </div>
  ) : null;

  return (
    <div>
      {marginYears.length > 0 && (
        <div class="warn" style="margin:12px 24px 0"><b>{marginYears.join(', ')} cannot be confirmed yet.</b> Its picture is allowed below 100 % coverage because all the missing data lies far from the glacier, but the scene rule you confirmed has no such margin. Add it in the scene rule, confirm that step again, and this review stays as it is.
          <div style="margin-top:8px"><button type="button" class="btn" style="display:inline-flex;padding:7px 14px" onClick={() => go(`/onboard/${st.region.id}/${g.id}/glacier.season`)}>Open the balance year and scene rule</button></div></div>
      )}
      {s2Problem && <div class="warn" style="margin:12px 24px 0"><b>The Sentinel-2 pictures cannot be loaded.</b> {s2Problem} Run <code>npm run credentials</code> in the project folder: it asks for your Copernicus client id and secret, checks them, and saves them. No restart is needed. The Landsat pictures come from local files and are not affected.</div>}
      {unconfirmedSeason && <div class="warn" style="margin:12px 24px 0">The balance year and scene rule are only proposed so far. You can look at the scenes now, but confirming this step waits for that one.</div>}
      <div class="keys">
        <button type="button" class="btn" style="padding:7px 14px" disabled={!!busy} onClick={load}>{busy ?? (years.length ? 'Score again' : 'Score the scenes')}</button>
        {years.length > 0 && <><span><b style="color:var(--rock)">{reviewed}</b> of {years.length} reviewed</span><span><kbd>←</kbd><kbd>→</kbd>move</span><span><kbd>A</kbd>approve</span><span><kbd>D</kbd>discard, next best</span><span><kbd>Space</kbd>enlarge the selected picture</span><span><kbd>N</kbd>no usable picture</span><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd>take a next-best scene</span></>}
      </div>
      {err && <div class="warn" style="margin:16px 24px">{err}{/credential|account|502/i.test(err) ? ' Run `npm run credentials` in the project folder: it asks for your Copernicus client id and secret and checks them.' : ''}</div>}
      {years.length === 0 && !err && <div class="wz-pad"><div class="cardx"><h4>Nothing scored yet</h4><p style="margin:0">Scoring asks Copernicus for the scenes of every year from 2016 to {lastYear} over this glacier's picture box and picks the best one per year by the rule you confirmed. Then you look at every one.</p></div></div>}
      <div class="sheet" ref={grid}>
        {years.flatMap((y, idx) => {
          const r = rows[y]!, c = r.chosen;
          const card = (
            <div key={y} class={'sc' + (cur === y ? ' cur' : '')} tabIndex={0} onClick={() => setCur(y)} onFocus={() => setCur(y)}>
              <div class="th">
                {c && !failed.has(y) ? <img loading="lazy" alt={`${g.name} ${y}`} src={imageOf(g.id, y, c)} onError={() => setFailed((f) => new Set(f).add(y))} /> : <div class="none">{c ? 'Picture cannot be loaded' : 'No usable picture'}</div>}
                <span class="yr">{y}</span>
                {c && !failed.has(y) && zoom(String(y), imageOf(g.id, y, c), capOf(y, c))}
              </div>
              <div class="meta">
                <span class={'chip ' + r.status}>{r.status === 'auto' ? 'to review' : r.status}</span> {c && <b>{fmt(c.date)}</b>} {c && <span>{SENSOR[c.sensor]}{c.orbit ? ` ${c.orbit}` : ''}</span>}
                {r.note && <div class="note" style="margin:4px 0 0;font-size:11px" title={r.note}>{r.note.length > 70 ? r.note.slice(0, 68) + '…' : r.note}</div>}
                {c && (
                  <div class="bars">
                    <span>cloud</span><i><b style={`width:${Math.min(100, (c.cloud ?? 0) * 100 * 4)}%;background:${(c.cloud ?? 0) > rule.maxCloud ? '#C8322A' : '#2D6E8E'}`} /></i>
                    <span>snow</span><i><b style={`width:${Math.min(100, (c.snow ?? 0) * 100 * 2)}%;background:${(c.snow ?? 0) > rule.maxSnow ? '#F2A93B' : '#9DB3BF'}`} /></i>
                  </div>
                )}
                {cur === y && (
                  <div style="display:flex;gap:6px;margin-top:8px">
                    <button type="button" class="chip approved" onClick={(e) => { e.stopPropagation(); approve(y); }}>Approve</button>
                    <button type="button" class="chip" onClick={(e) => { e.stopPropagation(); discard(y); }}>Discard</button>
                    <button type="button" class="chip" onClick={(e) => { e.stopPropagation(); none(y); }}>None</button>
                  </div>
                )}
              </div>
            </div>
          );
          const at = cur === null ? -1 : years.indexOf(cur), last = Math.min(years.length - 1, (Math.floor(at / cols) + 1) * cols - 1);
          return idx === last && altPanel ? [card, altPanel] : [card];
        })}
      </div>
      {peek && cur !== null && rows[cur] && (() => {
        const c = rows[cur]!.chosen, size = Math.min(760, innerHeight - 150);
        return (
          <div class="hovercard peek" role="dialog" aria-label={`The picture of ${cur}, enlarged`} style={`width:${size}px;left:${(innerWidth - size) / 2}px;top:${Math.max(12, (innerHeight - size - 80) / 2)}px`}>
            {c && !failed.has(cur) ? <img src={imageOf(g.id, cur, c)} alt="" style={`width:${size}px;height:${size}px`} /> : <div style={`width:${size}px;height:${size}px;display:grid;place-items:center;color:#fff`}>{c ? 'The picture cannot be loaded' : 'No usable picture for this year'}</div>}
            <div class="cap">{c ? capOf(cur, c) : String(cur)}<span class="peekkeys">Space or Esc closes · ← → other years</span></div>
          </div>
        );
      })()}
      {hover && (() => {
        const size = Math.min(640, innerHeight - 90), right = hover.x + 28 + size <= innerWidth;
        const left = right ? hover.x + 28 : Math.max(8, hover.x - 28 - size), top = Math.max(8, Math.min(hover.top - size / 2, innerHeight - size - 56));
        return (
          <div class="hovercard" style={`left:${left}px;top:${top}px;width:${size}px`} aria-hidden="true">
            <img src={hover.src} alt="" style={`width:${size}px;height:${size}px`} />
            <div class="cap">{hover.cap}</div>
          </div>
        );
      })()}
    </div>
  );
}
