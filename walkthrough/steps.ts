/**
 * The walkthrough as data. Each step says what it produces, what it needs, what to look at and how it is checked.
 * Nothing here is stored as "progress": status is DERIVED from the data files (see engine.ts).
 */
import { Glacier, LAYERS, OutlinesFile, Region, ScenesFile, type Confirmation, type Source } from '../shared/schema';
import { areaKm2, boxAreaKm2 } from '../shared/geo';
import { yearOfScene } from '../shared/season';

export type Ctx = { region: Region; glacier: Glacier | null; scenes: ScenesFile | null; outlines: OutlinesFile | null };
export type Patch = Record<string, unknown>;
export type Screen = 'region' | 'record' | 'outline' | 'placement' | 'season' | 'scenes' | 'layers' | 'elevation' | 'strip' | 'later';

export type StepDef = {
  id: string;
  phase: 1 | 2 | 3 | 4;
  scope: 'region' | 'glacier';
  title: string;
  /** one sentence: why this step exists and what depends on it */
  why: string;
  /** what the person should look at before confirming */
  look: string[];
  needs: string[];
  screen: Screen;
  implemented: boolean;
  /** what the step produced, without its confirmation; undefined = nothing yet */
  outputs(c: Ctx): unknown | undefined;
  confirmation(c: Ctx): Confirmation | undefined;
  /** automatic checks on the outputs */
  problems(c: Ctx): string[];
  /** put a patch and a confirmation into a copy of the context */
  apply(c: Ctx, patch: Patch, conf: Confirmation): Ctx;
};

const pick = <T extends object, K extends keyof T>(o: T | null | undefined, ...k: K[]) => {
  if (!o) return undefined;
  const out: Partial<T> = {};
  for (const key of k) if (o[key] !== undefined) out[key] = o[key];
  return Object.keys(out).length ? out : undefined;
};

const later = (id: string, phase: 2 | 3 | 4, title: string, why: string, needs: string[]): StepDef => ({
  id, phase, scope: 'glacier', title, why, look: [], needs, screen: 'later', implemented: false,
  outputs: () => undefined, confirmation: () => undefined,
  problems: () => ['This step is specified in docs/SPEC.md but its screen is not built yet.'],
  apply: (c) => c,
});

const needGlacier = (c: Ctx) => { if (!c.glacier) throw new Error('this step needs a glacier'); return c.glacier; };

export const STEPS: StepDef[] = [
  {
    id: 'region.unit', phase: 1, scope: 'region', title: 'Region, unit rule and sources',
    why: 'Says what counts as "a glacier" here and which sources (with licences) the region uses. Every glacier of the region builds on it.',
    look: ['Does the rule name a source and a measurable criterion (e.g. the ten largest by area in the national inventory)?', 'Is each source\'s licence written down, and is non-commercial use flagged?'],
    needs: [], screen: 'region', implemented: true,
    outputs: (c) => (c.region.unitRule && c.region.sources.length ? pick(c.region, 'unitRule', 'count', 'sources') : undefined),
    confirmation: (c) => c.region.confirmation,
    problems: (c) => [
      ...(c.region.unitRule && c.region.unitRule.length < 20 ? ['The unit rule is too short to be a rule.'] : []),
      ...(c.region.sources.length === 0 ? ['No sources yet.'] : []),
      ...[...c.region.sources, ...(c.region.layerSources ?? [])].filter((x) => /^NOT READ/i.test(x.licence)).map((x) => `The licence of "${x.name}" was not read: open ${x.url}, find the licence and write it into the source.`),
    ],
    apply: (c, patch, conf) => ({ ...c, region: Region.parse({ ...c.region, ...patch, confirmation: conf }) }),
  },
  {
    id: 'glacier.record', phase: 1, scope: 'glacier', title: 'The glacier',
    why: 'Name, inventory id, rank, area and where it is. The id is the address of the page, so it should be right the first time.',
    look: ['Is the area the source\'s own number, unrounded?', 'Does the marker sit on the glacier?'],
    needs: ['region.unit'], screen: 'record', implemented: true,
    outputs: (c) => pick(c.glacier, 'id', 'name', 'inventoryId', 'legacyIds', 'rank', 'areaKm2', 'areaSource', 'centre'),
    confirmation: (c) => c.glacier?.recordConfirmation,
    problems: (c) => (c.glacier && !c.region.sources.some((s) => s.id === c.glacier!.areaSource) ? [`areaSource "${c.glacier.areaSource}" is not a source of the region.`] : []),
    apply: (c, patch, conf) => ({ ...c, glacier: Glacier.parse({ ...(c.glacier ?? {}), ...patch, recordConfirmation: conf }) }),
  },
  {
    id: 'glacier.outline', phase: 1, scope: 'glacier', title: 'Outline',
    why: 'Which polygon is the glacier, now and (where the source has it) in the past. The picture box starts from it, and the area is checked against the record.',
    look: ['Are all parts of the glacier selected, and nothing that belongs to a neighbour?', 'Does the outline follow the ice edge on the satellite picture?', 'Is the area within a few percent of the source\'s own figure?'],
    needs: ['glacier.record'], screen: 'outline', implemented: true,
    outputs: (c) => (c.outlines ? { epochs: c.outlines.epochs } : undefined),
    confirmation: (c) => c.outlines?.confirmation,
    problems: (c) => {
      const o = c.outlines;
      if (!o) return [];
      const out: string[] = [];
      const cur = o.epochs.find((e) => e.kind === 'new');
      if (!cur) out.push('There is no current ("new") outline.');
      for (const e of o.epochs) if (!c.region.sources.some((s) => s.id === e.source)) out.push(`The ${e.kind} outline names source "${e.source}", which is not a source of the region.`);
      if (cur?.geojson && c.glacier && cur.geojson.features.every((f) => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')) {      // lines and referenced outlines have no area to compare
        const km2 = cur.geojson.features.reduce((a, f) => a + areaKm2(f.geometry), 0);
        const off = Math.abs(km2 - c.glacier.areaKm2) / c.glacier.areaKm2;
        if (off > 0.25) out.push(`The selected outline is ${km2.toFixed(2)} km², ${(off * 100).toFixed(0)} % away from the record (${c.glacier.areaKm2} km²). Select the missing parts or correct the record.`);
      }
      return out;
    },
    // an outline the record only points at stays a pointer: the wizard shows it resolved, and sends the geometry back with it
    apply: (c, patch, conf) => ({ ...c, outlines: OutlinesFile.parse({ epochs: ((patch.epochs ?? []) as { ref?: unknown; geojson?: unknown }[]).map((e) => (e.ref ? { ...e, geojson: undefined } : e)), confirmation: conf }) }),
  },
  {
    id: 'glacier.placement', phase: 1, scope: 'glacier', title: 'Tongue tip and picture box',
    why: 'The box decides every picture\'s framing and every request to Copernicus. Change it later and every picture of this glacier is fetched anew.',
    look: ['Is the whole tongue inside, with some surroundings?', 'Does the tip sit on the lowest point of the ice front?', 'Pixels and requests: does the readout look sensible (above 2,500 px a side, about 25 km, the picture is tiled)?'],
    needs: ['glacier.outline'], screen: 'placement', implemented: true,
    // the 3D strip is not part of what this step produced: changing it must not make the placement stale (the strip step depends on the placement, not the other way round)
    outputs: (c) => { const p = c.glacier?.placement; return p ? { tip: p.tip, pictureBox: p.pictureBox } : undefined; },
    confirmation: (c) => c.glacier?.placement?.confirmation,
    problems: (c) => {
      const p = c.glacier?.placement;
      if (!p) return [];
      const [[s, w], [n, e]] = p.pictureBox, [la, lo] = p.tip, out: string[] = [];
      if (la < s || la > n || lo < w || lo > e) out.push('The tip is outside the picture box.');
      if (boxAreaKm2(p.pictureBox) > 2500) out.push('The picture box is over 2,500 km²: too big for one glacier.');
      return out;
    },
    apply: (c, patch, conf) => {
      const g = needGlacier(c);
      return { ...c, glacier: Glacier.parse({ ...g, placement: { ...(g.placement ?? {}), ...patch, confirmation: conf } }) };
    },
  },
  {
    id: 'glacier.season', phase: 1, scope: 'glacier', title: 'Balance year and scene rule',
    why: 'Which dates a yearly picture may come from, and how the best one is chosen. A picture belongs to the balance year it closes.',
    look: ['Do the balance-year dates come from the source of this glacier\'s figures?', 'On the timeline: do the scenes of past years fall inside the window around the year end?', 'Is the note honest about what the scene statistics showed?'],
    needs: ['glacier.placement'], screen: 'season', implemented: true,
    outputs: (c) => pick(c.glacier, 'balanceYear', 'sceneRule'),
    confirmation: (c) => c.glacier?.seasonConfirmation,
    problems: (c) => {
      const g = c.glacier;
      if (!g?.balanceYear || !g.sceneRule) return [];
      const out: string[] = [];
      if (yearOfScene(`${2020}-${g.balanceYear.end}`, g.balanceYear, g.sceneRule) === null) out.push('The end of the balance year is not inside its own scene window.');
      if (g.sceneRule.maxCloud > g.sceneRule.fallbackCloud) out.push('maxCloud is above fallbackCloud.');
      return out;
    },
    apply: (c, patch, conf) => ({ ...c, glacier: Glacier.parse({ ...needGlacier(c), ...patch, seasonConfirmation: conf }) }),
  },
  {
    id: 'glacier.scenes', phase: 1, scope: 'glacier', title: 'Scene review',
    why: 'Every automatically chosen picture is looked at by a person: approved, swapped, discarded or pinned. This is the checkpoint that keeps cloudy pictures off the site.',
    look: ['Cloud or cloud shadow over the tongue?', 'Snow still covering the ice that is normally bare?', 'Do neighbouring years look like the same season?'],
    needs: ['glacier.season'], screen: 'scenes', implemented: true,
    outputs: (c) => (c.scenes ? Object.fromEntries(Object.entries(c.scenes.years).map(([y, v]) => [y, { chosen: v.chosen, status: v.status, discarded: v.discarded }])) : undefined),
    confirmation: (c) => c.scenes?.confirmation,
    problems: (c) => {
      const g = c.glacier;
      if (!c.scenes || !g?.balanceYear || !g.sceneRule) return [];
      const out: string[] = [];
      for (const [y, v] of Object.entries(c.scenes.years)) {
        if (v.status === 'auto') out.push(`${y}: not reviewed yet.`);
        if (v.chosen && yearOfScene(v.chosen.date, g.balanceYear, g.sceneRule) !== Number(y)) out.push(`${y}: the scene of ${v.chosen.date} belongs to balance year ${yearOfScene(v.chosen.date, g.balanceYear, g.sceneRule) ?? 'none'}, not ${y}.`);
        if (v.status === 'none' && v.chosen) out.push(`${y}: marked none but has a scene.`);
        if (v.chosen?.gaps === 'outside-glacier' && !((g.sceneRule?.noDataMarginM ?? 0) > 0)) out.push(`${y}: the scene is below 100 % coverage because its missing data is far from the glacier, but the scene rule allows no margin (noDataMarginM).`);
      }
      return out;
    },
    apply: (c, patch, conf) => ({ ...c, scenes: ScenesFile.parse({ ...(c.scenes ?? { years: {} }), ...patch, confirmation: conf }) }),
  },
  {
    id: 'glacier.layers', phase: 1, scope: 'glacier', title: 'Map layers',
    why: 'Every layer exists for every glacier: switched on with a source, or off with the reason. Silence is not allowed.',
    look: ['Is each "not available" reason specific (what was looked for, where)?', 'For pre-2016: was Landsat searched, and from which year does the oldest usable picture come?'],
    needs: ['glacier.placement'], screen: 'layers', implemented: true,
    outputs: (c) => c.glacier?.layers,
    confirmation: (c) => c.glacier?.layersConfirmation,
    problems: (c) => {
      const g = c.glacier;
      if (!g?.layers) return [];
      const out = LAYERS.filter((l) => !g.layers![l]).map((l) => `Layer "${l}" has no decision.`);
      const all = [...c.region.sources, ...(c.region.layerSources ?? [])], known = new Set(all.map((x) => x.id));
      for (const [l, st] of Object.entries(g.layers)) if (st.state === 'enabled') for (const id of [st.provider, ...(st.others ?? [])]) {
        if (!known.has(id)) out.push(`Layer "${l}": "${id}" is not a source of the region (the screen adds the fetched ones; add this one in the region step).`);
        else if (/^NOT READ/i.test(all.find((x) => x.id === id)!.licence)) out.push(`Layer "${l}": the licence of "${id}" was not read; open its page and write the licence into the source in the region step.`);
      }
      return out;
    },
    // the sources the layers use (found while fetching, licence read from their pages) join the region's layer sources here;
    // they sit outside the region step's hash, so confirming a layer does not turn the region step or the glacier steps stale
    apply: (c, patch, conf) => {
      const have = new Set(c.region.sources.map((x) => x.id)), extra = new Map((c.region.layerSources ?? []).map((x) => [x.id, x]));
      for (const x of (patch.layerSources ?? []) as Source[]) if (!have.has(x.id)) extra.set(x.id, x);
      return { ...c, region: Region.parse({ ...c.region, layerSources: [...extra.values()] }), glacier: Glacier.parse({ ...needGlacier(c), layers: patch.layers, layersConfirmation: conf }) };
    },
  },
  {
    id: 'glacier.elevation', phase: 2, scope: 'glacier', title: 'Elevation model',
    why: 'Which elevation model covers the area, how fine it is, and whether it has dated surfaces for yearly ice heights. This decides what the 3D view offers: yearly ice surfaces, or one surface for all years.',
    look: ['Does the model cover the whole strip, including the area above the tongue?', 'Is the resolution the model\'s own figure, as its source states it?', 'Yearly surfaces: are there dated surfaces (several editions, or dated strips), not a single composite?'],
    needs: ['glacier.placement'], screen: 'elevation', implemented: true,
    outputs: (c) => pick(c.glacier?.elevation, 'model', 'resolutionM', 'yearlySurfaces', 'reason'),
    confirmation: (c) => c.glacier?.elevation?.confirmation,
    problems: (c) => {
      const e = c.glacier?.elevation;
      if (!e) return [];
      return [...(e.reason.trim().length < 20 ? ['The reason is too short: say what was checked (coverage, resolution, dates of the surfaces) and where.'] : []), ...(e.yearlySurfaces && !/\d{4}/.test(e.reason) ? ['Yearly surfaces are claimed: name the years or editions the surfaces come from in the reason.'] : [])];
    },
    apply: (c, patch, conf) => ({ ...c, glacier: Glacier.parse({ ...needGlacier(c), elevation: { ...patch, confirmation: conf } }) }),
  },
  {
    id: 'glacier.strip', phase: 2, scope: 'glacier', title: '3D strip and start camera',
    why: 'The strip along the tongue that the 3D view shows, and where its camera starts. Confirmed in the real 3D view.',
    look: ['Does the strip start below the tip and run up the middle of the glacier, not along a ridge?', 'Is it wide enough for the tongue and the valley walls, and no wider than the elevation data?', 'In the real page (3D): does the start camera show the tongue and the glacier above it, with the picture sharp?'],
    needs: ['glacier.elevation'], screen: 'strip', implemented: true,
    outputs: (c) => c.glacier?.placement?.strip3d,
    confirmation: (c) => c.glacier?.stripConfirmation,
    problems: (c) => {
      const t = c.glacier?.placement?.strip3d;
      if (!t) return [];
      return [...(t.up > 40000 ? ['The strip is over 40 km long: too long for one glacier.'] : []), ...(t.half > 15000 ? ['The strip is over 30 km wide: too wide for the terrain grid.'] : []), ...(t.azimuth < 0 || t.azimuth >= 360 ? ['The azimuth is not between 0 and 360 degrees.'] : [])];
    },
    apply: (c, patch, conf) => {
      const g = needGlacier(c);
      if (!g.placement) throw new Error('this step needs the placement');
      return { ...c, glacier: Glacier.parse({ ...g, placement: { ...g.placement, strip3d: patch.strip3d }, stripConfirmation: conf }) };
    },
  },
  later('glacier.content', 3, 'Discover, facts and stats', 'The texts of the right panel, every fact with its source.', ['glacier.record']),
  later('glacier.about', 4, 'About and Sources', 'Generated from what phases 1 to 3 enabled, then edited by hand.', ['glacier.content', 'glacier.layers']),
];

export const stepById = (id: string) => STEPS.find((s) => s.id === id);
