/**
 * Balance years and scene choice. The ONE place that decides which year a picture belongs to.
 * Used by the page (scene search), the Worker (request validation) and the onboarding CLI.
 *
 * A picture belongs to the balance year it CLOSES: with a year of 1 Oct to 30 Sep and a window
 * of 10 days after the end, a scene of 5 Oct 2016 is the picture of 2016, never of 2017.
 * All dates are UTC days as 'YYYY-MM-DD'.
 */
import type { BalanceYear, SceneRule } from './schema';

const DAY_MS = 86_400_000;
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const md = (s: string): [number, number] => [Number(s.slice(0, 2)), Number(s.slice(3, 5))];
const utc = (y: number, m: number, d: number) => iso(Date.UTC(y, m - 1, d));

/** The last day of the balance year labelled `year`. */
export function balanceYearEnd(by: BalanceYear, year: number): string {
  const [em, ed] = md(by.end);
  if (by.label === 'ends-in') return utc(year, em, ed);
  // 'starts-in': the year starts in `year`; it ends on the first occurrence of `end` after its start
  const [sm, sd] = md(by.start);
  const endsNextYear = em < sm || (em === sm && ed < sd);
  return utc(endsNextYear ? year + 1 : year, em, ed);
}

/** The day the yearly picture should be as close to as snow and cloud allow. */
export const targetDate = balanceYearEnd;

/** First and last allowed day (inclusive) of the scene search of a balance year. */
export function sceneWindow(by: BalanceYear, rule: Pick<SceneRule, 'daysBeforeEnd' | 'daysAfterEnd'>, year: number) {
  const end = ms(balanceYearEnd(by, year));
  return { from: iso(end - rule.daysBeforeEnd * DAY_MS), to: iso(end + rule.daysAfterEnd * DAY_MS), target: iso(end) };
}

/** Which balance year does a scene of this day stand for? null if it lies in no year's window. */
export function yearOfScene(date: string, by: BalanceYear, rule: Pick<SceneRule, 'daysBeforeEnd' | 'daysAfterEnd'>): number | null {
  const y = Number(date.slice(0, 4));
  for (const cand of [y - 1, y, y + 1]) {
    const w = sceneWindow(by, rule, cand);
    if (date >= w.from && date <= w.to) return cand;
  }
  return null;
}

export type Candidate = {
  sensor: string;
  date: string;
  orbit?: string;
  id?: string;
  cloud: number;
  snow: number;
  coverage: number;
  cloudTongue?: number;
};

export type Chosen = { scene: Candidate; clear: boolean };

const away = (c: Candidate, target: string) => Math.abs(ms(c.date) - ms(target));

export type Tier = 'clear' | 'fallback' | 'cloudy';
export type Ranked = { scene: Candidate; tier: Tier };

/**
 * Every usable scene of one balance year, best first. Clear scenes (cloud, snow, tongue cloud within limits) come first, the one nearest
 * the end of the year leading, then less cloud; then the least cloudy up to `fallbackCloud`; then the rest by cloud, so a person can
 * still choose one. Candidates outside the window or the coverage limit never count, and discarded ids (from scenes.json) are skipped.
 */
export function rankScenes(candidates: Candidate[], year: number, by: BalanceYear, rule: SceneRule, discarded: readonly string[] = []): Ranked[] {
  const w = sceneWindow(by, rule, year);
  const key = (c: Candidate) => `${c.sensor}:${c.date}:${c.orbit ?? ''}`;
  const usable = candidates.filter(
    (c) => c.date >= w.from && c.date <= w.to && c.coverage >= rule.minCoverage - 1e-9 && !discarded.includes(key(c)),
  );
  const isClear = (c: Candidate) => c.cloud <= rule.maxCloud && c.snow <= rule.maxSnow && (c.cloudTongue ?? 0) <= rule.maxCloudTongue;
  const clear = usable.filter(isClear).sort((a, b) => away(a, w.target) - away(b, w.target) || a.cloud - b.cloud);
  const rest = usable.filter((c) => !isClear(c));
  const fallback = rest.filter((c) => c.cloud <= rule.fallbackCloud).sort((a, b) => a.cloud - b.cloud || away(a, w.target) - away(b, w.target));
  const cloudy = rest.filter((c) => c.cloud > rule.fallbackCloud).sort((a, b) => a.cloud - b.cloud || away(a, w.target) - away(b, w.target));
  return [...clear.map((scene) => ({ scene, tier: 'clear' as const })), ...fallback.map((scene) => ({ scene, tier: 'fallback' as const })), ...cloudy.map((scene) => ({ scene, tier: 'cloudy' as const }))];
}

/** The best scene of one balance year: the first of the ranking, unless it is cloudier than the fallback limit. */
export function pickScene(candidates: Candidate[], year: number, by: BalanceYear, rule: SceneRule, discarded: readonly string[] = []): Chosen | null {
  const first = rankScenes(candidates, year, by, rule, discarded)[0];
  return first && first.tier !== 'cloudy' ? { scene: first.scene, clear: first.tier === 'clear' } : null;
}

export const sceneKey = (c: Pick<Candidate, 'sensor' | 'date' | 'orbit'>) => `${c.sensor}:${c.date}:${c.orbit ?? ''}`;

/**
 * Pick every year at once. With `oneOrbit`, the orbit that gives a usable scene in most years wins
 * (ties: less total cloud); years it cannot serve keep their own best scene and are reported in `off`.
 */
export function pickYears(
  all: Candidate[],
  years: number[],
  by: BalanceYear,
  rule: SceneRule,
  discarded: Record<number, readonly string[]> = {},
): { picks: Record<number, Chosen | null>; orbit: string | null; off: number[] } {
  const own = (y: number, list = all) => pickScene(list, y, by, rule, discarded[y] ?? []);
  const picks: Record<number, Chosen | null> = {};
  for (const y of years) picks[y] = own(y);
  if (!rule.oneOrbit) return { picks, orbit: null, off: [] };
  const orbits = [...new Set(all.map((c) => c.orbit).filter((o): o is string => !!o))];
  const score = (o: string) => {
    const got = years.map((y) => own(y, all.filter((c) => c.orbit === o))).filter((p): p is Chosen => !!p);
    return { o, n: got.length, cloud: got.reduce((a, p) => a + p.scene.cloud, 0) };
  };
  const best = orbits.map(score).sort((a, b) => b.n - a.n || a.cloud - b.cloud)[0];
  if (!best) return { picks, orbit: null, off: [] };
  const off: number[] = [];
  for (const y of years) {
    const mine = own(y, all.filter((c) => c.orbit === best.o));
    if (mine) picks[y] = mine;
    else if (picks[y]) off.push(y);
  }
  return { picks, orbit: best.o, off };
}
