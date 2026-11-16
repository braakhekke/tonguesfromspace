#!/usr/bin/env python3
"""Field notes of an onboarded glacier: writes data/yearly/<id>.json with a `single` block, which provenance.html?id=<id> draws.

One page for every glacier that has ONE measured surface instead of the Swiss yearly surfaces (`provenance.html`, function singlePage). Part of the
automatic steps of onboarding any glacier (docs/ONBOARD_RUNBOOK.md, "Automatic steps"): run it after the sources are set and the terrain file is built.

Made automatically from the onboarding session `experiments/onboard/<id>/` (local):
  session.json          place, box, strip, scene picks (pictures chapter)
  sources.json          the Data input catalogue the owner set (what was measured, dates, datum, licence as read, read / NOT READ, cautions)
  field-notes-text.json the prose Claude writes once per glacier from the ledger (docs/sources/<region>-<id>.md); figures copied as the ledger states them:
                        {"region": "nz", "short": "Franz Josef", "explorer": "new-zealand", "size": "<html>", "surface": "<html>", "trust": "<html>", "year": 2025}
Usage: python3 scripts/build_field_notes.py franz-josef
"""
import datetime, html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
esc = lambda s: html.escape(str(s), quote=True)


def sensor_date(scene):
    """(sensor, ISO date) of a picked scene id: S2-L1C-MOSAIC-2025-02-14-R072-..., LT04_L2SP_075090_19930221_02_T1."""
    m = re.match(r"S2-L1C-MOSAIC-(\d{4}-\d\d-\d\d)-(R\d+)", scene)
    if m:
        return "Sentinel-2 " + m.group(2), m.group(1)
    m = re.match(r"(L[TEC]\d\d)_\w+?_\d{6}_(\d{4})(\d\d)(\d\d)_", scene)
    if m:
        n = {"LT04": "Landsat 4", "LT05": "Landsat 5", "LE07": "Landsat 7", "LC08": "Landsat 8", "LC09": "Landsat 9"}.get(m.group(1), m.group(1))
        return n, f"{m.group(2)}-{m.group(3)}-{m.group(4)}"
    return scene, ""


def table(head, rows):
    return "<table class=\"stab\"><tr>" + "".join(f"<th>{esc(h)}</th>" for h in head) + "</tr>" + "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows) + "</table>"


def link(url, text):
    return f'<a href="{esc(url)}" target="_blank" rel="noopener">{esc(text)}</a>' if url else esc(text)


def build(gid):
    S = os.path.join(ROOT, "experiments", "onboard", gid)
    ses = json.load(open(os.path.join(S, "session.json"), encoding="utf-8"))
    src = [s for s in json.load(open(os.path.join(S, "sources.json"), encoding="utf-8"))["sources"] if s.get("include")]
    T = json.load(open(os.path.join(S, "field-notes-text.json"), encoding="utf-8"))
    box, strip = ses["steps"]["box"]["params"], ses["steps"]["strip"]["params"]
    picks = ses["steps"]["scenes"]["params"]
    name, short = ses["name"], T["short"]
    strip_km2 = (strip["up"] + strip["back"]) * 2 * strip["half"] / 1e6

    area = (f"<p><b>{esc(name)}</b>, {esc(ses['place'])}. The picture box is {box['width_km']} x {box['height_km']} km (set by the owner); the 3D strip along the glacier "
            f"is {strip['up'] + strip['back']} m long and {2 * strip['half']} m wide, {strip_km2:.1f} km² (computed from the saved strip).</p>")
    glims = next((s for s in src if s["id"] == "glims"), None)
    if glims:
        area += f"<p>Outlines drawn on the map: {esc(glims['title'])}; dates {esc(glims['dates'])}. {esc(glims.get('caution', ''))}</p>"

    meas = [s for s in src if s["role"] in ("constraint", "validation")]
    measured = T["surface"] + "<h3 class=\"fnh\">Sources that constrain or check the surface</h3>" + table(
        ["Source", "Kind", "Dates", "Datum", "Role", "Read"],
        [[link(s.get("url"), s["title"]), esc(s["category"]), esc(s["dates"]), esc(s.get("datum", "")), esc(s["role"]), esc(s["read"])] for s in meas])

    cautions = "".join(f"<li><b>{esc(s['title'])}.</b> {esc(s['caution'])}</li>" for s in src if s.get("caution"))
    trust = T["trust"] + (f"<h3 class=\"fnh\">Cautions of each source</h3><ul class=\"fnl\">{cautions}</ul>" if cautions else "")

    rows, lost = [], [y for y, v in sorted(picks["picks"].items()) if v == "none"]
    for y, sc in sorted(picks["picks"].items()):
        if sc != "none":
            sen, day = sensor_date(sc)
            rows.append([esc(y), esc(sen), esc(day)])
    pictures = (f"<p>One picture per year, chosen by the owner from the candidates (main orbit {esc(picks.get('primaryOrbit', ''))}; season window {esc(picks['season'][0])} to {esc(picks['season'][1])}, "
                f"target {esc(picks['season'][2])}). Sentinel-2 pictures are one L1C pass over the whole box, in the site's colours; the older years are Landsat. "
                + (f"Years with no usable picture: {esc(', '.join(lost))}." if lost else "") + "</p>" + table(["Year", "Sensor", "Date"], rows))

    lic = [[link(s.get("url"), s["title"]), esc(s.get("licence", "")), esc(s["read"])] for s in src if s["role"] != "context" or s.get("licence")]
    licences = ("<p>Licence wording as read on the source page; <b>NOT READ</b> means the terms were not found or opened. The site is non-commercial; its own credits line and Sources list hold the full credits.</p>"
                + table(["Source", "Licence as read", "Read"], lic))

    year = T["year"]
    return {
        "glacier": gid, "name": name, "short": short, "built": datetime.date.today().isoformat(),
        "years": [year, year], "kind": {str(year): "measured"},
        "single": {"explorer": T["explorer"], "region": T["region"], "year": year, "sections": [
            {"id": "area", "toc": "Study area", "title": "Study area: " + short, "html": area},
            {"id": "anchors", "toc": "What was measured", "title": "What was measured", "html": measured},
            {"id": "validation", "toc": "How far to trust it", "title": "How far to trust it: checks, limits and caveats", "html": trust},
            {"id": "pictures", "toc": "Pictures", "title": "The pictures: one for each year", "html": pictures},
            {"id": "sizenote", "toc": "Size page", "title": "Size page: how this glacier is shown", "html": T["size"]},
            {"id": "licences", "toc": "Sources and licences", "title": "Sources and licences", "html": licences}]},
    }


if __name__ == "__main__":
    gid = sys.argv[1]
    d = build(gid)
    out = os.path.join(ROOT, "data", "yearly", gid + ".json")
    json.dump(d, open(out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("wrote", out, [s["id"] for s in d["single"]["sections"]])
