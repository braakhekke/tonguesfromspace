/** The timeline of the season screen: calendar dates on the axis, and years named in compact ranges. */

const DAY = 86_400_000;
const at = (iso: string, off: number) => new Date(Date.parse(iso + 'T00:00:00Z') + off * DAY);
export const fmtDay = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export type Tick = { off: number; label: string; end: boolean };

/** Tick marks as dates (1st and 15th of each month, and the year end), for offsets from -from to +to days around `end`. A tick within 3 days of the year end is left out so the year end label stays readable. */
export function axisTicks(end: string, from: number, to: number): Tick[] {
  const out: Tick[] = [];
  for (let off = from; off <= to; off++) {
    const d = at(end, off), day = d.getUTCDate();
    if (off === 0) out.push({ off, label: fmtDay(d), end: true });
    else if (Math.abs(off) > 3 && (day === 1 || day === 15)) out.push({ off, label: fmtDay(d), end: false }); // not next to the year end, whose label would be run over
  }
  return out;
}

/** [1980, 1981, 1982, 1985] -> "1980–1982, 1985" */
export function ranges(years: number[]): string {
  const ys = [...new Set(years)].sort((a, b) => a - b), out: string[] = [];
  for (let i = 0; i < ys.length; ) {
    let j = i;
    while (j + 1 < ys.length && ys[j + 1] === ys[j]! + 1) j++;
    out.push(j - i >= 1 ? `${ys[i]}–${ys[j]}` : String(ys[i]));
    i = j + 1;
  }
  return out.join(', ');
}

import { sceneWindow } from '../../shared/season';
import type { BalanceYear, SceneRule } from '../../shared/schema';

/**
 * The days a scan of one balance year looks at: that year's scene window (days before and after ITS OWN year end, from the rule),
 * widened by `margin` days if asked, and never into the future. null when the window has not opened yet.
 */
export function scanRange(by: BalanceYear, rule: Pick<SceneRule, 'daysBeforeEnd' | 'daysAfterEnd'>, year: number, margin: number, today: string): { from: string; to: string } | null {
  const w = sceneWindow(by, rule, year);
  const from = isoAt(w.from, -margin), to = isoAt(w.to, margin);
  if (from > today) return null;
  return { from, to: to > today ? today : to };
}

/** Days between two ISO days, a minus b. */
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / DAY);
export const isoAt = (iso: string, off: number) => at(iso, off).toISOString().slice(0, 10);

/** "Landsat 5 · 2 Sept" or "Sentinel-2 R108 · 12 Sept": which satellite (and orbit) and which day a picture is from. */
export function sceneLabel(c: { sensor: string; date: string; orbit?: string }): string {
  const sat = c.sensor === 'sentinel-2' ? 'Sentinel-2' : 'Landsat ' + c.sensor.slice(8);
  return `${sat}${c.orbit ? ' ' + c.orbit : ''} · ${fmtDay(new Date(c.date + 'T00:00:00Z'))}`;
}
