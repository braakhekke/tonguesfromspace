# Rewrite plan (branch `rewrite`)

In-place, strangler style: the deployed site works after every step. Decided 2026-10-26:
strangler (not a fresh `src/`), port the useful parts of `../tonguesfromspace-v2` into this repo and retire it,
first milestone = foundation + clutter.

Baseline before any change: `check_syntax.py` ok, 74 tests, 22 skipped (the non-Swiss regions, only tested with
`PUBLISH_*=1`). Every step must keep this green, and the skipped tests must shrink to zero.

## Milestone 1: foundation and clutter
1. **Toolchain. (done)** Vite + TypeScript (`strict`). Start with `allowJs` + `checkJs` so the 16 global scripts compile
   unchanged; the build emits the same hashed site that `build_site.py` makes today, then `build_site.py` shrinks.
2. **Globals to modules (done: all of js/01-14; wire.js for calls up the load order)**, one file at a time in load order (01-data first, 14-streetview last): `export` what
   others use, `import` what it needs. Delete the load-order rule from the docs when the last file is done.
3. **One region contract. (page code done: `features` flags; Swiss data format still differs)** Remove `REGION.id === 'ch'` / `FEATURES.swiss*` branches (about 40 in `js/`) by turning
   each into a field on the glacier or region record. Swiss data is converted to the same shape as the others.
   Un-skip the region tests: fixtures instead of `PUBLISH_*` flags.
4. **Clutter.** Checked 2026-10-26: `size.html` (size comparison) and `teaser/` (first-visit film) are live features, not clutter. The board/review layer, `lab/`, `experiments/` and `backup/` are already untracked. What remains: parked scripts, and `scripts/tools/onboard.html` once the ported walkthrough replaces it.
5. **Docs. (done)** `README.md` is 100 lines; the file table and `js/` map moved to `docs/REFERENCE.md` (corrected for modules), setup to `docs/SETUP.md`, sources to `docs/SOURCES.md`; `CLAUDE.md` keeps the wiring rules, `Rules`, style and testing.

## Milestone 2: routes and landing (done, 2026-10-26)
- `/` is `home.html`, the region picker; every region including Switzerland has a page at its `path` (`/switzerland/`,
  `/iceland/vatnajokull/`, ...); old `/#g=...` links are redirected by the picker; build, health check and tests follow.
- The picker reads the region records: `js/regions.js` is data only and shared by the dashboard and the front page;
  `js/00-regions.js` is the logic that picks a region. The front page is indexable (it carried `noindex` as a draft).
- One stylesheet per concern: `css/style.css` (dashboard and size page; synced to the sister sites, so not touched),
  `css/pages.css` (tokens and base of the public pages), `css/home.css` (the picker; moved out of the page, checked
  pixel-identical).
- `css/tokens.css` is the one token file of every page (wins over the copy in the synced `style.css`; a test keeps them equal). Every page has an "← All regions" link to the picker.
- Not done: a single shared header/footer component. The pages differ by design (dark hero page, light utility
  gallery, app-like dashboard), and `style.css` still holds a copy of the tokens because of the sister-site sync;
  retiring the sync (LaunchAgent org.tonguesfromspace.stylesync) lets that copy be deleted.

## Milestone 3: Worker and onboarding (in progress)
Walkthrough: ported from v2 as the preferred one (`walkthrough/`, docs/WALKTHROUGH.md). Done: the schema, season rule,
engine, steps (phase 1), CLI, local server and wizard, local relay by meaning; 119 unit tests and browser tests.
Next: (1) exporter from confirmed records to the site's data files, and importer from the site's data to proposals,
so every existing glacier is confirmed instead of re-typed; (2) the "Real page" tab on top of the exporter;
(3) retire `scripts/tools/onboard.html` and the box/3D/scene editors once the walkthrough covers them; (4) phases 2 to 4;
(5) the public Worker moves to the relay by meaning (request validated against the glacier record, no raw bodies).
