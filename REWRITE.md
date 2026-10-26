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
- Not done: a single shared header/footer component. The pages differ by design (dark hero page, light utility
  gallery, app-like dashboard), and `style.css` and `pages.css` both hold the colour tokens because of the sister-site
  sync. Retiring that sync would let `pages.css` import one token file; that is a decision for the owner.

## Milestone 3: Worker and onboarding
Port from v2: Worker that builds the Copernicus request itself (`src/shared/copernicus.ts`), `season.ts`
(balance-year rule, boundary tests), schema validation (`npm run data`), the walkthrough (derived status, stale
cascade, dev-only). Convert existing glacier data to the schema instead of re-onboarding by hand.

## Not touched without asking
Cloudflare resources and deploys, your uncommitted work in the working tree (20 files at the start), the external
numbers rule.
