/**
 * Reads and validates every data file under data/. The ONE loader: the build, the Worker index,
 * the onboarding CLI and the wizard server all call this, so they can never disagree about what is valid.
 */
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { Glacier, Region, ScenesFile } from '../shared/schema';

export const ROOT = join(import.meta.dirname, '..');
/** Read at call time, so tests and fixture builds can point at another folder with TFS_DATA / TFS_GENERATED. */
export const dataRoot = () => process.env.TFS_DATA ?? join(ROOT, 'data', 'regions');
/** Redirect rules for links of the previous site: data, not code. Sits next to regions/. */
export const legacyFile = () => join(dataRoot(), '..', 'legacy.json');
export const generatedRoot = () => process.env.TFS_GENERATED ?? join(ROOT, 'generated');

export type Loaded = {
  regions: { region: Region; glaciers: { glacier: Glacier; scenes: ScenesFile | null }[] }[];
  problems: string[];
  /** glaciers whose record step is not confirmed yet: listed, never published, never cross-checked */
  drafts: string[];
};

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const dirs = (p: string) => (existsSync(p) ? readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : []);

export const glacierFile = (region: string, glacier: string) => join(dataRoot(), region, glacier, 'glacier.json');
export const scenesFile = (region: string, glacier: string) => join(dataRoot(), region, glacier, 'scenes.json');
export const outlinesFile = (region: string, glacier: string) => join(dataRoot(), region, glacier, 'outlines.json');
export const regionFile = (region: string) => join(dataRoot(), region, 'region.json');

export function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}

export function loadAll(): Loaded {
  const problems: string[] = [];
  const drafts: string[] = [];
  const out: Loaded['regions'] = [];
  const fail = (where: string, e: unknown) =>
    problems.push(`${where}: ${(e as any)?.issues ? (e as any).issues.map((i: any) => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ') : String(e)}`);
  const ids = new Set<string>();
  for (const rid of dirs(dataRoot())) {
    const rf = regionFile(rid);
    if (!existsSync(rf)) { problems.push(`${rid}: region.json missing`); continue; }
    const parsed = Region.safeParse(readJson(rf));
    if (!parsed.success) { fail(`${rid}/region.json`, parsed.error); continue; }
    const region = parsed.data;
    if (region.id !== rid) problems.push(`${rid}/region.json: id "${region.id}" must equal the folder name`);
    const sourceIds = new Set([...region.sources, ...(region.layerSources ?? [])].map((s) => s.id));
    const glaciers: Loaded['regions'][number]['glaciers'] = [];
    const ranks = new Set<string>();
    for (const gid of dirs(join(dataRoot(), rid))) {
      const gf = glacierFile(rid, gid);
      if (!existsSync(gf)) { problems.push(`${rid}/${gid}: glacier.json missing`); continue; }
      const gp = Glacier.safeParse(readJson(gf));
      if (!gp.success) { fail(`${rid}/${gid}/glacier.json`, gp.error); continue; }
      const glacier = gp.data;
      const where = `${rid}/${gid}`;
      if (!glacier.recordConfirmation && !glacier.imported) { drafts.push(where); continue; }      // an imported record is published as it is; it shows as "proposed" in the walkthrough until a person confirms it
      if (glacier.id !== gid) problems.push(`${where}: id "${glacier.id}" must equal the folder name`);
      if (glacier.region !== rid) problems.push(`${where}: region "${glacier.region}" must equal the folder name`);
      if (ids.has(glacier.id)) problems.push(`${where}: id is used twice (ids are global: they are the URL)`);
      ids.add(glacier.id);
      const rankKey = `${glacier.parent ?? ''}#${glacier.rank}`;      // outlets are ranked within their ice cap
      if (ranks.has(rankKey)) problems.push(`${where}: rank ${glacier.rank} is used twice in ${glacier.parent ? `the outlets of ${glacier.parent}` : rid}`);
      ranks.add(rankKey);
      if (!sourceIds.has(glacier.areaSource)) problems.push(`${where}: areaSource "${glacier.areaSource}" is not a source of region ${rid}`);
      for (const c of glacier.credits ?? []) if (!sourceIds.has(c)) problems.push(`${where}: credit "${c}" is not a source of region ${rid}`);
      for (const [layer, st] of Object.entries(glacier.layers ?? {}))
        if (st.state === 'enabled' && !sourceIds.has(st.provider)) problems.push(`${where}: layer ${layer} provider "${st.provider}" is not a source of region ${rid}`);
      let scenes: ScenesFile | null = null;
      const sf = scenesFile(rid, gid);
      if (existsSync(sf)) {
        const sp = ScenesFile.safeParse(readJson(sf));
        if (sp.success) scenes = sp.data; else fail(`${where}/scenes.json`, sp.error);
      }
      glaciers.push({ glacier, scenes });
    }
    glaciers.sort((a, b) => a.glacier.rank - b.glacier.rank);
    if (region.status === 'live' && glaciers.length === 0) problems.push(`${rid}: status is live but there are no glaciers`);
    out.push({ region, glaciers });
  }
  return { regions: out, problems, drafts };
}
