#!/usr/bin/env python3
"""What visitors click (js/track.js -> /ev -> Workers Analytics Engine, dataset tsf_events).

    CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... python3 scripts/parked/clicks_report.py [--days 30] [--glacier aletsch]

The token needs Account > Account Analytics > Read (a separate token from the deploy one). Prints the top controls overall, per glacier,
per device and per country. Counts use SUM(_sample_interval), so they stay right if Cloudflare ever samples. Standard library only."""
import argparse, json, os, sys, urllib.request

def query(account, token, sql):
    req = urllib.request.Request(f"https://api.cloudflare.com/client/v4/accounts/{account}/analytics_engine/sql",
                                 data=sql.encode(), headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)["data"]
    except urllib.error.HTTPError as e:
        sys.exit(f"Cloudflare answered {e.code}: {e.read().decode()[:300]}")

def show(title, rows, cols):
    print(f"\n{title}")
    if not rows:
        print("  (nothing yet)")
    for r in rows:
        print("  " + "  ".join(f"{r[c]!s:<{w}}" for c, w in cols))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--glacier", help="only this glacier (the #g= id)")
    ap.add_argument("--limit", type=int, default=25)
    a = ap.parse_args()
    account, token = os.environ.get("CLOUDFLARE_ACCOUNT_ID"), os.environ.get("CLOUDFLARE_API_TOKEN")
    if not account or not token:
        sys.exit("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Account Analytics: Read).")
    where = f"timestamp > NOW() - INTERVAL '{int(a.days)}' DAY"
    if a.glacier:
        if not all(c.isalnum() or c == "-" for c in a.glacier):
            sys.exit("--glacier: letters, digits and hyphens only")
        where += f" AND blob2 = '{a.glacier}'"
    def top(col, label, limit):
        return query(account, token, f"SELECT {col} AS k, SUM(_sample_interval) AS n FROM tsf_events WHERE {where} GROUP BY k ORDER BY n DESC LIMIT {limit} FORMAT JSON")
    print(f"Last {a.days} days" + (f", glacier {a.glacier}" if a.glacier else ""))
    show("Controls", top("blob1", "control", a.limit), [("k", 28), ("n", 8)])
    if not a.glacier:
        show("Glaciers (clicks while one was open)", [r for r in top("blob2", "glacier", a.limit) if r["k"]], [("k", 28), ("n", 8)])
    show("Device (m = mobile, d = desktop)", top("blob4", "device", 5), [("k", 28), ("n", 8)])
    show("Countries", [r for r in top("blob5", "country", 10) if r["k"]], [("k", 28), ("n", 8)])

main()
