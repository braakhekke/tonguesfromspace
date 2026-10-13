#!/usr/bin/env python3
"""Type check of js/*.js with the TypeScript compiler (no types to write: it reads the code and the few JSDoc hints).

    python3 scripts/check_types.py

Needs Node (the GitHub runners have it; npx fetches TypeScript 5.9.3, nothing is installed in the project). Without Node the check is skipped.
The scripts are checked as one program (scripts/tsconfig.check.json); the names the page does not declare itself are in scripts/types/globals.d.ts.

What fails the check: a name that does not exist (a typo or a function that was renamed), a property that does not exist on one of our own objects,
or a call with the wrong number of arguments. These are the mistakes a visitor meets as "x is not defined" / "x is not a function".

What is tolerated (IGNORED below): "this value does not fit that type" findings about plain literals, e.g. a [lat, lng] pair that is an array of numbers
to TypeScript, or a table that mixes numbers and arrays. They are noise in a codebase without declared types and would need hundreds of casts.
Clean them up file by file if you like; the list of ignored codes can then shrink.
Standard library only.
"""
import os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TYPESCRIPT = "typescript@5.9.3"
IGNORED = {
    2322: "type 'X' is not assignable to type 'Y'",
    2345: "argument of type 'X' is not assignable to parameter of type 'Y'",
    2353: "object literal may only specify known properties",
    2362: "left-hand side of an arithmetic operation (mixed table)",
    2363: "right-hand side of an arithmetic operation (mixed table)",
    2365: "operator cannot be applied (mixed table)",
    2559: "type has no properties in common (spread array into a function)",
    2769: "no overload matches this call (browser API options)",
}


def main():
    if not shutil.which("npx"):
        print("types: skipped (no Node/npx here; the workflows run this check)")
        return
    r = subprocess.run(["npx", "--yes", "-p", TYPESCRIPT, "tsc", "-p", "scripts/tsconfig.check.json", "--pretty", "false"], cwd=ROOT, capture_output=True, text=True)
    lines = [l for l in (r.stdout + r.stderr).splitlines() if l.strip()]
    findings = [l for l in lines if re.search(r"error TS\d+", l)]
    other = [l for l in lines if not re.search(r"error TS\d+", l) and not l.startswith(" ")]
    kept, ignored = [], 0
    for l in findings:
        code = int(re.search(r"error TS(\d+)", l).group(1))
        if code in IGNORED:
            ignored += 1
        else:
            kept.append(l)
    if r.returncode not in (0, 2) and not findings:      # tsc could not run at all
        sys.exit("types: the TypeScript compiler failed to run:\n" + "\n".join(lines[:20]))
    if kept:
        print("TYPE PROBLEMS (a name, property or argument count that does not exist):")
        print("\n".join(kept))
        sys.exit(1)
    print(f"types ok: {len(findings)} findings, all of the tolerated kinds ({ignored} ignored: {', '.join('TS%d' % c for c in sorted(IGNORED))})")


if __name__ == "__main__":
    main()
