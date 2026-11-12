---
name: glacier-data-search
description: MANDATORY when onboarding any glacier, outlet or region, and whenever sources or data are requested for a glacier. Rigorous, region-aware search for every data type (outlines, elevation/DEMs with survey dates, length, volume and mass balance, stakes/point/camera data, thickness, speed, altimetry, papers, field data) in any country.
---

Read `docs/DATA_SEARCH.md` first and follow it. This is required by AGENTS.md for every onboarding (step 3 of the chat-onboarding rule) and by `docs/ADD_A_GLACIER.md` step 1.

1. Fix glacier ids (RGI, national, WGMS_ID), box, period, and each source's **role** (constraint, validation, context; never both).
2. **Cover every data type, every time** (table in section 2 of the doc): outlines in every epoch, elevation models with real survey dates, length change, glacier-wide and elevation-band mass balance, **point/stake/probing/camera data**, volume/geodetic change, ice thickness, altimetry, ice speed, snow/firn/ELA, imagery geometry, names and facts, papers about the glacier (full text), field data.
3. **Region discovery, never from memory:** each country differs. Start from what the repo holds (`docs/SOURCES.md`, `walkthrough/outline-sources.json`, `data/regions/<region>/`, ADD_A_GLACIER section 1) as *leads*, then find that region's own monitoring programme, mapping agency, polar/hydrological institute and universities (WGMS FoG metadata names investigators and agencies; RGI/GLIMS contributors; regional papers), and search in English and the local language (Icelandic, Norwegian, German, French, Italian, Spanish, Russian, Kyrgyz, Georgian...). A source that exists in one region says nothing about another. Write the region's "who holds what" note in the ledger.
4. **Rigour:** open every link (list `href`s with curl), run web searches, resolve each DOI through the repository API (manuscript DOIs can be dead), download and unzip, read ReadMes, headers, rows, figures and full-text papers including data availability. A summary is a pointer, not a reading.
5. **Licences everywhere** (landing page, file header, ReadMe, repository record); the stricter wins; restricted data stays local in `experiments/` and never reaches `data/`, the site or an artifact.
6. **Ledger** `docs/sources/<region>-<glacier>.md` from `docs/sources/TEMPLATE.md`: exact date wording, composites, datum, resolution, licence, independence, role, **read / NOT READ**. Flag conflicts; external numbers verbatim (AGENTS.md); unread figures are left out of the site and listed for the owner.
7. Apply the traps in section 6 of the doc (separate DOIs per data type, edition year vs survey year, DEMs hiding older data, datums, radar penetration, snow, stakes measure ablation, ASTER dates, shadow feasibility) and test every DEM against an independent referee.
8. Credentials never in chat (the owner runs a terminal script with hidden input). Keep command output short.
9. Finish by telling the owner what was read, what was not, where the ledger is, and updating the memory notes.
