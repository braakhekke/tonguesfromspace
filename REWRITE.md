# Rewrite plan (branch `rewrite`)

In-place, strangler style: the deployed site works after every step. Decided 2026-10-26:
strangler (not a fresh `src/`), port the useful parts of `../tonguesfromspace-v2` into this repo and retire it,
first milestone = foundation + clutter.

Baseline before any change: `check_syntax.py` ok, 74 tests, 22 skipped (the non-Swiss regions, only tested with
`PUBLISH_*=1`). Every step must keep this green, and the skipped tests must shrink to zero.

## Milestone 1: foundation and clutter
1. **Toolchain.** Vite + TypeScript (`strict`). Start with `allowJs` + `checkJs` so the 16 global scripts compile
   unchanged; the build emits the same hashed site that `build_site.py` makes today, then `build_site.py` shrinks.
2. **Globals to modules**, one file at a time in load order (01-data first, 14-streetview last): `export` what
   others use, `import` what it needs. Delete the load-order rule from the docs when the last file is done.
3. **One region contract.** Remove `REGION.id === 'ch'` / `FEATURES.swiss*` branches (about 40 in `js/`) by turning
   each into a field on the glacier or region record. Swiss data is converted to the same shape as the others.
   Un-skip the region tests: fixtures instead of `PUBLISH_*` flags.
4. **Delete clutter.** `size.html`, `build_size_demo.py`, `scripts/tools/onboard.html` (replaced by the ported
   walkthrough), parked scripts, the Stop hook in `.claude/settings.json`, `teaser/` (108 MB) out of git history's
   working tree (the film can be re-recorded).
5. **Docs.** `README.md` under 150 lines; `CLAUDE.md` shrinks to rules only (external numbers, filters, placement
   first). The 14-row file table is replaced by the code layout.

## Milestone 2: routes and landing
`/` world map + dropdown, `/<region>` equal pages, one shared layout (`Shell`), old links redirected by data.

## Milestone 3: Worker and onboarding
Port from v2: Worker that builds the Copernicus request itself (`src/shared/copernicus.ts`), `season.ts`
(balance-year rule, boundary tests), schema validation (`npm run data`), the walkthrough (derived status, stale
cascade, dev-only). Convert existing glacier data to the schema instead of re-onboarding by hand.

## Not touched without asking
Cloudflare resources and deploys, your uncommitted work in the working tree (20 files at the start), the external
numbers rule.
