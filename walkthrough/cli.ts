/**
 * npm run walkthrough -- <command>
 *   status [region] [glacier]            where everything stands, and what is next
 *   next [region] [glacier]              the next step and the address to open it
 *   new-region <id> <name> <lat> <lon>
 *   new-glacier <region> <id> <name> <lat> <lon>
 *   import-site [region]               fill the records from the site's own data (boxes, scenes, regions): proposals, nothing confirmed
 *   add-source <region> <id> "<name>" <url> [--glacier <id>]   a source found (an outline inventory, say) as a proposal for the region step; its licence is NOT READ
 *   names                              the glaciers named in each glacier's picture (RGI via GLIMS) into data/glacier-names.js, for the layer "Glacier names"
 *   aliases                            the names of every glacier in every language (Wikidata, CC0) into data/glacier-aliases.js, for the front page's search
 *   export [--check]                   write data/boxes.js and data/scenes.json from the records; --check only compares (CI runs it)
 *   import-old-scenes <region> <glacier> <old repo> <old scene key> <old landsat id>   the previous site's scenes, as proposals
 *   refill-landsat <region> <glacier>   fill the stripes of the Landsat 7 pictures along the flow (from the original renders)
 *   propose-box <region> <glacier> <S> <W> <N> <E> "<why>"   a box you already know, as the placement proposal
 *   propose-glamos <region> <glacier name> [--id <address>]   proposals from the GLAMOS inventories (Swiss glaciers)
 * The visual walkthrough is the same engine: `npm run walkthrough:serve`, then open http://localhost:5174/onboard
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoot, loadAll } from './data';
import { loadCtx, newGlacier, newRegion, progress, type Status } from './engine';
import { proposeGlamos } from './propose-glamos';
import { proposeBox } from './propose-box';
import { importOldScenes } from './import-old';
import { importSite } from './import-site';
import { writeProposal } from './proposals';
import { buildAliases, writeAliases } from './build-aliases';
import { buildNames, writeNames } from './build-names';
import { check as checkExport, exportAll } from './export';
import { refillScene } from './landsat/refill';
import { readProposals } from './proposals';

const C = { dim: (s: string) => `\x1b[2m${s}\x1b[0m`, red: (s: string) => `\x1b[31m${s}\x1b[0m`, green: (s: string) => `\x1b[32m${s}\x1b[0m`, yellow: (s: string) => `\x1b[33m${s}\x1b[0m`, bold: (s: string) => `\x1b[1m${s}\x1b[0m` };
const MARK: Record<Status, string> = { done: C.green('●'), todo: '○', review: C.yellow('◐'), stale: C.yellow('↻'), blocked: C.dim('·'), attention: C.red('!'), unavailable: C.dim('–') };
const LABEL: Record<Status, string> = { done: 'done', todo: 'to do', review: 'proposed, needs your confirmation', stale: 'stale: something it depends on changed', blocked: 'waiting for an earlier step', attention: 'confirmed, but a check now fails', unavailable: 'not built yet' };

const dirs = (p: string) => (existsSync(p) ? readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : []);
const url = (r: string, g: string | undefined, step: string) => `http://localhost:5174/onboard/${r}/${g ?? '-'}/${step}`;

function show(region: string, glacier?: string) {
  const p = progress(loadCtx(region, glacier));
  console.log(C.bold(`${region}${glacier ? ' / ' + glacier : ''}`) + C.dim(`  ${p.done} of ${p.total} steps done`));
  let phase = 0;
  for (const s of p.steps) {
    if (s.phase !== phase) { phase = s.phase; console.log(C.dim(`  phase ${phase}`)); }
    console.log(`  ${MARK[s.status]} ${s.title.padEnd(34)} ${C.dim(LABEL[s.status])}`);
    for (const pr of s.status === 'done' ? [] : s.problems.slice(0, 3)) console.log(C.dim(`      ${pr}`));
  }
  console.log(p.next ? `\n  next: ${C.bold(p.next)}  ${C.dim(url(region, glacier, p.next))}` : `\n  ${C.green('all doable steps are done')}`);
}

const [cmd, ...a] = process.argv.slice(2);
try {
  if (cmd === 'status' || cmd === 'next' || cmd === undefined) {
    const regions = a[0] ? [a[0]] : dirs(dataRoot());
    if (regions.length === 0) console.log('No regions yet. Start one: npm run walkthrough -- new-region <id> <name> <lat> <lon>');
    for (const r of regions) {
      if (cmd === 'next' && !a[1]) { const p = progress(loadCtx(r)); console.log(`${r}: ${p.next ?? 'nothing to do'}  ${p.next ? C.dim(url(r, undefined, p.next)) : ''}`); continue; }
      show(r);
      for (const g of a[1] ? [a[1]] : dirs(join(dataRoot(), r))) show(r, g);
    }
    const { drafts, problems } = loadAll();
    if (drafts.length) console.log(C.dim(`\ndrafts (record not confirmed yet): ${drafts.join(', ')}`));
    if (problems.length) { console.log(C.red('\nDATA PROBLEMS:\n' + problems.map((p) => '  - ' + p).join('\n'))); process.exitCode = 1; }
  } else if (cmd === 'import-site') {
    const r = importSite(a[0]);
    console.log(`Imported ${r.glaciers} glaciers of ${r.regions} regions (${r.scenes} scenes). Nothing is confirmed: open the walkthrough and look at each step.`);
    for (const x of r.skipped) console.log(C.dim('  skipped: ' + x));
  } else if (cmd === 'add-source') {
    const [region, id, name, url] = a;
    if (!region || !id || !name || !/^https?:\/\//.test(url ?? '')) throw new Error('usage: add-source <region> <id> "<name>" <url>');
    const c = loadCtx(region), prev = readProposals(region, null)['region.unit']?.data ?? {};
    const sources = [...(prev.sources ?? c.region.sources), ].filter((s: { id: string }) => s.id !== id);
    sources.push({ id, name, url, licence: `NOT READ: open ${url}, find the licence and write it here.`, commercialUse: false });
    writeProposal(region, null, 'region.unit', 'add-source', `${name} added as a source: its licence is NOT READ.`, { ...prev, unitRule: prev.unitRule ?? c.region.unitRule ?? 'TO WRITE: what counts as "a glacier" in this region, as a rule someone else could apply and get the same list.', sources });
    console.log(`${name} is now a proposed source of ${region}. Open the region step, read its licence and write it in.`);
  } else if (cmd === 'names') {
    const n = await buildNames((m) => console.log(C.dim('  ' + m)));
    writeNames(n);
    console.log(`names of the glaciers in the picture of ${Object.keys(n).length} glaciers written to data/glacier-names.js`);
  } else if (cmd === 'aliases') {
    const { aliases, missing } = await buildAliases(8, (m) => console.log(C.dim('  ' + m)));
    writeAliases(aliases);
    console.log(`${Object.keys(aliases).length} glaciers with names in other languages written to data/glacier-aliases.js.${missing.length ? ` No Wikidata item found for: ${missing.join(', ')} (the search still finds them by the name the site has).` : ''}`);
  } else if (cmd === 'export') {
    if (a.includes('--check')) {
      const bad = checkExport();
      if (bad.length) { console.log(C.red(bad.map((b) => '  - ' + b).join('\n'))); process.exitCode = 1; } else console.log(C.green('the site files are what the records say'));
    } else console.log('written: ' + exportAll().join(', '));
  } else if (cmd === 'new-region') {
    const [id, name, lat, lon] = a;
    if (!id || !name || !lat || !lon) throw new Error('usage: new-region <id> <name> <lat> <lon>');
    newRegion(id, name, [Number(lat), Number(lon)]);
    console.log(`Region ${id} created. Next: npm run walkthrough:serve, then open ${url(id, undefined, 'region.unit')}`);
  } else if (cmd === 'new-glacier') {
    const [r, id, name, lat, lon] = a;
    if (!r || !id || !name || !lat || !lon) throw new Error('usage: new-glacier <region> <id> <name> <lat> <lon>');
    newGlacier(r, id, name, [Number(lat), Number(lon)]);
    console.log(`Glacier ${id} created as a draft in ${r}. Next: ${url(r, id, 'glacier.record')}`);
  } else if (cmd === 'import-old-scenes') {
    const [r, g, repo, key, ls] = a, og = a.indexOf('--outside-glacier');
    if (!r || !g || !repo || !key || !ls) throw new Error('usage: import-old-scenes <region> <glacier> <old repo path> <old scene key> <old landsat id> [--outside-glacier <year,year>]');
    const out = importOldScenes(r, g, repo, key, ls, og >= 0 ? a[og + 1]!.split(',').map(Number) : []);
    console.log(`${out.scenes} scenes (${out.landsat} Landsat, ${out.sentinel} Sentinel-2); window fitted: ${out.before} days before the year end to ${out.after} after; ${out.pictures} Landsat pictures copied to the cache`);
    console.log(`nothing is confirmed. Open: ${url(r, g, 'glacier.season')}`);
  } else if (cmd === 'refill-landsat') {
    const [r, g] = a;
    if (!r || !g) throw new Error('usage: refill-landsat <region> <glacier>');
    const ctx = loadCtx(r, g), box = ctx.glacier?.placement?.pictureBox;
    if (!box) throw new Error('the picture box must be confirmed first');
    const years = (ctx.scenes?.years ?? readProposals(r, g)['glacier.scenes']?.data?.years ?? {}) as Record<string, { chosen?: { id?: string; gaps?: string } | null }>;
    const todo = Object.entries(years).filter(([, v]) => v.chosen?.gaps === 'slc-off' && v.chosen.id);
    if (!todo.length) console.log('No scene with stripe gaps.');
    for (const [y, v] of todo) {
      const jpg = join(process.env.TFS_CACHE ?? join(process.cwd(), '.cache'), 'landsat', g, `${y}.jpg`);
      const res = await refillScene(box, v.chosen!.id!, jpg);
      console.log(`${y}  ${(res.share * 100).toFixed(1)} % of the picture was stripes, filled along the flow`);
    }
  } else if (cmd === 'propose-box') {
    const [r, g, s0, w0, n0, e0, ...why] = a;
    if (!r || !g || !e0 || !why.length) throw new Error('usage: propose-box <region> <glacier> <south> <west> <north> <east> "<why>"');
    const out = proposeBox(r, g, [[Number(s0), Number(w0)], [Number(n0), Number(e0)]], why.join(' '));
    console.log(`box proposed: ${out.w} x ${out.h} px, ${out.requests} ${out.requests === 1 ? 'request' : 'requests'} per picture; tip kept at ${out.tip}`);
    console.log(`nothing is confirmed. Open: ${url(r, g, 'glacier.placement')}`);
  } else if (cmd === 'propose-glamos') {
    const [r, name] = a, at = a.indexOf('--id');
    if (!r || !name) throw new Error('usage: propose-glamos <region> "<glacier name>" [--id <address>]');
    const out = await proposeGlamos(r, name, { id: at >= 0 ? a[at + 1] : undefined, log: (m) => console.log(C.dim(m)) });
    console.log(`${C.bold(out.name)}  ${out.inventoryId}  ${out.areaKm2} km² (the file's own value)  rank ${out.rank} of the inventory`);
    if (out.tip) console.log(`tip: lowest outline point ${out.tip.height} m at ${out.tip.lat.toFixed(5)}, ${out.tip.lon.toFixed(5)} (swisstopo height service; compare with the inventory's masl_min in the proposal note)`);
    console.log(`proposals written for: region setup, the glacier, its outline (${out.candidates.new} candidate polygons now, ${out.candidates.old} for 1850)`);
    console.log(`nothing is confirmed. Open: ${url(r, out.id, 'glacier.record')}`);
  } else throw new Error(`unknown command "${cmd}" (status, next, new-region, new-glacier, refill-landsat, propose-box, propose-glamos)`);
} catch (e) {
  console.error(C.red((e as Error).message));
  process.exitCode = 1;
}
