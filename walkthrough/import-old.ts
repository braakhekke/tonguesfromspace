/**
 * One-off, at the owner's request: take a glacier's scenes exactly as the previous site had them.
 * Reads the previous repo's data/scenes.json (Sentinel-2 picks, hand-chosen in its scene picker) and data/landsat/<id>.json
 * (Landsat scenes) and writes PROPOSALS for the scene review and for the season window. The Landsat pictures go into
 * .cache/landsat so they can be looked at while reviewing. Nothing is confirmed here.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCtx } from './engine';
import { writeProposal } from './proposals';
import { ROOT } from './data';

type OldPick = { date: string; orbit: string; relaxed?: boolean };
type OldLandsat = { date: string; id: string; sat: string; cloud: number; snow: number; cover: number };

const daysBetween = (a: string, b: string) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5);

export function importOldScenes(region: string, glacier: string, oldRepo: string, oldKey: string, oldLandsatId: string, outsideGlacier: number[] = []) {
  loadCtx(region, glacier);
  const sc = JSON.parse(readFileSync(join(oldRepo, 'data/scenes.json'), 'utf8')).glaciers?.[oldKey] as { picks: Record<string, OldPick>; savedAt?: string } | undefined;
  if (!sc) throw new Error(`No scenes for "${oldKey}" in ${oldRepo}/data/scenes.json`);
  const lsFile = join(oldRepo, 'data/landsat', oldLandsatId + '.json');
  const ls = existsSync(lsFile) ? (JSON.parse(readFileSync(lsFile, 'utf8')).scenes as Record<string, OldLandsat>) : {};

  const years: Record<string, unknown> = {};
  for (const [y, v] of Object.entries(ls))
    years[y] = { chosen: { sensor: v.sat, date: v.date, id: v.id, cloud: v.cloud, snow: v.snow, coverage: v.cover, ...(v.sat === 'landsat-7' && v.date >= '2003-06-01' ? { gaps: 'slc-off' } : outsideGlacier.includes(Number(y)) ? { gaps: 'outside-glacier' } : {}) }, status: 'auto', discarded: [], note: 'Landsat scene as chosen by the previous site\'s script (its season rules); not looked at by a person yet.' };
  for (const [y, v] of Object.entries(sc.picks))
    years[y] = { chosen: { sensor: 'sentinel-2', date: v.date, orbit: v.orbit }, status: 'pinned', discarded: [], note: `Hand-chosen in the previous site's scene picker${sc.savedAt ? ` (saved ${sc.savedAt.slice(0, 10)})` : ''}${v.relaxed ? '; marked "relaxed": accepted although outside its usual limits' : ''}.` };

  // the smallest window around the end of each balance year (30 Sep) that holds every one of these scenes
  let before = 0, after = 0;
  for (const [y, v] of Object.entries(years)) { const d = (v as any).chosen.date as string; const e = daysBetween(`${y}-09-30`, d); before = Math.max(before, e); after = Math.max(after, -e); }

  writeProposal(region, glacier, 'glacier.scenes', 'import-old-scenes', `${Object.keys(years).length} scenes exactly as the previous site had them: ${Object.keys(ls).length} Landsat (to review) and ${Object.keys(sc.picks).length} Sentinel-2 (hand-chosen there, so pinned).`, { years });
  writeProposal(region, glacier, 'glacier.season', 'import-old-scenes', `The smallest window that holds every scene of the previous site: ${before} days before the end of the balance year to ${after} days after. Limits are that site's own (5 % cloud, 30 % fallback, one orbit); coverage of the picture box is 100 %, a requirement. Say where the balance-year dates come from.`, {
    balanceYear: { start: '10-01', end: '09-30', label: 'ends-in', source: '' },
    sceneRule: { daysBeforeEnd: before, daysAfterEnd: after, maxCloud: 0.05, maxCloudTongue: 0.01, maxSnow: 1, fallbackCloud: 0.3, minCoverage: 1, noDataMarginM: 1000, oneOrbit: true, note: `Window fitted to the ${Object.keys(years).length} scenes of the previous site. It ranked by least snow and had no snow limit, so maxSnow is 1.` },
  });

  let copied = 0;
  const dst = join(process.env.TFS_CACHE ?? join(ROOT, '.cache'), 'landsat', glacier);
  mkdirSync(dst, { recursive: true });
  for (const y of Object.keys(ls)) { const f = join(oldRepo, 'data/landsat', oldLandsatId, `${y}.jpg`); if (existsSync(f)) { copyFileSync(f, join(dst, `${y}.jpg`)); copied++; } }
  return { scenes: Object.keys(years).length, landsat: Object.keys(ls).length, sentinel: Object.keys(sc.picks).length, before, after, pictures: copied };
}
