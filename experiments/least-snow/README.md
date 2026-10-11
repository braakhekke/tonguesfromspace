# Least snow: one scene per glacier with the most visible bare ice

Question: which single Sentinel-2 scene (2016 to 2026, 1 July to 31 October) shows as much of the glacier ice as possible, without snow cover?

Method (`run.html`, driven in a browser against the relay, with the statistics script of `tools/pick-scenes.html`):

- area = SGI2023 outline of the glacier, simplified (Douglas-Peucker, 15 to 100 m) to fit the relay's 20,000 character limit;
- per day and orbit, the share of the outline in snow (SCL 11), cloud (SCL 8, 9 or the CLM detector), cloud shadow (SCL 3) and thin cirrus (SCL 10), at 40 m;
- scenes that do not cover the whole outline are dropped;
- cost = 4 x snow + cloud + shadow + 0.5 x cirrus; scenes with more than 25 % cloud, shadow and cirrus together are only used if nothing else is left.

Files: `raw-stats.json` (all scenes per glacier), `best-scenes.json` (best three overall and best per year).

Status (10 October 2026):

- Aletsch and Gorner: the polygon was refused and the code fell back to the bounding box, so their numbers are not valid. Re-run.
- Fee and Trift: not run, the Copernicus account had no processing units left (HTTP 403).
- The other six ran on the outline.
- Caveats: the SCL snow class often takes bright bare ice for snow, so early-season picks (July) may be wrong; check the pictures. Cloud over bare ice that obviously continues upstream is judged by eye, not by the cost.
