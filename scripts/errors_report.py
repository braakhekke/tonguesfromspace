#!/usr/bin/env python3
"""Script errors of the public pages (js/track.js -> /ev -> Workers Analytics Engine, dataset tsf_events, event error-js).

    CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... python3 scripts/errors_report.py [--days 7]

The token needs Account > Account Analytics > Read (the same one as scripts/parked/clicks_report.py). Prints what went wrong (the 80-character note of the page), on which page and
in which glacier, most often first. A new release that breaks something shows up here within a day. Counts use SUM(_sample_interval). Standard library only."""
import argparse, json, os, sys, urllib.request


def build_sql(days, group, limit=25):
    """group: the columns to count by: note = blob6, page = blob3, glacier = blob2, device = blob4"""
    cols = {"note": "blob6", "page": "blob3", "glacier": "blob2", "device": "blob4"}
    days, limit = int(days), int(limit)
    if not 1 <= days <= 90 or not 1 <= limit <= 200 or not set(group) <= set(cols):
        raise ValueError("days 1 to 90, limit 1 to 200, group by note, page, glacier or device")
    sel = ", ".join(f"{cols[g]} AS {g}" for g in group)
    return f"SELECT {sel}, SUM(_sample_interval) AS n FROM tsf_events WHERE blob1 = 'error-js' AND timestamp > NOW() - INTERVAL '{days}' DAY GROUP BY {', '.join(group)} ORDER BY n DESC LIMIT {limit} FORMAT JSON"


def query(account, token, sql):
    req = urllib.request.Request(f"https://api.cloudflare.com/client/v4/accounts/{account}/analytics_engine/sql", data=sql.encode(), headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)["data"]
    except urllib.error.HTTPError as e:
        sys.exit(f"Cloudflare answered {e.code}: {e.read().decode()[:300]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7)
    a = ap.parse_args()
    account, token = os.environ.get("CLOUDFLARE_ACCOUNT_ID"), os.environ.get("CLOUDFLARE_API_TOKEN")
    if not account or not token:
        sys.exit("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Account Analytics: Read).")
    print(f"Script errors of the last {a.days} days")
    for title, group in (("What went wrong, and where", ("note", "page")), ("Glacier open at the time", ("glacier",)), ("Device (m = mobile, d = desktop)", ("device",))):
        rows = query(account, token, build_sql(a.days, group))
        print(f"\n{title}")
        for r in rows or []:
            print(f"  {r['n']!s:>6}  " + "  ".join(str(r[g]) for g in group))
        if not rows:
            print("  (none: good)")


if __name__ == "__main__":
    main()
