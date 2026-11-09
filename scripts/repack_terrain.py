#!/usr/bin/env python3
"""Rewrites every data/terrain/*.bin in the compact form (header enc = 2, see terrain_lib.pack). Lossless: the decoded layers are checked equal before anything is written."""
import os, sys, zlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import terrain_lib as tl

before = after = 0
for gid, name in sorted(tl.manifest().items()):
    path = os.path.join(tl.OUT, name); head, legacy = tl.read(name); old = os.path.getsize(path)
    if head.get('enc') == 2: before += old; after += old; continue
    new, size = tl.write_bundle(gid, head, legacy); h2, l2 = tl.read(new)
    assert zlib.decompress(l2) == zlib.decompress(legacy) and {k: v for k, v in h2.items() if k != 'enc'} == head, gid
    print(f'{gid}: {old/1e6:.2f} -> {size/1e6:.2f} MB'); before += old; after += size
print(f'total {before/1e6:.1f} -> {after/1e6:.1f} MB')
