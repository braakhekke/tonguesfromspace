import { describe, expect, it } from 'vitest';
import { balanceYearEnd, pickScene, pickYears, rankScenes, sceneWindow, yearOfScene, type Candidate } from '../../shared/season';
import type { BalanceYear, SceneRule } from '../../shared/schema';

const north: BalanceYear = { start: '10-01', end: '09-30', label: 'ends-in', source: 'test' };
const rule: SceneRule = {
  daysBeforeEnd: 60, daysAfterEnd: 10, maxCloud: 0.05, maxCloudTongue: 0.01, maxSnow: 0.2,
  fallbackCloud: 0.3, minCoverage: 1, oneOrbit: false, note: 'test',
};
const c = (date: string, o: Partial<Candidate> = {}): Candidate => ({
  sensor: 'sentinel-2', date, orbit: 'R108', cloud: 0, snow: 0, coverage: 1, ...o,
});

describe('balance year', () => {
  it('ends on 30 Sep of the year it is named after (north)', () => {
    expect(balanceYearEnd(north, 2017)).toBe('2017-09-30');
  });
  it('southern year that starts in the labelled year ends in the next calendar year', () => {
    const south: BalanceYear = { start: '04-01', end: '03-31', label: 'starts-in', source: 'test' };
    expect(balanceYearEnd(south, 2016)).toBe('2017-03-31');
  });
  it('southern year labelled by the year it ends in', () => {
    const south: BalanceYear = { start: '04-01', end: '03-31', label: 'ends-in', source: 'test' };
    expect(balanceYearEnd(south, 2017)).toBe('2017-03-31');
  });
});

describe('a picture belongs to the balance year it closes', () => {
  it('30 Sep 2016 is 2016', () => expect(yearOfScene('2016-09-30', north, rule)).toBe(2016));
  it('1 Oct 2016 is still 2016 (closes the year that ended the day before)', () => expect(yearOfScene('2016-10-01', north, rule)).toBe(2016));
  it('5 Oct 2016 is 2016, never 2017', () => expect(yearOfScene('2016-10-05', north, rule)).toBe(2016));
  it('the last allowed day (10 Oct) is 2016', () => expect(yearOfScene('2016-10-10', north, rule)).toBe(2016));
  it('the day after the window is no year', () => expect(yearOfScene('2016-10-11', north, rule)).toBeNull());
  it('the first allowed day is 60 days before the end', () => {
    expect(sceneWindow(north, rule, 2016).from).toBe('2016-08-01');
    expect(yearOfScene('2016-08-01', north, rule)).toBe(2016);
    expect(yearOfScene('2016-07-31', north, rule)).toBeNull();
  });
  it('the next year does not claim a day of this one', () => {
    expect(yearOfScene('2017-08-01', north, rule)).toBe(2017);
  });
});

describe('100 % of the picture box must be covered', () => {
  it('a scene that covers 99.9 % of the box is never picked, however clear it is', () => {
    expect(pickScene([c('2016-09-29', { coverage: 0.999 })], 2016, north, rule)).toBeNull();
  });
  it('a clear scene with full coverage beats a clearer one that covers less', () => {
    expect(pickScene([c('2016-09-29', { coverage: 0.97 }), c('2016-09-10', { cloud: 0.04 })], 2016, north, rule)?.scene.date).toBe('2016-09-10');
  });
  it('the rule itself cannot be loosened: the schema refuses a minCoverage below 1', async () => {
    const { SceneRule } = await import('../../shared/schema');
    expect(SceneRule.safeParse({ ...rule, minCoverage: 0.95 }).success).toBe(false);
    expect(SceneRule.safeParse(rule).success).toBe(true);
  });
});

describe('pickScene', () => {
  it('prefers the clear scene nearest the end of the year', () => {
    const p = pickScene([c('2016-08-20'), c('2016-09-25'), c('2016-09-10')], 2016, north, rule)!;
    expect(p.scene.date).toBe('2016-09-25');
    expect(p.clear).toBe(true);
  });
  it('a scene of 5 Oct counts for 2016 and not for 2017', () => {
    expect(pickScene([c('2016-10-05')], 2016, north, rule)?.scene.date).toBe('2016-10-05');
    expect(pickScene([c('2016-10-05')], 2017, north, rule)).toBeNull();
  });
  it('skips snowy and cloudy scenes when a clear one exists', () => {
    const p = pickScene([c('2016-09-29', { snow: 0.5 }), c('2016-09-01', { cloud: 0.2 }), c('2016-09-05')], 2016, north, rule)!;
    expect(p.scene.date).toBe('2016-09-05');
  });
  it('falls back to the least cloudy, marked not clear', () => {
    const p = pickScene([c('2016-09-29', { cloud: 0.25 }), c('2016-09-01', { cloud: 0.1 })], 2016, north, rule)!;
    expect(p.scene.date).toBe('2016-09-01');
    expect(p.clear).toBe(false);
  });
  it('returns null when nothing is usable', () => {
    expect(pickScene([c('2016-09-29', { cloud: 0.9 })], 2016, north, rule)).toBeNull();
    expect(pickScene([c('2016-09-29', { coverage: 0.5 })], 2016, north, rule)).toBeNull();
  });
  it('never returns a discarded scene', () => {
    const list = [c('2016-09-29'), c('2016-09-20')];
    expect(pickScene(list, 2016, north, rule, ['sentinel-2:2016-09-29:R108'])?.scene.date).toBe('2016-09-20');
  });
  it('tongue cloud blocks a scene from counting as clear', () => {
    const p = pickScene([c('2016-09-29', { cloudTongue: 0.3 }), c('2016-09-10')], 2016, north, rule)!;
    expect(p.scene.date).toBe('2016-09-10');
  });
});

describe('pickYears with one orbit', () => {
  const r = { ...rule, oneOrbit: true };
  it('chooses the orbit that serves most years and reports the years that stay off', () => {
    const all = [
      c('2016-09-28', { orbit: 'R108' }), c('2016-09-29', { orbit: 'R065', cloud: 0.01 }),
      c('2017-09-28', { orbit: 'R108' }), c('2018-09-28', { orbit: 'R065' }),
    ];
    const out = pickYears(all, [2016, 2017, 2018], north, r);
    expect(out.orbit).toBe('R108');
    expect(out.picks[2016]?.scene.orbit).toBe('R108');
    expect(out.picks[2018]?.scene.orbit).toBe('R065');
    expect(out.off).toEqual([2018]);
  });
});

describe('rankScenes: the next best scenes, best first', () => {
  const list = [
    c('2016-08-10', { cloud: 0.2 }),                 // fallback
    c('2016-09-25'),                                  // clear, nearest the year end
    c('2016-09-10'),                                  // clear
    c('2016-10-05', { snow: 0.4, cloud: 0.02 }),      // snowy: not clear, little cloud: fallback, the best of those
    c('2016-09-01', { cloud: 0.6 }),                  // cloudy
    c('2016-09-02', { coverage: 0.9 }),               // does not cover the box: never listed
    c('2015-09-20'),                                  // another balance year: never listed
  ];
  it('clear scenes first by closeness to the year end, then the least cloudy of the rest, then the cloudy ones', () => {
    expect(rankScenes(list, 2016, north, rule).map((r) => `${r.scene.date} ${r.tier}`)).toEqual([
      '2016-09-25 clear', '2016-09-10 clear', '2016-10-05 fallback', '2016-08-10 fallback', '2016-09-01 cloudy',
    ]);
  });
  it('the pick is the first of the ranking, and nothing when only cloudy scenes are left', () => {
    expect(pickScene(list, 2016, north, rule)?.scene.date).toBe('2016-09-25');
    expect(pickScene([c('2016-09-01', { cloud: 0.6 })], 2016, north, rule)).toBeNull();
  });
  it('discarded scenes are not offered again', () => {
    expect(rankScenes(list, 2016, north, rule, ['sentinel-2:2016-09-25:R108'])[0]!.scene.date).toBe('2016-09-10');
  });
});
